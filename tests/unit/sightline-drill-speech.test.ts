import { describe, expect, it } from 'vitest';
import {
  DEFAULT_DRILL,
  DRILL_PRESETS,
  FASTEST_PRESET_MS,
  MIN_FLASH_MS,
  buildDrillPlan,
  clampFlashMs,
  drillItems,
  drillStimulus,
  flashEquivalentWpm,
  presetById,
  scoreRecall,
  seededRandom,
} from '../../src/tools/sightline/drill-engine';
import {
  anchorScrollTop,
  cumulativeStarts,
  pageDurationMs,
  pacerBoxes,
  pacerFrameAt,
  pacerPosition,
  wordDurations,
} from '../../src/tools/sightline/pacer-engine';
import {
  DEFAULT_METRONOME,
  MAX_BPM,
  MIN_BPM,
  beatAt,
  beatIntervalMs,
  beatsInRange,
  clampBpm,
  clickSchedule,
  describeTempo,
  tempoName,
} from '../../src/tools/sightline/metronome-engine';
import {
  NEUTRAL_SPEECH_WPM,
  buildSpeechPlan,
  chooseVoice,
  chunkStartTimes,
  clampRate,
  detectSpeechSupport,
  estimateWordMs,
  rateForWpm,
  tokenForCharOffset,
  wpmForRate,
} from '../../src/tools/sightline/speech-engine';
import { buildDocumentModel } from '../../src/tools/sightline/segmentation-engine';

const model = (text: string) => buildDocumentModel({
  format: 'text',
  fileName: 'sample.txt',
  paragraphs: [{ kind: 'body', level: 0, text }],
});

describe('flash drills', () => {
  const tokens = model('The quick brown fox jumps over the lazy dog again and again.').tokens;

  it('never presents below what a display can draw', () => {
    expect(clampFlashMs(1)).toBe(MIN_FLASH_MS);
    expect(clampFlashMs(0)).toBe(DEFAULT_DRILL.flashMs);
    expect(clampFlashMs(Number.NaN)).toBe(DEFAULT_DRILL.flashMs);
    expect(clampFlashMs(5000)).toBe(600);
    expect(FASTEST_PRESET_MS).toBeGreaterThanOrEqual(MIN_FLASH_MS);
  });

  it('produces a deterministic plan for a seed', () => {
    const first = buildDrillPlan(tokens, { ...DEFAULT_DRILL, seed: 7 });
    const second = buildDrillPlan(tokens, { ...DEFAULT_DRILL, seed: 7 });
    expect(first.flashes.map((flash) => flash.text)).toEqual(second.flashes.map((flash) => flash.text));
    const other = buildDrillPlan(tokens, { ...DEFAULT_DRILL, seed: 99 });
    expect(other.flashes.map((flash) => flash.text)).not.toEqual(first.flashes.map((flash) => flash.text));
  });

  it('lays flashes end to end with their gaps', () => {
    const plan = buildDrillPlan(tokens, { ...DEFAULT_DRILL, flashCount: 6, flashMs: 80, gapMs: 500, seed: 3 });
    expect(plan.flashes[0]!.startMs).toBe(0);
    plan.flashes.forEach((flash, index) => {
      if (index > 0) expect(flash.startMs).toBe(plan.flashes[index - 1]!.startMs + 80 + 500);
      expect(flash.durationMs).toBe(80);
    });
    expect(plan.totalMs).toBe(plan.flashes.length * (80 + 500));
    expect(plan.flashMs).toBe(80);
  });

  it('repeats earlier items when a repeat gap is configured', () => {
    const plan = buildDrillPlan(tokens, { ...DEFAULT_DRILL, flashCount: 12, repeatAfter: 4, seed: 5 });
    expect(plan.flashes.some((flash) => flash.isRepeat)).toBe(true);
    expect(plan.items).toBe(plan.flashes.length);
    expect(plan.uniqueItems).toBeLessThan(plan.items);
  });

  it('refuses to repeat items when repeats are disabled', () => {
    const plan = buildDrillPlan(tokens, { ...DEFAULT_DRILL, flashCount: 8, repeatAfter: 0, seed: 11 });
    expect(plan.flashes.some((flash) => flash.isRepeat)).toBe(false);
  });

  it('groups words per flash within the supported range', () => {
    const items = drillItems(tokens, 3);
    expect(items[0]!.words).toBe(3);
    expect(items[0]!.text.split(' ')).toHaveLength(3);
    expect(drillItems(tokens, 99)[0]!.words).toBe(5);
    expect(drillItems(tokens, 0)[0]!.words).toBe(1);
  });

  it('draws from the weak-word set when asked', () => {
    const plan = buildDrillPlan(tokens, { ...DEFAULT_DRILL, flashCount: 10, preferWeakWords: true, seed: 2 }, {
      weakWords: new Set(['fox', 'lazy']),
    });
    expect(plan.flashes.every((flash) => /fox|lazy/.test(flash.text))).toBe(true);
  });

  it('returns an empty plan for an empty document', () => {
    const plan = buildDrillPlan([], DEFAULT_DRILL);
    expect(plan.flashes).toHaveLength(0);
    expect(plan.totalMs).toBe(0);
  });

  it('scores recall separately for repeated and first-seen items', () => {
    const plan = buildDrillPlan(tokens, { ...DEFAULT_DRILL, flashCount: 10, repeatAfter: 3, seed: 4 });
    const repeats = plan.flashes.filter((flash) => flash.isRepeat).map((flash) => flash.position);
    const recognised = new Set<number>([0, ...repeats]);
    const score = scoreRecall(plan.flashes, recognised);
    expect(score.total).toBe(plan.flashes.length);
    expect(score.correct).toBe(recognised.size);
    expect(score.repeatsCorrect).toBe(repeats.length);
    expect(score.repeatsTotal).toBe(repeats.length);
    expect(score.firstTryAccuracy).toBeGreaterThan(0);
    expect(score.accuracy).toBeGreaterThan(0);
  });

  it('reports the equivalent reading rate of a flash', () => {
    expect(flashEquivalentWpm(100, 1)).toBe(600);
    expect(flashEquivalentWpm(100, 2)).toBe(1200);
  });

  it('splits the drill stimulus for emphasised rendering', () => {
    const parts = drillStimulus('considered');
    expect(`${parts.lead}${parts.strong}${parts.rest}`).toBe('considered');
    expect(parts.strong.length).toBeGreaterThan(0);
  });

  it('offers presets from settling in down to two frames', () => {
    expect(DRILL_PRESETS.length).toBeGreaterThanOrEqual(5);
    expect(presetById('blink').flashMs).toBe(50);
    expect(presetById('unknown').flashMs).toBe(DRILL_PRESETS[1]!.config.flashMs);
  });

  it('generates repeatable pseudo-random numbers', () => {
    const first = seededRandom(42);
    const second = seededRandom(42);
    const values = [first(), first(), first()];
    expect(values).toEqual([second(), second(), second()]);
    expect(values.every((value) => value >= 0 && value < 1)).toBe(true);
  });
});

describe('full-page pacer geometry', () => {
  const boxes = [
    { x: 40, y: 100, width: 60, height: 20, word: 'The' },
    { x: 104, y: 100, width: 70, height: 20, word: 'reader' },
    { x: 40, y: 132, width: 52, height: 20, word: 'moves' },
  ];

  it('marks the first word of each line', () => {
    const pacer = pacerBoxes(boxes);
    expect(pacer.map((box) => box.newLine)).toEqual([true, false, true]);
  });

  it('glides between words on the same line and jumps at a line break', () => {
    const pacer = pacerBoxes(boxes);
    const glide = pacerPosition(pacer[0]!, pacer[1]!, 0.5);
    expect(glide.x).toBeGreaterThan(pacer[0]!.x);
    expect(glide.x).toBeLessThan(pacer[1]!.x);
    const jump = pacerPosition(pacer[1]!, pacer[2]!, 0.5);
    expect(jump.x).toBe(pacer[1]!.x);
    expect(jump.y).toBe(pacer[1]!.y);
  });

  it('uses the bar width for the band shape', () => {
    const pacer = pacerBoxes(boxes);
    const bar = pacerPosition(pacer[0]!, undefined, 0, { ...DEFAULT_PACER_SHAPE });
    expect(bar.width).toBe(DEFAULT_PACER_SHAPE.barWidth);
    const underline = pacerPosition(pacer[0]!, undefined, 0.5);
    expect(underline.width).toBe(pacer[0]!.width);
  });

  it('holds the paced line at the anchor fraction of the viewport', () => {
    expect(anchorScrollTop(1000, 800, { shape: 'underline', anchorFraction: 0.5, barWidth: 96, feather: 24, glideSeconds: 0.05 })).toBe(600);
    expect(anchorScrollTop(100, 800)).toBe(0);
  });

  it('assigns longer durations to longer words', () => {
    const durations = wordDurations(['a', 'reading', 'extraordinarily'], 300);
    expect(durations[1]).toBeGreaterThan(durations[0]!);
    expect(durations[2]).toBeGreaterThan(durations[1]!);
    expect(Math.max(...durations)).toBeLessThan(60_000 / 40);
  });

  it('computes cumulative start times and page duration', () => {
    const starts = cumulativeStarts([100, 200, 300]);
    expect(starts).toEqual([0, 100, 300]);
    expect(pageDurationMs(['one', 'two', 'three'], 300)).toBe(wordDurations(['one', 'two', 'three'], 300).reduce((total, value) => total + value, 0));
  });

  it('finds the paced word at a point in time', () => {
    const durations = [100, 100, 100];
    const starts = cumulativeStarts(durations);
    const pacer = pacerBoxes(boxes);
    expect(pacerFrameAt(pacer, starts, durations, 0).boxIndex).toBe(0);
    expect(pacerFrameAt(pacer, starts, durations, 150).boxIndex).toBe(1);
    expect(pacerFrameAt(pacer, starts, durations, 150).progress).toBeCloseTo(0.5, 6);
    expect(pacerFrameAt(pacer, starts, durations, 999).boxIndex).toBe(2);
    expect(pacerFrameAt([], [], [], 0).boxIndex).toBe(0);
  });
});

const DEFAULT_PACER_SHAPE = { shape: 'bar' as const, anchorFraction: 0.45, barWidth: 96, feather: 24, glideSeconds: 0.06 };

describe('metronome', () => {
  it('holds the rate inside the supported range', () => {
    expect(clampBpm(10)).toBe(MIN_BPM);
    expect(clampBpm(10_000)).toBe(MAX_BPM);
    expect(clampBpm(0)).toBe(DEFAULT_METRONOME.bpm);
    expect(clampBpm(320)).toBe(320);
  });

  it('converts beats per minute to an interval', () => {
    expect(beatIntervalMs(60)).toBe(1000);
    expect(beatIntervalMs(120)).toBe(500);
    expect(beatIntervalMs(400)).toBe(150);
  });

  it('places accents every bar and nowhere else', () => {
    const beats = beatsInRange({ ...DEFAULT_METRONOME, bpm: 240, accentEvery: 4 }, 1000);
    expect(beats).toHaveLength(4);
    expect(beats.filter((beat) => beat.accent).map((beat) => beat.position)).toEqual([0]);
    const noAccents = beatsInRange({ ...DEFAULT_METRONOME, bpm: 240, accentEvery: 1 }, 1000);
    expect(noAccents.every((beat) => !beat.accent)).toBe(true);
  });

  it('reports the beat a clock is on', () => {
    const config = { ...DEFAULT_METRONOME, bpm: 120, accentEvery: 2 };
    expect(beatAt(config, 0).position).toBe(0);
    expect(beatAt(config, 700).position).toBe(1);
    expect(beatAt(config, 1100).position).toBe(2);
    expect(beatAt(config, 1100).accent).toBe(true);
  });

  it('builds an audio click schedule with quieter non-accented beats', () => {
    const schedule = clickSchedule({ ...DEFAULT_METRONOME, bpm: 240, accentEvery: 4, volume: 0.4, toneHz: 1000 }, 1000);
    expect(schedule).toHaveLength(4);
    expect(schedule[0]!.gain).toBeCloseTo(0.4, 6);
    expect(schedule[1]!.gain).toBeLessThan(schedule[0]!.gain);
    expect(schedule[0]!.frequencyHz).toBe(1500);
    expect(schedule[1]!.frequencyHz).toBe(1000);
  });

  it('names the tempo band and describes what it does to speech', () => {
    expect(tempoName(50)).toBe('Largo');
    expect(tempoName(100)).toBe('Andante');
    expect(tempoName(380)).toBe('Prestissimo');
    expect(describeTempo(100)).toContain('Slower than speech');
    expect(describeTempo(250)).toContain('inner voice');
    expect(describeTempo(400)).toContain('subvocalisation');
  });
});

describe('speech pacing', () => {
  const tokens = model('Reading aloud is paced by the browser. Every word is spoken at a set rate.').tokens;

  it('maps a reading rate onto the synthesiser rate', () => {
    expect(rateForWpm(NEUTRAL_SPEECH_WPM)).toBeCloseTo(1, 6);
    expect(rateForWpm(350)).toBeCloseTo(2, 6);
    expect(rateForWpm(10_000)).toBeLessThanOrEqual(10);
    expect(clampRate(0)).toBe(0.1);
    expect(wpmForRate(2)).toBe(NEUTRAL_SPEECH_WPM * 2);
  });

  it('detects whether speech is available at all', () => {
    expect(detectSpeechSupport({}).supported).toBe(false);
    const supported = detectSpeechSupport({ speechSynthesis: {}, SpeechSynthesisUtterance: () => undefined });
    expect(supported.supported).toBe(true);
    expect(supported.boundaryEvents).toBe(false);
    expect(supported.reason).toContain('estimated timings');
    expect(detectSpeechSupport({ speechSynthesis: {}, SpeechSynthesisUtterance: undefined }).supported).toBe(false);
  });

  it('splits the stream into sentence-sized utterances', () => {
    const plan = buildSpeechPlan(tokens, { wpm: 200 });
    expect(plan.chunks).toHaveLength(2);
    expect(plan.chunks[0]!.text).toBe('Reading aloud is paced by the browser.');
    expect(plan.chunks[1]!.text).toBe('Every word is spoken at a set rate.');
    expect(plan.chunks[0]!.startToken).toBe(0);
    expect(plan.chunks[1]!.startToken).toBe(plan.chunks[0]!.endToken);
  });

  it('caps long sentences at the utterance limit without losing words', () => {
    const long = model('one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty').tokens;
    const plan = buildSpeechPlan(long, { wpm: 200, maxChunkChars: 40 });
    expect(plan.chunks.length).toBeGreaterThan(1);
    const joined = plan.chunks.flatMap((chunk) => chunk.text.split(' '));
    expect(joined).toEqual(long.map((token) => token.text));
  });

  it('estimates a total duration and a realised rate', () => {
    const plan = buildSpeechPlan(tokens, { wpm: 250 });
    expect(plan.totalEstimatedMs).toBeGreaterThan(0);
    expect(plan.wpm).toBeGreaterThan(0);
    expect(chunkStartTimes(plan.chunks)).toHaveLength(plan.chunks.length);
    expect(chunkStartTimes(plan.chunks)[0]).toBe(0);
  });

  it('gives longer words a longer estimate', () => {
    expect(estimateWordMs('extraordinarily', 1)).toBeGreaterThan(estimateWordMs('a', 1));
    expect(estimateWordMs('reading', 2)).toBeLessThan(estimateWordMs('reading', 1));
  });

  it('maps a boundary offset onto the token to highlight', () => {
    const plan = buildSpeechPlan(tokens, { wpm: 200 });
    const chunk = plan.chunks[1]!;
    expect(tokenForCharOffset(chunk, 0)).toBe(chunk.startToken);
    const thirdWordOffset = chunk.tokenOffsets[2]!;
    expect(tokenForCharOffset(chunk, thirdWordOffset)).toBe(chunk.startToken + 2);
    expect(tokenForCharOffset(chunk, 10_000)).toBe(chunk.endToken - 1);
  });

  it('honours a token range for reading a passage aloud', () => {
    const plan = buildSpeechPlan(tokens, { wpm: 200, fromToken: 1, toToken: 5 });
    expect(plan.chunks[0]!.startToken).toBe(1);
    expect(plan.chunks.at(-1)!.endToken).toBe(5);
  });

  it('chooses a voice by language, then by preferred name', () => {
    const voices = [
      { name: 'Karen', lang: 'en-AU' },
      { name: 'Daniel', lang: 'en-GB' },
      { name: 'Amelie', lang: 'fr-CA' },
      { name: 'Thomas', lang: 'fr-FR' },
    ];
    expect(chooseVoice(voices, { language: 'en', preferred: ['Daniel'] })?.name).toBe('Daniel');
    expect(chooseVoice(voices, { language: 'fr' })?.lang).toBe('fr-CA');
    expect(chooseVoice(voices, { language: 'de' })?.name).toBe('Karen');
    expect(chooseVoice([], { language: 'en' })).toBeUndefined();
  });
});

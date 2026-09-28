import { describe, expect, it } from 'vitest';
import {
  BASELINE_WORD_LETTERS,
  DEFAULT_PACING,
  WPM_STEPS,
  baseDurationMs,
  breakMultiplier,
  buildSchedule,
  clampWpm,
  compensationFactor,
  frameAt,
  frameDuration,
  frameForToken,
  rampedWpm,
  rateNote,
  remainingMs,
  scheduleWpm,
} from '../../src/tools/sightline/pacing-engine';
import {
  DEFAULT_CHUNK_CONFIG,
  buildChunkSchedule,
  buildChunks,
  chunkStreamWpm,
  chunksAsTokens,
  suggestedChunkWidth,
} from '../../src/tools/sightline/chunk-engine';
import { buildDocumentModel } from '../../src/tools/sightline/segmentation-engine';

const model = (text: string) => buildDocumentModel({
  format: 'text',
  fileName: 'sample.txt',
  paragraphs: [{ kind: 'body', level: 0, text }],
});

describe('pacing maths', () => {
  it('derives the base duration from the rate', () => {
    expect(baseDurationMs(300)).toBeCloseTo(200, 6);
    expect(baseDurationMs(600)).toBeCloseTo(100, 6);
  });

  it('clamps nonsense rates into a usable band', () => {
    expect(clampWpm(0)).toBe(40);
    expect(clampWpm(-50)).toBe(40);
    expect(clampWpm(9999)).toBe(1600);
    expect(clampWpm(Number.NaN)).toBe(40);
  });

  it('stretches long words and shortens very short ones', () => {
    expect(compensationFactor({ letters: BASELINE_WORD_LETTERS, syllables: 1 }, 'length')).toBeCloseTo(1, 6);
    expect(compensationFactor({ letters: 2, syllables: 1 }, 'length')).toBeLessThan(1);
    expect(compensationFactor({ letters: 14, syllables: 5 }, 'length')).toBeGreaterThan(1);
    expect(compensationFactor({ letters: 14, syllables: 5 }, 'length')).toBeLessThanOrEqual(2.4);
    expect(compensationFactor({ letters: 14, syllables: 5 }, 'none')).toBe(1);
  });

  it('compensates by syllable count when asked', () => {
    expect(compensationFactor({ letters: 8, syllables: 4 }, 'syllable')).toBeGreaterThan(2);
    expect(compensationFactor({ letters: 3, syllables: 1 }, 'syllable')).toBeLessThanOrEqual(1);
  });

  it('applies the configured multipliers at each boundary kind', () => {
    const config = { ...DEFAULT_PACING, periodMultiplier: 2.5, clauseMultiplier: 1.8, paragraphMultiplier: 2, chapterMultiplier: 3.2 };
    expect(breakMultiplier('none', config)).toBe(1);
    expect(breakMultiplier('clause', config)).toBe(1.8);
    expect(breakMultiplier('sentence', config)).toBe(2.5);
    expect(breakMultiplier('paragraph', config)).toBe(2);
    expect(breakMultiplier('chapter', config)).toBe(3.2);
    expect(breakMultiplier('sentence', { ...config, respectBreaks: false })).toBe(1);
  });

  it('turns boundary multipliers into pause milliseconds', () => {
    const config = { ...DEFAULT_PACING, wpm: 300, compensator: 'none' as const, periodMultiplier: 2.5 };
    const plain = frameDuration({ letters: 5, syllables: 1, breakAfter: 'none' }, config);
    const sentence = frameDuration({ letters: 5, syllables: 1, breakAfter: 'sentence' }, config);
    expect(plain.durationMs).toBe(200);
    expect(plain.pauseMs).toBe(0);
    expect(sentence.durationMs).toBe(200);
    expect(sentence.pauseMs).toBe(300);
  });

  it('ramps the rate in steps and stops at the ceiling', () => {
    const config = {
      ...DEFAULT_PACING,
      ramp: { startWpm: 200, stepWpm: 20, everyTokens: 100, ceilingWpm: 260 },
    };
    expect(rampedWpm(config, 0)).toBe(200);
    expect(rampedWpm(config, 99)).toBe(200);
    expect(rampedWpm(config, 100)).toBe(220);
    expect(rampedWpm(config, 250)).toBe(240);
    expect(rampedWpm(config, 5000)).toBe(260);
    expect(rampedWpm(DEFAULT_PACING, 5000)).toBe(DEFAULT_PACING.wpm);
  });

  it('builds a schedule whose frames are contiguous and ordered', () => {
    const tokens = model('One two three four. Five six, seven eight nine.').tokens;
    const schedule = buildSchedule(tokens, { ...DEFAULT_PACING, wpm: 300, compensator: 'none' });
    expect(schedule.frames).toHaveLength(tokens.length);
    schedule.frames.forEach((frame, index) => {
      if (index > 0) expect(frame.startMs).toBe(schedule.frames[index - 1]!.endMs);
      expect(frame.endMs).toBeGreaterThan(frame.startMs);
    });
    expect(schedule.totalMs).toBe(schedule.frames.at(-1)!.endMs);
    expect(schedule.startWpm).toBe(300);
    expect(schedule.peakWpm).toBe(300);
  });

  it('reports the realised rate from the schedule itself', () => {
    const tokens = model('alpha beta gamma delta epsilon zeta').tokens;
    const schedule = buildSchedule(tokens, { ...DEFAULT_PACING, wpm: 240, compensator: 'none', respectBreaks: false });
    // Six words at 240 wpm is 1500 ms, which is 240 wpm.
    expect(schedule.totalMs).toBe(1500);
    expect(scheduleWpm(schedule)).toBe(240);
  });

  it('adds a longer pause at the end of the document than inside it', () => {
    const tokens = model('alpha beta gamma delta epsilon zeta').tokens;
    const withBreaks = buildSchedule(tokens, { ...DEFAULT_PACING, wpm: 240, compensator: 'none' });
    // The last token of the document carries the chapter break, so the final
    // pause is longer than the pause that would follow a sentence.
    expect(withBreaks.frames.at(-1)!.pauseMs).toBe(Math.round(baseDurationMs(240) * (DEFAULT_PACING.chapterMultiplier - 1)));
    expect(withBreaks.totalMs).toBeGreaterThan(1500);
  });

  it('slows the realised rate when compensation and pauses apply', () => {
    const tokens = model('A consideration. Extraordinarily complicated punctuation, and more.').tokens;
    const flat = buildSchedule(tokens, { ...DEFAULT_PACING, wpm: 400, compensator: 'none', respectBreaks: false });
    const realistic = buildSchedule(tokens, { ...DEFAULT_PACING, wpm: 400, compensator: 'syllable', respectBreaks: true });
    expect(scheduleWpm(realistic)).toBeLessThan(scheduleWpm(flat));
  });

  it('honours a range so a passage can be scheduled alone', () => {
    const tokens = model('one two three four five six').tokens;
    const schedule = buildSchedule(tokens, DEFAULT_PACING, { fromToken: 2, toToken: 4 });
    expect(schedule.frames.map((frame) => frame.tokenIndex)).toEqual([2, 3]);
    expect(schedule.frames[0]!.startMs).toBe(0);
  });

  it('finds the frame at a point in time and the time left after it', () => {
    const tokens = model('one two three').tokens;
    const schedule = buildSchedule(tokens, { ...DEFAULT_PACING, wpm: 300, compensator: 'none', respectBreaks: false });
    expect(frameAt(schedule, 0)?.tokenIndex).toBe(0);
    expect(frameAt(schedule, 250)?.tokenIndex).toBe(1);
    expect(frameAt(schedule, schedule.totalMs + 1)).toBeUndefined();
    expect(frameAt(schedule, -1)).toBeUndefined();
    expect(remainingMs(schedule, 0)).toBe(600);
    expect(remainingMs(schedule, 450)).toBe(200);
    expect(remainingMs(schedule, 10_000)).toBe(0);
    expect(frameForToken(schedule, 2)?.tokenIndex).toBe(2);
  });

  it('offers rate steps with an evidence note for each band', () => {
    expect(WPM_STEPS[0]).toBe(100);
    expect([...WPM_STEPS]).toEqual([...WPM_STEPS].sort((left, right) => left - right));
    expect(rateNote(200)).toContain('natural silent reading rate');
    expect(rateNote(350)).toContain('comprehension is usually held');
    expect(rateNote(390)).toContain('starts to fall');
    expect(rateNote(900)).toContain('recall of detail');
  });
});

describe('chunking', () => {
  const tokens = model('In the beginning, the reader paused. Then the reader continued swiftly onward.').tokens;

  it('groups words into chunks of the requested width', () => {
    const chunks = buildChunks(tokens, { wordsPerChunk: 3, splitPolicy: 'balanced' });
    expect(chunks.every((chunk) => chunk.words >= 1 && chunk.words <= 3)).toBe(true);
    expect(chunks.reduce((total, chunk) => total + chunk.words, 0)).toBe(tokens.length);
  });

  it('closes a chunk at clause and sentence boundaries when asked to', () => {
    const chunks = buildChunks(tokens, { wordsPerChunk: 4, splitPolicy: 'punctuation' });
    const firstClause = chunks.find((chunk) => chunk.text.endsWith('beginning,'))!;
    expect(firstClause.breakAfter).toBe('clause');
    const firstSentence = chunks.find((chunk) => chunk.text.endsWith('paused.'))!;
    expect(firstSentence.breakAfter).toBe('sentence');
    expect(firstSentence.endsSentence).toBe(true);
  });

  it('never spans two sentences', () => {
    for (const chunk of buildChunks(tokens, { wordsPerChunk: 5, splitPolicy: 'punctuation' })) {
      const slice = tokens.slice(chunk.startToken, chunk.endToken);
      const sentenceIndexes = new Set(slice.map((token) => token.sentenceIndex));
      expect(sentenceIndexes.size).toBe(1);
    }
  });

  it('anchors the widest word of the chunk', () => {
    const chunks = buildChunks(model('a considered answer').tokens, { wordsPerChunk: 3, splitPolicy: 'balanced' });
    const chunk = chunks[0]!;
    expect(chunk.anchorOffset).toBe(1);
    expect(chunk.text.split(' ')[chunk.anchorOffset]).toBe('considered');
  });

  it('presents a single word per unit when configured to', () => {
    const chunks = buildChunks(tokens, { wordsPerChunk: 1, splitPolicy: 'punctuation' });
    expect(chunks).toHaveLength(tokens.length);
    expect(chunks.every((chunk) => chunk.words === 1)).toBe(true);
  });

  it('builds a synthetic token per chunk so timing can be reused', () => {
    const chunks = buildChunks(tokens, { wordsPerChunk: 2, splitPolicy: 'balanced' });
    const synthetic = chunksAsTokens(chunks, tokens);
    expect(synthetic).toHaveLength(chunks.length);
    const first = chunks[0]!;
    expect(synthetic[0]!.letters).toBe(tokens.slice(first.startToken, first.endToken).reduce((total, token) => total + token.letters, 0));
    expect(synthetic[0]!.text).toBe(first.text);
  });

  it('schedules a chunk stream and reports the rate it delivers', () => {
    const { chunks, schedule } = buildChunkSchedule(tokens, { wordsPerChunk: 2, splitPolicy: 'balanced' }, { ...DEFAULT_PACING, wpm: 300 });
    expect(schedule.frames).toHaveLength(chunks.length);
    expect(schedule.totalMs).toBeGreaterThan(0);
    expect(chunkStreamWpm(chunks, schedule)).toBeGreaterThan(0);
    // Fewer words per chunk means more presentations, so the realised rate drops.
    const single = buildChunkSchedule(tokens, { wordsPerChunk: 1, splitPolicy: 'punctuation' }, { ...DEFAULT_PACING, wpm: 300 });
    expect(chunkStreamWpm(single.chunks, single.schedule)).toBeLessThan(chunkStreamWpm(chunks, schedule));
  });

  it('suggests a chunk width that grows with the rate', () => {
    expect(suggestedChunkWidth(200)).toBe(1);
    expect(suggestedChunkWidth(350)).toBe(2);
    expect(suggestedChunkWidth(500)).toBe(3);
    expect(suggestedChunkWidth(1000)).toBe(5);
  });

  it('keeps the default chunk width within the supported range', () => {
    expect(DEFAULT_CHUNK_CONFIG.wordsPerChunk).toBeGreaterThanOrEqual(1);
    expect(DEFAULT_CHUNK_CONFIG.wordsPerChunk).toBeLessThanOrEqual(5);
  });
});

/**
 * Pacing metronome.
 *
 * Subvocalisation — silently saying the words — caps reading speed near speech,
 * because the inner voice has to finish each word. A click track at a rate
 * faster than speech gives the reader something to keep pace with and makes the
 * habit audible: at 300 beats per minute there is no time between beats to say
 * anything. The clicks can be audible, visual, or both.
 *
 * The engine computes beat times and synthesises the click envelope; the audio
 * context is injected, so this stays testable and the reader can mute it.
 */

export interface MetronomeConfig {
  /** Beats per minute, 40–400. */
  readonly bpm: number;
  /** An accented beat every N beats, as a bar marker; 1 disables accents. */
  readonly accentEvery: number;
  /** Click tone frequency in hertz. */
  readonly toneHz: number;
  /** Click length in milliseconds. */
  readonly clickMs: number;
  /** Amplitude between 0 and 1. */
  readonly volume: number;
  /** How the metronome presents itself. */
  readonly channel: 'audio' | 'visual' | 'both';
}

export const DEFAULT_METRONOME: MetronomeConfig = {
  bpm: 300,
  accentEvery: 4,
  toneHz: 1100,
  clickMs: 18,
  volume: 0.35,
  channel: 'audio',
};

export const MIN_BPM = 40;
export const MAX_BPM = 400;

export const clampBpm = (bpm: number): number => {
  const rounded = Math.round(bpm);
  if (!Number.isFinite(rounded) || rounded <= 0) return DEFAULT_METRONOME.bpm;
  return Math.min(MAX_BPM, Math.max(MIN_BPM, rounded));
};

/** Milliseconds between beats. */
export const beatIntervalMs = (bpm: number): number => 60_000 / clampBpm(bpm);

export interface Beat {
  readonly position: number;
  readonly atMs: number;
  readonly accent: boolean;
}

/** Beat times for a span, from a start offset. */
export const beatsInRange = (
  config: MetronomeConfig,
  durationMs: number,
  startOffsetMs = 0,
): Beat[] => {
  const interval = beatIntervalMs(config.bpm);
  const accentEvery = Math.max(1, Math.round(config.accentEvery));
  const count = Math.max(0, Math.floor((Math.max(0, durationMs) - startOffsetMs) / interval));
  return Array.from({ length: count }, (_, index) => ({
    position: index,
    atMs: Math.round(startOffsetMs + index * interval),
    accent: accentEvery > 1 && index % accentEvery === 0,
  }));
};

/** The beat a monotic clock is on, for driving the visual pulse. */
export const beatAt = (config: MetronomeConfig, elapsedMs: number): Beat => {
  const interval = beatIntervalMs(config.bpm);
  const position = Math.max(0, Math.floor(elapsedMs / interval));
  const accentEvery = Math.max(1, Math.round(config.accentEvery));
  return {
    position,
    atMs: Math.round(position * interval),
    accent: accentEvery > 1 && position % accentEvery === 0,
  };
};

/** Rate expressed the way a reader thinks about it. */
export const describeTempo = (bpm: number): string => {
  const rate = clampBpm(bpm);
  if (rate < 120) return 'Slower than speech. Use this to slow a fast reader down, not to push.';
  if (rate < 200) return 'Around conversational speed, with the pauses removed.';
  if (rate < 300) return 'Faster than speech; the inner voice has to drop words to keep up.';
  if (rate <= MAX_BPM) return 'Beyond any possible subvocalisation. Clicks carry the rhythm alone.';
  return 'Out of range.';
};

export interface ClickSample {
  readonly atMs: number;
  readonly durationMs: number;
  readonly frequencyHz: number;
  readonly gain: number;
}

/** Audio schedule for a window of beats, for an injected audio context. */
export const clickSchedule = (
  config: MetronomeConfig,
  windowMs: number,
  startOffsetMs = 0,
): ClickSample[] => {
  const volume = Math.min(1, Math.max(0, config.volume));
  return beatsInRange(config, windowMs, startOffsetMs).map((beat) => ({
    atMs: beat.atMs,
    durationMs: Math.max(5, Math.round(config.clickMs)),
    frequencyHz: beat.accent ? Math.round(config.toneHz * 1.5) : config.toneHz,
    gain: beat.accent ? volume : volume * 0.6,
  }));
};

/**
 * Musical tempo names for the beat, so the control reads like a metronome rather
 * than a number. Ranges follow the conventional tempo markings.
 */
export const tempoName = (bpm: number): string => {
  const rate = clampBpm(bpm);
  if (rate < 60) return 'Largo';
  if (rate < 76) return 'Adagio';
  if (rate < 108) return 'Andante';
  if (rate < 120) return 'Moderato';
  if (rate < 168) return 'Allegro';
  if (rate < 200) return 'Presto';
  return 'Prestissimo';
};

export const METRONOME_PRESETS: readonly { id: string; label: string; bpm: number; detail: string }[] = [
  { id: 'speech', label: 'Speech pace', bpm: 150, detail: 'About the rate of reading aloud.' },
  { id: 'subvocal', label: 'At the inner voice', bpm: 250, detail: 'The fastest rate at which silent speech is still possible.' },
  { id: 'beyond', label: 'Beyond speech', bpm: 320, detail: 'No time left between beats to say the words.' },
  { id: 'drill', label: 'Drill tempo', bpm: 400, detail: 'The fastest the metronome will go.' },
];

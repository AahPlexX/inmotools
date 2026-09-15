/**
 * Fluid pacer geometry for full-page reading.
 *
 * In page mode the reader keeps the whole text on screen and the tool supplies
 * the rhythm: a moving band, underline, or highlight travels through the words
 * at the chosen rate. Because the text keeps its normal layout, word positions
 * have to be measured from the rendered page, and this module holds the maths
 * that turns those measurements plus a reading rate into a position over time.
 *
 * Three shapes are supported:
 *
 * - `bar` — a fixed-width band that travels along the current line and jumps to
 *   the start of the next one.
 * - `underline` — a line drawn under the words currently being paced.
 * - `window` — a translucent rectangle over the words currently being paced.
 */

export interface WordBox {
  /** Left edge in page coordinates, in pixels. */
  readonly x: number;
  /** Top edge in page coordinates, in pixels. */
  readonly y: number;
  readonly width: number;
  readonly height: number;
  /** The word itself, so callers can log or speak it. */
  readonly word: string;
}

export type PacerShape = 'bar' | 'underline' | 'window';

export interface PacerConfig {
  readonly shape: PacerShape;
  /** Fraction of the viewport height at which the paced line is held, 0.2–0.8. */
  readonly anchorFraction: number;
  /** Band width in pixels, for the `bar` shape. */
  readonly barWidth: number;
  /** How far the pacer fades at the edges of its travel, in pixels. */
  readonly feather: number;
  /** Seconds the pacer takes to glide between consecutive words. */
  readonly glideSeconds: number;
}

export const PACER_SHAPES: readonly { readonly id: PacerShape; readonly label: string; readonly detail: string }[] = [
  { id: 'bar', label: 'Bar', detail: 'A band centred on the word, wide enough to cover the next fixation.' },
  { id: 'underline', label: 'Underline', detail: 'A line under the word, which leaves the letters themselves unobstructed.' },
  { id: 'window', label: 'Window', detail: 'A translucent panel over the word, so the surrounding line stays visible.' },
];

export const DEFAULT_PACER: PacerConfig = {
  shape: 'underline',
  anchorFraction: 0.45,
  barWidth: 96,
  feather: 24,
  glideSeconds: 0.06,
};

export interface PacerBox {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  /** True when this box begins a new line, which makes the pacer jump. */
  readonly newLine: boolean;
}

/** Turn measured word boxes into pacer boxes, marking line starts. */
export const pacerBoxes = (boxes: readonly WordBox[]): PacerBox[] => {
  let previousY: number | null = null;
  return boxes.map((box) => {
    const newLine = previousY === null || Math.abs(box.y - previousY) > Math.max(2, box.height * 0.4);
    previousY = box.y;
    return { x: box.x, y: box.y, width: box.width, height: box.height, newLine };
  });
};

/** Scroll offset that holds a given line at the configured anchor fraction. */
export const anchorScrollTop = (
  lineTop: number,
  viewportHeight: number,
  config: PacerConfig = DEFAULT_PACER,
): number => {
  const fraction = Math.min(0.8, Math.max(0.2, config.anchorFraction));
  return Math.max(0, Math.round(lineTop - viewportHeight * fraction));
};

/**
 * Position of the pacer between two word boxes at a point in time. The pacer
 * glides rather than jumping, except at a line break, where a glide would drag
 * the eye backwards across text that has already been read.
 */
export const pacerPosition = (
  current: PacerBox,
  next: PacerBox | undefined,
  progress: number,
  config: PacerConfig = DEFAULT_PACER,
): { x: number; y: number; width: number; height: number } => {
  const t = Math.min(1, Math.max(0, progress));
  if (!next || next.newLine || t <= 0) {
    return widthFor(current, config);
  }
  const eased = easeInOut(t);
  return {
    x: current.x + (next.x - current.x) * eased,
    y: current.y + (next.y - current.y) * eased,
    width: current.width + (next.width - current.width) * eased,
    height: current.height + (next.height - current.height) * eased,
  };
};

const widthFor = (box: PacerBox, config: PacerConfig): { x: number; y: number; width: number; height: number } => {
  if (config.shape === 'bar') {
    const centre = box.x + box.width / 2;
    return { x: centre - config.barWidth / 2, y: box.y, width: config.barWidth, height: box.height };
  }
  return { x: box.x, y: box.y, width: box.width, height: box.height };
};

const easeInOut = (t: number): number => (t < 0.5 ? 2 * t * t : 1 - 2 * (1 - t) * (1 - t));

export interface PacerFrame {
  /** Box index the pacer is over. */
  readonly boxIndex: number;
  /** Progress from the current box to the next, 0–1. */
  readonly progress: number;
  readonly scrollTop: number;
}

/**
 * Which box is being paced at a point in time, and how far the pacer has
 * travelled toward the next one. Word timings come from the pacing engine.
 */
export const pacerFrameAt = (
  boxes: readonly PacerBox[],
  wordStartMs: readonly number[],
  wordDurationMs: readonly number[],
  elapsedMs: number,
  config: PacerConfig = DEFAULT_PACER,
): PacerFrame => {
  if (boxes.length === 0 || wordStartMs.length === 0) return { boxIndex: 0, progress: 0, scrollTop: 0 };
  const last = Math.min(boxes.length, wordStartMs.length) - 1;
  let index = 0;
  while (index < last && wordStartMs[index + 1]! <= elapsedMs) index += 1;
  const start = wordStartMs[index] ?? 0;
  const duration = Math.max(1, wordDurationMs[index] ?? 1);
  // The glide itself is a CSS transition on the pacer element; this reports how
  // far through the current word the reader is.
  const progress = Math.min(1, Math.max(0, (elapsedMs - start) / duration));
  void config;
  return { boxIndex: index, progress, scrollTop: 0 };
};

/** Milliseconds each word receives from a reading rate. */
export const wordDurations = (words: readonly string[], wpm: number): number[] => {
  const base = 60_000 / Math.min(1600, Math.max(40, wpm || 0));
  return words.map((word) => {
    const letters = (word.match(/[A-Za-z0-9\u00c0-\u024f]/g) ?? []).length;
    const factor = letters === 0 ? 0.5 : Math.min(2.4, Math.max(0.55, letters / 4.7));
    return Math.round(base * factor);
  });
};

/** Cumulative start times for a list of durations. */
export const cumulativeStarts = (durations: readonly number[]): number[] => {
  const starts: number[] = [];
  let cursor = 0;
  for (const duration of durations) {
    starts.push(cursor);
    cursor += duration;
  }
  return starts;
};

/** Total time a page takes at a given rate. */
export const pageDurationMs = (words: readonly string[], wpm: number): number =>
  wordDurations(words, wpm).reduce((total, duration) => total + duration, 0);

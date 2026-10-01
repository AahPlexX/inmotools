/** How many lines of the passage are visible at once. Three keeps the next line in sight without
 * showing a wall of text. */
export const PASSAGE_WINDOW_LINES = 3;

/**
 * Which line should sit at the top of the passage window, so the line being typed stays on the
 * middle row and the typist always sees one line behind and one ahead. Never scrolls past the
 * point where the last line is the bottom row, so the window is not padded with blank space.
 * Lines are zero-based. Pure, so it can be tested without a DOM.
 */
export function passageWindowStartLine(activeLine: number, totalLines: number, windowLines = PASSAGE_WINDOW_LINES): number {
  const lines = Math.max(1, Math.floor(totalLines));
  const rows = Math.max(1, Math.floor(windowLines));
  const active = Math.min(Math.max(0, Math.floor(activeLine) || 0), lines - 1);
  const lastStart = Math.max(0, lines - rows);
  const wanted = active - Math.floor(rows / 2);
  return Math.min(lastStart, Math.max(0, wanted));
}

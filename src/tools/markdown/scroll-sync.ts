import type { ScrollAnchorOffset } from './markdown-types';

// Computes the preview scroll offset that corresponds to the editor's current
// source line, by linearly interpolating between the two nearest anchors
// (a rendered top-level element's source line and its measured vertical
// position in the preview DOM).
//
// This is a real, testable position-tracking aid: it closely follows visual
// position for documents with irregular block heights (large diagrams,
// tables, images), because it interpolates within the actual bounding
// element's local offset range rather than the whole-document percentage.
// It is not a claim of sub-pixel or zero-jitter alignment - anchor
// measurements come from real layout, so precision is bounded by whatever
// the caller measured.

const sortAnchors = (anchors: ScrollAnchorOffset[]): ScrollAnchorOffset[] =>
  [...anchors].sort((a, b) => a.sourceLine - b.sourceLine);

export const computeScrollOffset = (
  anchors: readonly ScrollAnchorOffset[],
  currentLine: number,
): number => {
  if (anchors.length === 0) return 0;

  const sorted = sortAnchors([...anchors]);

  if (currentLine <= sorted[0].sourceLine) return sorted[0].offsetTop;
  const last = sorted[sorted.length - 1];
  if (currentLine >= last.sourceLine) return last.offsetTop;

  for (let index = 0; index < sorted.length - 1; index += 1) {
    const start = sorted[index];
    const end = sorted[index + 1];
    if (currentLine >= start.sourceLine && currentLine <= end.sourceLine) {
      const lineSpan = end.sourceLine - start.sourceLine;
      if (lineSpan === 0) return start.offsetTop;
      const t = (currentLine - start.sourceLine) / lineSpan;
      return start.offsetTop + t * (end.offsetTop - start.offsetTop);
    }
  }

  // Unreachable given the bounds checks above, but keeps the function total.
  return last.offsetTop;
};

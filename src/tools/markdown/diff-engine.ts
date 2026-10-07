import { Text } from '@codemirror/state';
import { Chunk } from '@codemirror/merge';

// Line-level comparison of the current document with a baseline (opened file or saved draft).
// It uses the same chunking as the diff view (@codemirror/merge) so the summary and the
// highlighted lines always agree. Line endings are ignored: CRLF and LF text compare equal.

export interface LineDiffSummary {
  readonly identical: boolean;
  readonly changes: number;
  readonly addedLines: number;
  readonly removedLines: number;
}

// The same limit the diff view applies, so a very large pair of documents falls back to a fast diff.
export const DIFF_CONFIG = { scanLimit: 500 } as const;

export const toDiffText = (source: string): Text => Text.of(source.split(/\r\n|\r|\n/));

const linesBetween = (doc: Text, from: number, to: number): number =>
  to > from ? doc.lineAt(to - 1).number - doc.lineAt(from).number + 1 : 0;

export const summarizeLineDiff = (baseline: string, current: string): LineDiffSummary => {
  const a = toDiffText(baseline);
  const b = toDiffText(current);
  const chunks = Chunk.build(a, b, DIFF_CONFIG);
  let addedLines = 0;
  let removedLines = 0;
  for (const chunk of chunks) {
    removedLines += linesBetween(a, chunk.fromA, chunk.toA);
    addedLines += linesBetween(b, chunk.fromB, chunk.toB);
  }
  return { identical: chunks.length === 0, changes: chunks.length, addedLines, removedLines };
};

export const describeLineDiff = (summary: LineDiffSummary): string => {
  if (summary.identical) return 'No differences.';
  const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;
  return `${plural(summary.changes, 'change')}: ${plural(summary.addedLines, 'line')} added or changed, ${plural(summary.removedLines, 'line')} removed or replaced.`;
};

import { describe, expect, it } from 'vitest';
import { describeLineDiff, summarizeLineDiff } from '../../src/tools/markdown/diff-engine';

describe('line diff summary', () => {
  it('reports identical text, ignoring line-ending style', () => {
    expect(summarizeLineDiff('a\nb\n', 'a\r\nb\r\n')).toEqual({ identical: true, changes: 0, addedLines: 0, removedLines: 0 });
    expect(describeLineDiff(summarizeLineDiff('same', 'same'))).toBe('No differences.');
  });

  it('shows an edited line as one change with one line removed and one added', () => {
    const summary = summarizeLineDiff('one\ntwo\nthree\n', 'one\nTWO\nthree\n');
    expect(summary).toMatchObject({ identical: false, changes: 1, addedLines: 1, removedLines: 1 });
    expect(describeLineDiff(summary)).toBe('1 change: 1 line added or changed, 1 line removed or replaced.');
  });

  it('counts pure insertions and deletions separately', () => {
    expect(summarizeLineDiff('a\nb\n', 'a\nb\nc\nd\n')).toMatchObject({ changes: 1, addedLines: 2, removedLines: 0 });
    expect(summarizeLineDiff('a\nb\nc\n', 'a\n')).toMatchObject({ changes: 1, addedLines: 0, removedLines: 2 });
  });

  it('separates distant edits into distinct changes', () => {
    const base = Array.from({ length: 20 }, (_, index) => `line ${index}`).join('\n');
    const edited = base.replace('line 2', 'LINE 2').replace('line 17', 'LINE 17');
    expect(summarizeLineDiff(base, edited)).toMatchObject({ changes: 2, addedLines: 2, removedLines: 2 });
  });

  it('treats a baseline of nothing as all lines added', () => {
    expect(summarizeLineDiff('', 'x\ny')).toMatchObject({ identical: false, addedLines: 2 });
  });
});

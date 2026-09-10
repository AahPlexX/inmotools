import { describe, expect, it } from 'vitest';
import { extractGroupNames, rowsToCsv, structureLogLines, unmatchedToTsv } from '../../src/tools/logs/log-engine';

describe('log structurer audit regressions', () => {
  it('derives escaped named captures from ECMAScript regex semantics', () => {
    const pattern = String.raw`(?<plain>\w+)-(?<\u0061>a)`;
    expect(extractGroupNames(pattern)).toEqual(['plain', 'a']);
    const result = structureLogLines('word-a', pattern);
    expect(result.columns).toEqual(['plain', 'a']);
    expect(result.rows[0]).toEqual({ plain: 'word', a: 'a' });
  });

  it('keeps source line numbers for matched and unmatched line-mode records', () => {
    const result = structureLogLines('id=1\nnoise\nid=2', String.raw`id=(?<id>\d+)`);
    expect(result.rowLineNumbers).toEqual([1, 3]);
    expect(result.unmatchedLineNumbers).toEqual([2]);
  });

  it('reports source line numbers for document-mode matches and gaps', () => {
    const result = structureLogLines('id=1\nnoise\nid=2', String.raw`id=(?<id>\d+)`, {}, 'document');
    expect(result.rowLineNumbers).toEqual([1, 3]);
    expect(result.unmatched).toEqual(['noise']);
    expect(result.unmatchedLineNumbers).toEqual([2]);
  });

  it('preserves whitespace and genuine blank unmatched lines in whole-document mode', () => {
    const input = '  before  \n\nid=1\n\tbetween\t\n\nid=2\n  after  ';
    const result = structureLogLines(input, String.raw`id=(?<id>\d+)`, {}, 'document');
    expect(result.unmatched).toEqual(['  before  ', '', '\tbetween\t', '', '  after  ']);
    expect(result.unmatchedLineNumbers).toEqual([1, 2, 4, 5, 7]);
  });

  it('quotes unmatched TSV fields containing tabs without changing their text', () => {
    expect(unmatchedToTsv(['plain', 'left\tright'], [2, 3])).toBe('source_line\ttext\r\n2\tplain\r\n3\t"left\tright"');
  });

  it('neutralizes spreadsheet formulas in CSV while leaving ordinary negative numbers numeric', () => {
    const csv = rowsToCsv([
      { value: '=2+2' },
      { value: '+cmd' },
      { value: '@SUM(A1:A2)' },
      { value: '-cmd' },
      { value: '-7.5' },
    ], ['value']);
    expect(csv).toContain("'=2+2");
    expect(csv).toContain("'+cmd");
    expect(csv).toContain("'@SUM(A1:A2)");
    expect(csv).toContain("'-cmd");
    expect(csv).toContain('\r\n-7.5');
  });
});

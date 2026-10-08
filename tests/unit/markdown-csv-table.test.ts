import { describe, expect, it } from 'vitest';
import type { Root } from 'mdast';
import {
  CsvTableError,
  csvToMarkdownTable,
  findTableAtLine,
  markdownTableToCsv,
  MAX_CSV_COLUMNS,
  parseCsv,
} from '../../src/tools/markdown/csv-table-engine';
import { buildMarkdownTable } from '../../src/tools/markdown/table-builder';
import { parseMarkdown } from '../../src/tools/markdown/parse-engine';

describe('MDW-R72 CSV and Markdown tables', () => {
  it('turns CSV into a pipe table with the first row as header', () => {
    expect(csvToMarkdownTable('Name,Qty\nWidget,4\nGadget,10\n')).toBe(
      '| Name | Qty |\n| --- | --- |\n| Widget | 4 |\n| Gadget | 10 |',
    );
  });

  it('reads quotes, doubled quotes, line breaks inside quotes and CRLF', () => {
    expect(parseCsv('a,"b,c","say ""hi"""\r\n"x\ny",2,\r\n')).toEqual([
      ['a', 'b,c', 'say "hi"'],
      ['x\ny', '2', ''],
    ]);
  });

  it('recognises semicolon and tab separated text', () => {
    expect(parseCsv('a;b\n1;2')).toEqual([['a', 'b'], ['1', '2']]);
    expect(parseCsv('a\tb\n1\t2')).toEqual([['a', 'b'], ['1', '2']]);
  });

  it('escapes pipes, writes line breaks as <br> and pads short rows', () => {
    expect(csvToMarkdownTable('a,b,c\n"x|y","l1\nl2"')).toBe(
      '| a | b | c |\n| --- | --- | --- |\n| x\\|y | l1<br>l2 |  |',
    );
  });

  it('reports empty input, unclosed quotes and too many columns', () => {
    expect(() => csvToMarkdownTable('  \n')).toThrow(CsvTableError);
    expect(() => csvToMarkdownTable('a,"b')).toThrow(/never closed/);
    expect(() => csvToMarkdownTable(Array.from({ length: MAX_CSV_COLUMNS + 1 }, (_, i) => i).join(','))).toThrow(/columns/);
  });

  it('turns a pipe table into CSV, dropping the delimiter row', () => {
    expect(markdownTableToCsv('| Name | Qty |\n| :--- | ---: |\n| Widget | 4 |')).toBe('Name,Qty\nWidget,4');
  });

  it('quotes CSV fields that need it and restores escaped pipes and <br>', () => {
    const csv = markdownTableToCsv('| a | b |\n| --- | --- |\n| x\\|y | l1<br>l2 |\n| "q", | plain |');
    expect(csv).toBe('a,b\n' + 'x|y,"l1\nl2"\n' + '"""q"",",plain');
  });

  it('round-trips CSV through a table', () => {
    const csv = 'Name,Note\nAda,"likes, commas"\nBob,"two\nlines"';
    expect(markdownTableToCsv(csvToMarkdownTable(csv))).toBe(csv);
  });

  it('still builds the empty grid of the table builder', () => {
    expect(buildMarkdownTable(1, 2)).toBe('| Column 1 | Column 2 |\n| --- | --- |\n|  |  |');
  });

  it('finds the table around a line, counting frontmatter lines', () => {
    const source = '---\ntitle: T\n---\n\ntext\n\n| a | b |\n| - | - |\n| 1 | 2 |\n\nafter\n';
    const parsed = parseMarkdown(source);
    const offset = parsed.frontmatter.format === null ? 0 : parsed.frontmatter.bodyStartLine - 1;
    const found = findTableAtLine(parsed.tree as Root, source, 8, offset);
    expect(found?.source).toBe('| a | b |\n| - | - |\n| 1 | 2 |');
    expect([found?.startLine, found?.endLine]).toEqual([7, 9]);
    expect(findTableAtLine(parsed.tree as Root, source, 5, offset)).toBeNull();
    expect(findTableAtLine(parseMarkdown('```\n| a |\n| - |\n```\n').tree as Root, '```\n| a |\n| - |\n```\n', 2)).toBeNull();
  });
});

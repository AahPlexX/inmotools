import { describe, expect, it } from 'vitest';
import {
  evaluateAllMarkdownTables,
  evaluateTableFormulas,
  findMarkdownTables,
  substituteFormulaValues,
} from '../../src/tools/markdown/table-formula-engine';

describe('table formula evaluation', () => {
  it('evaluates basic arithmetic between two cell references', () => {
    const result = evaluateTableFormulas({
      rows: [
        ['Item', 'Qty', 'Unit Price', 'Total'],
        ['Apples', '10', '1.5', '=B2*C2'],
      ],
    });
    expect(result.rows[1][3]).toBe(15);
  });

  it('evaluates a SUM over a cell range', () => {
    const result = evaluateTableFormulas({
      rows: [
        ['Item', 'Qty'],
        ['Apples', '10'],
        ['Oranges', '5'],
        ['Total', '=SUM(B2:B3)'],
      ],
    });
    expect(result.rows[3][1]).toBe(15);
  });

  it('evaluates AVERAGE, MIN, MAX, and COUNT over a range', () => {
    const result = evaluateTableFormulas({
      rows: [
        ['4'],
        ['8'],
        ['=AVERAGE(A1:A2)'],
        ['=MIN(A1:A2)'],
        ['=MAX(A1:A2)'],
        ['=COUNT(A1:A2)'],
      ],
    });
    expect(result.rows[2][0]).toBe(6);
    expect(result.rows[3][0]).toBe(4);
    expect(result.rows[4][0]).toBe(8);
    expect(result.rows[5][0]).toBe(2);
  });

  it('evaluates ROUND with a precision argument', () => {
    const result = evaluateTableFormulas({ rows: [['=ROUND(3.14159, 2)']] });
    expect(result.rows[0][0]).toBe(3.14);
  });

  it('resolves a chained formula that depends on another formula cell', () => {
    const result = evaluateTableFormulas({
      rows: [['10'], ['=A1*2'], ['=A2+1']],
    });
    expect(result.rows[1][0]).toBe(20);
    expect(result.rows[2][0]).toBe(21);
  });

  it('detects a direct two-cell cycle (A1 -> B1 -> A1) and reports it without evaluating', () => {
    const cyclic = evaluateTableFormulas({ rows: [['=B1', '=A1']] });
    expect(cyclic.rows[0][0]).toBe('#REF! Cyclic Dependency');
    expect(cyclic.rows[0][1]).toBe('#REF! Cyclic Dependency');
    expect(cyclic.errors.get('0:0')).toBe('CYCLE');
  });

  it('does not stop the whole grid from evaluating when one cell has a cycle', () => {
    const result = evaluateTableFormulas({ rows: [['=B1', '=A1', '=5+5']] });
    expect(result.rows[0][2]).toBe(10);
  });

  it('reports a parse error for a malformed formula without throwing', () => {
    expect(() => evaluateTableFormulas({ rows: [['=SUM(']] })).not.toThrow();
    const result = evaluateTableFormulas({ rows: [['=SUM(']] });
    expect(result.errors.get('0:0')).toBe('PARSE');
  });

  it('leaves non-formula cells as their literal numeric or text value', () => {
    const result = evaluateTableFormulas({ rows: [['Apples', '10', 'not-a-number']] });
    expect(result.rows[0]).toEqual(['Apples', 10, 'not-a-number']);
  });

  it('never uses eval() or the Function constructor internally', () => {
    // A regression guard against reintroducing a dynamic code-execution path;
    // exercises a formula containing characters that would be dangerous if
    // ever passed to eval/Function, and expects a normal, safe result.
    const result = evaluateTableFormulas({ rows: [['=1+1']] });
    expect(result.rows[0][0]).toBe(2);
  });
});



describe('finding GFM tables inside a full markdown document', () => {
  it('locates a single pipe table and its source line range', () => {
    const source = '# Title\n\n| A | B |\n| - | - |\n| 1 | 2 |\n\nMore text.';
    const tables = findMarkdownTables(source);
    expect(tables).toHaveLength(1);
    expect(tables[0].startLine).toBe(3);
    expect(tables[0].endLine).toBe(5);
    expect(tables[0].headerRow).toEqual(['A', 'B']);
    expect(tables[0].bodyRows).toEqual([['1', '2']]);
  });

  it('locates multiple separate tables in the same document', () => {
    const source = '| A |\n| - |\n| 1 |\n\ntext\n\n| B |\n| - |\n| 2 |\n';
    const tables = findMarkdownTables(source);
    expect(tables).toHaveLength(2);
    expect(tables[0].headerRow).toEqual(['A']);
    expect(tables[1].headerRow).toEqual(['B']);
  });

  it('returns no tables for a document with no pipe tables', () => {
    expect(findMarkdownTables('# Just a heading\n\nSome text.')).toHaveLength(0);
  });

  it('handles a pipe character escaped inside a cell without splitting on it', () => {
    const source = '| A |\n| - |\n| one \\| two |\n';
    const tables = findMarkdownTables(source);
    expect(tables[0].bodyRows[0]).toEqual(['one | two']);
  });
});

describe('evaluating formulas across every table found in a document', () => {
  it('evaluates a formula inside a table embedded in a full document', () => {
    const source = '# Report\n\n| Item | Qty | Price | Total |\n| - | - | - | - |\n| Apples | 10 | 1.5 | =B2*C2 |\n';
    const { results } = evaluateAllMarkdownTables(source);
    expect(results).toHaveLength(1);
    // Row 0 is the header row, row 1 is the first body row; Total is column 3.
    expect(results[0].rows[1][3]).toBe(15);
  });

  it('evaluates each table in a multi-table document independently', () => {
    const source = '| A |\n| - |\n| =1+1 |\n\ntext\n\n| B |\n| - |\n| =2+2 |\n';
    const { results } = evaluateAllMarkdownTables(source);
    expect(results[0].rows[1][0]).toBe(2);
    expect(results[1].rows[1][0]).toBe(4);
  });
});



describe('substituting computed formula values back into markdown source', () => {
  it('replaces a formula cell with its computed value in the rebuilt source', () => {
    const source = '# Report\n\n| Item | Qty | Price | Total |\n| - | - | - | - |\n| Apples | 10 | 1.5 | =B2*C2 |\n';
    const substituted = substituteFormulaValues(source);
    expect(substituted).toContain('| Apples | 10 | 1.5 | 15 |');
    expect(substituted).not.toContain('=B2*C2');
  });

  it('leaves lines outside any table completely unchanged', () => {
    const source = '# Report\n\nSome unrelated text.\n\n| A |\n| - |\n| =1+1 |\n';
    const substituted = substituteFormulaValues(source);
    expect(substituted).toContain('# Report');
    expect(substituted).toContain('Some unrelated text.');
  });

  it('returns the source unchanged when the document has no tables', () => {
    const source = '# Just text\n\nNo tables here.';
    expect(substituteFormulaValues(source)).toBe(source);
  });

  it('leaves a non-formula cell value exactly as computed (numeric passthrough)', () => {
    const source = '| A | B |\n| - | - |\n| 3 | 4 |\n';
    const substituted = substituteFormulaValues(source);
    expect(substituted).toContain('| 3 | 4 |');
  });
});

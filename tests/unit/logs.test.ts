import { describe, expect, it } from 'vitest';
import { rowsToCsv, rowsToMarkdown, structureLogLines } from '../../src/tools/logs/log-engine';

const input = '2026-08-29 INFO boot complete\n2026-08-29 ERROR disk full\nnoise';
const pattern = '^(?<date>\\d{4}-\\d{2}-\\d{2})\\s+(?<level>INFO|ERROR)\\s+(?<message>.+)$';

describe('regex log structuring', () => {
  it('maps named capture groups into columns and preserves unmatched lines', () => {
    const result = structureLogLines(input, pattern);
    expect(result.columns).toEqual(['date', 'level', 'message']);
    expect(result.rows[1].level).toBe('ERROR');
    expect(result.unmatched).toEqual(['noise']);
  });

  it('exports RFC4180-safe CSV cells', () => {
    const csv = rowsToCsv([{ message: 'hello, "world"', level: 'INFO' }], ['level', 'message']);
    expect(csv).toContain('"hello, ""world"""');
  });

  it('escapes markdown table delimiters', () => {
    const markdown = rowsToMarkdown([{ value: 'a|b' }], ['value']);
    expect(markdown).toContain('a\\|b');
  });
});

import { describe, expect, it } from 'vitest';
import {
  buildPatternFlags,
  extractGroupNames,
  inferColumnKind,
  inferColumnKinds,
  rowsToCsv,
  rowsToMarkdown,
  structureLogLines,
} from '../../src/tools/logs/log-engine';

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


describe('named group discovery', () => {
  it('reads group names straight from the pattern source', () => {
    expect(extractGroupNames(pattern)).toEqual(['date', 'level', 'message']);
  });

  it('finds groups in a pattern that can never match an empty string', () => {
    // The previous approach probed the pattern against '' and learned nothing
    // from a pattern like this one.
    expect(extractGroupNames('^(?<id>\\d+)$')).toEqual(['id']);
  });

  it('ignores lookbehind assertions, which are not capture groups', () => {
    expect(extractGroupNames('(?<=foo)(?<real>bar)(?<!baz)')).toEqual(['real']);
  });

  it('deduplicates and returns an empty list when there are no named groups', () => {
    expect(extractGroupNames('(\\d+)-(\\w+)')).toEqual([]);
  });

  it('reports declared columns even when no line matches', () => {
    const result = structureLogLines('nothing here', '^(?<code>\\d{3})$');
    expect(result.columns).toEqual(['code']);
    expect(result.rows).toEqual([]);
    expect(result.unmatched).toEqual(['nothing here']);
  });
});

describe('pattern flags', () => {
  it('builds the flag string in a stable order', () => {
    expect(buildPatternFlags({ ignoreCase: true, dotAll: true })).toBe('is');
    expect(buildPatternFlags({})).toBe('');
  });

  it('applies the ignore-case flag', () => {
    const lower = structureLogLines('2026-08-29 error disk full', pattern);
    expect(lower.rows).toHaveLength(0);
    const insensitive = structureLogLines('2026-08-29 error disk full', pattern, { ignoreCase: true });
    expect(insensitive.rows).toHaveLength(1);
    expect(insensitive.rows[0].level).toBe('error');
  });

  it('has no effect from dot-all in line mode, because a line holds no newline', () => {
    // Documents the real constraint: line mode splits first, so `s` cannot act.
    expect(structureLogLines('a\nb', '^(?<all>a.b)$', { dotAll: true }).rows).toHaveLength(0);
  });
});

describe('document scan mode', () => {
  it('matches a record that spans several lines, which line mode cannot', () => {
    const source = 'BEGIN\nfirst detail\nEND';
    const pattern = 'BEGIN(?<body>.*?)END';
    expect(structureLogLines(source, pattern, {}, 'line').rows).toHaveLength(0);

    const spanned = structureLogLines(source, pattern, { dotAll: true }, 'document');
    expect(spanned.rows).toHaveLength(1);
    expect(spanned.rows[0].body).toContain('first detail');
  });

  it('returns one row per match across the whole document', () => {
    const result = structureLogLines('id=1 id=2 id=3', 'id=(?<id>\\d+)', {}, 'document');
    expect(result.rows.map((row) => row.id)).toEqual(['1', '2', '3']);
  });

  it('collects the text between matches as unmatched content', () => {
    const result = structureLogLines('id=1 noise here id=2', 'id=(?<id>\\d+)', {}, 'document');
    expect(result.rows).toHaveLength(2);
    expect(result.unmatched).toEqual(['noise here']);
  });

  it('skips zero-length matches and reports how many, rather than emitting a row per position', () => {
    const result = structureLogLines('abc', '(?<maybe>x*)', {}, 'document');
    expect(result.rows).toEqual([]);
    expect(result.skippedEmptyMatches).toBeGreaterThan(0);
  });

  it('still parses a document containing a blank line', () => {
    // Regression guard: rejecting the run on the first empty match made the most
    // obvious document-mode pattern fail on the most ordinary input.
    const result = structureLogLines('a\n\nb', '^(?<line>.*)$', { multiline: true }, 'document');
    expect(result.rows.map((row) => row.line)).toEqual(['a', 'b']);
    expect(result.skippedEmptyMatches).toBeGreaterThan(0);
  });

  it('counts unmatched content per line, not per gap', () => {
    // A multi-line gap reported as one entry made the status line's "unmatched
    // lines" wrong and defeated the per-entry preview cap.
    const result = structureLogLines('id=1\nnoise1\nnoise2\nid=2', 'id=(?<id>\\d+)', {}, 'document');
    expect(result.unmatched).toEqual(['noise1', 'noise2']);
  });

  it('reports matches with no named groups as having no columns', () => {
    const result = structureLogLines('id=1 id=2', 'id=\\d+', {}, 'document');
    expect(result.columns).toEqual([]);
    expect(result.rows).toHaveLength(2);
  });

  it('applies multiline anchors in document mode', () => {
    const result = structureLogLines('a\nb', '^(?<letter>\\w)$', { multiline: true }, 'document');
    expect(result.rows.map((row) => row.letter)).toEqual(['a', 'b']);
  });
});

describe('column kind inference', () => {
  it('recognizes integers, decimals, and timestamps', () => {
    expect(inferColumnKind(['1', '42', '-7'])).toBe('integer');
    expect(inferColumnKind(['1.5', '2'])).toBe('decimal');
    expect(inferColumnKind(['2026-08-29'])).toBe('timestamp');
    expect(inferColumnKind(['2026-08-29 12:30:00'])).toBe('timestamp');
    expect(inferColumnKind(['2026-08-29T12:30:00Z'])).toBe('timestamp');
  });

  it('falls back to text as soon as one value does not fit', () => {
    expect(inferColumnKind(['1', '2', 'three'])).toBe('text');
  });

  it('reports an all-blank column as empty rather than guessing', () => {
    expect(inferColumnKind(['', '   '])).toBe('empty');
  });

  it('ignores blank values when judging the rest', () => {
    expect(inferColumnKind(['5', '', '6'])).toBe('integer');
  });

  it('maps kinds across a structured result', () => {
    const result = structureLogLines(input, pattern);
    const kinds = inferColumnKinds(result.rows, result.columns);
    expect(kinds.date).toBe('timestamp');
    expect(kinds.level).toBe('text');
  });
});


describe('group extraction is aware of escapes and character classes', () => {
  it('does not invent a column from group-like text inside a character class', () => {
    expect(extractGroupNames('[(?<inclass>)]')).toEqual([]);
  });

  it('does not invent a column from an escaped parenthesis', () => {
    expect(extractGroupNames('\\(?<notagroup>')).toEqual([]);
  });

  it('keeps a non-ASCII group name, whose value would otherwise vanish from every export', () => {
    expect(extractGroupNames('(?<\u00e9>x)(?<ok>y)')).toEqual(['\u00e9', 'ok']);
  });

  it('still finds groups after a character class', () => {
    expect(extractGroupNames('[abc](?<real>\\d+)')).toEqual(['real']);
  });

  it('rejects a malformed name rather than accepting arbitrary text', () => {
    expect(extractGroupNames('(?<not a name>x)')).toEqual([]);
  });
});

describe('column kinds travel with the structured result', () => {
  it('reports kinds from line mode without a separate main-thread pass', () => {
    const result = structureLogLines(input, pattern);
    expect(result.kinds.date).toBe('timestamp');
    expect(result.kinds.level).toBe('text');
  });

  it('reports kinds from document mode', () => {
    const result = structureLogLines('id=1 id=22', 'id=(?<id>\\d+)', {}, 'document');
    expect(result.kinds.id).toBe('integer');
  });
});

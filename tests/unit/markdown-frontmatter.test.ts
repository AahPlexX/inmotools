import { describe, expect, it } from 'vitest';
import { parseFrontmatter, stripFrontmatter } from '../../src/tools/markdown/frontmatter-engine';

describe('markdown frontmatter parsing', () => {
  it('parses a YAML frontmatter block delimited by ---', () => {
    const source = '---\ntitle: Report\ntags:\n  - a\n  - b\n---\n\n# Body';
    const result = parseFrontmatter(source);
    expect(result.format).toBe('yaml');
    expect(result.data).toEqual({ title: 'Report', tags: ['a', 'b'] });
  });

  it('parses a TOML frontmatter block delimited by +++', () => {
    const source = '+++\ntitle = "Report"\n+++\n\n# Body';
    const result = parseFrontmatter(source);
    expect(result.format).toBe('toml');
    expect(result.data).toEqual({ title: 'Report' });
  });

  it('parses a JSON frontmatter block delimited by braces', () => {
    const source = '{\n  "title": "Report"\n}\n\n# Body';
    const result = parseFrontmatter(source);
    expect(result.format).toBe('json');
    expect(result.data).toEqual({ title: 'Report' });
  });

  it('returns a null-format result when no frontmatter is present', () => {
    const result = parseFrontmatter('# Just a heading');
    expect(result.format).toBeNull();
    expect(result.data).toEqual({});
  });

  it('returns a null-format result for a document with only text', () => {
    const result = parseFrontmatter('');
    expect(result.format).toBeNull();
  });

  it('does not stop the document from rendering when frontmatter YAML is malformed', () => {
    const source = '---\ntitle: [unterminated\n---\n\n# Body';
    const result = parseFrontmatter(source);
    expect(result.format).toBeNull();
    expect(result.data).toEqual({});
  });

  it('strips a YAML frontmatter block from the returned body text', () => {
    const source = '---\ntitle: Report\n---\n\n# Body\n\nMore text.';
    const body = stripFrontmatter(source);
    expect(body.trim().startsWith('# Body')).toBe(true);
    expect(body).not.toContain('title: Report');
  });

  it('leaves a document with no frontmatter unchanged when stripped', () => {
    const source = '# Body only';
    expect(stripFrontmatter(source)).toBe(source);
  });
});


describe('native source positions after frontmatter', () => {
  const formats = [
    ['yaml', '---\ntitle: Report\n---'],
    ['toml', '+++\ntitle = "Report"\n+++'],
    ['json', '{\n"title": "Report"\n}'],
  ] as const;
  for (const [format, header] of formats) {
    for (const newline of ['\n', '\r\n', '\r']) {
      it(`preserves the exact ${format} body with ${JSON.stringify(newline)} line endings`, () => {
        const body = `${newline}See [@alpha].${newline}${newline}End.${newline}`;
        const source = header.replace(/\n/g, newline) + newline + body;
        expect(parseFrontmatter(source).format).toBe(format);
        expect(parseFrontmatter(source).data).toEqual({ title: 'Report' });
        expect(stripFrontmatter(source)).toBe(body);
      });
    }
  }
});


describe('JSON metadata string delimiters', () => {
  for (const title of ['A } brace [@metadata]', 'A { brace and "quoted" value']) {
    it(`parses braces as text inside the JSON title ${JSON.stringify(title)}`, () => {
      const header = JSON.stringify({ title }, null, 2);
      const source = header + '\n\nSee [@alpha].';
      expect(parseFrontmatter(source).data).toEqual({ title });
      expect(stripFrontmatter(source)).toBe('\nSee [@alpha].');
    });
  }
});


it('preserves a mixed-line-ending body after a mixed metadata prefix', () => {
  const body = '\nSee [@alpha].\r\n\rEnd.\r';
  const source = '---\r\ntitle: "Report"\r---\n' + body;
  expect(parseFrontmatter(source).data).toEqual({ title: 'Report' });
  expect(stripFrontmatter(source)).toBe(body);
});

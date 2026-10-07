import { describe, expect, it } from 'vitest';
import { parseFrontmatter } from '../../src/tools/markdown/frontmatter-engine';
import { formatFrontmatterValue } from '../../src/tools/markdown/frontmatter-display';

describe('read-only frontmatter display', () => {
  it('shows parsed YAML cycle edges without changing their graph or raw text', () => {
    const source = '---\nmeta: &loop\n  self: *loop\n---\n\nVisible prose.';
    const metadata = parseFrontmatter(source);
    expect(formatFrontmatterValue(metadata.data.meta)).toBe('{"self":"[Circular reference]"}');
    expect(metadata.raw).toContain('self: *loop');
    const meta = metadata.data.meta as { self: unknown };
    expect(meta.self).toBe(meta);
  });

  it('preserves repeated non-circular YAML aliases in separate branches', () => {
    const metadata = parseFrontmatter('---\nshared: &value {name: readable}\nlist: [*value, *value]\n---\n');
    expect(formatFrontmatterValue(metadata.data.list)).toBe('[{"name":"readable"},{"name":"readable"}]');
  });

  it.each(['.inf', '-.inf', '.nan'])('does not turn the YAML scalar %s into null', numeric => {
    const metadata = parseFrontmatter(`---\nnumber: ${numeric}\n---\n`);
    const expected = numeric === '.inf' ? 'Infinity' : numeric === '-.inf' ? '-Infinity' : 'NaN';
    expect(formatFrontmatterValue(metadata.data.number)).toBe(expected);
    expect(formatFrontmatterValue({ number: metadata.data.number })).toBe(`{"number":"${expected}"}`);
  });

  it.each([
    ['plain <script> text', 'plain <script> text'],
    [null, 'null'], [false, 'false'], [0, '0'], [undefined, 'undefined'],
    [{ values: [1, 'two', true] }, '{"values":[1,"two",true]}'],
  ])('retains ordinary scalar/object values', (value, expected) => {
    expect(formatFrontmatterValue(value)).toBe(expected);
  });

  it('keeps display failure local when a value cannot be serialized', () => {
    const value = { toJSON() { throw new Error('Synthetic serialization fault'); } };
    expect(formatFrontmatterValue(value)).toBe('Unable to display this value; see its source.');
  });
});

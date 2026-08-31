import { describe, expect, it } from 'vitest';
import { buildRegexExplanation } from '../../src/tools/regex/regex-ast';
import { analyzeCompatibility } from '../../src/tools/regex/regex-compat';
import { analyzeRedos } from '../../src/tools/regex/regex-redos';
import { generateRegexSnippet } from '../../src/tools/regex/regex-codegen';

describe('RegexMatrix diagnostics', () => {
  it('builds source-ranged ECMAScript explanation nodes', () => {
    const tree = buildRegexExplanation('(?<year>\\d{4})-(?<month>\\d{2})', 'g', 'ecmascript');
    expect(tree.kind).toBe('Pattern');
    expect(tree.children.some((node) => node.label.includes('year'))).toBe(true);
    expect(tree.children.every((node) => node.start >= 0 && node.end <= 33)).toBe(true);
  });

  it('marks lookbehind and backreferences unsupported for RE2-style targets without pretending to execute them', () => {
    const lookbehind = analyzeCompatibility('(?<=foo)bar');
    expect(lookbehind.find((entry) => entry.flavor === 'go-re2')).toMatchObject({ capability: 'compatibility', supported: false });
    const backref = analyzeCompatibility('(a)\\1');
    expect(backref.find((entry) => entry.flavor === 'rust')).toMatchObject({ supported: false });
    expect(backref.find((entry) => entry.flavor === 'pcre2')).toMatchObject({ capability: 'execution', supported: true });
  });

  it('reports ReDoS ambiguity without calling the score an engine step count', () => {
    const dangerous = analyzeRedos('(a+)+$');
    expect(dangerous.safe).toBe(false);
    expect(dangerous.risk).not.toBe('linear');
    expect(dangerous.metricLabel).toMatch(/ambiguity|path/i);
    const simple = analyzeRedos('^a+$');
    expect(simple.safe).toBe(true);
  });

  it('generates escaped production snippets for multiple targets', () => {
    expect(generateRegexSnippet('typescript', '\\d+', 'gi', 'id 42')).toContain('new RegExp');
    expect(generateRegexSnippet('python', '\\d+', 'i', 'id 42')).toContain('re.compile');
    expect(generateRegexSnippet('go', '\\d+', '', 'id 42')).toContain('regexp.MustCompile');
    expect(generateRegexSnippet('rust', '\\d+', '', 'id 42')).toContain('Regex::new');
  });
});

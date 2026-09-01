import { describe, expect, it } from 'vitest';
import { buildAssertionExport, codeFileExtension, serializeAssertionExport } from '../../src/tools/regex/regex-export';
import { addRegexSessionSnapshot, type RegexSavedSession } from '../../src/tools/regex/regex-session';

describe('RegexMatrix workspace support contracts', () => {
  it('serializes the same assertion bundle as JSON and YAML', () => {
    const bundle = buildAssertionExport({
      engine: 'ecmascript',
      pattern: '^\\d+$',
      flags: 'g',
      positive: '123\n456\n',
      negative: 'abc\n',
    });
    expect(bundle.positive).toEqual(['123', '456']);
    expect(bundle.negative).toEqual(['abc']);
    expect(JSON.parse(serializeAssertionExport(bundle, 'json'))).toMatchObject({ pattern: '^\\d+$', positive: ['123', '456'] });
    const yaml = serializeAssertionExport(bundle, 'yaml');
    expect(yaml).toContain('pattern: ^\\d+$');
    expect(yaml).toContain('positive:');
  });

  it('maps generated code targets to useful download extensions', () => {
    expect(codeFileExtension('typescript')).toBe('ts');
    expect(codeFileExtension('python')).toBe('py');
    expect(codeFileExtension('csharp')).toBe('cs');
  });

  it('keeps newest session snapshots first and caps local history at 200', () => {
    const make = (index: number): RegexSavedSession => ({
      id: `session-${index}`,
      savedAt: index,
      pattern: `pattern-${index}`,
      flags: 'g',
      subject: `subject-${index}`,
      flavor: 'ecmascript',
      replacement: '',
      positive: '',
      negative: '',
      codeTarget: 'typescript',
    });
    let sessions: RegexSavedSession[] = [];
    for (let index = 0; index < 205; index += 1) sessions = addRegexSessionSnapshot(sessions, make(index));
    expect(sessions).toHaveLength(200);
    expect(sessions[0]?.id).toBe('session-204');
    expect(sessions.at(-1)?.id).toBe('session-5');
  });
});

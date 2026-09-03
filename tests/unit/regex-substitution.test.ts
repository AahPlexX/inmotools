import { describe, expect, it } from 'vitest';
import { executePcre2Substitution } from '../../src/tools/regex/pcre-engine';
import { getSubstitutionProfile, executeEcmaSubstitution } from '../../src/tools/regex/regex-substitution';

describe('RegexMatrix engine-aware substitution contracts', () => {
  it('describes truthful replacement syntax and execution support per flavor', () => {
    expect(getSubstitutionProfile('ecmascript')).toMatchObject({ status: 'execution', namedReference: '$<name>' });
    expect(getSubstitutionProfile('pcre2')).toMatchObject({ status: 'execution', namedReference: '${name}' });
    expect(getSubstitutionProfile('python')).toMatchObject({ status: 'execution', namedReference: '\\g<name>' });
    expect(getSubstitutionProfile('oniguruma')).toMatchObject({ status: 'host-specific' });
    expect(getSubstitutionProfile('go-re2')).toMatchObject({ status: 'unavailable' });
  });

  it('uses native ECMAScript named-replacement semantics', () => {
    const result = executeEcmaSubstitution('(?<word>\\w+)', 'g', 'alpha beta', '[$<word>]');
    expect(result).toEqual({ output: '[alpha] [beta]', error: null });
  });

  it('uses the bundled PCRE2 runtime for named substitutions and honors global mode', async () => {
    const result = await executePcre2Substitution('(?<word>\\w+)', 'g', 'alpha beta', '[${word}]');
    expect(result.error).toBeNull();
    expect(result.output).toBe('[alpha] [beta]');
    expect(result.engine).toMatch(/PCRE2 10\.47\.5.*WebAssembly/i);
  });
});

import { describe, expect, it } from 'vitest';
import { planRegexPortability } from '../../src/tools/regex/regex-portability';

describe('RegexMatrix portability planner', () => {
  it('safely rewrites ECMAScript named captures and named backreferences for Python', () => {
    const plan = planRegexPortability('(?<word>\\w+)\\s+\\k<word>', 'ecmascript', 'python');
    expect(plan.status).toBe('safe-rewrite');
    expect(plan.outputPattern).toBe('(?P<word>\\w+)\\s+(?P=word)');
    expect(plan.blockers).toEqual([]);
    expect(plan.changes.map((change) => change.kind)).toEqual(['named-capture', 'named-backreference']);
  });

  it('safely rewrites Python named captures and named backreferences for ECMAScript', () => {
    const plan = planRegexPortability('(?P<word>\\w+)\\s+(?P=word)', 'python', 'ecmascript');
    expect(plan.status).toBe('safe-rewrite');
    expect(plan.outputPattern).toBe('(?<word>\\w+)\\s+\\k<word>');
    expect(plan.blockers).toEqual([]);
  });

  it('never invents a Go/RE2 polyfill for lookbehind', () => {
    const pattern = '(?<=foo)bar';
    const plan = planRegexPortability(pattern, 'ecmascript', 'go-re2');
    expect(plan.status).toBe('manual');
    expect(plan.outputPattern).toBe(pattern);
    expect(plan.blockers.join(' ')).toMatch(/lookbehind/i);
    expect(plan.changes).toEqual([]);
  });

  it('leaves already-portable patterns unchanged', () => {
    const plan = planRegexPortability('^[a-z]+$', 'ecmascript', 'python');
    expect(plan.status).toBe('portable');
    expect(plan.outputPattern).toBe('^[a-z]+$');
    expect(plan.blockers).toEqual([]);
  });
});

import { describe, expect, it } from 'vitest';
import { buildBenchmarkSummary } from '../../src/tools/regex/regex-benchmark';
import { buildDebugTrace, formatRegexForReview } from '../../src/tools/regex/regex-debugger';
import { buildMatchExportRows, serializeMatchRows } from '../../src/tools/regex/regex-list';
import { REGEX_REFERENCE, searchRegexReference } from '../../src/tools/regex/regex-reference';
import { analyzeCompatibility } from '../../src/tools/regex/regex-compat';
import type { RegexExplanationNode, RegexMatchRecord } from '../../src/tools/regex/regex-types';

describe('RegexMatrix parity workbench contracts', () => {
  it('covers the ten Regex101 parser flavors plus Oniguruma without conflating execution', () => {
    const rows = analyzeCompatibility('(?<=foo)bar');
    const flavors = rows.map((row) => row.flavor);
    expect(flavors).toEqual(expect.arrayContaining(['pcre','pcre2','ecmascript','python','go-re2','java','dotnet','rust','posix-ere','posix-bre','oniguruma']));
    expect(rows.filter((row) => row.capability === 'execution').map((row) => row.flavor).sort()).toEqual(['ecmascript','oniguruma','pcre2','python']);
  });

  it('ships a useful searchable quick reference with flavor-aware entries', () => {
    expect(REGEX_REFERENCE.length).toBeGreaterThanOrEqual(45);
    const lookbehind = searchRegexReference('lookbehind', 'ecmascript');
    expect(lookbehind.some((item) => /lookbehind/i.test(item.label))).toBe(true);
    expect(searchRegexReference('branch reset', 'pcre2').some((item) => item.token.includes('?|'))).toBe(true);
  });

  it('formats and debugs structurally without claiming native engine steps', () => {
    const root: RegexExplanationNode = { id:'root', kind:'Pattern', label:'Pattern', source:'a+', start:0, end:2, children:[{ id:'a', kind:'Literal', label:'literal a', source:'a', start:0, end:1, children:[] },{ id:'q', kind:'Quantifier', label:'one or more', source:'+', start:1, end:2, children:[] }] };
    const formatted = formatRegexForReview(root);
    expect(formatted).toContain('literal a');
    const trace = buildDebugTrace(root);
    expect(trace.nativeEngineTrace).toBe(false);
    expect(trace.steps).toHaveLength(2);
    const automaton = (trace as typeof trace & { automaton?: { supported: boolean; states: readonly unknown[]; transitions: readonly unknown[] } }).automaton;
    expect(automaton?.supported).toBe(true);
    expect(automaton?.states.length).toBeGreaterThanOrEqual(3);
    expect(automaton?.transitions.length).toBeGreaterThanOrEqual(2);
  });

  it('summarizes benchmark samples with deterministic percentile semantics', () => {
    const summary = buildBenchmarkSummary([1,2,3,4,10], 5, 0);
    expect(summary.medianMs).toBe(3);
    expect(summary.p95Ms).toBe(10);
    expect(summary.iterations).toBe(5);
    expect(summary.timeouts).toBe(0);
  });

  it('serializes match list exports deterministically', () => {
    const matches: RegexMatchRecord[] = [{ match:'alpha', index:0, end:5, groups:['a'], namedGroups:{ word:'alpha' } }];
    const rows = buildMatchExportRows(matches);
    expect(rows[0]?.namedGroups).toEqual({ word:'alpha' });
    expect(serializeMatchRows(rows,'csv')).toContain('alpha');
    expect(serializeMatchRows(rows,'json')).toContain('namedGroups');
  });
});

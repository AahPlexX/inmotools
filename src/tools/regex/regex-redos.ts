import { isSafePattern } from 'redos-detector';
import type { RedosAssessment } from './regex-types';

const representativeFromSource = (source: string): string | null => {
  if (!source) return null;
  if (/^\\d(?:[+*?]|\{)/.test(source)) return '1';
  if (/^\\w(?:[+*?]|\{)/.test(source)) return 'a';
  if (/^\\s(?:[+*?]|\{)/.test(source)) return ' ';
  if (source.startsWith('.')) return 'a';
  const classMatch = /^\[\^?([^\]\\-])/.exec(source);
  if (classMatch?.[1]) return classMatch[1];
  const escapedLiteral = /^\\([^dDsSwWpPAbBZzGkK1-9])/.exec(source);
  if (escapedLiteral?.[1]) return escapedLiteral[1];
  const literal = /[A-Za-z0-9]/.exec(source);
  return literal?.[0] ?? null;
};

const inferProbe = (pattern: string, trails: readonly { readonly source: string }[]): RedosAssessment['probe'] => {
  for (const trail of trails) {
    const pump = representativeFromSource(trail.source);
    if (pump) return { prefix: '', pump, suffix: '!', basis: `Ambiguity trail heuristic from ${JSON.stringify(trail.source)}.` };
  }
  const pump = representativeFromSource(pattern) ?? 'a';
  return { prefix: '', pump, suffix: '!', basis: 'Pattern heuristic; review the editable probe before profiling.' };
};

export const analyzeRedos = (pattern: string, flags = ''): RedosAssessment => {
  try {
    const result = isSafePattern(pattern, {
      caseInsensitive: flags.includes('i'), unicode: flags.includes('u'), dotAll: flags.includes('s'), multiLine: flags.includes('m'),
      maxScore: 200, maxSteps: 100_000, timeout: 40, downgradePattern: true,
    });
    const score = result.score.infinite ? 'infinite' : result.score.value;
    const risk: RedosAssessment['risk'] = result.safe ? 'linear' : score === 'infinite' || (typeof score === 'number' && score >= 50) ? 'critical' : 'caution';
    const trails = result.trails.flatMap((trail) => trail.trail.flatMap(({ a, b }) => [a.node, b.node])).map((node) => ({ start: node.start.offset, end: node.end.offset, source: node.source }));
    return {
      safe: result.safe,
      risk,
      score,
      metricLabel: 'Ambiguity path score',
      note: result.error ? `Analysis stopped: ${result.error}. This is ECMAScript static analysis, not an engine step counter.` : 'ECMAScript static ambiguity analysis. This score is not an engine backtracking-step count.',
      trails,
      probe: inferProbe(pattern, trails),
    };
  } catch (error) {
    return {
      safe: false,
      risk: 'unknown',
      score: null,
      metricLabel: 'Ambiguity path score',
      note: error instanceof Error ? error.message : String(error),
      trails: [],
      probe: inferProbe(pattern, []),
    };
  }
};

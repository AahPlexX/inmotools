import { isSafePattern } from 'redos-detector';
import type { RedosAssessment } from './regex-types';

export const analyzeRedos = (pattern: string, flags = ''): RedosAssessment => {
  try {
    const result = isSafePattern(pattern, {
      caseInsensitive: flags.includes('i'), unicode: flags.includes('u'), dotAll: flags.includes('s'), multiLine: flags.includes('m'),
      maxScore: 200, maxSteps: 100_000, timeout: 40, downgradePattern: true,
    });
    const score = result.score.infinite ? 'infinite' : result.score.value;
    const risk: RedosAssessment['risk'] = result.safe ? 'linear' : score === 'infinite' || (typeof score === 'number' && score >= 50) ? 'critical' : 'caution';
    const trails = result.trails.flatMap((trail) => trail.trail.flatMap(({ a, b }) => [a.node, b.node])).map((node) => ({ start: node.start.offset, end: node.end.offset, source: node.source }));
    return { safe: result.safe, risk, score, metricLabel: 'Ambiguity path score', note: result.error ? `Analysis stopped: ${result.error}. This is ECMAScript static analysis, not an engine step counter.` : 'ECMAScript static ambiguity analysis. This score is not an engine backtracking-step count.', trails };
  } catch (error) {
    return { safe: false, risk: 'unknown', score: null, metricLabel: 'Ambiguity path score', note: error instanceof Error ? error.message : String(error), trails: [] };
  }
};

// Feature 32 — Unified Composite Domain Health Scorecard (Radar Matrix).
// Aggregates findings already produced by every other engine into five
// weighted vectors and a single overall letter grade. Pure, synchronous, and
// fully deterministic given a fixed set of findings.

import type { Finding, Severity } from './site-intel-types';

export type ScoreVector = 'security' | 'dnsHygiene' | 'networkInfrastructure' | 'domainLongevity' | 'webStandards';

export const VECTOR_LABELS: Record<ScoreVector, string> = {
  security: 'Security',
  dnsHygiene: 'DNS Hygiene',
  networkInfrastructure: 'Network Infrastructure',
  domainLongevity: 'Domain Longevity',
  webStandards: 'Web Standards',
};

export const VECTOR_WEIGHTS: Record<ScoreVector, number> = {
  security: 0.3,
  dnsHygiene: 0.2,
  networkInfrastructure: 0.15,
  domainLongevity: 0.15,
  webStandards: 0.2,
};

const SEVERITY_PENALTY: Record<Severity, number> = { good: 0, info: 0, warn: 8, risk: 20 };

export interface VectorScore { vector: ScoreVector; label: string; score: number; grade: string; findings: Finding[] }
export interface Scorecard { vectors: VectorScore[]; overallScore: number; overallGrade: string }

export function letterGrade(score: number): string {
  if (score >= 97) return 'A+';
  if (score >= 93) return 'A';
  if (score >= 90) return 'A-';
  if (score >= 87) return 'B+';
  if (score >= 83) return 'B';
  if (score >= 80) return 'B-';
  if (score >= 77) return 'C+';
  if (score >= 73) return 'C';
  if (score >= 70) return 'C-';
  if (score >= 60) return 'D';
  return 'F';
}

function scoreFindings(findings: Finding[]): number {
  const penalty = findings.reduce((sum, f) => sum + SEVERITY_PENALTY[f.severity], 0);
  return Math.max(0, Math.min(100, 100 - penalty));
}

export function computeScorecard(byVector: Record<ScoreVector, Finding[]>): Scorecard {
  const vectors: VectorScore[] = (Object.keys(VECTOR_LABELS) as ScoreVector[]).map((vector) => {
    const findings = byVector[vector] ?? [];
    const score = scoreFindings(findings);
    return { vector, label: VECTOR_LABELS[vector], score, grade: letterGrade(score), findings };
  });
  const overallScore = Math.round(vectors.reduce((sum, v) => sum + v.score * VECTOR_WEIGHTS[v.vector], 0));
  return { vectors, overallScore, overallGrade: letterGrade(overallScore) };
}

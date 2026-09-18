import { describe, expect, it } from 'vitest';
import { computeScorecard, letterGrade, type ScoreVector } from '../../src/tools/site-intel/scoring-engine';
import { analyzeSchemeSecurity } from '../../src/tools/site-intel/mixed-content-engine';
import { classifyCdn, fingerprintCms } from '../../src/tools/site-intel/fingerprint-engine';
import { parseUrl } from '../../src/tools/site-intel/url-forensics';
import type { Finding } from '../../src/tools/site-intel/site-intel-types';

describe('scoring-engine (Feature 32)', () => {
  it('grades a clean report as A+', () => {
    const empty: Record<ScoreVector, Finding[]> = { security: [], dnsHygiene: [], networkInfrastructure: [], domainLongevity: [], webStandards: [] };
    const card = computeScorecard(empty);
    expect(card.overallScore).toBe(100);
    expect(card.overallGrade).toBe('A+');
  });

  it('penalizes risk findings more than warn findings', () => {
    const risky: Finding = { id: 'x', severity: 'risk', label: 'x', detail: 'x' };
    const warn: Finding = { id: 'y', severity: 'warn', label: 'y', detail: 'y' };
    const cardRisk = computeScorecard({ security: [risky], dnsHygiene: [], networkInfrastructure: [], domainLongevity: [], webStandards: [] });
    const cardWarn = computeScorecard({ security: [warn], dnsHygiene: [], networkInfrastructure: [], domainLongevity: [], webStandards: [] });
    expect(cardRisk.overallScore).toBeLessThan(cardWarn.overallScore);
  });

  it('maps score bands to expected letter grades', () => {
    expect(letterGrade(100)).toBe('A+');
    expect(letterGrade(85)).toBe('B');
    expect(letterGrade(55)).toBe('F');
  });
});

describe('analyzeSchemeSecurity (Feature 23)', () => {
  it('flags plaintext HTTP as a risk', () => {
    const parsed = parseUrl('http://example.com');
    const findings = analyzeSchemeSecurity(parsed);
    expect(findings.some((f) => f.id === 'scheme-http' && f.severity === 'risk')).toBe(true);
  });

  it('flags embedded credentials and non-standard ports', () => {
    const parsed = parseUrl('http://user:pass@example.com:8080/');
    const findings = analyzeSchemeSecurity(parsed);
    expect(findings.some((f) => f.id === 'embedded-credentials')).toBe(true);
    expect(findings.some((f) => f.id === 'nonstandard-port')).toBe(true);
  });

  it('treats https with no port/credentials as good', () => {
    const parsed = parseUrl('https://example.com');
    const findings = analyzeSchemeSecurity(parsed);
    expect(findings).toEqual([{ id: 'scheme-https', severity: 'good', label: 'Encrypted HTTPS scheme', detail: expect.any(String), terms: ['tls'] }]);
  });
});

describe('classifyCdn / fingerprintCms (Features 29-30)', () => {
  it('detects a known CDN suffix', () => {
    const findings = classifyCdn(['d123.cloudfront.net']);
    expect(findings.some((f) => f.label.includes('Amazon CloudFront'))).toBe(true);
  });

  it('reports no match for an unrecognized host', () => {
    const findings = classifyCdn(['origin.example-internal.test']);
    expect(findings[0].id).toBe('cdn-none');
  });

  it('detects a WordPress path signature', () => {
    const findings = fingerprintCms('https://example.com/wp-content/uploads/img.png');
    expect(findings.some((f) => f.label.includes('WordPress'))).toBe(true);
  });
});

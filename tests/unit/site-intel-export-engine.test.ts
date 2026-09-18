import { describe, expect, it } from 'vitest';
import { exportCsv, exportJson, exportMarkdown, exportPdf, type ExportBundle } from '../../src/tools/site-intel/export-engine';
import { computeScorecard } from '../../src/tools/site-intel/scoring-engine';
import type { Finding } from '../../src/tools/site-intel/site-intel-types';

function sampleBundle(): ExportBundle {
  const riskFinding: Finding = { id: 'scheme-http', severity: 'risk', label: 'Unencrypted HTTP scheme', detail: 'Uses plaintext http://.' };
  const goodFinding: Finding = { id: 'ipv6-ready', severity: 'good', label: 'IPv6 dual-stack ready', detail: '2 AAAA records found.' };
  const scorecard = computeScorecard({
    security: [riskFinding],
    dnsHygiene: [goodFinding],
    networkInfrastructure: [],
    domainLongevity: [],
    webStandards: [],
  });
  return {
    url: 'https://example.com/',
    metadata: { auditorName: 'Ada Lovelace', organization: 'InMo Tools', notes: 'Routine quarterly audit.', auditTimestamp: Date.parse('2026-09-18T00:00:00Z') },
    scorecard,
  };
}

describe('export-engine (Feature 36)', () => {
  it('round-trips through exportJson as valid JSON containing the URL and score', () => {
    const bundle = sampleBundle();
    const json = exportJson(bundle);
    const parsed = JSON.parse(json);
    expect(parsed.url).toBe('https://example.com/');
    expect(parsed.scorecard.overallScore).toBe(bundle.scorecard.overallScore);
  });

  it('renders Markdown with a scorecard table and finding bullets', () => {
    const md = exportMarkdown(sampleBundle());
    expect(md).toContain('# Site Intelligence Audit — https://example.com/');
    expect(md).toContain('| Vector | Score | Grade |');
    expect(md).toContain('Ada Lovelace');
    expect(md).toContain('[RISK] Unencrypted HTTP scheme');
    expect(md).toContain('[GOOD] IPv6 dual-stack ready');
  });

  it('renders CSV rows with one row per finding', () => {
    const csv = exportCsv(sampleBundle());
    const lines = csv.trim().split('\n');
    expect(lines[0]).toBe('vector,severity,label,detail,id');
    expect(lines).toHaveLength(3); // header + 2 findings
    expect(csv).toContain('scheme-http');
    expect(csv).toContain('ipv6-ready');
  });

  it('builds a non-trivial PDF blob', () => {
    const blob = exportPdf(sampleBundle());
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toContain('pdf');
    expect(blob.size).toBeGreaterThan(500);
  });

  it('produces an empty-but-valid CSV when there are no findings at all', () => {
    const bundle = sampleBundle();
    bundle.scorecard.vectors.forEach((v) => { v.findings = []; });
    const csv = exportCsv(bundle);
    expect(csv.trim().split('\n')).toHaveLength(1); // header only
  });
});

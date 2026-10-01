import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { queryDns } from '../../src/tools/site-intel/doh-client';
import { auditIpv6Readiness, validateCaaRecords } from '../../src/tools/site-intel/dns-engine';
import { validateSpf, inspectDmarc, checkBimi, fetchMxRecords } from '../../src/tools/site-intel/email-auth-engine';
import { scanDnsbl } from '../../src/tools/site-intel/blacklist-engine';
import { fetchRdap, assessDomainAge, assessExpiration } from '../../src/tools/site-intel/rdap-engine';
import { fetchWaybackTimeline } from '../../src/tools/site-intel/wayback-engine';
import { checkHstsPreload, describeHstsPreload } from '../../src/tools/site-intel/hsts-engine';

function jsonResponse(body: unknown, ok = true, status = 200) {
  return Promise.resolve({ ok, status, json: () => Promise.resolve(body), text: () => Promise.resolve(JSON.stringify(body)) } as Response);
}

describe('doh-client / dns-engine', () => {
  beforeEach(() => { vi.stubGlobal('fetch', vi.fn()); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('parses a successful A-record answer', async () => {
    vi.mocked(fetch).mockImplementation(() => jsonResponse({ Status: 0, AD: false, Answer: [{ name: 'example.com', type: 1, TTL: 300, data: '93.184.216.34' }] }));
    const result = await queryDns('example.com', 'A');
    expect(result.status).toBe('ok');
    expect(result.answers[0].data).toBe('93.184.216.34');
    expect(result.answers[0].typeName).toBe('A');
  });

  it('reports IPv6 readiness when AAAA answers exist', () => {
    const finding = auditIpv6Readiness({ recordType: 'AAAA', status: 'ok', answers: [{ name: 'x', type: 28, typeName: 'AAAA', ttl: 300, data: '::1' }], authenticatedData: false, resolver: 'test' });
    expect(finding.severity).toBe('good');
  });

  it('flags missing CAA records as a rogue-issuance risk', async () => {
    vi.mocked(fetch).mockImplementation(() => jsonResponse({ Status: 0, Answer: [] }));
    const { findings } = await validateCaaRecords('example.com');
    expect(findings[0].id).toBe('caa-missing');
    expect(findings[0].severity).toBe('warn');
  });
});

describe('email-auth-engine', () => {
  beforeEach(() => { vi.stubGlobal('fetch', vi.fn()); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('flags an insecure +all SPF wildcard', async () => {
    vi.mocked(fetch).mockImplementation(() => jsonResponse({ Status: 0, Answer: [{ name: 'x', type: 16, TTL: 300, data: '"v=spf1 include:_spf.example.com +all"' }] }));
    const { findings } = await validateSpf('example.com');
    expect(findings.some((f) => f.id === 'spf-plus-all' && f.severity === 'risk')).toBe(true);
  });

  it('flags a missing DMARC record as a spoofing risk', async () => {
    vi.mocked(fetch).mockImplementation(() => jsonResponse({ Status: 0, Answer: [] }));
    const { findings } = await inspectDmarc('example.com');
    expect(findings[0].id).toBe('dmarc-missing');
    expect(findings[0].severity).toBe('risk');
  });

  it('parses a DMARC policy tag', async () => {
    vi.mocked(fetch).mockImplementation(() => jsonResponse({ Status: 0, Answer: [{ name: 'x', type: 16, TTL: 300, data: '"v=DMARC1; p=reject; rua=mailto:d@example.com"' }] }));
    const { findings } = await inspectDmarc('example.com');
    expect(findings.some((f) => f.label.includes('p=reject') && f.severity === 'good')).toBe(true);
  });

  it('reports no BIMI record gracefully', async () => {
    vi.mocked(fetch).mockImplementation(() => jsonResponse({ Status: 0, Answer: [] }));
    const { finding } = await checkBimi('example.com');
    expect(finding.id).toBe('bimi-missing');
  });

  it('identifies backup MX presence', async () => {
    vi.mocked(fetch).mockImplementation(() => jsonResponse({ Status: 0, Answer: [{ name: 'x', type: 15, TTL: 300, data: '10 mail.example.com' }, { name: 'x', type: 15, TTL: 300, data: '20 backup.example.com' }] }));
    const { records, finding } = await fetchMxRecords('example.com');
    expect(records).toHaveLength(2);
    expect(finding.label).toContain('backup MX present');
  });
});

describe('blacklist-engine (DNSBL)', () => {
  beforeEach(() => { vi.stubGlobal('fetch', vi.fn()); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('reports clean when no DNSBL zone returns a listing', async () => {
    vi.mocked(fetch).mockImplementation(() => jsonResponse({ Status: 3 }));
    const { finding } = await scanDnsbl({ ip: '93.184.216.34', domain: 'example.com' });
    expect(finding.id).toBe('dnsbl-clean');
  });

  it('reports a risk when at least one zone lists the target', async () => {
    vi.mocked(fetch).mockImplementation((url: unknown) => {
      const listed = String(url).includes('zen.spamhaus.org');
      return jsonResponse(listed ? { Status: 0, Answer: [{ name: 'x', type: 1, TTL: 300, data: '127.0.0.2' }] } : { Status: 3 });
    });
    const { finding } = await scanDnsbl({ ip: '1.2.3.4' });
    expect(finding.id).toBe('dnsbl-listed');
  });
});

describe('rdap-engine', () => {
  beforeEach(() => { vi.stubGlobal('fetch', vi.fn()); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('flags a newly registered domain as high risk', async () => {
    const created = new Date(Date.now() - 5 * 86_400_000).toISOString();
    vi.mocked(fetch).mockImplementation(() => jsonResponse({ ldhName: 'EXAMPLE.COM', status: ['active'], events: [{ action: 'registration', date: created }], entities: [] }));
    const task = await fetchRdap('example.com');
    expect(task.status).toBe('ready');
    if (task.status === 'ready' && task.data) {
      const finding = assessDomainAge(task.data);
      expect(finding.id).toBe('age-nrd');
      expect(finding.severity).toBe('risk');
    }
  });

  it('flags a redemptionPeriod status as an expiration risk', () => {
    const finding = assessExpiration({
      ldhName: 'example.com', status: ['redemptionPeriod'],
      events: [{ action: 'expiration', date: new Date(Date.now() + 10 * 86_400_000).toISOString() }],
      entities: [], nameservers: [], raw: {},
    });
    expect(finding.severity).toBe('risk');
  });
});

describe('wayback-engine', () => {
  beforeEach(() => { vi.stubGlobal('fetch', vi.fn()); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('summarizes captures and detects content-change points via digest', async () => {
    vi.mocked(fetch).mockImplementation(() => jsonResponse([
      ['timestamp', 'original', 'statuscode', 'digest'],
      ['20200101000000', 'http://example.com', '200', 'AAA'],
      ['20210101000000', 'http://example.com', '200', 'AAA'],
      ['20220101000000', 'http://example.com', '200', 'BBB'],
    ]));
    const task = await fetchWaybackTimeline('example.com');
    expect(task.status).toBe('ready');
    if (task.status === 'ready' && task.data) {
      expect(task.data.totalCaptures).toBe(3);
      expect(task.data.contentChangePoints).toHaveLength(1);
    }
  });
});

describe('hsts-engine', () => {
  beforeEach(() => { vi.stubGlobal('fetch', vi.fn()); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('describes a preloaded domain as good', async () => {
    vi.mocked(fetch).mockImplementation(() => jsonResponse({ status: 'preloaded' }));
    const task = await checkHstsPreload('example.com');
    expect(task.status).toBe('ready');
    if (task.status === 'ready' && task.data) {
      expect(describeHstsPreload(task.data).severity).toBe('good');
    }
  });
});

import { describe, expect, it } from 'vitest';
import { analyzeHar, buildWaterfallRows, sanitizeHar } from '../../src/tools/har/har-engine';

const secretValues = ['Bearer top-secret-token', 'session-secret', 'query-secret', 'body-secret', 'nested-api-key'];

function makeHar() {
  return {
    log: {
      version: '1.2',
      creator: { name: 'InmoTools fixture', version: '1' },
      entries: [
        {
          startedDateTime: '2026-08-29T12:00:00.000Z',
          time: 120,
          request: {
            method: 'POST',
            url: 'https://api.example.test/orders?token=query-secret&safe=visible',
            httpVersion: 'HTTP/2',
            headers: [
              { name: 'Authorization', value: 'Bearer top-secret-token' },
              { name: 'X-Trace', value: 'trace-safe' },
            ],
            queryString: [
              { name: 'token', value: 'query-secret' },
              { name: 'safe', value: 'visible' },
            ],
            cookies: [{ name: 'session', value: 'session-secret' }],
            headersSize: -1,
            bodySize: 80,
            postData: {
              mimeType: 'application/json',
              text: JSON.stringify({ password: 'body-secret', profile: { apiKey: 'nested-api-key', display: 'safe-value' } }),
            },
          },
          response: {
            status: 200,
            statusText: 'OK',
            httpVersion: 'HTTP/2',
            headers: [
              { name: 'Set-Cookie', value: 'session=session-secret; Secure; HttpOnly' },
              { name: 'Content-Type', value: 'application/json' },
            ],
            cookies: [{ name: 'session', value: 'session-secret' }],
            content: { size: 2, mimeType: 'application/json', text: '{}' },
            redirectURL: '',
            headersSize: -1,
            bodySize: 2,
          },
          cache: {},
          timings: { blocked: -1, dns: 5, connect: 15, ssl: 8, send: 2, wait: 70, receive: 28 },
        },
      ],
    },
  };
}

describe('HAR sanitizer', () => {
  it('finds credential-bearing fields without echoing their values into the analysis', () => {
    const analysis = analyzeHar(makeHar());
    expect(analysis.requestCount).toBe(1);
    expect(analysis.findings.map((finding) => finding.category)).toEqual(
      expect.arrayContaining(['headers', 'cookies', 'query', 'bodies']),
    );
    const serialized = JSON.stringify(analysis);
    for (const secret of secretValues) expect(serialized).not.toContain(secret);
  });

  it('redacts selected categories while preserving unrelated HAR content', async () => {
    const result = await sanitizeHar(makeHar(), {
      mode: 'redact',
      categories: { headers: true, cookies: true, query: true, bodies: true },
    });
    const text = JSON.stringify(result.har);
    for (const secret of secretValues) expect(text).not.toContain(secret);
    expect(text).toContain('[REDACTED]');
    expect(text).toContain('trace-safe');
    expect(text).toContain('safe-value');
    expect(text).toContain('safe=visible');
  });

  it('hashes secrets deterministically with SHA-256', async () => {
    const policy = { mode: 'hash' as const, categories: { headers: true, cookies: true, query: true, bodies: true } };
    const first = await sanitizeHar(makeHar(), policy);
    const second = await sanitizeHar(makeHar(), policy);
    expect(first.har).toEqual(second.har);
    const serialized = JSON.stringify(first.har);
    for (const secret of secretValues) expect(serialized).not.toContain(secret);
    expect(serialized).toMatch(/[a-f0-9]{64}/);
  });

  it('normalizes HAR timing sentinels for waterfall rendering', () => {
    const rows = buildWaterfallRows(makeHar());
    expect(rows).toHaveLength(1);
    expect(rows[0].phases.blocked).toBe(0);
    expect(rows[0].phases).toMatchObject({ dns: 5, connect: 15, ssl: 8, send: 2, wait: 70, receive: 28 });
  });
  it('supports a user-supplied mask without changing unrelated values', async () => {
    const result = await sanitizeHar(makeHar(), {
      mode: 'mask',
      mask: 'CUSTOM-MASK',
      categories: { headers: true, cookies: true, query: true, bodies: true },
    });
    const text = JSON.stringify(result.har);
    for (const secret of secretValues) expect(text).not.toContain(secret);
    expect(text).toContain('CUSTOM-MASK');
    expect(text).toContain('trace-safe');
    expect(text).toContain('safe-value');
  });

});

import { describe, expect, it } from 'vitest';
import { analyzeHar, buildWaterfallRows, decodeBase64Body, readBody, sanitizeHar } from '../../src/tools/har/har-engine';

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


describe('base64-encoded request bodies', () => {
  const secretBody = JSON.stringify({ user: 'ada', access_token: 'super-secret-value' });
  const base64Har = {
    log: {
      entries: [{
        request: {
          method: 'POST',
          url: 'https://example.test/login',
          headers: [],
          cookies: [],
          queryString: [],
          postData: { mimeType: 'application/json', encoding: 'base64', text: btoa(secretBody) },
        },
        response: { headers: [], cookies: [] },
      }],
    },
  };

  it('decodes a base64 body so its credentials are reported as findings', () => {
    // Previously the scan read the encoded text, JSON.parse failed, and the body
    // was never reported at all - the tool stayed silent about the secret.
    const { findings } = analyzeHar(base64Har);
    expect(findings.some((finding) => finding.field === 'request.body:access_token')).toBe(true);
  });

  it('sanitizes a credential inside a base64 body instead of copying it through', async () => {
    const { har } = await sanitizeHar(base64Har, { mode: 'redact', categories: { headers: true, cookies: true, query: true, bodies: true } });
    const encoded = har.log.entries[0].request.postData.text as string;
    // The decisive assertion: the secret must not survive anywhere in the output.
    expect(JSON.stringify(har)).not.toContain('super-secret-value');
    const decoded = JSON.parse(atob(encoded));
    expect(decoded.access_token).not.toBe('super-secret-value');
    expect(decoded.user).toBe('ada');
  });

  it('keeps the declared transport encoding so the sanitized archive stays loadable', async () => {
    const { har } = await sanitizeHar(base64Har, { mode: 'redact', categories: { headers: false, cookies: false, query: false, bodies: true } });
    const postData = har.log.entries[0].request.postData;
    expect(postData.encoding).toBe('base64');
    expect(() => JSON.parse(atob(postData.text as string))).not.toThrow();
  });

  it('leaves a plain-text body unencoded', async () => {
    const plain = {
      log: { entries: [{ request: { headers: [], cookies: [], queryString: [], postData: { text: secretBody } }, response: { headers: [], cookies: [] } } ] },
    };
    const { har } = await sanitizeHar(plain, { mode: 'redact', categories: { headers: false, cookies: false, query: false, bodies: true } });
    const text = har.log.entries[0].request.postData.text as string;
    expect(() => JSON.parse(text)).not.toThrow();
    expect(text).not.toContain('super-secret-value');
  });

  it('treats a mislabelled encoding as plain text rather than throwing', () => {
    expect(decodeBase64Body('not base64 at all!!')).toBeUndefined();
    expect(decodeBase64Body('')).toBeUndefined();
    expect(readBody({ encoding: 'base64', text: 'not base64 at all!!' }).wasBase64).toBe(false);
  });

  it('round-trips a decodable body', () => {
    expect(decodeBase64Body(btoa('{"a":1}'))).toBe('{"a":1}');
    expect(readBody({ encoding: 'base64', text: btoa('{"a":1}') })).toEqual({ text: '{"a":1}', wasBase64: true });
  });
});

import { describe, expect, it } from 'vitest';
import {
  buildSanitizedUrl, classifyQueryParams, detectHomoglyphs, detectShortener,
  findTyposquatMatches, parseUrl, shannonEntropy,
} from '../../src/tools/site-intel/url-forensics';

describe('parseUrl (Feature 1 — RFC 3986 decomposition)', () => {
  it('repairs a bare domain by adding https and splitting host', () => {
    const result = parseUrl('example.com');
    expect(result.protocolRepaired).toBe(true);
    expect(result.protocol).toBe('https');
    expect(result.sld).toBe('example');
    expect(result.tld).toBe('com');
    expect(result.registrableDomain).toBe('example.com');
  });

  it('parses a fully specified URL with port, path, query, and fragment', () => {
    const result = parseUrl('http://sub.domain.co.uk:8080/path?q=1#top');
    expect(result.protocolRepaired).toBe(false);
    expect(result.protocol).toBe('http');
    expect(result.subdomains).toEqual(['sub']);
    expect(result.sld).toBe('domain');
    expect(result.tld).toBe('co.uk');
    expect(result.port).toBe('8080');
    expect(result.portInBounds).toBe(true);
    expect(result.pathSegments).toEqual(['path']);
    expect(result.queryParams).toEqual([{ key: 'q', value: '1' }]);
    expect(result.hash).toBe('top');
  });

  it('flags an out-of-bounds port', () => {
    const result = parseUrl('http://example.com:99999/');
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('flags embedded credentials in the authority segment', () => {
    const result = parseUrl('http://user:pass@example.com/');
    expect(result.hasEmbeddedCredentials).toBe(true);
  });
});

describe('detectHomoglyphs (Feature 2)', () => {
  it('flags Cyrillic confusables mixed with Latin characters', () => {
    // "\u0430pple.com" substitutes Cyrillic а for Latin a in "apple.com".
    const finding = detectHomoglyphs('\u0430pple.com');
    expect(finding.confusableChars.length).toBeGreaterThan(0);
    expect(finding.risk).toBe('risk');
  });

  it('does not flag a plain ASCII hostname', () => {
    const finding = detectHomoglyphs('example.com');
    expect(finding.confusableChars).toHaveLength(0);
    expect(finding.hasMixedScript).toBe(false);
    expect(finding.risk).toBe('good');
  });
});

describe('shannonEntropy (Feature 3)', () => {
  it('scores a short, repetitive label as low entropy', () => {
    const result = shannonEntropy('aaaa');
    expect(result.classification).toBe('low');
  });

  it('scores a long random-looking token as high entropy', () => {
    const result = shannonEntropy('x7q9zv2mflk8pw1rte5cnb3ohgs6');
    expect(result.classification).toBe('high');
    expect(result.suspicion).toBe('risk');
  });
});

describe('findTyposquatMatches (Feature 4)', () => {
  it('flags a single-character substitution against a known brand', () => {
    const matches = findTyposquatMatches('paypa1.com');
    expect(matches.some((m) => m.brand === 'paypal.com' && m.distance === 1)).toBe(true);
  });

  it('does not flag the exact brand domain itself', () => {
    const matches = findTyposquatMatches('paypal.com');
    expect(matches.some((m) => m.brand === 'paypal.com')).toBe(false);
  });
});

describe('classifyQueryParams / buildSanitizedUrl (Feature 5)', () => {
  it('categorizes known tracking keys', () => {
    const params = classifyQueryParams([{ key: 'utm_source', value: 'x' }, { key: 'fbclid', value: 'y' }, { key: 'page', value: '2' }]);
    expect(params[0].category).toBe('tracking');
    expect(params[1].category).toBe('tracking');
    expect(params[2].category).toBe('routing');
  });

  it('strips tracking and session params from the sanitized URL', () => {
    const parsed = parseUrl('https://example.com/path?utm_source=x&page=2&fbclid=y');
    const sanitized = buildSanitizedUrl(parsed);
    expect(sanitized).toBe('https://example.com/path?page=2');
  });
});

describe('detectShortener (Feature 6)', () => {
  it('identifies a known shortener host', () => {
    const finding = detectShortener('bit.ly', 'https://bit.ly/abc123');
    expect(finding.isShortener).toBe(true);
    expect(finding.service).toBe('Bitly');
  });

  it('does not flag an ordinary host', () => {
    const finding = detectShortener('example.com', 'https://example.com/');
    expect(finding.isShortener).toBe(false);
  });
});

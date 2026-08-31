import { describe, expect, it } from 'vitest';
import { protectData } from '../../src/tools/lattice/privacy-engine';

describe('JSON Lattice privacy shield', () => {
  it('masks supported secret/PII classes without mutating source', () => {
    const source = {
      email: 'ada@example.com',
      jwt: 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ.signature123',
      auth: 'Bearer top-secret-token',
      uuid: '123e4567-e89b-12d3-a456-426614174000',
      ipv4: '192.168.10.12',
      ipv6: '2001:db8::1',
      card: '4111 1111 1111 1111',
      apiToken: 'opaque-secret-value',
      safe: 'visible',
    };
    const snapshot = structuredClone(source);
    const result = protectData(source, { mode: 'mask' });
    const serialized = JSON.stringify(result.value);
    expect(serialized).not.toContain('ada@example.com');
    expect(serialized).not.toContain('top-secret-token');
    expect(serialized).not.toContain('4111 1111 1111 1111');
    expect(serialized).toContain('[REDACTED_EMAIL]');
    expect(serialized).toContain('[REDACTED_BEARER]');
    expect(serialized).toContain('[REDACTED_CARD]');
    expect(serialized).toContain('visible');
    expect(new Set(result.findings.map((finding) => finding.kind))).toEqual(new Set(['email', 'jwt', 'bearer', 'uuid', 'ipv4', 'ipv6', 'card', 'secret-key']));
    expect(source).toEqual(snapshot);
  });

  it('can produce deterministic presentation-safe mock values', () => {
    const first = protectData({ email: 'ada@example.com', ip: '10.0.0.7' }, { mode: 'mock' });
    const second = protectData({ email: 'ada@example.com', ip: '10.0.0.7' }, { mode: 'mock' });
    expect(first.value).toEqual(second.value);
    expect(JSON.stringify(first.value)).not.toContain('ada@example.com');
    expect(JSON.stringify(first.value)).toContain('@example.test');
  });
});

// Group 6 — Feature 29 (CDN/edge classifier) and Feature 30 (CMS/eCommerce
// fingerprint). Both are deterministic pattern matches against data this tool
// already has locally (resolved CNAME/NS hostnames and the URL string itself)
// — no cross-origin page-content fetch is required or attempted, which keeps
// this fully CORS-safe for arbitrary third-party targets.

import { CDN_SIGNATURES, CMS_SIGNATURES } from './reference-data';
import type { Finding } from './site-intel-types';

/** Feature 29 — CDN & cloud infrastructure classifier. */
export function classifyCdn(hostnames: string[]): Finding[] {
  const matches = new Map<string, string>();
  for (const host of hostnames) {
    const lower = host.toLowerCase();
    const hit = CDN_SIGNATURES.find((sig) => lower.endsWith(sig.suffix));
    if (hit) matches.set(hit.label, host);
  }
  if (matches.size === 0) {
    return [{ id: 'cdn-none', severity: 'info', label: 'No known CDN signature detected', detail: 'CNAME/NS hostnames did not match a recognized CDN or edge-platform suffix. The domain may be self-hosted or use an unrecognized provider.', terms: ['cdn'] }];
  }
  return [...matches.entries()].map(([label, host]) => ({ id: `cdn-${label}`, severity: 'info' as const, label: `Edge platform: ${label}`, detail: `Detected via ${host}.`, terms: ['cdn'] }));
}

/** Feature 30 — Web technology signature & CMS/eCommerce profiler. */
export function fingerprintCms(fullUrl: string): Finding[] {
  const matches = new Set<string>();
  for (const sig of CMS_SIGNATURES) if (sig.pattern.test(fullUrl)) matches.add(sig.label);
  if (matches.size === 0) {
    return [{ id: 'cms-none', severity: 'info', label: 'No known CMS/platform signature detected', detail: 'No recognized platform path or asset-hosting pattern was found in the URL. This is a heuristic check, not a certification of a custom stack.', terms: ['cms-fingerprint'] }];
  }
  return [...matches].map((label) => ({ id: `cms-${label}`, severity: 'info' as const, label: `Platform signature: ${label}`, detail: 'Matched a known path/asset-hosting pattern for this platform.', terms: ['cms-fingerprint'] }));
}

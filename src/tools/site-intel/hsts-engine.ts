// Feature 22 — Chromium HSTS preload list status checker, via hstspreload.org's
// public status API (https://hstspreload.org/api/v2/status?domain=<domain>),
// the same dataset-backed service used by chromium's own preload submission
// form. It documents open, CORS-friendly access for exactly this kind of
// read-only status check.

import type { AsyncTaskState, Finding } from './site-intel-types';

export interface HstsPreloadStatus { status: 'preloaded' | 'pending' | 'unknown' | 'rejected' | 'removed'; raw: unknown }

const HSTS_TIMEOUT_MS = 8000;

export async function checkHstsPreload(hostname: string): Promise<AsyncTaskState<HstsPreloadStatus>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), HSTS_TIMEOUT_MS);
  try {
    const res = await fetch(`https://hstspreload.org/api/v2/status?domain=${encodeURIComponent(hostname)}`, { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = await res.json() as { status?: string };
    const status = (body.status ?? 'unknown') as HstsPreloadStatus['status'];
    return { status: 'ready', data: { status, raw: body }, fetchedAt: Date.now() };
  } catch (err) {
    return { status: 'error', error: err instanceof Error ? err.message : 'HSTS preload status lookup failed' };
  } finally {
    clearTimeout(timer);
  }
}

export function describeHstsPreload(result: HstsPreloadStatus): Finding {
  if (result.status === 'preloaded') {
    return { id: 'hsts-preloaded', severity: 'good', label: 'HSTS preloaded in Chromium', detail: 'This domain ships baked into Chromium\'s HSTS preload list, so compliant browsers refuse plaintext HTTP to it even on first visit.', terms: ['hsts'] };
  }
  if (result.status === 'pending') {
    return { id: 'hsts-pending', severity: 'info', label: 'HSTS preload submission pending', detail: 'A preload submission exists but has not yet shipped in a Chromium release.', terms: ['hsts'] };
  }
  return { id: 'hsts-none', severity: 'warn', label: 'Not on the HSTS preload list', detail: 'This domain is not preloaded. Its first plaintext-HTTP visit in a new browser profile is not automatically upgraded to HTTPS.', terms: ['hsts'] };
}

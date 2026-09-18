// Feature 31 — Robots.txt & sitemap auto-path generator with in-app side-drawer preview.
// Constructs the well-known paths and attempts a direct fetch for inline
// preview; if the target host does not grant CORS (no guarantee for
// arbitrary third-party sites), the drawer falls back to an "open in new
// tab" link so the feature still works, just outside the sandboxed preview.

export interface WellKnownPath { label: string; path: string; url: string }

export function buildWellKnownPaths(origin: string): WellKnownPath[] {
  const base = origin.replace(/\/$/, '');
  return [
    { label: 'robots.txt', path: '/robots.txt', url: `${base}/robots.txt` },
    { label: 'sitemap.xml', path: '/sitemap.xml', url: `${base}/sitemap.xml` },
    { label: 'security.txt', path: '/.well-known/security.txt', url: `${base}/.well-known/security.txt` },
  ];
}

const FETCH_TIMEOUT_MS = 7000;

export async function previewWellKnownPath(url: string): Promise<{ ok: boolean; status?: number; body?: string; error?: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    const body = await res.text();
    return { ok: res.ok, status: res.status, body: body.slice(0, 20_000) };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'The target did not allow an in-app preview (likely no CORS header). Use "Open directly" instead.' };
  } finally {
    clearTimeout(timer);
  }
}

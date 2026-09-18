// Feature 6 (continued) — best-effort client-side shortener redirect resolution.
// Most link-shortening services do not send CORS headers on their redirect
// response, so a generic cross-origin fetch fails for the majority of
// targets. This is implemented as a bounded, honestly-labeled best-effort
// attempt (per the tracking document's flagged judgment call) rather than a
// guaranteed unwrapper: it succeeds transparently when a target does allow
// it, and degrades to a clear explanation otherwise instead of pretending to
// resolve a destination it could not see.

export interface ShortenerResolution { resolved: boolean; finalUrl?: string; error?: string }

const RESOLVE_TIMEOUT_MS = 8000;

export async function resolveShortenedUrl(url: string): Promise<ShortenerResolution> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), RESOLVE_TIMEOUT_MS);
  try {
    const res = await fetch(url, { redirect: 'follow', signal: controller.signal });
    if (res.url && res.url !== url) return { resolved: true, finalUrl: res.url };
    return { resolved: false, error: 'No redirect was observed, or the final destination could not be disclosed to this page.' };
  } catch {
    return { resolved: false, error: 'This shortener does not allow cross-origin resolution from a browser (no CORS headers on the redirect response). The destination remains masked until opened directly.' };
  } finally {
    clearTimeout(timer);
  }
}

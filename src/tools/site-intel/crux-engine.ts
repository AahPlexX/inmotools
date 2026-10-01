// Feature 28 — Public Core Web Vitals (CrUX) explorer.
// The Chrome UX Report API (`https://chromeuxreport.googleapis.com/v1/records:queryRecord`)
// requires a Google Cloud API key. There is no CORS-safe way to embed a
// shared secret in a static, client-only bundle without exposing it to abuse,
// and issuing a key requires the *site owner* to create one in Google Cloud
// Console — that is a genuine external-credential blocker, not something a
// static GitHub Pages deployment can supply on a visitor's behalf.
//
// Resolution adopted here (flagged explicitly per the tracking document):
// the workstation lets each user paste their *own* CrUX API key, which is
// stored only in local IndexedDB (see vault-db.ts) and sent directly from
// the browser to Google's endpoint. This keeps the tool credential-free and
// account-free by default, while still making the feature fully functional
// for any user willing to supply their own free API key. No key ships in
// the bundle and no key is ever sent anywhere but Google's API.

import type { AsyncTaskState, Finding, Severity } from './site-intel-types';

export interface CruxMetric { p75: number | null; category: 'FAST' | 'AVERAGE' | 'SLOW' | 'UNKNOWN' }
export interface CruxReport { lcp: CruxMetric; cls: CruxMetric; inp: CruxMetric; collectionPeriod?: string }

const CRUX_TIMEOUT_MS = 8000;

function summarizeMetric(histogram: Array<{ start: number; end?: number; density?: number }> | undefined, percentiles: Record<string, number> | undefined, key: string): CruxMetric {
  const p75 = percentiles && typeof percentiles[key] === 'number' ? percentiles[key] : null;
  if (!histogram || p75 === null) return { p75, category: 'UNKNOWN' };
  // CrUX histograms are ordered [good, needs-improvement, poor]; the bucket containing p75 tells the category.
  let cumulative = 0;
  for (let i = 0; i < histogram.length; i += 1) {
    cumulative += histogram[i].density ?? 0;
    if (cumulative >= 0.75) return { p75, category: i === 0 ? 'FAST' : i === 1 ? 'AVERAGE' : 'SLOW' };
  }
  return { p75, category: 'UNKNOWN' };
}

export async function fetchCruxReport(origin: string, apiKey: string | null): Promise<AsyncTaskState<CruxReport>> {
  if (!apiKey) {
    return { status: 'blocked', blockedReason: 'Core Web Vitals field data requires your own free Chrome UX Report API key (Google Cloud Console → enable "Chrome UX Report API" → create an API key). Add it in Settings; it is stored only in this browser and never leaves it except to query Google\'s API directly.' };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CRUX_TIMEOUT_MS);
  try {
    const res = await fetch(`https://chromeuxreport.googleapis.com/v1/records:queryRecord?key=${encodeURIComponent(apiKey)}`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ origin }), signal: controller.signal,
    });
    if (res.status === 404) return { status: 'blocked', blockedReason: 'No Chrome UX Report data exists for this origin (insufficient real-world Chrome traffic volume).' };
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = await res.json() as { record?: { metrics?: Record<string, { histogram?: Array<{ start: number; end?: number; density?: number }>; percentiles?: Record<string, number> }>; collectionPeriod?: { firstDate?: unknown; lastDate?: unknown } } };
    const metrics = body.record?.metrics ?? {};
    const report: CruxReport = {
      lcp: summarizeMetric(metrics.largest_contentful_paint?.histogram, metrics.largest_contentful_paint?.percentiles as Record<string, number> | undefined, 'p75'),
      cls: summarizeMetric(metrics.cumulative_layout_shift?.histogram, metrics.cumulative_layout_shift?.percentiles as Record<string, number> | undefined, 'p75'),
      inp: summarizeMetric(metrics.interaction_to_next_paint?.histogram, metrics.interaction_to_next_paint?.percentiles as Record<string, number> | undefined, 'p75'),
    };
    return { status: 'ready', data: report, fetchedAt: Date.now() };
  } catch (err) {
    return { status: 'error', error: err instanceof Error ? err.message : 'CrUX API request failed' };
  } finally {
    clearTimeout(timer);
  }
}

export function summarizeCrux(report: CruxReport): Finding[] {
  const toSeverity = (cat: CruxMetric['category']): Severity => cat === 'FAST' ? 'good' : cat === 'AVERAGE' ? 'warn' : cat === 'SLOW' ? 'risk' : 'info';
  return [
    { id: 'crux-lcp', severity: toSeverity(report.lcp.category), label: `LCP: ${report.lcp.p75 ?? '—'} ms (${report.lcp.category})`, detail: 'Largest Contentful Paint — time until the largest visible element renders.', terms: ['lcp', 'core-web-vitals'] },
    { id: 'crux-cls', severity: toSeverity(report.cls.category), label: `CLS: ${report.cls.p75 ?? '—'} (${report.cls.category})`, detail: 'Cumulative Layout Shift — how much visible content unexpectedly moves during load.', terms: ['cls', 'core-web-vitals'] },
    { id: 'crux-inp', severity: toSeverity(report.inp.category), label: `INP: ${report.inp.p75 ?? '—'} ms (${report.inp.category})`, detail: 'Interaction to Next Paint — responsiveness of the page to real user input.', terms: ['inp', 'core-web-vitals'] },
  ];
}

// Feature 17 — Wayback Machine historical snapshot timeline via the Internet
// Archive CDX Server API (https://archive.org/developers/wayback-cdx-server.html).
// web.archive.org sends permissive CORS headers on the CDX JSON endpoint, so
// this is directly fetchable from the browser.
//
// Design note: the CDX API does not return page titles, and fetching every
// archived snapshot's HTML to diff <title> tags would mean dozens of extra
// cross-origin requests with uncertain CORS support during replay. Instead
// this uses the CDX `digest` field (a content hash Internet Archive already
// computes per capture) to detect meaningful content changes — an explicit,
// documented substitution for literal title-diffing that stays fully
// client-side and CORS-safe.

import type { AsyncTaskState } from './site-intel-types';

export interface WaybackCapture { timestamp: string; original: string; statusCode: string; digest: string }
export interface WaybackTimeline {
  totalCaptures: number;
  truncated: boolean;
  earliest: WaybackCapture | null;
  latest: WaybackCapture | null;
  yearCounts: Array<{ year: string; count: number }>;
  contentChangePoints: WaybackCapture[];
}

const CDX_LIMIT = 2000;
const CDX_TIMEOUT_MS = 10_000;

export async function fetchWaybackTimeline(hostname: string): Promise<AsyncTaskState<WaybackTimeline>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CDX_TIMEOUT_MS);
  try {
    const url = `https://web.archive.org/cdx/search/cdx?url=${encodeURIComponent(hostname)}&matchType=domain&output=json&fl=timestamp,original,statuscode,digest&collapse=timestamp:8&limit=${CDX_LIMIT}`;
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const rows = await res.json() as string[][];
    if (!Array.isArray(rows) || rows.length <= 1) {
      return { status: 'ready', data: { totalCaptures: 0, truncated: false, earliest: null, latest: null, yearCounts: [], contentChangePoints: [] }, fetchedAt: Date.now() };
    }
    const captures: WaybackCapture[] = rows.slice(1).map(([timestamp, original, statusCode, digest]) => ({ timestamp, original, statusCode, digest }));
    const yearMap = new Map<string, number>();
    let previousDigest = '';
    const contentChangePoints: WaybackCapture[] = [];
    for (const capture of captures) {
      const year = capture.timestamp.slice(0, 4);
      yearMap.set(year, (yearMap.get(year) ?? 0) + 1);
      if (capture.digest && capture.digest !== previousDigest) {
        if (previousDigest) contentChangePoints.push(capture);
        previousDigest = capture.digest;
      }
    }
    const timeline: WaybackTimeline = {
      totalCaptures: captures.length,
      truncated: captures.length >= CDX_LIMIT,
      earliest: captures[0] ?? null,
      latest: captures[captures.length - 1] ?? null,
      yearCounts: [...yearMap.entries()].map(([year, count]) => ({ year, count })).sort((a, b) => a.year.localeCompare(b.year)),
      contentChangePoints: contentChangePoints.slice(0, 25),
    };
    return { status: 'ready', data: timeline, fetchedAt: Date.now() };
  } catch (err) {
    return { status: 'error', error: err instanceof Error ? err.message : 'Wayback CDX lookup failed' };
  } finally {
    clearTimeout(timer);
  }
}

export function waybackCaptureUrl(capture: WaybackCapture): string {
  return `https://web.archive.org/web/${capture.timestamp}/${capture.original}`;
}

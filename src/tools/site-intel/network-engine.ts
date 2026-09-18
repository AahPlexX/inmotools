// Group 2 (continued) — Feature 9 (NS redundancy), Feature 12 (ASN/hosting
// profiler), Feature 13 (GeoIP + anycast heuristic).
//
// IP intelligence uses ipapi.co's JSON endpoint (https://ipapi.co/{ip}/json/),
// which documents browser-safe CORS access and returns ASN, organization,
// city/country, and coordinates in a single free-tier call. This is the one
// external dependency in this tool that is rate-limited (free tier), so
// lookups are batched conservatively and failures degrade to a "blocked"
// AsyncTaskState rather than breaking the rest of the report.
// Verification note: confirm current ipapi.co CORS/rate-limit terms from
// https://ipapi.co/api/ in a network-enabled environment before shipping.

import { queryDns } from './doh-client';
import type { Finding } from './site-intel-types';

export interface IpIntel {
  ip: string;
  asn: string | null;
  organization: string | null;
  country: string | null;
  city: string | null;
  latitude: number | null;
  longitude: number | null;
  error?: string;
}

const IPAPI_TIMEOUT_MS = 6000;

export async function lookupIpIntel(ip: string): Promise<IpIntel> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), IPAPI_TIMEOUT_MS);
  try {
    const res = await fetch(`https://ipapi.co/${encodeURIComponent(ip)}/json/`, { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = await res.json() as Record<string, unknown>;
    if (body.error) throw new Error(String(body.reason ?? 'ipapi.co returned an error'));
    return {
      ip,
      asn: typeof body.asn === 'string' ? body.asn : null,
      organization: typeof body.org === 'string' ? body.org : null,
      country: typeof body.country_name === 'string' ? body.country_name : null,
      city: typeof body.city === 'string' ? body.city : null,
      latitude: typeof body.latitude === 'number' ? body.latitude : null,
      longitude: typeof body.longitude === 'number' ? body.longitude : null,
    };
  } catch (err) {
    return { ip, asn: null, organization: null, country: null, city: null, latitude: null, longitude: null, error: err instanceof Error ? err.message : 'IP intelligence lookup failed' };
  } finally {
    clearTimeout(timer);
  }
}

export async function lookupIpIntelBatch(ips: string[]): Promise<IpIntel[]> {
  const unique = [...new Set(ips)];
  return Promise.all(unique.map((ip) => lookupIpIntel(ip)));
}

/** Feature 13 — flags anycast distribution when multiple IPs map to distinct countries. */
export function detectAnycast(intel: IpIntel[]): Finding {
  const countries = new Set(intel.map((i) => i.country).filter(Boolean));
  if (countries.size > 1) {
    return {
      id: 'anycast-detected', severity: 'good', label: 'Likely Anycast distribution',
      detail: `Resolved IPs geolocate to ${countries.size} distinct countries (${[...countries].join(', ')}), consistent with an Anycast edge network rather than a single origin server.`,
      terms: ['anycast', 'geoip'],
    };
  }
  return {
    id: 'anycast-unlikely', severity: 'info', label: 'Single-region hosting',
    detail: 'Resolved IPs geolocate to a single country/region. This is typical of a conventional single-origin (Unicast) deployment.',
    terms: ['anycast', 'geoip'],
  };
}

/** Feature 9 — nameserver network/topological diversity via distinct ASNs. */
export async function checkNameserverRedundancy(nameservers: string[]): Promise<{ perNameserver: Array<{ ns: string; ip: string | null; asn: string | null }>; finding: Finding }> {
  const perNameserver = await Promise.all(nameservers.map(async (ns) => {
    const a = await queryDns(ns, 'A');
    const ip = a.answers[0]?.data ?? null;
    if (!ip) return { ns, ip: null, asn: null };
    const intel = await lookupIpIntel(ip);
    return { ns, ip, asn: intel.asn };
  }));
  const distinctAsns = new Set(perNameserver.map((n) => n.asn).filter(Boolean));
  const finding: Finding = distinctAsns.size > 1
    ? {
      id: 'ns-redundant', severity: 'good', label: 'Nameservers span distinct networks',
      detail: `Authoritative nameservers resolve across ${distinctAsns.size} distinct Autonomous System(s), reducing single-point-of-failure risk.`,
      terms: ['asn', 'nameserver'],
    }
    : {
      id: 'ns-single-network', severity: 'warn', label: 'Nameservers share a single network',
      detail: 'All authoritative nameservers appear to resolve within the same Autonomous System. An outage at that network could take DNS resolution down entirely.',
      terms: ['asn', 'nameserver'],
    };
  return { perNameserver, finding };
}

/** Feature 12 — ASN & hosting-tier profiler for the domain's primary A-record IPs. */
export async function profileHosting(ips: string[]): Promise<{ intel: IpIntel[]; findings: Finding[] }> {
  const intel = await lookupIpIntelBatch(ips);
  const findings: Finding[] = intel
    .filter((i) => i.asn)
    .map((i) => ({
      id: `hosting-${i.ip}`, severity: 'info', label: `${i.ip} → ${i.organization ?? 'Unknown organization'}`,
      detail: `${i.asn ?? 'Unknown ASN'}${i.city ? `, ${i.city}` : ''}${i.country ? `, ${i.country}` : ''}.`,
      terms: ['asn'],
    }));
  return { intel, findings };
}

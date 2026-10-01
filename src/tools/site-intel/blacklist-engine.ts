// Feature 18 — DNSBL & IP/domain blacklist reputation multi-scanner.
// Every DNSBL zone in DNSBL_ZONES is queryable with an ordinary A-record
// lookup (RFC 5782), which is exactly what the DoH client already does — no
// bespoke protocol or server-side proxy is required. An A-record answer
// (conventionally in 127.0.0.0/8) means "listed"; NXDOMAIN means "clean".

import { queryDns } from './doh-client';
import { DNSBL_ZONES } from './reference-data';
import type { Finding } from './site-intel-types';

export interface DnsblResult { zone: string; label: string; listed: boolean; returnCodes: string[]; error?: string }

function reverseIpv4(ip: string): string | null {
  const parts = ip.split('.');
  if (parts.length !== 4 || parts.some((p) => !/^\d{1,3}$/.test(p))) return null;
  return parts.reverse().join('.');
}

export async function scanDnsbl(target: { ip?: string; domain?: string }): Promise<{ results: DnsblResult[]; finding: Finding }> {
  const results = await Promise.all(DNSBL_ZONES.map(async (zoneDef): Promise<DnsblResult> => {
    const queryName = zoneDef.kind === 'ip'
      ? target.ip ? `${reverseIpv4(target.ip)}.${zoneDef.zone}` : null
      : target.domain ? `${target.domain}.${zoneDef.zone}` : null;
    if (!queryName) return { zone: zoneDef.zone, label: zoneDef.label, listed: false, returnCodes: [], error: 'No applicable target (IP or domain) supplied for this zone type.' };
    const res = await queryDns(queryName, 'A');
    if (res.status === 'error') return { zone: zoneDef.zone, label: zoneDef.label, listed: false, returnCodes: [], error: res.error };
    return { zone: zoneDef.zone, label: zoneDef.label, listed: res.status === 'ok' && res.answers.length > 0, returnCodes: res.answers.map((a) => a.data) };
  }));
  const listedOn = results.filter((r) => r.listed);
  const finding: Finding = listedOn.length > 0
    ? { id: 'dnsbl-listed', severity: 'risk', label: `Listed on ${listedOn.length} blacklist source(s)`, detail: listedOn.map((r) => r.label).join(', '), terms: ['dnsbl'] }
    : { id: 'dnsbl-clean', severity: 'good', label: 'Clean across all checked blacklist sources', detail: `No listings found across ${results.length} DNSBL source(s).`, terms: ['dnsbl'] };
  return { results, finding };
}

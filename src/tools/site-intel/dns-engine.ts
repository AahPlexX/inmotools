// Group 2 — DNS Architecture, Infrastructure & Network Routing.
// Features 7 (multi-record DoH table), 8 (IPv6 readiness), 10 (CAA validator),
// and 11 (DNSSEC chain signal) live here. Feature 9 (NS ASN diversity) and
// Feature 12/13 (ASN + GeoIP) live in network-engine.ts because they compose
// DNS answers with a third-party IP-intelligence lookup.

import { queryDns, queryDnsMulti, reverseDnsName } from './doh-client';
import type { DnsAnswer, DnsQueryResult, Finding } from './site-intel-types';

export interface DnsTable {
  A: DnsQueryResult;
  AAAA: DnsQueryResult;
  CNAME: DnsQueryResult;
  NS: DnsQueryResult;
  SOA: DnsQueryResult;
  TXT: DnsQueryResult;
  MX: DnsQueryResult;
}

/** Feature 7 — populates the full DNS table for a hostname in one pass. */
export async function fetchDnsTable(hostname: string): Promise<DnsTable> {
  const [A, AAAA, CNAME, NS, SOA, TXT, MX] = await queryDnsMulti(hostname, ['A', 'AAAA', 'CNAME', 'NS', 'SOA', 'TXT', 'MX']);
  return { A, AAAA, CNAME, NS, SOA, TXT, MX };
}

/** Resolves reverse DNS (PTR) for every A-record IP found, for the hover tooltip. */
export async function resolvePtrRecords(ipAddresses: string[]): Promise<Record<string, string | null>> {
  const results: Record<string, string | null> = {};
  await Promise.all(ipAddresses.map(async (ip) => {
    const ptrName = reverseDnsName(ip);
    if (!ptrName) { results[ip] = null; return; }
    const res = await queryDns(ptrName, 'PTR');
    results[ip] = res.answers[0]?.data.replace(/\.$/, '') ?? null;
  }));
  return results;
}

/** Feature 8 — IPv6 readiness & dual-stack connectivity auditor. */
export function auditIpv6Readiness(aaaaResult: DnsQueryResult): Finding {
  if (aaaaResult.status === 'ok' && aaaaResult.answers.length > 0) {
    return {
      id: 'ipv6-ready', severity: 'good', label: 'IPv6 dual-stack ready',
      detail: `${aaaaResult.answers.length} AAAA record(s) found. The domain is reachable over native IPv6 in addition to IPv4.`,
      terms: ['ipv6', 'aaaa-record'],
    };
  }
  return {
    id: 'ipv6-missing', severity: 'warn', label: 'IPv4-only (no AAAA record)',
    detail: 'No AAAA record was found. The domain currently depends entirely on legacy IPv4 connectivity.',
    terms: ['ipv6', 'aaaa-record'],
  };
}

/** Feature 10 — CAA record validator. */
export async function validateCaaRecords(hostname: string): Promise<{ result: DnsQueryResult; findings: Finding[] }> {
  const result = await queryDns(hostname, 'CAA');
  const findings: Finding[] = [];
  if (result.status === 'ok' && result.answers.length > 0) {
    const issuers = result.answers
      .map((a) => parseCaaData(a.data))
      .filter((p): p is { flag: string; tag: string; value: string } => p !== null && p.tag === 'issue');
    findings.push({
      id: 'caa-present', severity: 'good', label: 'CAA record present',
      detail: issuers.length
        ? `Only these certificate authorities are authorized to issue for this domain: ${issuers.map((i) => i.value).join(', ')}.`
        : 'A CAA record is present, restricting certificate issuance.',
      terms: ['caa'],
    });
  } else {
    findings.push({
      id: 'caa-missing', severity: 'warn', label: 'No CAA record found',
      detail: 'Without a CAA record, any publicly trusted certificate authority may issue a certificate for this domain (rogue-issuance risk).',
      terms: ['caa'],
    });
  }
  return { result, findings };
}

function parseCaaData(data: string): { flag: string; tag: string; value: string } | null {
  // DoH returns CAA data as `<flags> <tag> "<value>"`.
  const match = /^(\d+)\s+(\w+)\s+"?([^"]*)"?$/.exec(data.trim());
  if (!match) return null;
  return { flag: match[1], tag: match[2], value: match[3] };
}

/** Feature 11 — DNSSEC cryptographic chain signal.
 * A full from-the-root RRSIG/DNSKEY/DS chain-of-trust re-implementation would
 * require recursive validation and root-zone trust anchors, which is not
 * realistic to re-derive client-side. Instead this reports the resolver's
 * authenticated-data (AD) bit (RFC 6840 §5.8) together with the presence of
 * DNSKEY/DS/RRSIG records, which is the same signal every public DoH resolver
 * uses to represent "this answer passed DNSSEC validation".
 */
export async function checkDnssecSignals(hostname: string): Promise<{ dnskey: DnsQueryResult; ds: DnsQueryResult; rrsig: DnsQueryResult; finding: Finding }> {
  const [dnskey, ds, rrsig] = await queryDnsMulti(hostname, ['DNSKEY', 'DS', 'RRSIG']);
  const signed = dnskey.answers.length > 0 || ds.answers.length > 0;
  const authenticated = dnskey.authenticatedData || ds.authenticatedData || rrsig.authenticatedData;
  const finding: Finding = signed
    ? {
      id: 'dnssec-signed', severity: authenticated ? 'good' : 'warn', label: authenticated ? 'DNSSEC signed and validated' : 'DNSSEC records present, not resolver-validated',
      detail: authenticated
        ? 'DNSKEY/DS material is present and the resolver returned the authenticated-data (AD) flag, indicating the chain validated to a trust anchor.'
        : 'DNSKEY/DS material is present, but the resolver did not set the authenticated-data (AD) flag for this query.',
      terms: ['dnssec', 'rrsig', 'dnskey'],
    }
    : {
      id: 'dnssec-unsigned', severity: 'warn', label: 'Zone is not DNSSEC-signed',
      detail: 'No DNSKEY or DS records were found. The zone has no cryptographic protection against spoofing or cache poisoning.',
      terms: ['dnssec'],
    };
  return { dnskey, ds, rrsig, finding };
}

export function extractIps(table: DnsTable): { v4: string[]; v6: string[] } {
  const v4 = table.A.answers.filter((a) => a.typeName === 'A').map((a) => a.data);
  const v6 = table.AAAA.answers.filter((a) => a.typeName === 'AAAA').map((a) => a.data);
  return { v4, v6 };
}

export function extractNameservers(table: DnsTable): string[] {
  return table.NS.answers.map((a) => a.data.replace(/\.$/, ''));
}

export type { DnsAnswer, DnsQueryResult };

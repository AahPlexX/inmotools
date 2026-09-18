// Low-level DNS-over-HTTPS client. Uses the Cloudflare JSON API as the primary
// resolver (https://developers.cloudflare.com/1.1.1.1/encryption/dns-over-https/make-api-requests/json-requests/,
// verified 2026-09: GET requests with `Accept: application/dns-json` are CORS-enabled
// for browser use) with Google's JSON API as a same-shape fallback
// (https://developers.google.com/speed/public-dns/docs/doh/json).
//
// Both resolvers return an identical response shape (Status, TC, RD, RA, AD, CD,
// Question[], Answer[]), which is what makes a single client viable.

import type { DnsAnswer, DnsQueryResult } from './site-intel-types';

const RESOLVERS = [
  { name: 'Cloudflare (1.1.1.1)', endpoint: 'https://cloudflare-dns.com/dns-query' },
  { name: 'Google Public DNS', endpoint: 'https://dns.google/resolve' },
] as const;

export const DNS_TYPE_NAMES: Record<number, string> = {
  1: 'A', 2: 'NS', 5: 'CNAME', 6: 'SOA', 12: 'PTR', 15: 'MX', 16: 'TXT',
  28: 'AAAA', 33: 'SRV', 43: 'DS', 46: 'RRSIG', 47: 'NSEC', 48: 'DNSKEY',
  257: 'CAA', 255: 'ANY',
};

interface RawDohAnswer { name: string; type: number; TTL: number; data: string }
interface RawDohResponse { Status: number; AD?: boolean; Answer?: RawDohAnswer[]; Authority?: RawDohAnswer[] }

const FETCH_TIMEOUT_MS = 8000;

async function fetchWithTimeout(url: string): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { headers: { accept: 'application/dns-json' }, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/** Queries a DNS record type over DoH, trying each resolver in order until one answers. */
export async function queryDns(name: string, type: string, resolverIndex = 0): Promise<DnsQueryResult> {
  const resolver = RESOLVERS[resolverIndex] ?? RESOLVERS[0];
  const url = `${resolver.endpoint}?name=${encodeURIComponent(name)}&type=${encodeURIComponent(type)}`;
  try {
    const res = await fetchWithTimeout(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = (await res.json()) as RawDohResponse;
    if (body.Status === 2 && resolverIndex < RESOLVERS.length - 1) {
      return queryDns(name, type, resolverIndex + 1);
    }
    const answers: DnsAnswer[] = (body.Answer ?? []).map((a) => ({
      name: a.name, type: a.type, typeName: DNS_TYPE_NAMES[a.type] ?? String(a.type), ttl: a.TTL, data: a.data,
    }));
    const status: DnsQueryResult['status'] = body.Status === 3 ? 'nxdomain' : body.Status === 2 ? 'servfail' : answers.length === 0 ? 'empty' : 'ok';
    return { recordType: type, status, answers, authenticatedData: Boolean(body.AD), resolver: resolver.name };
  } catch (err) {
    if (resolverIndex < RESOLVERS.length - 1) return queryDns(name, type, resolverIndex + 1);
    return {
      recordType: type, status: 'error', answers: [], authenticatedData: false, resolver: resolver.name,
      error: err instanceof Error ? err.message : 'DNS-over-HTTPS query failed',
    };
  }
}

export async function queryDnsMulti(name: string, types: string[]): Promise<DnsQueryResult[]> {
  return Promise.all(types.map((type) => queryDns(name, type)));
}

/** Builds the reverse-lookup name for a PTR query (IPv4 only; IPv6 nibble form is rarely needed here). */
export function reverseDnsName(ip: string): string | null {
  const parts = ip.split('.');
  if (parts.length !== 4 || parts.some((p) => !/^\d{1,3}$/.test(p))) return null;
  return `${parts.reverse().join('.')}.in-addr.arpa`;
}

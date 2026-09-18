// Group 3 — Domain Registration, Lifecycles & Historical Records.
// Feature 14 (RDAP bootstrap profiler), Feature 15 (age/longevity index),
// Feature 16 (expiration countdown + status codes).
//
// Uses rdap.org as a bootstrap redirector (https://rdap.org/domain/{name}),
// which 302-redirects to the authoritative regional registry (ARIN-operated
// bootstrap registrar list mirrors IANA's RDAP bootstrap file). The ICANN RDAP
// Technical Implementation Guide requires gTLD RDAP servers to send
// `Access-Control-Allow-Origin: *`, which is what makes direct browser fetch
// viable without a server-side proxy. ccTLD registries are not bound by the
// ICANN profile, so some ccTLDs may not return RDAP data or CORS headers —
// this degrades to a reported "blocked" state rather than a hard failure.

import type { AsyncTaskState, Finding } from './site-intel-types';

export interface RdapEvent { action: string; date: string }
export interface RdapEntity { roles: string[]; name?: string; email?: string }

export interface RdapRecord {
  ldhName: string;
  handle?: string;
  status: string[];
  events: RdapEvent[];
  entities: RdapEntity[];
  nameservers: string[];
  secureDns?: boolean;
  registrarName?: string;
  abuseEmail?: string;
  raw: unknown;
}

const RDAP_TIMEOUT_MS = 9000;

function extractEntities(raw: unknown): RdapEntity[] {
  const entities = (raw as { entities?: unknown[] })?.entities;
  if (!Array.isArray(entities)) return [];
  return entities.map((e) => {
    const entity = e as { roles?: string[]; vcardArray?: unknown; handle?: string };
    let name: string | undefined;
    let email: string | undefined;
    const vcard = entity.vcardArray;
    if (Array.isArray(vcard) && Array.isArray(vcard[1])) {
      for (const field of vcard[1] as unknown[][]) {
        if (field[0] === 'fn' && typeof field[3] === 'string') name = field[3];
        if (field[0] === 'email' && typeof field[3] === 'string') email = field[3];
      }
    }
    return { roles: Array.isArray(entity.roles) ? entity.roles : [], name, email };
  });
}

export async function fetchRdap(domain: string): Promise<AsyncTaskState<RdapRecord>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), RDAP_TIMEOUT_MS);
  try {
    const res = await fetch(`https://rdap.org/domain/${encodeURIComponent(domain)}`, { signal: controller.signal });
    if (res.status === 404) return { status: 'error', error: 'No RDAP registration record found for this domain.' };
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = await res.json() as Record<string, unknown>;
    const entities = extractEntities(body);
    const registrar = entities.find((e) => e.roles.includes('registrar'));
    const abuse = entities.find((e) => e.roles.includes('abuse'));
    const record: RdapRecord = {
      ldhName: typeof body.ldhName === 'string' ? body.ldhName : domain,
      handle: typeof body.handle === 'string' ? body.handle : undefined,
      status: Array.isArray(body.status) ? body.status as string[] : [],
      events: Array.isArray(body.events) ? (body.events as RdapEvent[]) : [],
      entities,
      nameservers: Array.isArray(body.nameservers)
        ? (body.nameservers as Array<{ ldhName?: string }>).map((n) => n.ldhName ?? '').filter(Boolean)
        : [],
      secureDns: typeof (body.secureDNS as { delegationSigned?: boolean } | undefined)?.delegationSigned === 'boolean'
        ? (body.secureDNS as { delegationSigned?: boolean }).delegationSigned
        : undefined,
      registrarName: registrar?.name,
      abuseEmail: abuse?.email,
      raw: body,
    };
    return { status: 'ready', data: record, fetchedAt: Date.now() };
  } catch (err) {
    return { status: 'error', error: err instanceof Error ? err.message : 'RDAP lookup failed (registry may not support CORS-accessible RDAP).' };
  } finally {
    clearTimeout(timer);
  }
}

/** Feature 15 — Domain age & longevity health index. */
export function assessDomainAge(record: RdapRecord): Finding {
  const created = record.events.find((e) => e.action === 'registration')?.date;
  if (!created) {
    return { id: 'age-unknown', severity: 'info', label: 'Registration date unavailable', detail: 'The registry did not disclose a registration event.', terms: ['domain-age'] };
  }
  const createdDate = new Date(created);
  const ageDays = Math.floor((Date.now() - createdDate.getTime()) / 86_400_000);
  if (ageDays < 30) {
    return { id: 'age-nrd', severity: 'risk', label: 'High Risk — Newly Registered Domain (NRD)', detail: `Registered ${ageDays} day(s) ago (${createdDate.toISOString().slice(0, 10)}). Domains under 30 days old are disproportionately associated with abuse.`, terms: ['domain-age', 'nrd'] };
  }
  if (ageDays >= 365 * 5) {
    return { id: 'age-established', severity: 'good', label: 'Established domain (5+ years)', detail: `Registered ${Math.floor(ageDays / 365)} year(s) ago (${createdDate.toISOString().slice(0, 10)}). Long registration history is a positive authority signal.`, terms: ['domain-age'] };
  }
  return { id: 'age-moderate', severity: 'info', label: `Registered ${Math.floor(ageDays / 365)} year(s), ${ageDays % 365} day(s) ago`, detail: createdDate.toISOString().slice(0, 10), terms: ['domain-age'] };
}

/** Feature 16 — Domain expiration countdown & renewal risk telemetry. */
export function assessExpiration(record: RdapRecord): Finding {
  const expiryEvent = record.events.find((e) => e.action === 'expiration');
  const riskyStatuses = ['redemptionPeriod', 'pendingDelete', 'clientHold', 'serverHold'];
  const flaggedStatuses = record.status.filter((s) => riskyStatuses.includes(s));
  if (!expiryEvent) {
    return { id: 'expiry-unknown', severity: 'info', label: 'Expiration date unavailable', detail: 'The registry did not disclose an expiration event.', terms: ['domain-expiration'] };
  }
  const expiry = new Date(expiryEvent.date);
  const daysLeft = Math.floor((expiry.getTime() - Date.now()) / 86_400_000);
  const statusNote = record.status.length ? ` Registry status: ${record.status.join(', ')}.` : '';
  if (flaggedStatuses.length > 0) {
    return { id: 'expiry-risk', severity: 'risk', label: `Renewal risk status active (${flaggedStatuses.join(', ')})`, detail: `${daysLeft} day(s) until expiration (${expiry.toISOString().slice(0, 10)}).${statusNote}`, terms: ['domain-expiration', 'registry-status'] };
  }
  if (daysLeft < 30) {
    return { id: 'expiry-soon', severity: 'warn', label: `Expires in ${daysLeft} day(s)`, detail: `Expiration date: ${expiry.toISOString().slice(0, 10)}.${statusNote}`, terms: ['domain-expiration'] };
  }
  return { id: 'expiry-ok', severity: 'good', label: `${daysLeft} day(s) until expiration`, detail: `Expiration date: ${expiry.toISOString().slice(0, 10)}.${statusNote}`, terms: ['domain-expiration'] };
}

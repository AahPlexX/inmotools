// Group 5 — Email Deliverability & Domain Authentication.
// Feature 24 (MX), Feature 25 (SPF, RFC 7208), Feature 26 (DMARC, RFC 7489),
// Feature 27 (BIMI). All resolved via the same client-side DoH engine used
// elsewhere in this tool — TXT/MX record lookups require no special API.

import { queryDns } from './doh-client';
import type { Finding } from './site-intel-types';

export interface MxRecord { priority: number; host: string; provider?: string }

const KNOWN_MAIL_PROVIDERS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /google\.com$|googlemail\.com$/i, label: 'Google Workspace / Gmail' },
  { pattern: /outlook\.com$|protection\.outlook\.com$/i, label: 'Microsoft 365 / Outlook' },
  { pattern: /pphosted\.com$/i, label: 'Proofpoint' },
  { pattern: /mimecast\.com$/i, label: 'Mimecast' },
  { pattern: /zoho\.com$/i, label: 'Zoho Mail' },
  { pattern: /messagingengine\.com$/i, label: 'Fastmail' },
  { pattern: /icloud\.com$/i, label: 'iCloud Mail' },
  { pattern: /yahoodns\.net$/i, label: 'Yahoo Mail' },
  { pattern: /barracudanetworks\.com$/i, label: 'Barracuda' },
];

function identifyProvider(host: string): string | undefined {
  return KNOWN_MAIL_PROVIDERS.find((p) => p.pattern.test(host))?.label;
}

/** Feature 24 — MX priority & health evaluator. */
export async function fetchMxRecords(hostname: string): Promise<{ records: MxRecord[]; finding: Finding }> {
  const res = await queryDns(hostname, 'MX');
  const records: MxRecord[] = res.answers
    .map((a) => {
      const match = /^(\d+)\s+(.+)$/.exec(a.data.trim());
      const host = (match ? match[2] : a.data).replace(/\.$/, '');
      return { priority: match ? Number(match[1]) : 0, host, provider: identifyProvider(host) };
    })
    .sort((a, b) => a.priority - b.priority);
  const finding: Finding = records.length === 0
    ? { id: 'mx-none', severity: 'warn', label: 'No MX records found', detail: 'This domain cannot receive mail unless a fallback A/AAAA-based implicit MX is configured.', terms: ['mx'] }
    : { id: 'mx-present', severity: records.length > 1 ? 'good' : 'info', label: `${records.length} MX host(s) configured${records.length > 1 ? ' (backup MX present)' : ''}`, detail: records.map((r) => `${r.priority} ${r.host}${r.provider ? ` (${r.provider})` : ''}`).join(', '), terms: ['mx'] };
  return { records, finding };
}

/** Feature 25 — SPF syntax & rule validator (RFC 7208). */
export async function validateSpf(hostname: string): Promise<{ record: string | null; findings: Finding[] }> {
  const res = await queryDns(hostname, 'TXT');
  const spfRaw = res.answers.map((a) => a.data.replace(/^"|"$/g, '')).find((t) => /^v=spf1/i.test(t)) ?? null;
  const findings: Finding[] = [];
  if (!spfRaw) {
    findings.push({ id: 'spf-missing', severity: 'warn', label: 'No SPF record found', detail: 'Without SPF, receiving mail servers have no policy to check the sending IP against for this domain.', terms: ['spf'] });
    return { record: null, findings };
  }
  const mechanisms = spfRaw.split(/\s+/).slice(1);
  const includeCount = mechanisms.filter((m) => /^[+\-~?]?include:/i.test(m)).length;
  const selfInclude = mechanisms.some((m) => new RegExp(`^[+\\-~?]?include:${hostname}$`, 'i').test(m));
  const allMechanism = mechanisms.find((m) => /all$/i.test(m));

  findings.push({ id: 'spf-present', severity: 'good', label: 'SPF record found', detail: spfRaw, terms: ['spf'] });
  if (selfInclude) findings.push({ id: 'spf-self-include', severity: 'risk', label: 'SPF include loop detected', detail: `The record includes its own domain (${hostname}), which can cause an SPF resolution loop.`, terms: ['spf'] });
  if (includeCount > 10) findings.push({ id: 'spf-too-many-includes', severity: 'warn', label: `${includeCount} include mechanisms`, detail: 'RFC 7208 limits SPF evaluation to 10 DNS-querying mechanisms; this record is close to or over that ceiling and may fail (permerror) at some resolvers.', terms: ['spf'] });
  if (allMechanism === '+all') findings.push({ id: 'spf-plus-all', severity: 'risk', label: 'Insecure "+all" wildcard', detail: 'This authorizes any server on the internet to send mail as this domain, defeating the purpose of SPF.', terms: ['spf'] });
  else if (!allMechanism) findings.push({ id: 'spf-no-all', severity: 'warn', label: 'No trailing "all" mechanism', detail: 'Without an explicit all mechanism, SPF evaluation ends in a neutral result for unmatched senders.', terms: ['spf'] });

  return { record: spfRaw, findings };
}

/** Feature 26 — DMARC policy & alignment enforcement inspector (RFC 7489). */
export async function inspectDmarc(hostname: string): Promise<{ record: string | null; findings: Finding[] }> {
  const res = await queryDns(`_dmarc.${hostname}`, 'TXT');
  const raw = res.answers.map((a) => a.data.replace(/^"|"$/g, '')).find((t) => /^v=DMARC1/i.test(t)) ?? null;
  const findings: Finding[] = [];
  if (!raw) {
    findings.push({ id: 'dmarc-missing', severity: 'risk', label: 'No DMARC record — spoofing/CEO-fraud risk', detail: 'Without DMARC, receivers have no domain-level policy for handling SPF/DKIM failures, leaving this domain fully exposed to look-alike sender fraud.', terms: ['dmarc'] });
    return { record: null, findings };
  }
  const tags = Object.fromEntries(raw.split(';').map((t) => t.trim()).filter(Boolean).map((t) => {
    const [k, ...rest] = t.split('=');
    return [k.trim().toLowerCase(), rest.join('=').trim()];
  }));
  const policy = tags.p ?? 'none';
  findings.push({ id: 'dmarc-present', severity: policy === 'reject' ? 'good' : policy === 'quarantine' ? 'warn' : 'risk', label: `DMARC policy: p=${policy}`, detail: raw, terms: ['dmarc'] });
  if (policy === 'none') findings.push({ id: 'dmarc-monitor-only', severity: 'warn', label: 'Monitor-only DMARC policy', detail: 'p=none means failing mail is still delivered; the domain gets visibility (via rua reports) but no enforcement against spoofing.', terms: ['dmarc'] });
  if (!tags.rua) findings.push({ id: 'dmarc-no-rua', severity: 'info', label: 'No aggregate report address (rua)', detail: 'Without rua, the domain owner receives no visibility into who is sending mail claiming to be from this domain.', terms: ['dmarc'] });
  return { record: raw, findings };
}

/** Feature 27 — BIMI readiness checker. */
export async function checkBimi(hostname: string): Promise<{ record: string | null; finding: Finding }> {
  const res = await queryDns(`default._bimi.${hostname}`, 'TXT');
  const raw = res.answers.map((a) => a.data.replace(/^"|"$/g, '')).find((t) => /^v=BIMI1/i.test(t)) ?? null;
  if (!raw) {
    return { record: null, finding: { id: 'bimi-missing', severity: 'info', label: 'No BIMI record', detail: 'BIMI is optional; without it, mailbox providers cannot display this domain\'s brand logo next to authenticated mail.', terms: ['bimi'] } };
  }
  const hasVmc = /a=/.test(raw);
  return {
    record: raw,
    finding: {
      id: 'bimi-present', severity: hasVmc ? 'good' : 'info', label: hasVmc ? 'BIMI configured with a Verified Mark Certificate' : 'BIMI configured (logo only, no VMC evidence)',
      detail: raw, terms: ['bimi'],
    },
  };
}

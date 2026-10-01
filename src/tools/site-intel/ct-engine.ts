// Group 4 — SSL/TLS, Encryption & Security Posture.
// Feature 19 (CT log ingestion), Feature 20 (SAN subdomain discovery), and
// Feature 21 (certificate expiration / automated-renewal sentinel) all read
// from crt.sh's public JSON endpoint (`https://crt.sh/?q=<domain>&output=json`),
// which indexes public Certificate Transparency logs. crt.sh has historically
// had inconsistent CORS/availability behavior (it is a community service, not
// an SLA-backed API) — this is called out explicitly in the tracking document
// as a verify-before-relying-on-it dependency. Failures degrade to a reported
// "blocked" state instead of breaking the rest of the audit.

import type { AsyncTaskState, Finding } from './site-intel-types';

export interface CtCertificate {
  id: number;
  issuerName: string;
  commonName: string;
  sans: string[];
  notBefore: string;
  notAfter: string;
  serialNumber: string;
}

export interface CtReport {
  certificates: CtCertificate[];
  allSans: string[];
  active: CtCertificate | null;
}

const CRTSH_TIMEOUT_MS = 12_000;

interface CrtShRow { id: number; issuer_name: string; common_name: string; name_value: string; not_before: string; not_after: string; serial_number: string }

export async function fetchCtLog(domain: string): Promise<AsyncTaskState<CtReport>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CRTSH_TIMEOUT_MS);
  try {
    const res = await fetch(`https://crt.sh/?q=${encodeURIComponent(domain)}&output=json`, { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    // crt.sh occasionally emits back-to-back JSON objects without array commas; normalize defensively.
    const rows = JSON.parse(text.trim().startsWith('[') ? text : `[${text.trim().replace(/}\s*{/g, '},{')}]`) as CrtShRow[];
    const certMap = new Map<string, CtCertificate>();
    for (const row of rows) {
      const key = `${row.common_name}|${row.not_before}|${row.not_after}|${row.serial_number}`;
      if (certMap.has(key)) continue;
      const sans = [...new Set(row.name_value.split('\n').map((s) => s.trim()).filter(Boolean))];
      certMap.set(key, { id: row.id, issuerName: row.issuer_name, commonName: row.common_name, sans, notBefore: row.not_before, notAfter: row.not_after, serialNumber: row.serial_number });
    }
    const certificates = [...certMap.values()].sort((a, b) => new Date(b.notBefore).getTime() - new Date(a.notBefore).getTime());
    const now = Date.now();
    const active = certificates.find((c) => new Date(c.notAfter).getTime() > now) ?? null;
    const allSans = [...new Set(certificates.flatMap((c) => c.sans))].sort();
    return { status: 'ready', data: { certificates, allSans, active }, fetchedAt: Date.now() };
  } catch (err) {
    return {
      status: 'blocked',
      blockedReason: 'crt.sh did not respond with usable Certificate Transparency data. This community service does not guarantee CORS headers or uptime; retry later or verify service status at crt.sh directly.',
      error: err instanceof Error ? err.message : 'CT log fetch failed',
    };
  } finally {
    clearTimeout(timer);
  }
}

/** Feature 20 — SAN subdomain discovery from ingested certificates (no brute-force scanning). */
export function summarizeSanSubdomains(report: CtReport): Finding {
  return {
    id: 'san-subdomains', severity: 'info', label: `${report.allSans.length} hostname(s) observed in certificate SANs`,
    detail: report.allSans.slice(0, 50).join(', ') || 'No Subject Alternative Names were found.',
    terms: ['san', 'certificate-transparency'],
  };
}

/** Feature 21 — certificate expiration & automated-renewal sentinel. */
export function assessCertificateExpiry(report: CtReport): Finding {
  if (!report.active) {
    return { id: 'cert-none-active', severity: 'warn', label: 'No currently valid certificate found in CT logs', detail: 'Every logged certificate for this name has already expired, or none were logged.', terms: ['certificate-transparency'] };
  }
  const cert = report.active;
  const daysLeft = Math.floor((new Date(cert.notAfter).getTime() - Date.now()) / 86_400_000);
  const isAcme = /let's encrypt|zerossl|google trust services|buypass/i.test(cert.issuerName);
  const shortLifetime = (new Date(cert.notAfter).getTime() - new Date(cert.notBefore).getTime()) <= 100 * 86_400_000;
  const automatedSignal = isAcme && shortLifetime;
  const severity = daysLeft < 14 ? 'risk' : daysLeft < 30 ? 'warn' : 'good';
  return {
    id: 'cert-expiry', severity, label: `${daysLeft} day(s) remaining on active certificate`,
    detail: `Issuer: ${cert.issuerName}. Valid ${cert.notBefore.slice(0, 10)} → ${cert.notAfter.slice(0, 10)}.${automatedSignal ? ' Short validity window and CA pattern is consistent with automated ACME renewal.' : ''}`,
    terms: ['certificate-expiration', 'acme'],
  };
}

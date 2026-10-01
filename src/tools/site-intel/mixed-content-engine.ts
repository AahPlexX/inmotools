// Feature 23 — Mixed content risk & default scheme security analyzer.
// Purely lexical: works from the already-parsed URL with no network calls.

import type { Finding, ParsedUrl } from './site-intel-types';

const NON_STANDARD_INSECURE_PORTS = new Set(['8080', '8000', '8888', '3000', '8081']);

export function analyzeSchemeSecurity(parsed: ParsedUrl): Finding[] {
  const findings: Finding[] = [];
  if (parsed.protocol === 'http') {
    findings.push({ id: 'scheme-http', severity: 'risk', label: 'Unencrypted HTTP scheme', detail: 'This URL uses plaintext http:// rather than https://. Traffic can be intercepted or modified in transit.', terms: ['mixed-content', 'tls'] });
  } else if (parsed.protocol === 'https') {
    findings.push({ id: 'scheme-https', severity: 'good', label: 'Encrypted HTTPS scheme', detail: 'This URL uses https:// by default.', terms: ['tls'] });
  }
  if (parsed.portDeclared && NON_STANDARD_INSECURE_PORTS.has(parsed.port)) {
    findings.push({ id: 'nonstandard-port', severity: 'warn', label: `Non-standard port :${parsed.port}`, detail: 'Development/admin ports like this are sometimes left open on production hosts and are worth double-checking.', terms: ['mixed-content'] });
  }
  if (parsed.hasEmbeddedCredentials) {
    findings.push({ id: 'embedded-credentials', severity: 'risk', label: 'Plaintext credentials embedded in URL', detail: 'This URL carries a user:pass@host authority segment. Credentials in URLs are commonly logged, cached, and leaked via the Referer header.', terms: ['mixed-content'] });
  }
  return findings;
}

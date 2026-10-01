// Shared types for the Site Intelligence Analyzer. Every telemetry engine in this
// tool returns a plain, JSON-serializable result so it can be persisted (IndexedDB),
// exported (JSON/Markdown/CSV/PDF), and re-hydrated without loss.

export type Severity = 'info' | 'good' | 'warn' | 'risk';

export interface Finding {
  id: string;
  severity: Severity;
  label: string;
  detail: string;
  /** Glossary term keys this finding should link to, for contextual tooltips. */
  terms?: string[];
}

export interface UrlToken {
  label: string;
  value: string;
  kind: 'protocol' | 'credentials' | 'subdomain' | 'sld' | 'tld' | 'port' | 'path' | 'query' | 'fragment';
}

export interface ParsedUrl {
  raw: string;
  normalized: string;
  protocol: string;
  protocolRepaired: boolean;
  username: string;
  password: string;
  hasEmbeddedCredentials: boolean;
  host: string;
  hostnameUnicode: string;
  hostnamePunycode: string;
  isPunycode: boolean;
  subdomains: string[];
  sld: string;
  tld: string;
  registrableDomain: string;
  port: string;
  portDeclared: boolean;
  portInBounds: boolean;
  pathSegments: string[];
  queryParams: Array<{ key: string; value: string }>;
  hash: string;
  tokens: UrlToken[];
  errors: string[];
}

export interface HomoglyphFinding {
  label: string;
  hasMixedScript: boolean;
  scripts: string[];
  confusableChars: Array<{ char: string; codePoint: string; looksLike: string; script: string }>;
  unicodeForm: string;
  punycodeForm: string;
  risk: Severity;
}

export interface EntropyResult {
  target: string;
  entropyBits: number;
  maxEntropyBits: number;
  normalized: number;
  classification: 'low' | 'moderate' | 'high';
  suspicion: Severity;
}

export interface TyposquatMatch {
  brand: string;
  distance: number;
  diffHighlight: Array<{ char: string; changed: boolean }>;
  risk: Severity;
}

export interface TrackingParam {
  key: string;
  value: string;
  category: 'tracking' | 'session' | 'routing' | 'unknown';
  service?: string;
}

export interface ShortenerFinding {
  isShortener: boolean;
  service?: string;
  originalUrl: string;
  note: string;
}

export interface DnsAnswer {
  name: string;
  type: number;
  typeName: string;
  ttl: number;
  data: string;
}

export interface DnsQueryResult {
  recordType: string;
  status: 'ok' | 'nxdomain' | 'servfail' | 'error' | 'empty';
  answers: DnsAnswer[];
  authenticatedData: boolean;
  resolver: string;
  error?: string;
}

export interface AsyncTaskState<T> {
  status: 'idle' | 'loading' | 'ready' | 'error' | 'blocked';
  data?: T;
  error?: string;
  blockedReason?: string;
  fetchedAt?: number;
}

export interface AuditRecord {
  id?: number;
  url: string;
  createdAt: number;
  updatedAt: number;
  tags: string[];
  notes: string;
  auditorName: string;
  organization: string;
  snapshot: Record<string, unknown>;
  scorecard?: unknown;
}

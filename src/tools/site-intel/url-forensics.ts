// Group 1 — Core URL Parsing, Lexical Forensics & Syntactic Security.
// Every function here is pure, synchronous, and network-free so it works
// identically offline, in unit tests, and on GitHub Pages.

import {
  BRAND_REFERENCE_DOMAINS, CONFUSABLE_MAP, KNOWN_SHORTENERS, MULTI_PART_TLDS,
  ROUTING_PARAM_PATTERNS, SESSION_PARAM_PATTERNS, TRACKING_PARAM_PATTERNS,
} from './reference-data';
import type {
  EntropyResult, HomoglyphFinding, ParsedUrl, ShortenerFinding, Severity,
  TrackingParam, TyposquatMatch, UrlToken,
} from './site-intel-types';

// ---------------------------------------------------------------------------
// Feature 1 — RFC 3986 canonical URL decomposition engine
// ---------------------------------------------------------------------------

const SCHEME_RE = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//;

/** Repairs a raw/partial input into something the WHATWG URL parser can accept. */
function repairScheme(raw: string): { value: string; repaired: boolean } {
  const trimmed = raw.trim();
  if (SCHEME_RE.test(trimmed)) return { value: trimmed, repaired: false };
  // Protocol-relative ("//host/path") still needs an explicit scheme.
  if (trimmed.startsWith('//')) return { value: `https:${trimmed}`, repaired: true };
  return { value: `https://${trimmed}`, repaired: true };
}

function splitRegistrableDomain(hostname: string): { subdomains: string[]; sld: string; tld: string } {
  const labels = hostname.split('.').filter(Boolean);
  if (labels.length <= 1) return { subdomains: [], sld: labels[0] ?? '', tld: '' };
  const lastTwo = labels.slice(-2).join('.');
  if (MULTI_PART_TLDS.has(lastTwo) && labels.length >= 3) {
    return { subdomains: labels.slice(0, -3), sld: labels[labels.length - 3], tld: lastTwo };
  }
  if (MULTI_PART_TLDS.has(lastTwo) && labels.length === 2) {
    return { subdomains: [], sld: '', tld: lastTwo };
  }
  return { subdomains: labels.slice(0, -2), sld: labels[labels.length - 2], tld: labels[labels.length - 1] };
}

export function parseUrl(rawInput: string): ParsedUrl {
  const errors: string[] = [];
  const { value: repairedInput, repaired } = repairScheme(rawInput);

  let url: URL | null = null;
  try {
    url = new URL(repairedInput);
  } catch (err) {
    errors.push(err instanceof Error ? err.message : 'Unable to parse URL');
  }

  if (!url) {
    return {
      raw: rawInput, normalized: '', protocol: '', protocolRepaired: repaired,
      username: '', password: '', hasEmbeddedCredentials: false, host: '', hostnameUnicode: '',
      hostnamePunycode: '', isPunycode: false, subdomains: [], sld: '', tld: '', registrableDomain: '',
      port: '', portDeclared: false, portInBounds: true, pathSegments: [], queryParams: [], hash: '',
      tokens: [], errors,
    };
  }

  const declaredPort = url.port;
  const portNum = declaredPort ? Number(declaredPort) : NaN;
  const portInBounds = !declaredPort || (Number.isInteger(portNum) && portNum >= 1 && portNum <= 65535);
  if (declaredPort && !portInBounds) errors.push(`Port ${declaredPort} is outside the valid 1-65535 range`);

  const hostnamePunycode = url.hostname;
  let hostnameUnicode = hostnamePunycode;
  try {
    // The URL API cannot decode punycode back to Unicode on its own; reconstruct
    // via the domain-to-Unicode form only when a label carries the ACE prefix.
    hostnameUnicode = hostnamePunycode
      .split('.')
      .map((label) => (label.startsWith('xn--') ? punycodeLabelToUnicode(label) : label))
      .join('.');
  } catch {
    hostnameUnicode = hostnamePunycode;
  }
  const isPunycode = hostnamePunycode.split('.').some((l) => l.startsWith('xn--'));

  const { subdomains, sld, tld } = splitRegistrableDomain(hostnamePunycode);
  const registrableDomain = tld ? [sld, tld].filter(Boolean).join('.') : hostnamePunycode;

  const pathSegments = url.pathname.split('/').filter(Boolean);
  const queryParams = Array.from(url.searchParams.entries()).map(([key, value]) => ({ key, value }));

  const tokens: UrlToken[] = [];
  tokens.push({ label: 'Protocol', value: url.protocol.replace(':', ''), kind: 'protocol' });
  if (url.username) tokens.push({ label: 'Credentials', value: `${url.username}${url.password ? ':***' : ''}`, kind: 'credentials' });
  subdomains.forEach((s) => tokens.push({ label: 'Subdomain', value: s, kind: 'subdomain' }));
  if (sld) tokens.push({ label: 'SLD', value: sld, kind: 'sld' });
  if (tld) tokens.push({ label: 'TLD', value: tld, kind: 'tld' });
  if (declaredPort) tokens.push({ label: 'Port', value: declaredPort, kind: 'port' });
  pathSegments.forEach((p) => tokens.push({ label: 'Path', value: p, kind: 'path' }));
  queryParams.forEach((q) => tokens.push({ label: 'Query', value: `${q.key}=${q.value}`, kind: 'query' }));
  if (url.hash) tokens.push({ label: 'Fragment', value: url.hash.replace('#', ''), kind: 'fragment' });

  return {
    raw: rawInput,
    normalized: url.toString(),
    protocol: url.protocol.replace(':', ''),
    protocolRepaired: repaired,
    username: url.username,
    password: url.password,
    hasEmbeddedCredentials: Boolean(url.username || url.password),
    host: url.host,
    hostnameUnicode,
    hostnamePunycode,
    isPunycode,
    subdomains,
    sld,
    tld,
    registrableDomain,
    port: declaredPort,
    portDeclared: Boolean(declaredPort),
    portInBounds,
    pathSegments,
    queryParams,
    hash: url.hash.replace('#', ''),
    tokens,
    errors,
  };
}

/** Minimal RFC 3492 Punycode decoder (ASCII "xn--" label to Unicode code points). */
function punycodeLabelToUnicode(label: string): string {
  const input = label.slice(4);
  const BASE = 36, TMIN = 1, TMAX = 26, SKEW = 38, DAMP = 700, INITIAL_BIAS = 72, INITIAL_N = 128;
  let n = INITIAL_N, i = 0, bias = INITIAL_BIAS;
  const output: number[] = [];
  const delimIdx = input.lastIndexOf('-');
  let basic = delimIdx >= 0 ? input.slice(0, delimIdx) : '';
  for (const ch of basic) output.push(ch.codePointAt(0)!);
  let idx = delimIdx >= 0 ? delimIdx + 1 : 0;

  function adapt(delta: number, numPoints: number, firstTime: boolean): number {
    let d = firstTime ? Math.floor(delta / DAMP) : Math.floor(delta / 2);
    d += Math.floor(d / numPoints);
    let k = 0;
    while (d > ((BASE - TMIN) * TMAX) / 2) { d = Math.floor(d / (BASE - TMIN)); k += BASE; }
    return k + Math.floor(((BASE - TMIN + 1) * d) / (d + SKEW));
  }

  while (idx < input.length) {
    const oldI = i;
    let w = 1, k = BASE;
    for (;;) {
      if (idx >= input.length) throw new Error('Invalid punycode input');
      const c = input.charCodeAt(idx++);
      const digit = c - 48 < 10 ? c - 22 : c - 65 < 26 ? c - 65 : c - 97 < 26 ? c - 97 : -1;
      if (digit < 0 || digit > BASE - 1) throw new Error('Invalid punycode digit');
      i += digit * w;
      const t = k <= bias ? TMIN : k >= bias + TMAX ? TMAX : k - bias;
      if (digit < t) break;
      w *= BASE - t;
      k += BASE;
    }
    const numPoints = output.length + 1;
    bias = adapt(i - oldI, numPoints, oldI === 0);
    n += Math.floor(i / numPoints);
    i %= numPoints;
    output.splice(i, 0, n);
    i += 1;
  }
  return String.fromCodePoint(...output);
}

// ---------------------------------------------------------------------------
// Feature 2 — Homoglyph & Punycode (IDN) spoofing detector
// ---------------------------------------------------------------------------

function detectScript(char: string): string {
  const cp = char.codePointAt(0) ?? 0;
  if (cp <= 0x024f) return 'Latin';
  if (cp >= 0x0370 && cp <= 0x03ff) return 'Greek';
  if (cp >= 0x0400 && cp <= 0x04ff) return 'Cyrillic';
  if (cp >= 0x0530 && cp <= 0x058f) return 'Armenian';
  if (cp >= 0x0600 && cp <= 0x06ff) return 'Arabic';
  if (cp >= 0x4e00 && cp <= 0x9fff) return 'CJK';
  if (cp >= 0x0030 && cp <= 0x0039) return 'Digit';
  return 'Other';
}

export function detectHomoglyphs(hostnameUnicode: string): HomoglyphFinding {
  const scripts = new Set<string>();
  const confusableChars: HomoglyphFinding['confusableChars'] = [];
  for (const char of hostnameUnicode) {
    if (char === '.' || char === '-') continue;
    const script = detectScript(char);
    scripts.add(script);
    const confusable = CONFUSABLE_MAP[char];
    if (confusable) {
      confusableChars.push({
        char, codePoint: `U+${(char.codePointAt(0) ?? 0).toString(16).toUpperCase().padStart(4, '0')}`,
        looksLike: confusable.looksLike, script: confusable.script,
      });
    }
  }
  const meaningfulScripts = [...scripts].filter((s) => s !== 'Digit' && s !== 'Other');
  const hasMixedScript = meaningfulScripts.length > 1;

  let punycodeForm = hostnameUnicode;
  try {
    punycodeForm = hostnameUnicode
      .split('.')
      .map((label) => (/[^\x00-\x7f]/.test(label) ? `xn--${label}` : label))
      .join('.');
    // Use the platform URL parser for a spec-correct ToASCII conversion when possible.
    punycodeForm = new URL(`https://${hostnameUnicode}`).hostname;
  } catch { /* keep best-effort fallback */ }

  const risk: Severity = confusableChars.length > 0 || hasMixedScript ? 'risk' : 'good';
  return { label: hostnameUnicode, hasMixedScript, scripts: [...scripts], confusableChars, unicodeForm: hostnameUnicode, punycodeForm, risk };
}

// ---------------------------------------------------------------------------
// Feature 3 — Lexical Shannon entropy & algorithmic randomness analyzer
// ---------------------------------------------------------------------------

export function shannonEntropy(target: string): EntropyResult {
  const clean = target.replace(/[.\-_/]/g, '');
  const freq = new Map<string, number>();
  for (const ch of clean) freq.set(ch, (freq.get(ch) ?? 0) + 1);
  const len = clean.length || 1;
  let entropyBits = 0;
  for (const count of freq.values()) {
    const p = count / len;
    entropyBits -= p * Math.log2(p);
  }
  const maxEntropyBits = Math.log2(Math.max(freq.size, 1)) || 1;
  const normalized = clean.length ? entropyBits : 0;
  const classification: EntropyResult['classification'] = normalized >= 4.5 ? 'high' : normalized >= 3.2 ? 'moderate' : 'low';
  const suspicion: Severity = classification === 'high' ? 'risk' : classification === 'moderate' ? 'warn' : 'good';
  return { target, entropyBits: Number(entropyBits.toFixed(3)), maxEntropyBits: Number(maxEntropyBits.toFixed(3)), normalized: Number(normalized.toFixed(3)), classification, suspicion };
}

// ---------------------------------------------------------------------------
// Feature 4 — Typosquatting & Levenshtein brand-distance calculator
// ---------------------------------------------------------------------------

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 0; j <= n; j += 1) dp[0][j] = j;
  for (let i = 1; i <= m; i += 1) {
    for (let j = 1; j <= n; j += 1) {
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

function diffHighlight(candidate: string, brand: string): TyposquatMatch['diffHighlight'] {
  const maxLen = Math.max(candidate.length, brand.length);
  const out: TyposquatMatch['diffHighlight'] = [];
  for (let i = 0; i < maxLen; i += 1) {
    const c = candidate[i] ?? '';
    out.push({ char: c || '·', changed: c !== (brand[i] ?? '') });
  }
  return out;
}

export function findTyposquatMatches(registrableDomain: string): TyposquatMatch[] {
  const matches: TyposquatMatch[] = [];
  const candidate = registrableDomain.toLowerCase();
  for (const brand of BRAND_REFERENCE_DOMAINS) {
    if (candidate === brand) continue;
    const distance = levenshtein(candidate, brand);
    if (distance >= 1 && distance <= 2) {
      matches.push({ brand, distance, diffHighlight: diffHighlight(candidate, brand), risk: distance === 1 ? 'risk' : 'warn' });
    }
  }
  return matches.sort((a, b) => a.distance - b.distance);
}

// ---------------------------------------------------------------------------
// Feature 5 — Query parameter & privacy tracking profiler
// ---------------------------------------------------------------------------

export function classifyQueryParams(queryParams: Array<{ key: string; value: string }>): TrackingParam[] {
  return queryParams.map(({ key, value }) => {
    const tracker = TRACKING_PARAM_PATTERNS.find((t) => t.pattern.test(key));
    if (tracker) return { key, value, category: 'tracking', service: tracker.service };
    if (SESSION_PARAM_PATTERNS.some((p) => p.test(key))) return { key, value, category: 'session' };
    if (ROUTING_PARAM_PATTERNS.some((p) => p.test(key))) return { key, value, category: 'routing' };
    return { key, value, category: 'unknown' };
  });
}

export function buildSanitizedUrl(parsed: ParsedUrl): string {
  if (!parsed.normalized) return '';
  const url = new URL(parsed.normalized);
  const classified = classifyQueryParams(Array.from(url.searchParams.entries()).map(([key, value]) => ({ key, value })));
  url.search = '';
  for (const param of classified) {
    if (param.category === 'tracking' || param.category === 'session') continue;
    url.searchParams.append(param.key, param.value);
  }
  return url.toString();
}

// ---------------------------------------------------------------------------
// Feature 6 — Deep URL shortener & vanity link detector
// ---------------------------------------------------------------------------

export function detectShortener(host: string, normalized: string): ShortenerFinding {
  const bareHost = host.replace(/^www\./, '').toLowerCase();
  const service = KNOWN_SHORTENERS[bareHost];
  if (!service) return { isShortener: false, originalUrl: normalized, note: 'No known shortener signature matched this host.' };
  return {
    isShortener: true,
    service,
    originalUrl: normalized,
    note: `${service} masks its true destination. Use "Resolve destination" to follow client-permissible redirects before trusting this link.`,
  };
}

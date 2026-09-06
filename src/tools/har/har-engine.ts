export type HarFindingCategory = 'headers' | 'cookies' | 'query' | 'bodies';
export type HarSanitizePolicy = { mode: 'redact' | 'hash' | 'mask'; mask?: string; categories: Partial<Record<HarFindingCategory, boolean>> };
export type HarFinding = { category: HarFindingCategory; entryIndex: number; field: string };
type HarLike = { log?: { entries?: any[] } };

const REDACTED = '[REDACTED]';
const SENSITIVE_NAMES = ['authorization','proxyauthorization','cookie','setcookie','apikey','xapikey','xauthtoken','token','accesstoken','refreshtoken','password','passwd','secret','session','sessionid','credential','clientsecret','bearer'];
const normalizeName = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '');
const isSensitiveName = (value: string) => {
  const normalized = normalizeName(value);
  return SENSITIVE_NAMES.some((candidate) => normalized === candidate || normalized.endsWith(candidate));
};
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

function scanObject(value: unknown, path: string, found: string[]): void {
  if (Array.isArray(value)) { value.forEach((item, index) => scanObject(item, `${path}[${index}]`, found)); return; }
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const nextPath = path ? `${path}.${key}` : key;
    if (isSensitiveName(key)) found.push(nextPath); else scanObject(child, nextPath, found);
  }
}

function parseJsonBody(text: unknown): unknown | undefined {
  if (typeof text !== 'string' || !text) return undefined;
  try { return JSON.parse(text); } catch { return undefined; }
}

export function analyzeHar(har: HarLike) {
  const findings: HarFinding[] = [];
  const entries = har.log?.entries ?? [];
  entries.forEach((entry, entryIndex) => {
    for (const side of ['request', 'response'] as const) {
      const message = entry?.[side];
      if (!message) continue;
      for (const header of message.headers ?? []) if (isSensitiveName(String(header?.name ?? ''))) findings.push({ category: 'headers', entryIndex, field: `${side}.header:${String(header.name)}` });
      for (const cookie of message.cookies ?? []) findings.push({ category: 'cookies', entryIndex, field: `${side}.cookie:${String(cookie?.name ?? '')}` });
    }
    for (const query of entry?.request?.queryString ?? []) if (isSensitiveName(String(query?.name ?? ''))) findings.push({ category: 'query', entryIndex, field: `request.query:${String(query.name)}` });
    // Decoded first, so a base64 body's credentials are reported rather than
    // skipped. Without this the scan stayed silent about the very values the
    // sanitizer was also failing to reach.
    const parsedBody = parseJsonBody(readBody(entry?.request?.postData).text);
    if (parsedBody !== undefined) {
      const fields: string[] = [];
      scanObject(parsedBody, '', fields);
      fields.forEach((field) => findings.push({ category: 'bodies', entryIndex, field: `request.body:${field}` }));
    }
  });
  return { requestCount: entries.length, findings };
}

async function sha256(value: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}
async function replacement(value: unknown, policy: HarSanitizePolicy): Promise<string> {
  if (policy.mode === 'redact') return REDACTED;
  if (policy.mode === 'mask') return policy.mask?.trim() || REDACTED;
  return sha256(String(value ?? ''));
}

async function sanitizeStructured(value: unknown, policy: HarSanitizePolicy): Promise<unknown> {
  if (Array.isArray(value)) return Promise.all(value.map((item) => sanitizeStructured(item, policy)));
  if (!value || typeof value !== 'object') return value;
  const output: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) output[key] = isSensitiveName(key) ? await replacement(child, policy) : await sanitizeStructured(child, policy);
  return output;
}

async function sanitizeHeaders(headers: any[], policy: HarSanitizePolicy) { for (const header of headers ?? []) if (isSensitiveName(String(header?.name ?? ''))) header.value = await replacement(header.value, policy); }
async function sanitizeCookies(cookies: any[], policy: HarSanitizePolicy) { for (const cookie of cookies ?? []) cookie.value = await replacement(cookie.value, policy); }

async function sanitizeQuery(entry: any, policy: HarSanitizePolicy) {
  const request = entry?.request;
  if (!request) return;
  const replacements = new Map<string, string>();
  for (const query of request.queryString ?? []) {
    if (!isSensitiveName(String(query?.name ?? ''))) continue;
    const next = await replacement(query.value, policy);
    query.value = next; replacements.set(String(query.name), next);
  }
  if (typeof request.url === 'string') {
    try {
      const url = new URL(request.url);
      for (const [name, next] of replacements) if (url.searchParams.has(name)) url.searchParams.set(name, next);
      request.url = url.toString();
    } catch { /* malformed HAR URL: preserve original */ }
  }
}

// A HAR may declare `postData.encoding: "base64"`, in which case `text` holds
// the body base64-encoded. Reading it as-is meant `JSON.parse` failed, the body
// was skipped, and it was copied verbatim into the "sanitized" output - so a
// credential in a base64 body survived a sanitization pass that reported
// success. Decoding first is what makes the guarantee hold.
//
// Returns undefined when the value is not decodable base64, so a mislabelled
// body falls through to being treated as plain text rather than throwing.
export function decodeBase64Body(text: unknown): string | undefined {
  if (typeof text !== 'string' || text.trim() === '') return undefined;
  try {
    const binary = atob(text.replace(/\s+/g, ''));
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return undefined;
  }
}

const encodeBase64Body = (text: string): string => {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
};

// The body as readable text regardless of transport encoding, plus how to put it
// back. Both the finding scan and the sanitizer go through this so they cannot
// disagree about what a body contains.
export function readBody(postData: { text?: unknown; encoding?: unknown } | undefined): {
  text: string | undefined;
  wasBase64: boolean;
} {
  if (!postData) return { text: undefined, wasBase64: false };
  if (String(postData.encoding ?? '').toLowerCase() === 'base64') {
    const decoded = decodeBase64Body(postData.text);
    if (decoded !== undefined) return { text: decoded, wasBase64: true };
  }
  return { text: typeof postData.text === 'string' ? postData.text : undefined, wasBase64: false };
}

async function sanitizeBody(entry: any, policy: HarSanitizePolicy) {
  const postData = entry?.request?.postData;
  if (!postData) return;
  for (const parameter of postData.params ?? []) if (isSensitiveName(String(parameter?.name ?? ''))) parameter.value = await replacement(parameter.value, policy);

  const { text, wasBase64 } = readBody(postData);
  const parsed = parseJsonBody(text);
  if (parsed === undefined) return;
  const sanitized = JSON.stringify(await sanitizeStructured(parsed, policy));
  // Re-encoded in the transport encoding the entry declared, so the sanitized
  // archive stays loadable by whatever consumed the original.
  postData.text = wasBase64 ? encodeBase64Body(sanitized) : sanitized;
}

export async function sanitizeHar<T extends HarLike>(har: T, policy: HarSanitizePolicy) {
  const output = clone(har);
  for (const entry of output.log?.entries ?? []) {
    if (policy.categories.headers) { await sanitizeHeaders(entry?.request?.headers, policy); await sanitizeHeaders(entry?.response?.headers, policy); }
    if (policy.categories.cookies) { await sanitizeCookies(entry?.request?.cookies, policy); await sanitizeCookies(entry?.response?.cookies, policy); }
    if (policy.categories.query) await sanitizeQuery(entry, policy);
    if (policy.categories.bodies) await sanitizeBody(entry, policy);
  }
  return { har: output, findings: analyzeHar(har).findings };
}

const phaseValue = (value: unknown) => typeof value === 'number' && value > 0 ? value : 0;
export function buildWaterfallRows(har: HarLike) {
  const entries = har.log?.entries ?? [];
  const times = entries.map((entry) => Date.parse(entry.startedDateTime)).filter(Number.isFinite);
  const base = times.length ? Math.min(...times) : 0;
  return entries.map((entry, index) => ({
    index, method: entry?.request?.method ?? '', url: entry?.request?.url ?? '', status: entry?.response?.status ?? 0,
    startOffsetMs: Math.max(0, Date.parse(entry.startedDateTime) - base), totalMs: phaseValue(entry?.time),
    phases: { blocked: phaseValue(entry?.timings?.blocked), dns: phaseValue(entry?.timings?.dns), connect: phaseValue(entry?.timings?.connect), ssl: phaseValue(entry?.timings?.ssl), send: phaseValue(entry?.timings?.send), wait: phaseValue(entry?.timings?.wait), receive: phaseValue(entry?.timings?.receive) },
  }));
}

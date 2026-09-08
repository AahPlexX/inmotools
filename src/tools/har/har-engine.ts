export type HarFindingCategory = 'headers' | 'cookies' | 'query' | 'bodies';
export type HarSanitizePolicy = { mode: 'redact' | 'hash' | 'mask'; mask?: string; categories: Partial<Record<HarFindingCategory, boolean>> };
export type HarFinding = { category: HarFindingCategory; entryIndex: number; field: string };
type HarLike = { log?: { entries?: any[] } };

const REDACTED = '[REDACTED]';
const SENSITIVE_NAMES = ['authorization','proxyauthorization','cookie','setcookie','apikey','xapikey','xauthtoken','token','accesstoken','refreshtoken','password','passwd','secret','session','sessionid','credential','clientsecret','bearer'];
const normalizeName = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '');
const isSensitiveName = (value: string) => { const normalized = normalizeName(value); return SENSITIVE_NAMES.some((candidate) => normalized === candidate || normalized.endsWith(candidate)); };
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

function scanObject(value: unknown, path: string, found: string[]): void {
  if (Array.isArray(value)) { value.forEach((item, index) => scanObject(item, `${path}[${index}]`, found)); return; }
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const nextPath = path ? `${path}.${key}` : key;
    if (isSensitiveName(key)) found.push(nextPath); else scanObject(child, nextPath, found);
  }
}

function parseJsonBody(text: unknown): unknown | undefined { if (typeof text !== 'string' || !text) return undefined; try { return JSON.parse(text); } catch { return undefined; } }

export function decodeBase64Body(text: unknown): string | undefined {
  if (typeof text !== 'string' || text.trim() === '') return undefined;
  try { const binary = atob(text.replace(/\s+/g, '')); const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0)); return new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { return undefined; }
}
const encodeBase64Body = (text: string): string => { const bytes = new TextEncoder().encode(text); let binary = ''; for (const byte of bytes) binary += String.fromCharCode(byte); return btoa(binary); };

export function readBody(body: { text?: unknown; encoding?: unknown } | undefined): { text: string | undefined; wasBase64: boolean } {
  if (!body) return { text: undefined, wasBase64: false };
  if (String(body.encoding ?? '').toLowerCase() === 'base64') { const decoded = decodeBase64Body(body.text); if (decoded !== undefined) return { text: decoded, wasBase64: true }; }
  return { text: typeof body.text === 'string' ? body.text : undefined, wasBase64: false };
}

function scanBody(body: any, side: 'request' | 'response', entryIndex: number, add: (finding: HarFinding) => void): void {
  for (const parameter of body?.params ?? []) if (isSensitiveName(String(parameter?.name ?? ''))) add({ category: 'bodies', entryIndex, field: `${side}.body:${String(parameter.name)}` });
  const { text } = readBody(body);
  const parsed = parseJsonBody(text);
  if (parsed !== undefined) {
    const fields: string[] = []; scanObject(parsed, '', fields); fields.forEach((field) => add({ category: 'bodies', entryIndex, field: `${side}.body:${field}` })); return;
  }
  if (typeof text === 'string' && String(body?.mimeType ?? '').toLowerCase().includes('application/x-www-form-urlencoded')) {
    for (const [name] of new URLSearchParams(text)) if (isSensitiveName(name)) add({ category: 'bodies', entryIndex, field: `${side}.body:${name}` });
  }
}

export function analyzeHar(har: HarLike) {
  const findings: HarFinding[] = [];
  const seen = new Set<string>();
  const add = (finding: HarFinding) => { const key = `${finding.category}|${finding.entryIndex}|${finding.field}`; if (!seen.has(key)) { seen.add(key); findings.push(finding); } };
  const entries = har.log?.entries ?? [];
  entries.forEach((entry, entryIndex) => {
    for (const side of ['request', 'response'] as const) {
      const message = entry?.[side]; if (!message) continue;
      for (const header of message.headers ?? []) if (isSensitiveName(String(header?.name ?? ''))) add({ category: 'headers', entryIndex, field: `${side}.header:${String(header.name)}` });
      for (const cookie of message.cookies ?? []) add({ category: 'cookies', entryIndex, field: `${side}.cookie:${String(cookie?.name ?? '')}` });
    }
    for (const query of entry?.request?.queryString ?? []) if (isSensitiveName(String(query?.name ?? ''))) add({ category: 'query', entryIndex, field: `request.query:${String(query.name)}` });
    if (typeof entry?.request?.url === 'string') {
      try { const url = new URL(entry.request.url); for (const [name] of url.searchParams) if (isSensitiveName(name)) add({ category: 'query', entryIndex, field: `request.query:${name}` }); } catch { /* malformed URL */ }
    }
    scanBody(entry?.request?.postData, 'request', entryIndex, add);
    scanBody(entry?.response?.content, 'response', entryIndex, add);
  });
  return { requestCount: entries.length, findings };
}

async function sha256(value: string): Promise<string> { const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)); return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join(''); }
async function replacement(value: unknown, policy: HarSanitizePolicy): Promise<string> { if (policy.mode === 'redact') return REDACTED; if (policy.mode === 'mask') return policy.mask?.trim() || REDACTED; return sha256(String(value ?? '')); }
async function sanitizeStructured(value: unknown, policy: HarSanitizePolicy): Promise<unknown> {
  if (Array.isArray(value)) return Promise.all(value.map((item) => sanitizeStructured(item, policy)));
  if (!value || typeof value !== 'object') return value;
  const output: Record<string, unknown> = {}; for (const [key, child] of Object.entries(value as Record<string, unknown>)) output[key] = isSensitiveName(key) ? await replacement(child, policy) : await sanitizeStructured(child, policy); return output;
}
async function sanitizeHeaders(headers: any[], policy: HarSanitizePolicy) { for (const header of headers ?? []) if (isSensitiveName(String(header?.name ?? ''))) header.value = await replacement(header.value, policy); }
async function sanitizeCookies(cookies: any[], policy: HarSanitizePolicy) { for (const cookie of cookies ?? []) cookie.value = await replacement(cookie.value, policy); }

async function sanitizeQuery(entry: any, policy: HarSanitizePolicy) {
  const request = entry?.request; if (!request) return;
  for (const query of request.queryString ?? []) if (isSensitiveName(String(query?.name ?? ''))) query.value = await replacement(query.value, policy);
  if (typeof request.url === 'string') {
    try {
      const url = new URL(request.url);
      const pairs = Array.from(url.searchParams.entries());
      url.search = '';
      for (const [name, value] of pairs) url.searchParams.append(name, isSensitiveName(name) ? await replacement(value, policy) : value);
      request.url = url.toString();
    } catch { /* malformed HAR URL: preserve original */ }
  }
}

async function sanitizeBodyContainer(body: any, policy: HarSanitizePolicy) {
  if (!body) return;
  for (const parameter of body.params ?? []) if (isSensitiveName(String(parameter?.name ?? ''))) parameter.value = await replacement(parameter.value, policy);
  const { text, wasBase64 } = readBody(body); if (text === undefined) return;
  let sanitized: string | undefined;
  const parsed = parseJsonBody(text);
  if (parsed !== undefined) sanitized = JSON.stringify(await sanitizeStructured(parsed, policy));
  else if (String(body?.mimeType ?? '').toLowerCase().includes('application/x-www-form-urlencoded')) {
    const params = new URLSearchParams(text); const rebuilt = new URLSearchParams();
    for (const [name, value] of params) rebuilt.append(name, isSensitiveName(name) ? await replacement(value, policy) : value);
    sanitized = rebuilt.toString();
  }
  if (sanitized !== undefined) body.text = wasBase64 ? encodeBase64Body(sanitized) : sanitized;
}

export async function sanitizeHar<T extends HarLike>(har: T, policy: HarSanitizePolicy) {
  const output = clone(har);
  const originalFindings = analyzeHar(har).findings;
  for (const entry of output.log?.entries ?? []) {
    if (policy.categories.headers) { await sanitizeHeaders(entry?.request?.headers, policy); await sanitizeHeaders(entry?.response?.headers, policy); }
    if (policy.categories.cookies) { await sanitizeCookies(entry?.request?.cookies, policy); await sanitizeCookies(entry?.response?.cookies, policy); }
    if (policy.categories.query) await sanitizeQuery(entry, policy);
    if (policy.categories.bodies) { await sanitizeBodyContainer(entry?.request?.postData, policy); await sanitizeBodyContainer(entry?.response?.content, policy); }
  }
  const outputFindings = analyzeHar(output).findings;
  const changedFindings = originalFindings.filter((finding) => policy.categories[finding.category]);
  return { har: output, findings: originalFindings, originalFindings, outputFindings, changedFindings };
}

const phaseValue = (value: unknown) => typeof value === 'number' && value > 0 ? value : 0;
export function buildWaterfallRows(har: HarLike) {
  const entries = har.log?.entries ?? [];
  const times = entries.map((entry) => Date.parse(entry.startedDateTime)).filter(Number.isFinite);
  const base = times.length ? Math.min(...times) : 0;
  return entries.map((entry, index) => {
    const ssl = phaseValue(entry?.timings?.ssl);
    const connectTotal = phaseValue(entry?.timings?.connect);
    return {
      index, method: entry?.request?.method ?? '', url: entry?.request?.url ?? '', status: entry?.response?.status ?? 0,
      startOffsetMs: Math.max(0, Date.parse(entry.startedDateTime) - base), totalMs: phaseValue(entry?.time),
      phases: { blocked: phaseValue(entry?.timings?.blocked), dns: phaseValue(entry?.timings?.dns), connect: Math.max(0, connectTotal - ssl), ssl, send: phaseValue(entry?.timings?.send), wait: phaseValue(entry?.timings?.wait), receive: phaseValue(entry?.timings?.receive) },
    };
  });
}

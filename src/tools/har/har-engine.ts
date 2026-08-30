export type HarFindingCategory = 'headers' | 'cookies' | 'query' | 'bodies';
export type HarSanitizePolicy = { mode: 'redact' | 'hash'; categories: Partial<Record<HarFindingCategory, boolean>> };
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
    const parsedBody = parseJsonBody(entry?.request?.postData?.text);
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
const replacement = (value: unknown, mode: HarSanitizePolicy['mode']) => mode === 'redact' ? Promise.resolve(REDACTED) : sha256(String(value ?? ''));

async function sanitizeStructured(value: unknown, mode: HarSanitizePolicy['mode']): Promise<unknown> {
  if (Array.isArray(value)) return Promise.all(value.map((item) => sanitizeStructured(item, mode)));
  if (!value || typeof value !== 'object') return value;
  const output: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) output[key] = isSensitiveName(key) ? await replacement(child, mode) : await sanitizeStructured(child, mode);
  return output;
}

async function sanitizeHeaders(headers: any[], mode: HarSanitizePolicy['mode']) { for (const header of headers ?? []) if (isSensitiveName(String(header?.name ?? ''))) header.value = await replacement(header.value, mode); }
async function sanitizeCookies(cookies: any[], mode: HarSanitizePolicy['mode']) { for (const cookie of cookies ?? []) cookie.value = await replacement(cookie.value, mode); }

async function sanitizeQuery(entry: any, mode: HarSanitizePolicy['mode']) {
  const request = entry?.request;
  if (!request) return;
  const replacements = new Map<string, string>();
  for (const query of request.queryString ?? []) {
    if (!isSensitiveName(String(query?.name ?? ''))) continue;
    const next = await replacement(query.value, mode);
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

async function sanitizeBody(entry: any, mode: HarSanitizePolicy['mode']) {
  const postData = entry?.request?.postData;
  if (!postData) return;
  for (const parameter of postData.params ?? []) if (isSensitiveName(String(parameter?.name ?? ''))) parameter.value = await replacement(parameter.value, mode);
  const parsed = parseJsonBody(postData.text);
  if (parsed !== undefined) postData.text = JSON.stringify(await sanitizeStructured(parsed, mode));
}

export async function sanitizeHar<T extends HarLike>(har: T, policy: HarSanitizePolicy) {
  const output = clone(har);
  for (const entry of output.log?.entries ?? []) {
    if (policy.categories.headers) { await sanitizeHeaders(entry?.request?.headers, policy.mode); await sanitizeHeaders(entry?.response?.headers, policy.mode); }
    if (policy.categories.cookies) { await sanitizeCookies(entry?.request?.cookies, policy.mode); await sanitizeCookies(entry?.response?.cookies, policy.mode); }
    if (policy.categories.query) await sanitizeQuery(entry, policy.mode);
    if (policy.categories.bodies) await sanitizeBody(entry, policy.mode);
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

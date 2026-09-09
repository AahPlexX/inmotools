export type HarFindingCategory = 'headers' | 'cookies' | 'query' | 'bodies';
export type HarSanitizePolicy = { mode: 'redact' | 'hash' | 'mask'; mask?: string; categories: Partial<Record<HarFindingCategory, boolean>> };
export type HarFinding = { category: HarFindingCategory; entryIndex: number; field: string };
type HarLike = { log?: { entries?: any[] } };

const REDACTED = '[REDACTED]';
const SENSITIVE_NAMES = ['authorization','proxyauthorization','cookie','setcookie','apikey','xapikey','xauthtoken','token','accesstoken','refreshtoken','password','passwd','secret','session','sessionid','credential','clientsecret','bearer'];
const normalizeName = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '');
const isSensitiveName = (value: string) => { const normalized = normalizeName(value); return SENSITIVE_NAMES.some((candidate) => normalized === candidate || normalized.endsWith(candidate)); };

const RAW_JSON_NUMBER = Symbol('inmotools.har.raw-json-number');
type RawJsonNumber = { readonly [RAW_JSON_NUMBER]: string };
const MAX_SAFE_INTEGER_BIGINT = BigInt(Number.MAX_SAFE_INTEGER);
const MIN_SAFE_INTEGER_BIGINT = BigInt(Number.MIN_SAFE_INTEGER);

function rawJsonNumber(source: string): RawJsonNumber {
  return Object.freeze({ [RAW_JSON_NUMBER]: source });
}

function isRawJsonNumber(value: unknown): value is RawJsonNumber {
  return Boolean(value && typeof value === 'object' && RAW_JSON_NUMBER in value);
}

/**
 * Protect integer JSON tokens that JavaScript cannot represent exactly before
 * JSON.parse gets a chance to round them. This lexical pass deliberately only
 * replaces number tokens outside JSON strings, then the reviver restores a
 * private wrapper whose original numeric lexeme can be emitted losslessly.
 */
export function parseHarJson(text: string): any {
  let marker = '__INMOTOOLS_HAR_RAW_INTEGER__';
  while (text.includes(marker)) marker += '_';

  const replacements = new Map<string, string>();
  let protectedText = '';
  let index = 0;
  let inString = false;
  let escaped = false;

  while (index < text.length) {
    const character = text[index];
    if (inString) {
      protectedText += character;
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === '"') inString = false;
      index += 1;
      continue;
    }

    if (character === '"') {
      inString = true;
      protectedText += character;
      index += 1;
      continue;
    }

    if (character === '-' || (character >= '0' && character <= '9')) {
      const match = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(text.slice(index));
      if (match) {
        const token = match[0];
        if (!/[.eE]/.test(token)) {
          try {
            const integer = BigInt(token);
            if (integer > MAX_SAFE_INTEGER_BIGINT || integer < MIN_SAFE_INTEGER_BIGINT) {
              const placeholder = `${marker}${replacements.size}`;
              replacements.set(placeholder, token);
              protectedText += JSON.stringify(placeholder);
              index += token.length;
              continue;
            }
          } catch {
            // Invalid JSON will still be rejected by JSON.parse below.
          }
        }
        protectedText += token;
        index += token.length;
        continue;
      }
    }

    protectedText += character;
    index += 1;
  }

  return JSON.parse(protectedText, (_key, value) => {
    if (typeof value === 'string') {
      const source = replacements.get(value);
      if (source !== undefined) return rawJsonNumber(source);
    }
    return value;
  });
}

/** Serialize parsed HAR data while emitting protected unsafe integers as their
 * original numeric JSON lexemes rather than strings or rounded Numbers. */
export function stringifyHarJson(value: unknown, space = 0): string {
  const indentUnit = ' '.repeat(Math.min(10, Math.max(0, Math.trunc(space))));
  const seen = new Set<object>();
  const indent = (depth: number) => indentUnit.repeat(depth);

  const serialize = (input: unknown, depth: number): string | undefined => {
    if (isRawJsonNumber(input)) return input[RAW_JSON_NUMBER];
    if (input === null) return 'null';
    if (typeof input === 'string' || typeof input === 'boolean') return JSON.stringify(input);
    if (typeof input === 'number') return Number.isFinite(input) ? JSON.stringify(input) : 'null';
    if (typeof input === 'bigint') throw new TypeError('BigInt values are not valid JSON without an explicit representation.');
    if (typeof input === 'undefined' || typeof input === 'function' || typeof input === 'symbol') return undefined;
    if (typeof input !== 'object') return JSON.stringify(input);

    const object = input as Record<string, unknown>;
    if (seen.has(object)) throw new TypeError('Converting circular structure to JSON');
    seen.add(object);

    let output: string;
    if (Array.isArray(input)) {
      const items = input.map((item) => serialize(item, depth + 1) ?? 'null');
      output = !items.length
        ? '[]'
        : indentUnit
          ? `[\n${indent(depth + 1)}${items.join(`,\n${indent(depth + 1)}`)}\n${indent(depth)}]`
          : `[${items.join(',')}]`;
    } else {
      const pairs: string[] = [];
      for (const key of Object.keys(object)) {
        const serialized = serialize(object[key], depth + 1);
        if (serialized === undefined) continue;
        pairs.push(`${JSON.stringify(key)}${indentUnit ? ': ' : ':'}${serialized}`);
      }
      output = !pairs.length
        ? '{}'
        : indentUnit
          ? `{\n${indent(depth + 1)}${pairs.join(`,\n${indent(depth + 1)}`)}\n${indent(depth)}}`
          : `{${pairs.join(',')}}`;
    }

    seen.delete(object);
    return output;
  };

  return serialize(value, 0) ?? '';
}

function cloneValue<T>(value: T): T {
  if (isRawJsonNumber(value)) return rawJsonNumber(value[RAW_JSON_NUMBER]) as T;
  if (Array.isArray(value)) return value.map((item) => cloneValue(item)) as T;
  if (!value || typeof value !== 'object') return value;
  const output: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) output[key] = cloneValue(child);
  return output as T;
}

function scanObject(value: unknown, path: string, found: string[]): void {
  if (isRawJsonNumber(value)) return;
  if (Array.isArray(value)) { value.forEach((item, index) => scanObject(item, `${path}[${index}]`, found)); return; }
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const nextPath = path ? `${path}.${key}` : key;
    if (isSensitiveName(key)) found.push(nextPath); else scanObject(child, nextPath, found);
  }
}

function parseJsonBody(text: unknown): unknown | undefined {
  if (typeof text !== 'string' || !text) return undefined;
  try { return parseHarJson(text); } catch { return undefined; }
}

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

function scanUrl(value: unknown, credentialPrefix: string, queryPrefix: string, entryIndex: number, add: (finding: HarFinding) => void): void {
  if (typeof value !== 'string' || !value) return;
  try {
    const url = new URL(value);
    if (url.username) add({ category: 'query', entryIndex, field: `${credentialPrefix}:username` });
    if (url.password) add({ category: 'query', entryIndex, field: `${credentialPrefix}:password` });
    for (const [name] of url.searchParams) if (isSensitiveName(name)) add({ category: 'query', entryIndex, field: `${queryPrefix}:${name}` });
    return;
  } catch {
    // A redirect target can legally be represented in relative form by some
    // producers. Even when URL() cannot parse it as absolute, inspect its query.
  }
  const question = value.indexOf('?');
  if (question < 0) return;
  const hash = value.indexOf('#', question);
  const queryText = value.slice(question + 1, hash >= 0 ? hash : undefined);
  for (const [name] of new URLSearchParams(queryText)) if (isSensitiveName(name)) add({ category: 'query', entryIndex, field: `${queryPrefix}:${name}` });
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
    scanUrl(entry?.request?.url, 'request.url', 'request.query', entryIndex, add);
    scanUrl(entry?.response?.redirectURL, 'response.redirectURL', 'response.redirectURL.query', entryIndex, add);
    scanBody(entry?.request?.postData, 'request', entryIndex, add);
    scanBody(entry?.response?.content, 'response', entryIndex, add);
  });
  return { requestCount: entries.length, findings };
}

async function sha256(value: string): Promise<string> { const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)); return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join(''); }
async function replacement(value: unknown, policy: HarSanitizePolicy): Promise<string> { if (policy.mode === 'redact') return REDACTED; if (policy.mode === 'mask') return policy.mask?.trim() || REDACTED; return sha256(String(value ?? '')); }
async function sanitizeStructured(value: unknown, policy: HarSanitizePolicy): Promise<unknown> {
  if (isRawJsonNumber(value)) return rawJsonNumber(value[RAW_JSON_NUMBER]);
  if (Array.isArray(value)) return Promise.all(value.map((item) => sanitizeStructured(item, policy)));
  if (!value || typeof value !== 'object') return value;
  const output: Record<string, unknown> = {}; for (const [key, child] of Object.entries(value as Record<string, unknown>)) output[key] = isSensitiveName(key) ? await replacement(child, policy) : await sanitizeStructured(child, policy); return output;
}
async function sanitizeHeaders(headers: any[], policy: HarSanitizePolicy) { for (const header of headers ?? []) if (isSensitiveName(String(header?.name ?? ''))) header.value = await replacement(header.value, policy); }
async function sanitizeCookies(cookies: any[], policy: HarSanitizePolicy) { for (const cookie of cookies ?? []) cookie.value = await replacement(cookie.value, policy); }

async function sanitizeRelativeUrlQuery(value: string, policy: HarSanitizePolicy): Promise<string> {
  const question = value.indexOf('?');
  if (question < 0) return value;
  const hashIndex = value.indexOf('#', question);
  const prefix = value.slice(0, question);
  const suffix = hashIndex >= 0 ? value.slice(hashIndex) : '';
  const queryText = value.slice(question + 1, hashIndex >= 0 ? hashIndex : undefined);
  const params = new URLSearchParams(queryText);
  const rebuilt = new URLSearchParams();
  for (const [name, item] of params) rebuilt.append(name, isSensitiveName(name) ? await replacement(item, policy) : item);
  return `${prefix}?${rebuilt.toString()}${suffix}`;
}

async function sanitizeUrl(value: unknown, policy: HarSanitizePolicy): Promise<unknown> {
  if (typeof value !== 'string' || !value) return value;
  try {
    const url = new URL(value);
    if (url.username) url.username = await replacement(url.username, policy);
    if (url.password) url.password = await replacement(url.password, policy);
    const pairs = Array.from(url.searchParams.entries());
    url.search = '';
    for (const [name, item] of pairs) url.searchParams.append(name, isSensitiveName(name) ? await replacement(item, policy) : item);
    return url.toString();
  } catch {
    return sanitizeRelativeUrlQuery(value, policy);
  }
}

async function sanitizeQuery(entry: any, policy: HarSanitizePolicy) {
  const request = entry?.request;
  if (request) {
    for (const query of request.queryString ?? []) if (isSensitiveName(String(query?.name ?? ''))) query.value = await replacement(query.value, policy);
    request.url = await sanitizeUrl(request.url, policy);
  }
  if (entry?.response && typeof entry.response.redirectURL === 'string') entry.response.redirectURL = await sanitizeUrl(entry.response.redirectURL, policy);
}

async function sanitizeBodyContainer(body: any, policy: HarSanitizePolicy) {
  if (!body) return;
  for (const parameter of body.params ?? []) if (isSensitiveName(String(parameter?.name ?? ''))) parameter.value = await replacement(parameter.value, policy);
  const { text, wasBase64 } = readBody(body); if (text === undefined) return;
  let sanitized: string | undefined;
  const parsed = parseJsonBody(text);
  if (parsed !== undefined) sanitized = stringifyHarJson(await sanitizeStructured(parsed, policy));
  else if (String(body?.mimeType ?? '').toLowerCase().includes('application/x-www-form-urlencoded')) {
    const params = new URLSearchParams(text); const rebuilt = new URLSearchParams();
    for (const [name, value] of params) rebuilt.append(name, isSensitiveName(name) ? await replacement(value, policy) : value);
    sanitized = rebuilt.toString();
  }
  if (sanitized !== undefined) body.text = wasBase64 ? encodeBase64Body(sanitized) : sanitized;
}

export async function sanitizeHar<T extends HarLike>(har: T, policy: HarSanitizePolicy) {
  const output = cloneValue(har);
  const originalFindings = analyzeHar(har).findings;
  for (const entry of output.log?.entries ?? []) {
    if (policy.categories.headers) { await sanitizeHeaders(entry?.request?.headers, policy); await sanitizeHeaders(entry?.response?.headers, policy); }
    if (policy.categories.cookies) { await sanitizeCookies(entry?.request?.cookies, policy); await sanitizeCookies(entry?.response?.cookies, policy); }
    if (policy.categories.query) await sanitizeQuery(entry, policy);
    if (policy.categories.bodies) { await sanitizeBodyContainer(entry?.request?.postData, policy); await sanitizeBodyContainer(entry?.response?.content, policy); }
  }
  const outputFindings = analyzeHar(output).findings;
  const changedFindings = originalFindings.filter((finding) => policy.categories[finding.category]);
  const remainingFindings = originalFindings.filter((finding) => !policy.categories[finding.category]);
  return { har: output, findings: originalFindings, originalFindings, outputFindings, changedFindings, remainingFindings };
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

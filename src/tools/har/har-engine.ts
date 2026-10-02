export type HarFindingCategory = 'headers' | 'cookies' | 'query' | 'bodies' | 'emails' | 'addresses';
export type HarSanitizePolicy = {
  mode: 'redact' | 'hash' | 'mask';
  mask?: string;
  categories: Partial<Record<HarFindingCategory, boolean>>;
  /** Extra header, cookie, query, or body field names treated as sensitive for this run. */
  extraNames?: readonly string[];
};
export type HarFinding = { category: HarFindingCategory; entryIndex: number; field: string };
export type HarNameValue = { name?: unknown; value?: unknown };
export type HarBody = { mimeType?: unknown; encoding?: unknown; text?: unknown; params?: HarNameValue[] };
export type HarMessage = {
  method?: unknown;
  url?: unknown;
  headers?: HarNameValue[];
  cookies?: HarNameValue[];
  queryString?: HarNameValue[];
  postData?: HarBody;
  status?: unknown;
  redirectURL?: unknown;
  content?: HarBody;
};
export type HarEntry = {
  startedDateTime?: unknown;
  time?: unknown;
  request?: HarMessage;
  response?: HarMessage;
  timings?: Record<string, unknown>;
  serverIPAddress?: unknown;
  connection?: unknown;
  pageref?: unknown;
};
export type HarLike = { log?: { entries?: HarEntry[]; pages?: unknown[] } };
export type HarWaterfallRow = {
  index: number;
  method: string;
  url: string;
  displayUrl: string;
  status: number;
  mime: string;
  bytes: number;
  startOffsetMs: number;
  totalMs: number;
  phases: { blocked: number; dns: number; connect: number; ssl: number; send: number; wait: number; receive: number };
};

const REDACTED = '[REDACTED]';
const SENSITIVE_NAMES = ['authorization','proxyauthorization','cookie','setcookie','apikey','xapikey','xauthtoken','token','accesstoken','refreshtoken','password','passwd','secret','session','sessionid','credential','clientsecret','bearer'];
const normalizeName = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '');
const isSensitiveName = (value: string, extraNames: readonly string[] = []) => {
  const normalized = normalizeName(value);
  if (!normalized) return false;
  if (SENSITIVE_NAMES.some((candidate) => normalized === candidate || normalized.endsWith(candidate))) return true;
  return extraNames.some((candidate) => { const extra = normalizeName(candidate); return extra.length > 0 && (normalized === extra || normalized.endsWith(extra)); });
};

const EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const IPV4_PATTERN = /\b(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\b/g;
const IPV6_PATTERN = /\b(?:[0-9A-F]{1,4}:){2,7}[0-9A-F]{1,4}\b/gi;
const FORWARD_HEADERS = ['xforwardedfor', 'xrealip', 'forwarded', 'cfconnectingip', 'trueclientip', 'xclientip'];

export function displayUrl(value: string, extraNames: readonly string[] = []): string {
  if (!value) return '';
  try {
    const url = new URL(value);
    if (url.username) url.username = 'redacted';
    if (url.password) url.password = 'redacted';
    const pairs = Array.from(url.searchParams.entries());
    url.search = '';
    for (const [name, item] of pairs) url.searchParams.append(name, isSensitiveName(name, extraNames) ? '[REDACTED]' : item);
    return url.toString();
  } catch {
    return value.replace(/\/\/[^/\s@]*:[^/\s@]*@/g, '//redacted:redacted@');
  }
}

function containsEmail(value: string): boolean { EMAIL_PATTERN.lastIndex = 0; return EMAIL_PATTERN.test(value); }
function containsIp(value: string): boolean { IPV4_PATTERN.lastIndex = 0; if (IPV4_PATTERN.test(value)) return true; IPV6_PATTERN.lastIndex = 0; return IPV6_PATTERN.test(value); }

const RAW_JSON_NUMBER = Symbol('inmotools.har.raw-json-number');
type RawJsonNumber = { readonly [RAW_JSON_NUMBER]: string };
const MAX_SAFE_INTEGER_BIGINT = BigInt(Number.MAX_SAFE_INTEGER);
const MIN_SAFE_INTEGER_BIGINT = BigInt(Number.MIN_SAFE_INTEGER);

function rawJsonNumber(source: string): RawJsonNumber {
  return Object.freeze({ [RAW_JSON_NUMBER]: source, [Symbol.toPrimitive]: (hint: string) => hint === 'number' ? Number(source) : source });
}

function isRawJsonNumber(value: unknown): value is RawJsonNumber {
  return Boolean(value && typeof value === 'object' && RAW_JSON_NUMBER in value);
}

function normalizedDecimal(token: string): string {
  const [coefficient, exponent = '0'] = token.toLowerCase().split('e');
  const negative = coefficient.startsWith('-');
  const [whole, fraction = ''] = coefficient.replace(/^-/, '').split('.');
  const digits = (whole + fraction).replace(/^0+/, '').replace(/0+$/, '');
  if (!digits) return '0';
  const trailingZeros = (whole + fraction).match(/0+$/)?.[0].length ?? 0;
  return `${negative ? '-' : ''}${digits}e${BigInt(exponent) - BigInt(fraction.length) + BigInt(trailingZeros)}`;
}

function shouldProtectJsonNumber(token: string): boolean {
  if (!/[.eE]/.test(token)) {
    try {
      const integer = BigInt(token);
      return integer > MAX_SAFE_INTEGER_BIGINT || integer < MIN_SAFE_INTEGER_BIGINT;
    } catch {
      return false;
    }
  }
  const numeric = Number(token);
  if (!Number.isFinite(numeric) || (Number.isInteger(numeric) && !Number.isSafeInteger(numeric))) return true;
  // Avoid constructing enormous exponents; retaining the token is lossless.
  if ((token.split(/[eE]/)[1]?.length ?? 0) > 6) return true;
  return normalizedDecimal(token) !== normalizedDecimal(String(numeric));
}

/**
 * Protect JSON number tokens that JavaScript cannot represent safely before
 * JSON.parse gets a chance to round or overflow them. The lexical pass only
 * considers number tokens outside JSON strings, then the reviver restores a
 * private wrapper whose original numeric lexeme can be emitted losslessly.
 */
export function parseHarJson(text: string): any {
  let marker = '__INMOTOOLS_HAR_RAW_NUMBER__';
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
        if (shouldProtectJsonNumber(token)) {
          const placeholder = `${marker}${replacements.size}`;
          replacements.set(placeholder, token);
          protectedText += JSON.stringify(placeholder);
          index += token.length;
          continue;
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

/** Serialize parsed HAR data while emitting protected unsafe numbers as their
 * original numeric JSON lexemes rather than strings, rounded Numbers, or null. */
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
  const output = Object.create(null) as Record<string, unknown>;
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) output[key] = cloneValue(child);
  return output as T;
}

function scanObject(value: unknown, path: string, found: string[], extraNames: readonly string[] = []): void {
  if (isRawJsonNumber(value)) return;
  if (Array.isArray(value)) { value.forEach((item, index) => scanObject(item, `${path}[${index}]`, found, extraNames)); return; }
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const nextPath = path ? `${path}.${key}` : key;
    if (isSensitiveName(key, extraNames)) found.push(nextPath); else scanObject(child, nextPath, found, extraNames);
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

function scanBody(body: HarBody | undefined, side: 'request' | 'response', entryIndex: number, extraNames: readonly string[], add: (finding: HarFinding) => void): void {
  for (const parameter of body?.params ?? []) if (isSensitiveName(String(parameter?.name ?? ''), extraNames)) add({ category: 'bodies', entryIndex, field: `${side}.body:${String(parameter.name)}` });
  const { text } = readBody(body);
  const parsed = parseJsonBody(text);
  if (parsed !== undefined) {
    const fields: string[] = []; scanObject(parsed, '', fields, extraNames); fields.forEach((field) => add({ category: 'bodies', entryIndex, field: `${side}.body:${field}` })); return;
  }
  if (typeof text === 'string' && String(body?.mimeType ?? '').toLowerCase().includes('application/x-www-form-urlencoded')) {
    for (const [name] of new URLSearchParams(text)) if (isSensitiveName(name, extraNames)) add({ category: 'bodies', entryIndex, field: `${side}.body:${name}` });
  }
}

function scanUrl(value: unknown, credentialPrefix: string, queryPrefix: string, entryIndex: number, extraNames: readonly string[], add: (finding: HarFinding) => void): void {
  if (typeof value !== 'string' || !value) return;
  try {
    const url = new URL(value);
    if (url.username) add({ category: 'query', entryIndex, field: `${credentialPrefix}:username` });
    if (url.password) add({ category: 'query', entryIndex, field: `${credentialPrefix}:password` });
    for (const [name] of url.searchParams) if (isSensitiveName(name, extraNames)) add({ category: 'query', entryIndex, field: `${queryPrefix}:${name}` });
    return;
  } catch {
    // A redirect target can legally be represented in relative form by some
    // producers. Even when URL() cannot parse it as absolute, inspect its query.
  }
  const question = value.indexOf('?');
  if (question < 0) return;
  const hash = value.indexOf('#', question);
  const queryText = value.slice(question + 1, hash >= 0 ? hash : undefined);
  for (const [name] of new URLSearchParams(queryText)) if (isSensitiveName(name, extraNames)) add({ category: 'query', entryIndex, field: `${queryPrefix}:${name}` });
}

// `user:pass@host` in a URL is a credential (reported under query), not an email address.
function withoutUrlUserinfo(value: string): string {
  try {
    const url = new URL(value);
    if (!url.username && !url.password) return value;
    url.username = '';
    url.password = '';
    return url.href;
  } catch {
    return value;
  }
}

function notePersonalData(value: unknown, entryIndex: number, field: string, add: (finding: HarFinding) => void): void {
  if (typeof value !== 'string' || !value) return;
  const text = withoutUrlUserinfo(value);
  if (containsEmail(text)) add({ category: 'emails', entryIndex, field: `${field}:email` });
  if (containsIp(text)) add({ category: 'addresses', entryIndex, field: `${field}:ip` });
}

export function analyzeHar(har: HarLike, extraNames: readonly string[] = []) {
  const findings: HarFinding[] = [];
  const seen = new Set<string>();
  const add = (finding: HarFinding) => { const key = `${finding.category}|${finding.entryIndex}|${finding.field}`; if (!seen.has(key)) { seen.add(key); findings.push(finding); } };
  const entries = har.log?.entries ?? [];
  entries.forEach((entry, entryIndex) => {
    for (const side of ['request', 'response'] as const) {
      const message = entry?.[side]; if (!message) continue;
      for (const header of message.headers ?? []) {
        if (isSensitiveName(String(header?.name ?? ''), extraNames)) add({ category: 'headers', entryIndex, field: `${side}.header:${String(header.name)}` });
        notePersonalData(header?.value, entryIndex, `${side}.header:${String(header?.name ?? 'header')}`, add);
      }
      for (const cookie of message.cookies ?? []) {
        add({ category: 'cookies', entryIndex, field: `${side}.cookie:${String(cookie?.name ?? '')}` });
        notePersonalData(cookie?.value, entryIndex, `${side}.cookie:${String(cookie?.name ?? 'cookie')}`, add);
      }
    }
    for (const query of entry?.request?.queryString ?? []) {
      if (isSensitiveName(String(query?.name ?? ''), extraNames)) add({ category: 'query', entryIndex, field: `request.query:${String(query.name)}` });
      notePersonalData(query?.value, entryIndex, `request.query:${String(query?.name ?? 'query')}`, add);
    }
    scanUrl(entry?.request?.url, 'request.url', 'request.query', entryIndex, extraNames, add);
    scanUrl(entry?.response?.redirectURL, 'response.redirectURL', 'response.redirectURL.query', entryIndex, extraNames, add);
    notePersonalData(entry?.request?.url, entryIndex, 'request.url', add);
    notePersonalData(entry?.response?.redirectURL, entryIndex, 'response.redirectURL', add);
    scanBody(entry?.request?.postData, 'request', entryIndex, extraNames, add);
    scanBody(entry?.response?.content, 'response', entryIndex, extraNames, add);
    notePersonalData(readBody(entry?.request?.postData).text, entryIndex, 'request.body', add);
    notePersonalData(readBody(entry?.response?.content).text, entryIndex, 'response.body', add);
    if (typeof entry?.serverIPAddress === 'string' && entry.serverIPAddress) add({ category: 'addresses', entryIndex, field: 'entry.serverIPAddress' });
  });
  return { requestCount: entries.length, findings };
}

async function sha256(value: string): Promise<string> { const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)); return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join(''); }
async function replacement(value: unknown, policy: HarSanitizePolicy): Promise<string> { if (policy.mode === 'redact') return REDACTED; if (policy.mode === 'mask') return policy.mask?.trim() || REDACTED; return sha256(String(value ?? '')); }
async function replacePattern(value: string, pattern: RegExp, policy: HarSanitizePolicy): Promise<string> {
  const matches = value.match(pattern);
  if (!matches) return value;
  let output = value;
  for (const match of new Set(matches)) output = output.split(match).join(await replacement(match, policy));
  return output;
}
async function scrubPersonalString(value: string, policy: HarSanitizePolicy): Promise<string> {
  let output = value;
  if (policy.categories.emails) output = await replacePattern(output, EMAIL_PATTERN, policy);
  if (policy.categories.addresses) {
    output = await replacePattern(output, IPV4_PATTERN, policy);
    output = await replacePattern(output, IPV6_PATTERN, policy);
  }
  return output;
}
async function sanitizeStructured(value: unknown, policy: HarSanitizePolicy): Promise<unknown> {
  if (isRawJsonNumber(value)) return rawJsonNumber(value[RAW_JSON_NUMBER]);
  if (typeof value === 'string') return scrubPersonalString(value, policy);
  if (Array.isArray(value)) return Promise.all(value.map((item) => sanitizeStructured(item, policy)));
  if (!value || typeof value !== 'object') return value;
  const output = Object.create(null) as Record<string, unknown>;
  const extras = policy.extraNames ?? [];
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) output[key] = policy.categories.bodies && isSensitiveName(key, extras) ? await replacement(child, policy) : await sanitizeStructured(child, policy);
  return output;
}
async function sanitizeHeaders(headers: HarNameValue[] | undefined, policy: HarSanitizePolicy) {
  const extras = policy.extraNames ?? [];
  for (const header of headers ?? []) {
    const name = String(header?.name ?? '');
    const hideName = policy.categories.headers && isSensitiveName(name, extras);
    const hideForward = policy.categories.addresses && FORWARD_HEADERS.includes(normalizeName(name));
    if (hideName || hideForward) header.value = await replacement(header.value, policy);
    else if (typeof header.value === 'string') header.value = await scrubPersonalString(header.value, policy);
  }
}
async function sanitizeCookies(cookies: HarNameValue[] | undefined, policy: HarSanitizePolicy) {
  for (const cookie of cookies ?? []) cookie.value = await replacement(cookie.value, policy);
}

async function sanitizeRelativeUrlQuery(value: string, policy: HarSanitizePolicy): Promise<string> {
  const question = value.indexOf('?');
  if (question < 0) return value;
  const hashIndex = value.indexOf('#', question);
  const prefix = value.slice(0, question);
  const suffix = hashIndex >= 0 ? value.slice(hashIndex) : '';
  const queryText = value.slice(question + 1, hashIndex >= 0 ? hashIndex : undefined);
  const params = new URLSearchParams(queryText);
  const rebuilt = new URLSearchParams();
  for (const [name, item] of params) rebuilt.append(name, policy.categories.query && isSensitiveName(name, policy.extraNames ?? []) ? await replacement(item, policy) : await scrubPersonalString(item, policy));
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
    if (policy.categories.addresses && containsIp(url.hostname)) url.hostname = 'redacted.invalid';
    for (const [name, item] of pairs) url.searchParams.append(name, policy.categories.query && isSensitiveName(name, policy.extraNames ?? []) ? await replacement(item, policy) : await scrubPersonalString(item, policy));
    const rebuilt = url.toString();
    return policy.categories.emails || policy.categories.addresses ? scrubPersonalString(rebuilt, policy) : rebuilt;
  } catch {
    return sanitizeRelativeUrlQuery(value, policy);
  }
}

async function sanitizeQuery(entry: any, policy: HarSanitizePolicy) {
  const request = entry?.request;
  if (request) {
    for (const query of request.queryString ?? []) {
      if (policy.categories.query && isSensitiveName(String(query?.name ?? ''), policy.extraNames ?? [])) query.value = await replacement(query.value, policy);
      else if (typeof query.value === 'string') query.value = await scrubPersonalString(query.value, policy);
    }
    request.url = await sanitizeUrl(request.url, policy);
  }
  if (entry?.response && typeof entry.response.redirectURL === 'string') entry.response.redirectURL = await sanitizeUrl(entry.response.redirectURL, policy);
}

async function sanitizeBodyContainer(body: any, policy: HarSanitizePolicy) {
  if (!body) return;
  for (const parameter of body.params ?? []) {
    if (policy.categories.bodies && isSensitiveName(String(parameter?.name ?? ''), policy.extraNames ?? [])) parameter.value = await replacement(parameter.value, policy);
    else if (typeof parameter.value === 'string') parameter.value = await scrubPersonalString(parameter.value, policy);
  }
  const { text, wasBase64 } = readBody(body); if (text === undefined) return;
  let sanitized: string | undefined;
  const parsed = parseJsonBody(text);
  if (parsed !== undefined) sanitized = stringifyHarJson(await sanitizeStructured(parsed, policy));
  else if (String(body?.mimeType ?? '').toLowerCase().includes('application/x-www-form-urlencoded')) {
    const params = new URLSearchParams(text); const rebuilt = new URLSearchParams();
    for (const [name, value] of params) rebuilt.append(name, isSensitiveName(name, policy.extraNames ?? []) ? await replacement(value, policy) : await scrubPersonalString(value, policy));
    sanitized = rebuilt.toString();
  }
  if (sanitized === undefined && typeof text === 'string' && (policy.categories.emails || policy.categories.addresses)) sanitized = await scrubPersonalString(text, policy);
  if (sanitized !== undefined) body.text = wasBase64 ? encodeBase64Body(sanitized) : sanitized;
}

export async function sanitizeHar<T extends HarLike>(har: T, policy: HarSanitizePolicy) {
  const output = cloneValue(har);
  const extras = policy.extraNames ?? [];
  const originalFindings = analyzeHar(har, extras).findings;
  for (const entry of output.log?.entries ?? []) {
    if (policy.categories.headers || policy.categories.emails || policy.categories.addresses) { await sanitizeHeaders(entry?.request?.headers, policy); await sanitizeHeaders(entry?.response?.headers, policy); }
    if (policy.categories.cookies) { await sanitizeCookies(entry?.request?.cookies, policy); await sanitizeCookies(entry?.response?.cookies, policy); }
    if (policy.categories.query || policy.categories.emails || policy.categories.addresses) await sanitizeQuery(entry, policy);
    if (policy.categories.bodies || policy.categories.emails || policy.categories.addresses) { await sanitizeBodyContainer(entry?.request?.postData, policy); await sanitizeBodyContainer(entry?.response?.content, policy); }
    if (policy.categories.addresses && typeof entry?.serverIPAddress === 'string' && entry.serverIPAddress) entry.serverIPAddress = await replacement(entry.serverIPAddress, policy);
  }
  const outputFindings = analyzeHar(output, extras).findings;
  const changedFindings = originalFindings.filter((finding) => policy.categories[finding.category]);
  // Unmentioned categories are not "left on purpose". Only an explicit false counts as remaining risk.
  const remainingFindings = originalFindings.filter((finding) => policy.categories[finding.category] === false);
  return { har: output, findings: originalFindings, originalFindings, outputFindings, changedFindings, remainingFindings };
}

const phaseValue = (value: unknown) => {
  const numeric = typeof value === 'number' ? value : isRawJsonNumber(value) ? Number(value[RAW_JSON_NUMBER]) : 0;
  return Number.isFinite(numeric) && numeric > 0 ? numeric : 0;
};
export function buildWaterfallRows(har: HarLike, extraNames: readonly string[] = []): HarWaterfallRow[] {
  const entries = har.log?.entries ?? [];
  const times = entries.map((entry) => Date.parse(String(entry.startedDateTime))).filter(Number.isFinite);
  const base = times.length ? Math.min(...times) : 0;
  return entries.map((entry, index) => {
    const ssl = phaseValue(entry?.timings?.ssl);
    const connectTotal = phaseValue(entry?.timings?.connect);
    const url = String(entry?.request?.url ?? '');
    const size = entry?.response?.content && typeof (entry.response.content as { size?: unknown }).size === 'number' ? (entry.response.content as { size: number }).size : 0;
    return {
      index,
      method: String(entry?.request?.method ?? ''),
      url,
      displayUrl: displayUrl(url, extraNames),
      status: Number(entry?.response?.status ?? 0) || 0,
      mime: String(entry?.response?.content?.mimeType ?? ''),
      bytes: Number.isFinite(size) ? size : 0,
      startOffsetMs: Math.max(0, Date.parse(String(entry.startedDateTime)) - base),
      totalMs: phaseValue(entry?.time),
      phases: { blocked: phaseValue(entry?.timings?.blocked), dns: phaseValue(entry?.timings?.dns), connect: Math.max(0, connectTotal - ssl), ssl, send: phaseValue(entry?.timings?.send), wait: phaseValue(entry?.timings?.wait), receive: phaseValue(entry?.timings?.receive) },
    };
  });
}

import { escapeJsonPointer } from './patch-engine';
import type { JsonValue } from './format-engine';

export type PrivacyKind = 'email' | 'jwt' | 'bearer' | 'uuid' | 'ipv4' | 'ipv6' | 'card' | 'secret-key';
export interface PrivacyFinding { readonly path: string; readonly kind: PrivacyKind; }
export interface PrivacyOptions { readonly mode: 'mask' | 'mock'; }

const simpleHash = (value: string): number => {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) { hash ^= value.charCodeAt(index); hash = Math.imul(hash, 16777619); }
  return hash >>> 0;
};
const token = (value: string): string => simpleHash(value).toString(36);

const luhnValid = (candidate: string): boolean => {
  const digits = candidate.replace(/\D/g, '');
  if (digits.length < 13 || digits.length > 19) return false;
  let sum = 0; let double = false;
  for (let index = digits.length - 1; index >= 0; index -= 1) {
    let digit = Number(digits[index]);
    if (double) { digit *= 2; if (digit > 9) digit -= 9; }
    sum += digit; double = !double;
  }
  return sum % 10 === 0;
};

const isIpv6Candidate = (value: string): boolean => {
  if (!value.includes(':') || !/^[0-9a-f:]+$/i.test(value)) return false;
  const pieces = value.split(':');
  if (pieces.some((piece) => piece.length > 4)) return false;
  const emptyCount = pieces.filter((piece) => piece === '').length;
  const nonEmpty = pieces.filter(Boolean);
  if (nonEmpty.length < 2 || nonEmpty.length > 8) return false;
  if (value.includes('::')) return value.indexOf('::') === value.lastIndexOf('::') && emptyCount >= 1 && nonEmpty.length < 8;
  return pieces.length === 8 && emptyCount === 0;
};

const secretKey = (key: string): boolean => /(?:password|passwd|secret|api[_-]?key|token)$/i.test(key);
const maskFor = (kind: PrivacyKind): string => `[REDACTED_${kind === 'secret-key' ? 'SECRET' : kind.toUpperCase().replaceAll('-', '_')}]`;
const mockFor = (kind: PrivacyKind, original: string): string => {
  const id = token(original);
  if (kind === 'email') return `user_${id}@example.test`;
  if (kind === 'bearer') return `Bearer local_${id}`;
  if (kind === 'jwt') return `eyJsb2NhbCI6dHJ1ZX0.${id}.signature`;
  if (kind === 'uuid') return `00000000-0000-4000-8000-${id.padStart(12, '0').slice(0, 12)}`;
  if (kind === 'ipv4') return `198.51.100.${(simpleHash(original) % 250) + 1}`;
  if (kind === 'ipv6') return `2001:db8::${(simpleHash(original) % 65535).toString(16)}`;
  if (kind === 'card') return '4242 4242 4242 4242';
  return `[MOCK_SECRET_${id}]`;
};

const replaceMatches = (value: string, regex: RegExp, kind: PrivacyKind, mode: PrivacyOptions['mode'], path: string, findings: PrivacyFinding[], predicate?: (match: string) => boolean): string =>
  value.replace(regex, (match) => {
    if (predicate && !predicate(match)) return match;
    findings.push({ path, kind });
    return mode === 'mask' ? maskFor(kind) : mockFor(kind, match);
  });

const protectString = (value: string, path: string, mode: PrivacyOptions['mode'], findings: PrivacyFinding[]): string => {
  let next = value;
  next = replaceMatches(next, /\bBearer\s+[A-Za-z0-9._~+\/=-]+/gi, 'bearer', mode, path, findings);
  next = replaceMatches(next, /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, 'jwt', mode, path, findings);
  next = replaceMatches(next, /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, 'email', mode, path, findings);
  next = replaceMatches(next, /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi, 'uuid', mode, path, findings);
  next = replaceMatches(next, /\b(?:\d{1,3}\.){3}\d{1,3}\b/g, 'ipv4', mode, path, findings, (match) => match.split('.').every((part) => Number(part) <= 255));
  next = replaceMatches(next, /(?<![0-9a-f:])[0-9a-f:]*:[0-9a-f:]+(?![0-9a-f:])/gi, 'ipv6', mode, path, findings, isIpv6Candidate);
  next = replaceMatches(next, /\b(?:\d[ -]*?){13,19}\b/g, 'card', mode, path, findings, luhnValid);
  return next;
};

export const protectData = (source: JsonValue | unknown, options: PrivacyOptions): { value: JsonValue; findings: PrivacyFinding[] } => {
  const findings: PrivacyFinding[] = [];
  const walk = (value: unknown, path: string, key?: string): JsonValue => {
    if (key && secretKey(key) && (value === null || ['string', 'number', 'boolean'].includes(typeof value))) {
      findings.push({ path, kind: 'secret-key' });
      const original = String(value ?? 'null');
      return options.mode === 'mask' ? maskFor('secret-key') : mockFor('secret-key', original);
    }
    if (typeof value === 'string') return protectString(value, path, options.mode, findings);
    if (value === null || typeof value === 'number' || typeof value === 'boolean') return value;
    if (Array.isArray(value)) return value.map((item, index) => walk(item, `${path}/${index}`, String(index)));
    if (typeof value === 'object' && value !== null) return Object.fromEntries(Object.entries(value).map(([childKey, item]) => [childKey, walk(item, `${path}/${escapeJsonPointer(childKey)}`, childKey)]));
    return String(value);
  };
  return { value: walk(source, ''), findings };
};

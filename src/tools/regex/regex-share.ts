import LZString from 'lz-string';
import type { RegexFlavor, RegexMode, RegexShareState } from './regex-types';

const modes = new Set<RegexMode>(['studio', 'academy']);
const flavors = new Set<RegexFlavor>(['ecmascript', 'pcre2', 'python', 'go-re2', 'rust', 'oniguruma']);
const isState = (value: unknown): value is RegexShareState => {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<RegexShareState>;
  return modes.has(candidate.mode as RegexMode) && flavors.has(candidate.flavor as RegexFlavor) && typeof candidate.pattern === 'string' && typeof candidate.flags === 'string' && typeof candidate.subject === 'string';
};
export const encodeRegexMatrixState = (state: RegexShareState): string => LZString.compressToEncodedURIComponent(JSON.stringify(state));
export const decodeRegexMatrixState = (encoded: string): RegexShareState | null => {
  try { const text = LZString.decompressFromEncodedURIComponent(encoded); if (!text) return null; const value: unknown = JSON.parse(text); return isState(value) ? value : null; }
  catch { return null; }
};

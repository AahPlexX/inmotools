import type { RegexMatchRecord, RegexRunResult } from './regex-types';
export { executePcre2Regex } from './pcre-engine';

export const DEFAULT_REGEX_MATCH_LIMIT = 5_000;
export const MAX_REGEX_COUNT_SCAN = 100_000;

export interface EcmaRegexExecutionOptions {
  readonly matchLimit?: number;
  readonly startIndex?: number;
  readonly countLimit?: number;
}

const now = () => typeof performance !== 'undefined' ? performance.now() : Date.now();
const normalizeNamedGroups = (groups: Record<string, string | undefined> | undefined): Record<string, string> => Object.fromEntries(
  Object.entries(groups ?? {}).filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
);

/**
 * ECMAScript AdvanceStringIndex, expressed directly so zero-length manual
 * advancement follows the same UTF-16/code-point rules as built-in global
 * matching. In Unicode-aware mode (`u` or `v`) an astral code point consumes
 * two UTF-16 code units; otherwise advancement is exactly one code unit.
 */
export const advanceStringIndex = (subject: string, index: number, unicodeAware: boolean): number => {
  if (!unicodeAware) return index + 1;
  if (index + 1 >= subject.length) return index + 1;
  const codePoint = subject.codePointAt(index);
  return index + (codePoint !== undefined && codePoint > 0xffff ? 2 : 1);
};

const clampInteger = (value: number | undefined, fallback: number, minimum: number, maximum: number) => {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(maximum, Math.max(minimum, Math.floor(value as number)));
};

export const executeEcmaRegex = (
  pattern: string,
  flags: string,
  subject: string,
  options: EcmaRegexExecutionOptions = {},
): RegexRunResult => {
  const started = now();
  const matchLimit = clampInteger(options.matchLimit, DEFAULT_REGEX_MATCH_LIMIT, 1, MAX_REGEX_COUNT_SCAN);
  const countLimit = clampInteger(options.countLimit, MAX_REGEX_COUNT_SCAN, matchLimit, MAX_REGEX_COUNT_SCAN);
  const startIndex = clampInteger(options.startIndex, 0, 0, subject.length + 1);

  try {
    const expression = new RegExp(pattern, flags);
    const matches: RegexMatchRecord[] = [];
    const collect = (match: RegExpExecArray) => matches.push({
      match: match[0],
      index: match.index,
      end: match.index + match[0].length,
      groups: match.slice(1).map((value) => value ?? ''),
      namedGroups: normalizeNamedGroups(match.groups),
    });

    let totalMatches = 0;
    let totalMatchesExact = true;
    let nextStartIndex: number | null = null;

    if (expression.global || expression.sticky) {
      expression.lastIndex = startIndex;
      const unicodeAware = flags.includes('u') || flags.includes('v');
      while (true) {
        const match = expression.exec(subject);
        if (match === null) break;

        totalMatches += 1;
        if (matches.length < matchLimit) collect(match);

        let resumeIndex = expression.lastIndex;
        if (match[0] === '' && resumeIndex === match.index) {
          resumeIndex = advanceStringIndex(subject, resumeIndex, unicodeAware);
          expression.lastIndex = resumeIndex;
        }
        if (matches.length === matchLimit && nextStartIndex === null) nextStartIndex = resumeIndex;

        if (totalMatches >= countLimit) {
          const probe = expression.exec(subject);
          if (probe !== null) totalMatchesExact = false;
          break;
        }
      }
    } else {
      const match = expression.exec(subject);
      if (match) {
        collect(match);
        totalMatches = 1;
      }
    }

    const truncated = !totalMatchesExact || totalMatches > matches.length;
    return {
      engine: 'ECMAScript · browser RegExp',
      capability: 'execution',
      matches,
      durationMs: now() - started,
      error: null,
      truncated,
      omittedCount: totalMatchesExact ? Math.max(0, totalMatches - matches.length) : null,
      totalMatches: totalMatchesExact ? totalMatches : null,
      totalMatchesExact,
      nextStartIndex: truncated ? nextStartIndex : null,
      startIndex,
      matchLimit,
    };
  } catch (error) {
    return {
      engine: 'ECMAScript · browser RegExp',
      capability: 'execution',
      matches: [],
      durationMs: now() - started,
      error: error instanceof Error ? error.message : String(error),
      truncated: false,
      omittedCount: 0,
      totalMatches: 0,
      totalMatchesExact: true,
      nextStartIndex: null,
      startIndex,
      matchLimit,
    };
  }
};

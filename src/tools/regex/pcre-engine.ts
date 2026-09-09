import type { RegexMatchRecord, RegexRunResult } from './regex-types';

const now = () => typeof performance !== 'undefined' ? performance.now() : Date.now();
const DISPLAY_MATCH_LIMIT = 5_000;
let runtimePromise: Promise<{ runtime: Awaited<ReturnType<(typeof import('pcre2-wasm'))['createPCRE2']>>; parseFlags: (flags: string) => number }> | undefined;

const getRuntime = () => {
  runtimePromise ??= import('pcre2-wasm').then(async (module) => ({ runtime: await module.createPCRE2(), parseFlags: module.parseFlags }));
  return runtimePromise;
};

export interface Pcre2SubstitutionResult {
  readonly engine: string;
  readonly output: string | null;
  readonly error: string | null;
}

export const executePcre2Substitution = async (
  pattern: string,
  flags: string,
  subject: string,
  replacement: string,
): Promise<Pcre2SubstitutionResult> => {
  const engine = 'PCRE2 10.47.5 · WebAssembly';
  try {
    const { runtime, parseFlags } = await getRuntime();
    const isGlobal = flags.includes('g');
    const numericFlags = parseFlags(flags.replace('g', ''));
    const output = isGlobal
      ? runtime.replaceAll(pattern, subject, replacement, numericFlags)
      : runtime.replace(pattern, subject, replacement, numericFlags);
    return { engine, output, error: null };
  } catch (error) {
    return { engine, output: null, error: error instanceof Error ? error.message : String(error) };
  }
};

export const executePcre2Regex = async (pattern: string, flags: string, subject: string): Promise<RegexRunResult> => {
  const started = now();
  const runtimeStarted = now();
  try {
    const { runtime, parseFlags } = await getRuntime();
    const startupMs = now() - runtimeStarted;
    const executionStarted = now();
    const isGlobal = flags.includes('g');
    const numericFlags = parseFlags(flags.replace('g', ''));
    const allRows = runtime.matchAll(pattern, subject, numericFlags, { matchLimit: 100_000, depthLimit: 1_000 });
    const selectedRows = isGlobal ? allRows.slice(0, DISPLAY_MATCH_LIMIT) : allRows.slice(0, 1);
    const matches: RegexMatchRecord[] = selectedRows.map((row) => ({
      match: row.match,
      index: row.index,
      end: row.index + row.match.length,
      groups: row.groups.map((value) => value ?? ''),
      namedGroups: Object.fromEntries(Object.entries(row.namedGroups ?? {}).filter((entry): entry is [string, string] => typeof entry[1] === 'string')),
    }));
    const executionMs = now() - executionStarted;
    const totalMatches = isGlobal ? allRows.length : Math.min(allRows.length, 1);
    const truncated = isGlobal && allRows.length > DISPLAY_MATCH_LIMIT;
    return {
      engine: 'PCRE2 10.47.5 · WebAssembly',
      capability: 'execution',
      matches,
      durationMs: now() - started,
      startupMs,
      executionMs,
      offsetUnit: 'utf16-code-unit',
      error: null,
      truncated,
      omittedCount: truncated ? allRows.length - DISPLAY_MATCH_LIMIT : 0,
      totalMatches,
      totalMatchesExact: true,
      startIndex: 0,
      matchLimit: DISPLAY_MATCH_LIMIT,
      nextStartIndex: null,
    };
  } catch (error) {
    const durationMs = now() - started;
    return {
      engine: 'PCRE2 10.47.5 · WebAssembly',
      capability: 'execution',
      matches: [],
      durationMs,
      startupMs: durationMs,
      executionMs: 0,
      offsetUnit: 'utf16-code-unit',
      error: error instanceof Error ? error.message : String(error),
      truncated: false,
      omittedCount: 0,
      totalMatches: 0,
      totalMatchesExact: true,
      startIndex: 0,
      matchLimit: DISPLAY_MATCH_LIMIT,
      nextStartIndex: null,
    };
  }
};

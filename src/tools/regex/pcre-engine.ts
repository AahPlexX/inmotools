import type { RegexMatchRecord, RegexRunResult } from './regex-types';

const now = () => typeof performance !== 'undefined' ? performance.now() : Date.now();
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
  try {
    const { runtime, parseFlags } = await getRuntime();
    const rows = runtime.matchAll(pattern, subject, parseFlags(flags), { matchLimit: 100_000, depthLimit: 1_000 });
    const matches: RegexMatchRecord[] = rows.map((row) => ({
      match: row.match,
      index: row.index,
      end: row.index + row.match.length,
      groups: row.groups.map((value) => value ?? ''),
      namedGroups: Object.fromEntries(Object.entries(row.namedGroups ?? {}).filter((entry): entry is [string, string] => typeof entry[1] === 'string')),
    }));
    return { engine: 'PCRE2 10.47.5 · WebAssembly', capability: 'execution', matches, durationMs: now() - started, error: null };
  } catch (error) {
    return { engine: 'PCRE2 10.47.5 · WebAssembly', capability: 'execution', matches: [], durationMs: now() - started, error: error instanceof Error ? error.message : String(error) };
  }
};

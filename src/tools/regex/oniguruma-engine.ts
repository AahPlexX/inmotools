import onigWasmUrl from 'vscode-oniguruma/release/onig.wasm?url';
import type { RegexMatchRecord, RegexRunResult } from './regex-types';

const now = () => typeof performance !== 'undefined' ? performance.now() : Date.now();
let runtimePromise: Promise<typeof import('vscode-oniguruma')> | undefined;

const getRuntime = () => {
  runtimePromise ??= import('vscode-oniguruma').then(async (module) => {
    const response = await fetch(onigWasmUrl);
    if (!response.ok) throw new Error(`Unable to load bundled Oniguruma WASM (${response.status}).`);
    await module.loadWASM(response);
    return module;
  });
  return runtimePromise;
};

const preparePattern = (pattern: string, flags: string) => {
  const unsupported = [...new Set([...flags].filter((flag) => !['g', 'i', 'u'].includes(flag)))];
  if (unsupported.length) throw new Error(`Oniguruma execution currently maps g, i, and u flags. Unsupported flag${unsupported.length === 1 ? '' : 's'}: ${unsupported.join(', ')}.`);
  return flags.includes('i') ? `(?i:${pattern})` : pattern;
};

export const executeOnigurumaRegex = async (pattern: string, flags: string, subject: string): Promise<RegexRunResult> => {
  const started = now();
  let scanner: import('vscode-oniguruma').OnigScanner | undefined;
  let onigString: import('vscode-oniguruma').OnigString | undefined;
  try {
    const runtime = await getRuntime();
    scanner = runtime.createOnigScanner([preparePattern(pattern, flags)]);
    onigString = runtime.createOnigString(subject);
    const matches: RegexMatchRecord[] = [];
    let cursor = 0;
    const global = flags.includes('g');
    while (cursor <= subject.length && matches.length < 5000) {
      const found = scanner.findNextMatchSync(onigString, cursor);
      if (!found) break;
      const whole = found.captureIndices[0];
      if (!whole || whole.start < 0 || whole.end < whole.start) break;
      matches.push({
        match: subject.slice(whole.start, whole.end),
        index: whole.start,
        end: whole.end,
        groups: found.captureIndices.slice(1).map((capture) => capture.start >= 0 && capture.end >= capture.start ? subject.slice(capture.start, capture.end) : ''),
        namedGroups: {},
      });
      if (!global) break;
      const nextCursor = whole.end > whole.start ? whole.end : whole.end + 1;
      if (nextCursor <= cursor) break;
      cursor = nextCursor;
    }
    return { engine: 'Oniguruma · WebAssembly (vscode-oniguruma 2.0.1)', capability: 'execution', matches, durationMs: now() - started, error: null };
  } catch (error) {
    return { engine: 'Oniguruma · WebAssembly (vscode-oniguruma 2.0.1)', capability: 'execution', matches: [], durationMs: now() - started, error: error instanceof Error ? error.message : String(error) };
  } finally {
    onigString?.dispose();
    scanner?.dispose();
  }
};

import { loadPyodide, version as pyodideVersion, type PyodideAPI } from 'pyodide';
import type { RegexMatchRecord, RegexRunResult } from './regex-types';

type InitRequest = { readonly type: 'init' };
type RunRequest = { readonly type: 'run'; readonly requestId: number; readonly pattern: string; readonly flags: string; readonly subject: string };
type Request = InitRequest | RunRequest;
const scope = self as unknown as DedicatedWorkerGlobalScope;
const now = () => performance.now();
const indexURL = new URL(`${import.meta.env.BASE_URL}pyodide/`, scope.location.origin).href;
let runtimePromise: Promise<PyodideAPI> | undefined;
const getRuntime = () => { runtimePromise ??= loadPyodide({ indexURL }); return runtimePromise; };

const PYTHON_RUNNER = `
import json, platform, re
_flag_map = {'i': re.IGNORECASE, 'm': re.MULTILINE, 's': re.DOTALL, 'x': re.VERBOSE, 'a': re.ASCII, 'u': re.UNICODE}
_unsupported = sorted(set(__regex_flags) - set('gimsxau'))
if _unsupported:
    raise ValueError('Unsupported Python flag' + ('s' if len(_unsupported) != 1 else '') + ': ' + ', '.join(_unsupported))
_compiled = re.compile(__regex_pattern, sum((_flag_map[ch] for ch in __regex_flags if ch in _flag_map), re.NOFLAG))
_display_limit = 5000
_count_limit = 100000
_rows = []
_total = 0
_exact = True
_iterator = iter(_compiled.finditer(__regex_subject))
while True:
    _match = next(_iterator, None)
    if _match is None:
        break
    _total += 1
    if len(_rows) < _display_limit:
        _rows.append({
            'match': _match.group(0),
            'index': _match.start(),
            'end': _match.end(),
            'groups': [value if value is not None else '' for value in _match.groups()],
            'namedGroups': {key: value for key, value in _match.groupdict().items() if value is not None},
        })
    if 'g' not in __regex_flags:
        break
    if _total >= _count_limit:
        if next(_iterator, None) is not None:
            _exact = False
        break
json.dumps({
    'pythonVersion': platform.python_version(),
    'matches': _rows,
    'totalMatches': _total if _exact else None,
    'totalMatchesExact': _exact,
    'omittedCount': max(0, _total - len(_rows)) if _exact else None,
    'truncated': (not _exact) or _total > len(_rows),
})
`;

interface PythonExecutionPayload {
  readonly pythonVersion: string;
  readonly matches: RegexMatchRecord[];
  readonly totalMatches: number | null;
  readonly totalMatchesExact: boolean;
  readonly omittedCount: number | null;
  readonly truncated: boolean;
}

const buildCodePointToUtf16Map = (subject: string): number[] => {
  const map = [0];
  let utf16Index = 0;
  for (const codePoint of subject) {
    utf16Index += codePoint.length;
    map.push(utf16Index);
  }
  return map;
};

const execute = async (request: RunRequest): Promise<RegexRunResult> => {
  const started = now();
  try {
    const runtime = await getRuntime();
    const executionStarted = now();
    runtime.globals.set('__regex_pattern', request.pattern);
    runtime.globals.set('__regex_flags', request.flags);
    runtime.globals.set('__regex_subject', request.subject);
    const raw = runtime.runPython(PYTHON_RUNNER);
    const parsed = JSON.parse(String(raw)) as PythonExecutionPayload;
    const codePointToUtf16 = buildCodePointToUtf16Map(request.subject);
    const matches = parsed.matches.map((match) => ({
      ...match,
      index: codePointToUtf16[match.index] ?? request.subject.length,
      end: codePointToUtf16[match.end] ?? request.subject.length,
    }));
    const executionMs = now() - executionStarted;
    return {
      engine: `Python ${parsed.pythonVersion} · Pyodide ${pyodideVersion} · WebAssembly`,
      capability: 'execution',
      matches,
      durationMs: now() - started,
      startupMs: 0,
      executionMs,
      offsetUnit: 'utf16-code-unit',
      error: null,
      truncated: parsed.truncated,
      omittedCount: parsed.omittedCount,
      totalMatches: parsed.totalMatches,
      totalMatchesExact: parsed.totalMatchesExact,
      nextStartIndex: null,
      startIndex: 0,
      matchLimit: 5_000,
    };
  } catch (error) {
    const durationMs = now() - started;
    return {
      engine: `Python · Pyodide ${pyodideVersion} · WebAssembly`,
      capability: 'execution',
      matches: [],
      durationMs,
      startupMs: 0,
      executionMs: durationMs,
      offsetUnit: 'utf16-code-unit',
      error: error instanceof Error ? error.message : String(error),
      truncated: false,
      omittedCount: 0,
      totalMatches: 0,
      totalMatchesExact: true,
      nextStartIndex: null,
      startIndex: 0,
      matchLimit: 5_000,
    };
  } finally {
    const runtime = await runtimePromise?.catch(() => undefined);
    runtime?.globals.delete('__regex_pattern');
    runtime?.globals.delete('__regex_flags');
    runtime?.globals.delete('__regex_subject');
  }
};

scope.onmessage = (event: MessageEvent<Request>) => {
  const request = event.data;
  if (request.type === 'init') {
    void getRuntime().then(() => scope.postMessage({ type: 'ready' })).catch((error) => scope.postMessage({ type: 'init-error', error: error instanceof Error ? error.message : String(error) }));
    return;
  }
  void execute(request).then((result) => scope.postMessage({ type: 'result', requestId: request.requestId, result }));
};

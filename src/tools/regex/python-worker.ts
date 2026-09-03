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
_rows = []
for _match in _compiled.finditer(__regex_subject):
    _rows.append({
        'match': _match.group(0),
        'index': _match.start(),
        'end': _match.end(),
        'groups': [value if value is not None else '' for value in _match.groups()],
        'namedGroups': {key: value for key, value in _match.groupdict().items() if value is not None},
    })
    if 'g' not in __regex_flags or len(_rows) >= 5000:
        break
json.dumps({'pythonVersion': platform.python_version(), 'matches': _rows})
`;

const execute = async (request: RunRequest): Promise<RegexRunResult> => {
  const started = now();
  try {
    const runtime = await getRuntime();
    runtime.globals.set('__regex_pattern', request.pattern);
    runtime.globals.set('__regex_flags', request.flags);
    runtime.globals.set('__regex_subject', request.subject);
    const raw = runtime.runPython(PYTHON_RUNNER);
    const parsed = JSON.parse(String(raw)) as { pythonVersion: string; matches: RegexMatchRecord[] };
    return { engine: `Python ${parsed.pythonVersion} · Pyodide ${pyodideVersion} · WebAssembly`, capability: 'execution', matches: parsed.matches, durationMs: now() - started, error: null };
  } catch (error) {
    return { engine: `Python · Pyodide ${pyodideVersion} · WebAssembly`, capability: 'execution', matches: [], durationMs: now() - started, error: error instanceof Error ? error.message : String(error) };
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

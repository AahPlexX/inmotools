import { executeEcmaRegex, type EcmaRegexExecutionOptions } from './regex-engine';
import { executePcre2Regex, preparePcre2Runtime } from './pcre-engine';
import { executeOnigurumaRegex, prepareOnigurumaRuntime } from './oniguruma-engine';
import type { RegexRunResult } from './regex-types';

type Request = {
  readonly requestId: number;
  readonly flavor: 'ecmascript' | 'pcre2' | 'oniguruma';
  readonly pattern: string;
  readonly flags: string;
  readonly subject: string;
  readonly ecmaOptions?: EcmaRegexExecutionOptions;
};
// `executing` is posted once the engine is loaded, immediately before the
// pattern runs, so the client can hold its execution watchdog until then.
type Response =
  | { readonly requestId: number; readonly phase: 'executing' }
  | { readonly requestId: number; readonly result: RegexRunResult };
const scope = self as unknown as DedicatedWorkerGlobalScope;

const prepare = (flavor: Request['flavor']): Promise<void> =>
  flavor === 'pcre2' ? preparePcre2Runtime() : flavor === 'oniguruma' ? prepareOnigurumaRuntime() : Promise.resolve();

scope.onmessage = (event: MessageEvent<Request>) => {
  const request = event.data;
  // A preparation failure is not reported here: the engine call below awaits
  // the same load and returns it as a descriptive error result.
  prepare(request.flavor).catch(() => undefined).then(() => {
    scope.postMessage({ requestId: request.requestId, phase: 'executing' } satisfies Response);
    return request.flavor === 'pcre2'
      ? executePcre2Regex(request.pattern, request.flags, request.subject)
      : request.flavor === 'oniguruma'
        ? executeOnigurumaRegex(request.pattern, request.flags, request.subject)
        : executeEcmaRegex(request.pattern, request.flags, request.subject, request.ecmaOptions);
  }).then((result) => scope.postMessage({ requestId: request.requestId, result } satisfies Response));
};

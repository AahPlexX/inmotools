import { executeEcmaRegex } from './regex-engine';
import { executePcre2Regex } from './pcre-engine';
import type { RegexRunResult } from './regex-types';

type Request = { readonly requestId: number; readonly flavor: 'ecmascript' | 'pcre2'; readonly pattern: string; readonly flags: string; readonly subject: string };
type Response = { readonly requestId: number; readonly result: RegexRunResult };
const scope = self as unknown as DedicatedWorkerGlobalScope;
scope.onmessage = (event: MessageEvent<Request>) => {
  const request = event.data;
  Promise.resolve(request.flavor === 'pcre2' ? executePcre2Regex(request.pattern, request.flags, request.subject) : executeEcmaRegex(request.pattern, request.flags, request.subject))
    .then((result) => scope.postMessage({ requestId: request.requestId, result } satisfies Response));
};

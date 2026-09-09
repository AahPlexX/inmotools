import { executeEcmaSubstitution } from './regex-substitution';

type Request = {
  readonly requestId: number;
  readonly pattern: string;
  readonly flags: string;
  readonly subject: string;
  readonly replacement: string;
};

type Response = {
  readonly requestId: number;
  readonly output: string | null;
  readonly error: string | null;
  readonly durationMs: number;
};

const scope = self as unknown as DedicatedWorkerGlobalScope;

scope.onmessage = (event: MessageEvent<Request>) => {
  const request = event.data;
  const started = performance.now();
  const result = executeEcmaSubstitution(request.pattern, request.flags, request.subject, request.replacement);
  scope.postMessage({
    requestId: request.requestId,
    output: result.output,
    error: result.error,
    durationMs: performance.now() - started,
  } satisfies Response);
};

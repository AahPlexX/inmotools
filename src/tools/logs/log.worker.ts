/// <reference lib="webworker" />
import { structureLogLines, type LogPatternFlags, type LogScanMode } from './log-engine';

// Structuring runs here rather than on the main thread for one specific
// reason: a user-supplied pattern can backtrack catastrophically. On the main
// thread that is unrecoverable - the tab stops responding, so there is no way
// left to edit the pattern that caused it. In a worker the same pattern only
// hangs the worker, which the caller can terminate.

type Request = { id: string; input: string; pattern: string; flags: LogPatternFlags; mode: LogScanMode };

self.onmessage = (event: MessageEvent<Request>) => {
  const { id, input, pattern, flags, mode } = event.data;
  try {
    self.postMessage({ id, result: structureLogLines(input, pattern, flags, mode) });
  } catch (error) {
    self.postMessage({
      id,
      error: error instanceof Error ? error.message : 'Invalid regular expression.',
    });
  }
};

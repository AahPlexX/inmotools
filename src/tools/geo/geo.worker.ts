/// <reference lib="webworker" />
import { simplifyTopology, type GeoSimplifyOptions } from './geo-engine';

// Simplification runs here because it is proportional to vertex count, and a
// multi-megabyte GeoJSON has enough vertices to stall the main thread long
// enough that the tab stops responding. Unlike the regex case this input is
// large rather than pathological, so no deadline is needed - but the caller
// still needs to be able to abandon a run, which terminating the worker
// provides.

type Request = { id: string; source: Record<string, unknown>; options: GeoSimplifyOptions };

self.onmessage = (event: MessageEvent<Request>) => {
  const { id, source, options } = event.data;
  try {
    self.postMessage({ id, result: simplifyTopology(source, options) });
  } catch (error) {
    self.postMessage({
      id,
      error: error instanceof Error ? error.message : 'Simplification failed.',
    });
  }
};

/// <reference lib="webworker" />
import { findDuplicateClusters, type DedupeConfig, type DedupeRow } from './dedupe-engine';

type Request = { id: string; rows: DedupeRow[]; config: DedupeConfig };

self.onmessage = (event: MessageEvent<Request>) => {
  const { id, rows, config } = event.data;
  try {
    self.postMessage({ id, clusters: findDuplicateClusters(rows, config) });
  } catch (error) {
    self.postMessage({ id, error: error instanceof Error ? error.message : 'Deduplication failed.' });
  }
};

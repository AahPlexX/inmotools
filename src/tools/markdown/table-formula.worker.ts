/// <reference lib="webworker" />
import { substituteFormulaValues } from './table-formula-engine';

type Request = { readonly id: number; readonly source: string };

self.onmessage = (event: MessageEvent<Request>) => {
  const { id, source } = event.data;
  try {
    self.postMessage({ id, result: substituteFormulaValues(source) });
  } catch (error) {
    self.postMessage({
      id,
      error: error instanceof Error ? error.message : 'Table formula preparation failed.',
    });
  }
};

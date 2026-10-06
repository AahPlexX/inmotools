import { formatMarkdownSource } from './format-engine';

self.onmessage = async (event: MessageEvent<{ source: string; cursorOffset: number }>) => {
  try {
    self.postMessage({ result: await formatMarkdownSource(event.data.source, event.data.cursorOffset) });
  } catch {
    self.postMessage({ error: 'Formatting failed. Your source is unchanged.' });
  }
};

import { describe, expect, test } from 'vitest';
import {
  buildExportManifest,
  createDownloadSink,
  createFolderSink,
  createQueueItems,
  isPickerCancel,
  manifestToCsv,
  moveQueueItem,
  retryQueueItems,
  runPhotoQueue,
} from '../../src/tools/photo/photo-export-queue';

const blob = (text: string) => new Blob([text], { type: 'image/png' });

describe('export queue', () => {
  test('runs in order, isolates failures, and hands every result to the sink as it finishes', async () => {
    const saved: string[] = [];
    const sink = createDownloadSink((_blob, name) => saved.push(name));
    const items = createQueueItems([{ label: 'a', payload: 1 }, { label: 'b', payload: 2 }, { label: 'c', payload: 3 }]);
    const order: string[] = [];
    const { items: finished, summary } = await runPhotoQueue(items, async (item) => {
      order.push(item.label);
      if (item.label === 'b') throw new Error('decode failed');
      return { blob: blob(item.label), filename: 'same.png', width: 10, height: 5 };
    }, { sink, onChange: () => undefined, isCancelled: () => false });
    expect(order).toEqual(['a', 'b', 'c']);
    expect(summary).toEqual({ done: 2, failed: 1, cancelled: 0 });
    expect(saved).toEqual(['same.png', 'same (2).png']);
    expect(finished.map((item) => [item.status, item.outputName, item.error])).toEqual([
      ['done', 'same.png', undefined], ['failed', undefined, 'decode failed'], ['done', 'same (2).png', undefined],
    ]);
  });

  test('cancelled items are skipped, and a cancel during rendering discards the result', async () => {
    const saved: string[] = [];
    const cancelled = new Set<string>();
    const items = createQueueItems([{ label: 'a', payload: 0 }, { label: 'b', payload: 0 }, { label: 'c', payload: 0 }]);
    cancelled.add(items[2].id);
    const { summary } = await runPhotoQueue(items, async (item) => {
      if (item.label === 'a') cancelled.add(item.id); // User cancels while this one renders.
      return { blob: blob(item.label), filename: `${item.label}.png`, width: 1, height: 1 };
    }, { sink: createDownloadSink((_b, name) => saved.push(name)), onChange: () => undefined, isCancelled: (id) => cancelled.has(id) });
    expect(saved).toEqual(['b.png']);
    expect(summary).toEqual({ done: 1, failed: 0, cancelled: 2 });
  });

  test('items can be reordered and failed or cancelled ones retried', () => {
    const items = createQueueItems([{ label: 'a', payload: 0 }, { label: 'b', payload: 0 }]);
    expect(moveQueueItem(items, items[1].id, -1).map((item) => item.label)).toEqual(['b', 'a']);
    expect(moveQueueItem(items, items[0].id, -1)).toBe(items);
    const failed = items.map((item, index) => ({ ...item, status: index ? 'failed' as const : 'done' as const, error: 'x' }));
    expect(retryQueueItems(failed).map((item) => [item.status, item.error])).toEqual([['done', 'x'], ['queued', undefined]]);
  });
});

describe('folder output', () => {
  function fakeFolder(existing: string[]) {
    const files = new Map<string, string>(existing.map((name) => [name, 'old']));
    return {
      files,
      handle: {
        name: 'Exports',
        async getFileHandle(name: string, options?: { create?: boolean }) {
          if (!files.has(name) && !options?.create) throw new DOMException('missing', 'NotFoundError');
          return {
            async createWritable() {
              return { async write(data: Blob) { files.set(name, await data.text()); }, async close() {}, async abort() {} };
            },
          };
        },
      },
    };
  }

  test('never overwrites an existing file and writes the bytes it was given', async () => {
    const folder = fakeFolder(['photo.jpg', 'photo (2).jpg']);
    const sink = createFolderSink(folder.handle);
    expect(sink.label).toBe('the “Exports” folder');
    expect(await sink.write(blob('new'), 'photo.jpg')).toBe('photo (3).jpg');
    expect(folder.files.get('photo.jpg')).toBe('old');
    expect(folder.files.get('photo (3).jpg')).toBe('new');
  });

  test('picker dismissal is recognised as a cancel, not an error', () => {
    expect(isPickerCancel(new DOMException('User cancelled', 'AbortError'))).toBe(true);
    expect(isPickerCancel(new Error('boom'))).toBe(false);
  });
});

describe('export manifest', () => {
  const entries = [
    { source: 'a.jpg', output: 'a-web.jpg', status: 'done' as const, width: 1600, height: 1067, bytes: 2048, details: { format: 'JPEG', metadata: 'strip' } },
    { source: '=cmd|x.jpg', output: null, status: 'failed' as const, error: 'Decode, "bad" data' },
  ];

  test('summarises totals and settings as JSON', () => {
    const manifest = buildExportManifest(entries, { generatedAt: new Date('2026-09-24T12:00:00Z'), destination: 'downloads', settings: { outputMime: 'image/jpeg' } });
    expect(manifest).toMatchObject({ kind: 'inmotools-photo-export-manifest', version: 1, generatedAt: '2026-09-24T12:00:00.000Z', totals: { files: 2, exported: 1, failed: 1, cancelled: 0 } });
  });

  test('CSV escapes quotes/commas and neutralises spreadsheet formulas', () => {
    expect(manifestToCsv(entries)).toBe([
      'source,output,status,width,height,bytes,error,format,metadata',
      'a.jpg,a-web.jpg,done,1600,1067,2048,,JPEG,strip',
      `'=cmd|x.jpg,,failed,,,,"Decode, ""bad"" data",,`,
      '',
    ].join('\r\n'));
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import { PdfJsDocumentSession } from '../../src/tools/pdf/pdfjs-browser';

const native = vi.hoisted(() => ({ getDocument: vi.fn() }));
vi.mock('pdfjs-dist', () => ({ getDocument: native.getDocument, GlobalWorkerOptions: {}, TextLayer: class {} }));
vi.mock('pdfjs-dist/build/pdf.worker.min.mjs?url', () => ({ default: '/owned-pdf-worker.mjs' }));

function pending(rejectOnDestroy = true) {
  let resolve!: (document: { numPages: number }) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<{ numPages: number }>((yes, no) => { resolve = yes; reject = no; });
  const task = { promise, onPassword: undefined as undefined | ((update: (text: string) => void, reason: number) => void), destroy: vi.fn(async () => { if (rejectOnDestroy) reject(new Error('Loading aborted')); }) };
  native.getDocument.mockReturnValue(task);
  return { task, resolve, reject };
}
afterEach(() => vi.clearAllMocks());

describe('PDF-R02 cancellable password loading', () => {
  it('does not create a loading task after the caller already cancelled', async () => {
    const controller = new AbortController(); controller.abort();
    await expect(PdfJsDocumentSession.open(new Uint8Array([1]), { signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' });
    expect(native.getDocument).not.toHaveBeenCalled();
  });

  it('destroys pending password work and reports cancellation independently of native exception name', async () => {
    const { task } = pending(); const controller = new AbortController(); const password = vi.fn();
    const open = PdfJsDocumentSession.open(new Uint8Array([1]), { signal: controller.signal, onPassword: password });
    const update = vi.fn(); task.onPassword!(update, 1);
    expect(password).toHaveBeenCalledWith(update, 1);
    controller.abort();
    await expect(open).rejects.toMatchObject({ name: 'AbortError' });
    task.onPassword!(update, 2);
    expect(password).toHaveBeenCalledTimes(1);
    expect(task.destroy).toHaveBeenCalledTimes(1);
  });

  it('forwards retry callbacks with exact password text and retains source bytes', async () => {
    const { task, resolve } = pending(); const original = new Uint8Array([1, 2, 3]); const updates: number[] = [];
    const update = vi.fn();
    const open = PdfJsDocumentSession.open(original, { onPassword: (accept, reason) => { updates.push(reason); accept(reason === 1 ? 'wrong' : ' fixture user '); } });
    const data = native.getDocument.mock.calls[0][0].data as Uint8Array;
    expect(data).not.toBe(original); data[0] = 99;
    task.onPassword!(update, 1); task.onPassword!(update, 2); resolve({ numPages: 2 });
    const session = await open;
    expect(updates).toEqual([1, 2]); expect(update.mock.calls).toEqual([['wrong'], [' fixture user ']]);
    expect(original).toEqual(new Uint8Array([1, 2, 3])); expect(session.pageCount).toBe(2);
    await session.destroy(); expect(task.destroy).toHaveBeenCalledTimes(1);
  });

  it('releases loading resources on a native failure and preserves that error', async () => {
    const { task, reject } = pending(); const open = PdfJsDocumentSession.open(new Uint8Array([1]));
    const error = new Error('Invalid PDF structure.'); reject(error);
    await expect(open).rejects.toBe(error); expect(task.destroy).toHaveBeenCalledTimes(1);
  });

  it('does not publish a document that resolves after cancellation', async () => {
    const { task, resolve } = pending(false); const controller = new AbortController();
    const open = PdfJsDocumentSession.open(new Uint8Array([1]), { signal: controller.signal });
    controller.abort(); resolve({ numPages: 2 });
    await expect(open).rejects.toMatchObject({ name: 'AbortError' }); expect(task.destroy).toHaveBeenCalledTimes(1);
  });

  it('removes the pending-open abort listener when session ownership transfers to the caller', async () => {
    const { task, resolve } = pending(); const controller = new AbortController();
    const open = PdfJsDocumentSession.open(new Uint8Array([1]), { signal: controller.signal });
    resolve({ numPages: 2 }); const session = await open; controller.abort();
    expect(task.destroy).not.toHaveBeenCalled(); await session.destroy(); await session.destroy();
    expect(task.destroy).toHaveBeenCalledTimes(1);
  });
});

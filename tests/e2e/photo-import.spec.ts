import { expect, test, type Page } from '@playwright/test';
import { makePhotoTiff } from '../fixtures/photo-tiff';
import { makePhotoDng } from '../fixtures/photo-dng';
import { readFile } from 'node:fs/promises';

const FIXTURE_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAUAAAADwCAIAAAD+Tyo8AAACqElEQVR42u3VQQ0AMQwDwbVU/pj7OBQ9zTyWQeJVqzVVfa6nBTzqtO+CVfW9WmCwwKpqgQELrGqBAQusqhYYsMCqFhiwwKpqgcEC+2SqFhiwwKpqgcECq6oFBiywqlpgsMCqaoEBC6xqgQELrKoWGLDAqhYYsMCqaoEBC6xqgQELrKoWGCywqlpgwAKrqgUGC6yqFhiwwKoW2AKDBVZVCwxYYFULDFhgVbXAgAVWtcCABVZVCwwWWFUtMGCBVdUCgwVWVQsMWGBVtcBggVXVAgMWWNUCAxZYVS0wYIFVLTBggVXVAgMWWNUCAxZYVS0wWGBVtcCABVZVCwwWWFUtMGCBVS0wYIFV1QIDFljVAgMWWFUtMGCBVS0wYIFV1QKDBVZVCwxYYFW1wGCBVdUCAxZYVS0wWGBVtcCABVa1wIAFVlULDFhgVQsMWGBVtcCABVa1wIAFVlULDBZYVS0wYIFV1QKDBVZVCwxYYFULDFhgVbXAgAVWtcCABVZVCwxYYFULDFhgVbXAYIFV1QIDFlhVLTBYYFW1wIAFVlULDBZYVS0wYIFVLTBggVXVAgMWWNUCAxZYVS0wWGALrGqBAQusqhYYLLCqWmDAAquqBQYLrKoWGLDAqhYYsMCqaoEBC6xqgQELrKoWGLDAqhYYsMCqaoHBAquqBQYssKpaYLDAqmqBAQusqhYYLLCqWmDAAqtaYMACq6oFBiywqgUGLLCqWmCwwD6ZqgUGLLCqWmCwwKpqgQELrKoWGCywqlpgwAKrWmDAAquqBQYssKoFBiywqlpgwAKrWmDAAquqBQYLrKoWGLDAqmqBwQKrqgUGLLCqWmCwwKpqgQELrGqBAQusqhYYsMCqFhiwwKpqgcEC+2SqFhiwwKpqgcECq6oFBiywqlpg+I0LLVVQ6zZs79UAAAAASUVORK5CYII=',
  'base64',
);

async function openStudio(page: Page) {
  await page.goto('/inmotools/#/tools/photo-studio');
  await expect(page.getByTestId('suite-workspace').getByRole('heading', { name: 'Photo Studio', exact: true })).toBeVisible();
}

async function openNamedFixture(page: Page, name: string) {
  await page.setInputFiles('[data-testid="photo-file-input"]', {
    name,
    mimeType: 'image/png',
    buffer: FIXTURE_PNG,
  });
  await expect(page.getByTestId('photo-source-dimensions')).toContainText('320 × 240');
  await expect(page.getByTestId('photo-preview')).toBeVisible();
}

test('RAW DNG imports through the actual worker and retains its original source through recovery and export', async ({ page }) => {
  await openStudio(page);
  await page.setInputFiles('[data-testid="photo-file-input"]', {
    name: 'synthetic-sensor.dng', mimeType: 'application/octet-stream', buffer: Buffer.from(makePhotoDng()),
  });
  await expect(page.getByTestId('photo-source-dimensions')).toContainText('32 × 32');
  await expect(page.getByTestId('photo-preview')).toBeVisible();
  await expect(page.getByTestId('photo-codec-notice')).toContainText(/RAW source preserved.*16-bit.*8-bit/);
  await page.getByLabel('Exposure value').fill('1');
  await page.getByLabel('Exposure value').press('Enter');
  await expect(page.getByTestId('photo-project-save-state')).toContainText('Saved locally');
  const persisted = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('inmotools.photo-studio');
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
    const read = <T,>(store: string, action: (objectStore: IDBObjectStore) => IDBRequest<T>) => new Promise<T>((resolve, reject) => {
      const request = action(db.transaction(store, 'readonly').objectStore(store));
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
    try {
      const projects = await read('projects', (store) => store.getAll());
      const project = projects.find((entry) => entry.source.name === 'synthetic-sensor.dng');
      let source: Blob;
      if (project.source.storage === 'opfs') {
        const directory = await (await navigator.storage.getDirectory()).getDirectoryHandle('inmotools-photo-studio');
        source = await (await directory.getFileHandle(project.source.key)).getFile();
      } else source = await read('sources', (store) => store.get(project.source.key));
      return [...new Uint8Array(await source.arrayBuffer())];
    } finally { db.close(); }
  });
  expect(persisted).toEqual([...makePhotoDng()]);
  await page.reload();
  await page.getByTestId('photo-recovery-prompt').getByRole('button', { name: 'Recover project' }).click();
  await expect(page.getByTestId('photo-preview')).toBeVisible();
  await expect(page.getByLabel('Exposure value')).toHaveValue('1');
  await expect(page.getByTestId('photo-codec-notice')).toContainText('RAW source preserved');
  await page.getByRole('button', { name: 'Before/after', exact: true }).click();
  const original = page.getByTestId('photo-before-overlay').locator('img');
  await expect(original).toBeVisible();
  expect(await original.evaluate((image) => {
    const canvas = document.createElement('canvas'); canvas.width = 32; canvas.height = 32;
    const context = canvas.getContext('2d')!; context.drawImage(image as HTMLImageElement, 0, 0);
    return [...context.getImageData(16, 16, 1, 1).data];
  })).toEqual([137, 137, 137, 255]);
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('File format', { exact: true }).selectOption('image/png');
  const downloaded = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Download photo', exact: true }).click();
  const bytes = await readFile((await (await downloaded).path())!);
  const output = await page.evaluate(async (bytes) => {
    const bitmap = await createImageBitmap(new Blob([Uint8Array.from(bytes)], { type: 'image/png' }));
    try {
      const canvas = document.createElement('canvas'); canvas.width = bitmap.width; canvas.height = bitmap.height;
      const context = canvas.getContext('2d')!; context.drawImage(bitmap, 0, 0);
      return { width: bitmap.width, height: bitmap.height, pixel: [...context.getImageData(16, 16, 1, 1).data] };
    } finally { bitmap.close(); }
  }, [...bytes]);
  expect(output).toEqual({ width: 32, height: 32, pixel: [188, 188, 188, 255] });
});

test('RAW development controls are source-gated and survive undo, recovery and pixel export', async ({ page }) => {
  await openStudio(page); await openNamedFixture(page, 'native-controls.png');
  await expect(page.getByTestId('photo-raw-controls')).toHaveCount(0);
  await page.setInputFiles('[data-testid="photo-file-input"]', { name: 'development.dng', mimeType: 'image/x-adobe-dng', buffer: Buffer.from(makePhotoDng()) });
  await expect(page.getByTestId('photo-preview')).toBeVisible();
  const raw = page.getByTestId('photo-raw-controls');
  await expect(raw).toBeVisible();
  await raw.getByLabel('RAW white balance', { exact: true }).selectOption('custom');
  await raw.getByLabel('RAW red multiplier', { exact: true }).fill('2');
  await raw.getByLabel('RAW red multiplier', { exact: true }).press('Enter');
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(raw.getByLabel('RAW red multiplier', { exact: true })).toHaveValue('1');
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  await expect(raw.getByLabel('RAW red multiplier', { exact: true })).toHaveValue('2');
  await raw.getByLabel('RAW highlight handling', { exact: true }).selectOption('blend');
  await raw.getByLabel('RAW demosaic', { exact: true }).selectOption('bilinear');
  await expect(page.getByTestId('photo-project-save-state')).toContainText('Saved locally');
  await page.reload(); await page.getByRole('button', { name: 'Recover project', exact: true }).click();
  await expect(raw.getByLabel('RAW white balance', { exact: true })).toHaveValue('custom');
  await expect(raw.getByLabel('RAW red multiplier', { exact: true })).toHaveValue('2');
  await expect(raw.getByLabel('RAW highlight handling', { exact: true })).toHaveValue('blend');
  await expect(raw.getByLabel('RAW demosaic', { exact: true })).toHaveValue('bilinear');
  await expect(page.getByTestId('photo-preview')).toBeVisible();
  await expect(page.locator('.photo-render-badge')).toHaveCount(0);
  const previewPixel = await page.getByTestId('photo-preview').evaluate((image) => {
    const canvas = document.createElement('canvas'); canvas.width = 32; canvas.height = 32;
    const context = canvas.getContext('2d')!; context.drawImage(image as HTMLImageElement, 0, 0);
    return [...context.getImageData(16, 16, 1, 1).data];
  });
  expect(previewPixel[0]).toBeGreaterThan(previewPixel[1]);
  await page.getByRole('button', { name: 'Before/after', exact: true }).click();
  const original = page.getByTestId('photo-before-overlay').locator('img'); await expect(original).toBeVisible();
  expect(await original.evaluate((image) => {
    const canvas = document.createElement('canvas'); canvas.width = 32; canvas.height = 32;
    const context = canvas.getContext('2d')!; context.drawImage(image as HTMLImageElement, 0, 0);
    return [...context.getImageData(16, 16, 1, 1).data];
  })).toEqual([137, 137, 137, 255]);
  await page.getByRole('button', { name: 'Inspect & workflow', exact: true }).click();
  await expect(page.getByTestId('photo-raw-source')).toContainText('InMo Synthetic Bayer');
  await expect(page.getByTestId('photo-raw-source')).toContainText('Bayer CFA');
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  const dialog = page.getByRole('dialog'); await dialog.getByLabel('File format', { exact: true }).selectOption('image/png');
  const downloaded = page.waitForEvent('download'); await dialog.getByRole('button', { name: 'Download photo', exact: true }).click();
  const bytes = await readFile((await (await downloaded).path())!);
  expect(await page.evaluate(async (bytes) => {
    const bitmap = await createImageBitmap(new Blob([Uint8Array.from(bytes)], { type: 'image/png' }));
    try {
      const canvas = document.createElement('canvas'); canvas.width = 32; canvas.height = 32;
      const context = canvas.getContext('2d')!; context.drawImage(bitmap, 0, 0);
      return [...context.getImageData(16, 16, 1, 1).data];
    } finally { bitmap.close(); }
  }, [...bytes])).toEqual(previewPixel);
  await dialog.getByText('Batch export current recipe', { exact: true }).click();
  await dialog.getByLabel('Choose batch photos').setInputFiles([
    { name: 'broken-batch.dng', mimeType: 'image/x-adobe-dng', buffer: Buffer.alloc(12) },
    { name: 'same-development.dng', mimeType: 'image/x-adobe-dng', buffer: Buffer.from(makePhotoDng()) },
  ]);
  const batchDownload = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Export 2 photos', exact: true }).click();
  const batchResult = await batchDownload;
  expect(batchResult.suggestedFilename()).toBe('same-development.png');
  await expect(page.locator('.photo-status-message')).toContainText('1 completed · 1 failed');
  const batchBytes = await readFile((await batchResult.path())!);
  expect(await page.evaluate(async (bytes) => {
    const bitmap = await createImageBitmap(new Blob([Uint8Array.from(bytes)], { type: 'image/png' }));
    try {
      const canvas = document.createElement('canvas'); canvas.width = 32; canvas.height = 32;
      const context = canvas.getContext('2d')!; context.drawImage(bitmap, 0, 0);
      return [...context.getImageData(16, 16, 1, 1).data];
    } finally { bitmap.close(); }
  }, [...batchBytes])).toEqual(previewPixel);
  await dialog.getByRole('button', { name: 'Close export dialog', exact: true }).click();
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await raw.getByRole('button', { name: 'Reset RAW red multiplier', exact: true }).click();
  await expect(raw.getByLabel('RAW red multiplier', { exact: true })).toHaveValue('1');
  await expect(raw.getByLabel('RAW highlight handling', { exact: true })).toHaveValue('blend');
  await expect(raw.getByLabel('RAW demosaic', { exact: true })).toHaveValue('bilinear');
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(raw.getByLabel('RAW red multiplier', { exact: true })).toHaveValue('2');
  await raw.getByRole('button', { name: 'Reset RAW development', exact: true }).click();
  await expect(raw.getByLabel('RAW white balance', { exact: true })).toHaveValue('camera');
  await expect(raw.getByLabel('RAW highlight handling', { exact: true })).toHaveValue('clip');
  await expect(raw.getByLabel('RAW demosaic', { exact: true })).toHaveValue('ahd');
  await raw.getByLabel('RAW white balance', { exact: true }).selectOption('custom');
  const gain = raw.getByLabel('RAW blue multiplier', { exact: true });
  await gain.fill(''); await gain.pressSequentially('2.25'); await gain.press('Enter');
  await expect(gain).toHaveValue('2.25');
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(gain).toHaveValue('1');
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  await expect(gain).toHaveValue('2.25');
  await page.setViewportSize({ width: 320, height: 740 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await openNamedFixture(page, 'native-after-development.png');
  await expect(page.getByTestId('photo-raw-source')).toHaveCount(0);
});

test('malformed RAW leaves the active photo intact and a subsequent DNG import succeeds', async ({ page }) => {
  await openStudio(page); await openNamedFixture(page, 'preserve-native.png');
  await page.setInputFiles('[data-testid="photo-file-input"]', { name: 'damaged.cr3', mimeType: 'application/octet-stream', buffer: Buffer.alloc(12) });
  await expect(page.locator('.photo-status-message')).toContainText(/RAW.*failed/i);
  await expect(page.locator('.photo-status-strip')).toContainText('preserve-native.png');
  await expect(page.getByTestId('photo-source-dimensions')).toContainText('320 × 240');
  await page.setInputFiles('[data-testid="photo-file-input"]', { name: 'after-failure.dng', mimeType: 'image/x-adobe-dng', buffer: Buffer.from(makePhotoDng()) });
  await expect(page.getByTestId('photo-source-dimensions')).toContainText('32 × 32');
  await expect(page.getByTestId('photo-preview')).toBeVisible();
});

test('RAW decoding is on-demand and a cached decoder can recover a project offline', async ({ page, context }) => {
  await openStudio(page);
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
  await page.reload();
  await openNamedFixture(page, 'native-before-raw.png');
  expect(await page.evaluate(async () => {
    const cache = await caches.open('photo-raw-codecs'); return (await cache.keys()).length;
  })).toBe(0);
  await page.setInputFiles('[data-testid="photo-file-input"]', { name: 'offline-sensor.dng', mimeType: 'image/x-adobe-dng', buffer: Buffer.from(makePhotoDng()) });
  await expect(page.getByTestId('photo-source-dimensions')).toContainText('32 × 32');
  await expect(page.getByTestId('photo-preview')).toBeVisible();
  await expect(page.getByTestId('photo-project-save-state')).toContainText('Saved locally');
  await expect.poll(() => page.evaluate(async () => {
    const cache = await caches.open('photo-raw-codecs'); return (await cache.keys()).length;
  })).toBe(2);
  await context.setOffline(true);
  await page.reload();
  await page.getByTestId('photo-recovery-prompt').getByRole('button', { name: 'Recover project' }).click();
  await expect(page.getByTestId('photo-preview')).toBeVisible();
  await expect(page.getByTestId('photo-source-dimensions')).toContainText('32 × 32');
  await expect(page.getByTestId('photo-codec-notice')).toContainText('RAW source preserved');
});

test('TIFF shares preview, comparison, export and durable recovery while preserving original source bytes', async ({ page }) => {
  await openStudio(page);
  const bytes = makePhotoTiff({ bits: 16, samples: [32768, 0, 0, 0, 65535, 0] });
  await page.setInputFiles('[data-testid="photo-file-input"]', { name: 'precision-proof.tiff', mimeType: 'image/tiff', buffer: Buffer.from(bytes) });
  await expect(page.getByTestId('photo-source-dimensions')).toContainText('2 × 1');
  await expect(page.getByTestId('photo-preview')).toBeVisible();
  await expect(page.getByTestId('photo-codec-notice')).toContainText(/16-bit.*8-bit/);
  await page.getByLabel('Exposure value').fill('1');
  await page.getByLabel('Exposure value').press('Enter');
  await expect(page.getByTestId('photo-project-save-state')).toContainText('Saved locally');
  const persisted = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('inmotools.photo-studio');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const read = <T,>(store: string, action: (objectStore: IDBObjectStore) => IDBRequest<T>) => new Promise<T>((resolve, reject) => {
      const request = action(db.transaction(store, 'readonly').objectStore(store));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      const projects = await read('projects', (store) => store.getAll());
      const project = projects.find((entry) => entry.source.name === 'precision-proof.tiff');
      let source: Blob;
      if (project.source.storage === 'opfs') {
        const root = await navigator.storage.getDirectory();
        const directory = await root.getDirectoryHandle('inmotools-photo-studio');
        source = await (await directory.getFileHandle(project.source.key)).getFile();
      } else source = await read('sources', (store) => store.get(project.source.key));
      return Array.from(new Uint8Array(await source.arrayBuffer()));
    } finally { db.close(); }
  });
  expect(persisted).toEqual([...bytes]);
  await page.reload();
  await page.getByTestId('photo-recovery-prompt').getByRole('button', { name: 'Recover project' }).click();
  await expect(page.getByTestId('photo-preview')).toBeVisible();
  await expect(page.getByTestId('photo-source-dimensions')).toContainText('2 × 1');
  await expect(page.getByLabel('Exposure value')).toHaveValue('1');
  await expect(page.getByTestId('photo-codec-notice')).toContainText(/16-bit.*8-bit/);
  const original = page.getByTestId('photo-before-overlay').locator('img');
  await page.getByRole('button', { name: 'Before/after', exact: true }).click();
  await expect(original).toBeVisible();
  expect(await original.evaluate((image) => (image as HTMLImageElement).naturalWidth)).toBe(2);
  const beforePixels = await original.evaluate((image) => {
    const canvas = document.createElement('canvas');
    canvas.width = 2; canvas.height = 1;
    const context = canvas.getContext('2d')!;
    context.drawImage(image as HTMLImageElement, 0, 0);
    return [...context.getImageData(0, 0, 2, 1).data];
  });
  expect(beforePixels).toEqual([128, 0, 0, 255, 0, 255, 0, 255]);
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('File format', { exact: true }).selectOption('image/png');
  const download = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Download photo', exact: true }).click();
  const result = await download;
  expect(result.suggestedFilename()).toMatch(/\.png$/);
  const exportedBytes = await readFile((await result.path())!);
  const exported = await page.evaluate(async (pixels) => {
    const bitmap = await createImageBitmap(new Blob([Uint8Array.from(pixels)], { type: 'image/png' }));
    try {
      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width; canvas.height = bitmap.height;
      const context = canvas.getContext('2d')!;
      context.drawImage(bitmap, 0, 0);
      return { width: bitmap.width, height: bitmap.height, pixels: [...context.getImageData(0, 0, 2, 1).data] };
    } finally { bitmap.close(); }
  }, [...exportedBytes]);
  expect(exported).toEqual({ width: 2, height: 1, pixels: [176, 0, 0, 255, 0, 255, 0, 255] });
});

test('Deflate TIFF decodes through the browser worker', async ({ page }) => {
  await openStudio(page);
  await page.setInputFiles('[data-testid="photo-file-input"]', {
    name: 'deflate-proof.tif', mimeType: 'application/octet-stream',
    buffer: Buffer.from(makePhotoTiff({ compression: 8, encoded: [120, 156, 251, 207, 192, 192, 240, 159, 1, 0, 7, 254, 1, 255] })),
  });
  await expect(page.getByTestId('photo-source-dimensions')).toContainText('2 × 1');
  await expect(page.getByTestId('photo-preview')).toBeVisible();
  await expect(page.getByTestId('photo-codec-notice')).toContainText('8-bit TIFF source preserved');
});

test('unsupported TIFF preserves the current document and gives variant-specific guidance', async ({ page }) => {
  await openStudio(page);
  await openNamedFixture(page, 'keep-me.png');
  await page.setInputFiles('[data-testid="photo-file-input"]', { name: 'rotated.tif', mimeType: 'image/tiff', buffer: Buffer.from(makePhotoTiff({ orientation: 6 })) });
  await expect(page.locator('.photo-status-message')).toContainText(/TIFF.*orientation/i);
  await expect(page.getByTestId('photo-source-dimensions')).toContainText('320 × 240');
  await expect(page.locator('.photo-status-strip')).toContainText('keep-me.png');
});

for (const codec of [
  { format: 'TIFF', worker: 'tiff.worker-', name: 'delayed.tif', mime: 'image/tiff', bytes: makePhotoTiff() },
  { format: 'RAW', worker: 'raw.worker-', name: 'delayed.dng', mime: 'image/x-adobe-dng', bytes: makePhotoDng() },
]) test(`a delayed ${codec.format} decoder cannot replace a newer native import`, async ({ page }) => {
  await page.addInitScript((worker) => {
    const NativeWorker = window.Worker;
    const state = window as unknown as { releaseTiff?: () => void; tiffCompleted?: boolean };
    window.Worker = class extends NativeWorker {
      private readonly isTiff: boolean;
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        this.isTiff = String(url).includes(worker);
        if (this.isTiff) this.addEventListener('message', () => { state.tiffCompleted = true; });
      }
      postMessage(message: unknown, transfer: Transferable[]): void {
        if (this.isTiff) state.releaseTiff = () => super.postMessage(message, transfer);
        else super.postMessage(message, transfer);
      }
    };
  }, codec.worker);
  await openStudio(page);
  await page.setInputFiles('[data-testid="photo-file-input"]', { name: codec.name, mimeType: codec.mime, buffer: Buffer.from(codec.bytes) });
  await expect.poll(() => page.evaluate(() => typeof (window as unknown as { releaseTiff?: () => void }).releaseTiff)).toBe('function');
  await openNamedFixture(page, 'newer-photo.png');
  await page.evaluate(() => (window as unknown as { releaseTiff: () => void }).releaseTiff());
  await expect.poll(() => page.evaluate(() => (window as unknown as { tiffCompleted?: boolean }).tiffCompleted)).toBe(true);
  await expect(page.locator('.photo-status-strip')).toContainText('newer-photo.png');
  await expect(page.getByTestId('photo-source-dimensions')).toContainText('320 × 240');
  await expect(page.getByTestId('photo-codec-notice')).toHaveCount(0);
});

test('opens a dropped image through the shared import target', async ({ page }) => {
  await openStudio(page);
  const dropTarget = page.getByTestId('photo-drop-target');
  const dataTransfer = await page.evaluateHandle(({ bytes }) => {
    const transfer = new DataTransfer();
    transfer.items.add(new File([Uint8Array.from(bytes)], 'dropped-photo.png', { type: 'image/png' }));
    return transfer;
  }, { bytes: Array.from(FIXTURE_PNG) });

  await dropTarget.dispatchEvent('dragenter', { dataTransfer });
  await expect(dropTarget).toHaveClass(/is-photo-dragging/);
  await dropTarget.dispatchEvent('drop', { dataTransfer });
  await expect(page.getByTestId('photo-source-dimensions')).toContainText('320 × 240');
  await expect(page.locator('.photo-status-strip')).toContainText('dropped-photo.png');
  await dataTransfer.dispose();
});

test('routes the progressive camera input through the same importer', async ({ page }) => {
  await openStudio(page);
  const cameraInput = page.getByTestId('photo-camera-input');
  await expect(cameraInput).toHaveAttribute('accept', 'image/*');
  await expect(cameraInput).toHaveAttribute('capture', 'environment');
  await cameraInput.focus();
  await expect(cameraInput.locator('..')).toHaveCSS('outline-style', 'solid');
  await cameraInput.setInputFiles({
    name: 'camera-capture.png',
    mimeType: 'image/png',
    buffer: FIXTURE_PNG,
  });

  await expect(page.getByTestId('photo-source-dimensions')).toContainText('320 × 240');
  await expect(page.locator('.photo-status-strip')).toContainText('camera-capture.png');
});

test('opens a clipboard image when direct clipboard reading is available', async ({ page }) => {
  await page.addInitScript(({ bytes }) => {
    const blob = new Blob([Uint8Array.from(bytes)], { type: 'image/png' });
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { read: async () => [{ types: ['image/png'], getType: async () => blob }] },
    });
  }, { bytes: Array.from(FIXTURE_PNG) });
  await openStudio(page);

  await page.getByRole('button', { name: 'Paste image' }).click();
  await expect(page.getByTestId('photo-source-dimensions')).toContainText('320 × 240');
  await expect(page.locator('.photo-status-strip')).toContainText('clipboard-image.png');
});

test('opens an image pasted while focus is outside the Photo Studio root', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: {} });
  });
  await openStudio(page);
  await page.evaluate(({ bytes }) => {
    const transfer = new DataTransfer();
    transfer.items.add(new File([Uint8Array.from(bytes)], 'keyboard-paste.png', { type: 'image/png' }));
    document.body.dispatchEvent(new ClipboardEvent('paste', {
      clipboardData: transfer,
      bubbles: true,
      cancelable: true,
    }));
  }, { bytes: Array.from(FIXTURE_PNG) });

  await expect(page.getByTestId('photo-source-dimensions')).toContainText('320 × 240');
  await expect(page.locator('.photo-status-strip')).toContainText('keyboard-paste.png');
});

test('a delayed clipboard read cannot replace a newer file import', async ({ page }) => {
  await page.addInitScript(({ bytes }) => {
    const state = window as unknown as {
      releasePhotoClipboard: () => void;
      staleClipboardDecodeStarted: boolean;
    };
    const blob = new Blob([Uint8Array.from(bytes)], { type: 'image/png' });
    let release!: (items: Array<{ types: string[]; getType: () => Promise<Blob> }>) => void;
    const pending = new Promise<Array<{ types: string[]; getType: () => Promise<Blob> }>>((resolve) => {
      release = resolve;
    });
    state.releasePhotoClipboard = () => release([{ types: ['image/png'], getType: async () => blob }]);
    state.staleClipboardDecodeStarted = false;
    const nativeCreateImageBitmap = window.createImageBitmap.bind(window);
    window.createImageBitmap = (source, ...options) => {
      if (source instanceof File && source.name === 'clipboard-image.png') state.staleClipboardDecodeStarted = true;
      return nativeCreateImageBitmap(source, ...options);
    };
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { read: () => pending },
    });
  }, { bytes: Array.from(FIXTURE_PNG) });
  await openStudio(page);
  await page.getByRole('button', { name: 'Paste image' }).click();
  await openNamedFixture(page, 'newer-photo.png');
  const exposure = page.getByLabel('Exposure value');
  await exposure.fill('1.5');
  await exposure.press('Enter');

  await page.evaluate(() => {
    (window as unknown as { releasePhotoClipboard: () => void }).releasePhotoClipboard();
  });
  await page.evaluate(() => new Promise((resolve) => window.setTimeout(resolve, 0)));
  expect(await page.evaluate(() => (
    window as unknown as { staleClipboardDecodeStarted: boolean }
  ).staleClipboardDecodeStarted)).toBe(false);
  await expect(page.locator('.photo-status-strip')).toContainText('newer-photo.png');
  await expect(exposure).toHaveValue('1.5');
});

test('clipboard denial explains the fallback without replacing the active edit', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        read: async () => { throw new DOMException('denied', 'NotAllowedError'); },
      },
    });
  });
  await openStudio(page);
  await openNamedFixture(page, 'active-photo.png');
  const preview = page.getByTestId('photo-preview');
  const exposure = page.getByLabel('Exposure value');
  await exposure.fill('1.5');
  await exposure.press('Enter');

  await page.getByRole('button', { name: 'Paste image' }).click();
  await expect(page.locator('.photo-status-message')).toContainText('Clipboard access was denied');
  await expect(page.locator('.photo-status-strip')).toContainText('active-photo.png');
  await expect(exposure).toHaveValue('1.5');
  await expect(preview).toBeVisible();
});

test('an older preview failure cannot replace newer clipboard guidance', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        read: async () => { throw new DOMException('denied', 'NotAllowedError'); },
      },
    });
  });
  await openStudio(page);
  await openNamedFixture(page, 'active-during-preview-failure.png');
  await page.evaluate(() => {
    const state = window as unknown as { rejectPhotoPreviewDecode: () => void };
    let rejectPreview!: (error: Error) => void;
    state.rejectPhotoPreviewDecode = () => rejectPreview(new Error('delayed preview failure'));
    window.createImageBitmap = () => new Promise<ImageBitmap>((_resolve, reject) => {
      rejectPreview = reject;
    });
  });

  await page.getByLabel('Exposure value').fill('1.5');
  await expect(page.locator('.photo-render-badge')).toBeVisible();
  await page.getByRole('button', { name: 'Paste image' }).click();
  await expect(page.locator('.photo-status-message')).toContainText('Clipboard access was denied');
  await page.evaluate(() => {
    (window as unknown as { rejectPhotoPreviewDecode: () => void }).rejectPhotoPreviewDecode();
  });
  await expect(page.locator('.photo-render-badge')).toHaveCount(0);
  await expect(page.locator('.photo-status-message')).toContainText('Clipboard access was denied');
});

test('source replacement clears observations before the new preview is ready', async ({ page }) => {
  await openStudio(page);
  await openNamedFixture(page, 'observed-source.png');
  await page.getByRole('button', { name: 'Clipping warnings' }).click();
  await page.getByRole('button', { name: 'Color sampler' }).click();
  await page.getByTestId('photo-preview').click({ position: { x: 20, y: 20 } });
  await expect(page.getByRole('status', { name: 'Sampled color readout' })).toBeVisible();
  await expect(page.getByTestId('photo-clipping-overlay')).toBeVisible();

  await page.evaluate(() => {
    const state = window as unknown as { secondSourcePreviewPending: boolean };
    state.secondSourcePreviewPending = false;
    const nativeCreateImageBitmap = window.createImageBitmap.bind(window);
    let secondSourceDecodes = 0;
    window.createImageBitmap = (source, ...options) => {
      if (source instanceof File && source.name === 'replacement-source.png') {
        secondSourceDecodes += 1;
        if (secondSourceDecodes === 2) {
          state.secondSourcePreviewPending = true;
          return new Promise<ImageBitmap>(() => {});
        }
      }
      return nativeCreateImageBitmap(source, ...options);
    };
  });
  await page.setInputFiles('[data-testid="photo-file-input"]', {
    name: 'replacement-source.png',
    mimeType: 'image/png',
    buffer: FIXTURE_PNG,
  });
  await expect(page.locator('.photo-status-strip')).toContainText('replacement-source.png');
  await expect.poll(() => page.evaluate(() => (
    window as unknown as { secondSourcePreviewPending: boolean }
  ).secondSourcePreviewPending)).toBe(true);

  await expect(page.getByRole('status', { name: 'Sampled color readout' })).toHaveCount(0);
  await expect(page.getByTestId('photo-clipping-overlay')).toHaveCount(0);
  await expect(page.getByTestId('photo-preview')).toHaveCount(0);
});

test('clipboard object URL failure leaves the active document usable', async ({ page }) => {
  await page.addInitScript(({ bytes }) => {
    const blob = new Blob([Uint8Array.from(bytes)], { type: 'image/png' });
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { read: async () => [{ types: ['image/png'], getType: async () => blob }] },
    });
  }, { bytes: Array.from(FIXTURE_PNG) });
  await openStudio(page);
  await openNamedFixture(page, 'active-before-url-failure.png');
  await page.evaluate(() => {
    const state = window as unknown as { photoRevokedUrls: string[] };
    state.photoRevokedUrls = [];
    const nativeCreateObjectUrl = URL.createObjectURL.bind(URL);
    const nativeRevokeObjectUrl = URL.revokeObjectURL.bind(URL);
    URL.createObjectURL = (value) => {
      if (value instanceof File && value.name === 'clipboard-image.png') {
        throw new DOMException('object URL unavailable', 'QuotaExceededError');
      }
      return nativeCreateObjectUrl(value);
    };
    URL.revokeObjectURL = (url) => {
      state.photoRevokedUrls.push(url);
      nativeRevokeObjectUrl(url);
    };
  });

  await page.getByRole('button', { name: 'Paste image' }).click();
  await expect(page.locator('.photo-status-message')).toContainText('object URL unavailable');
  await expect(page.locator('.photo-status-strip')).toContainText('active-before-url-failure.png');
  await expect(page.getByTestId('photo-preview')).toBeVisible();
  await expect(page.getByTestId('photo-preview')).toHaveJSProperty('complete', true);
  expect(await page.evaluate(() => {
    const previewUrl = (document.querySelector('[data-testid="photo-preview"]') as HTMLImageElement).src;
    return (window as unknown as { photoRevokedUrls: string[] }).photoRevokedUrls.includes(previewUrl);
  })).toBe(false);
});

test('explains the fallback when direct clipboard reading is unavailable', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: {} });
  });
  await openStudio(page);

  await expect(page.getByRole('button', { name: 'Paste image' })).toBeDisabled();
  await expect(page.locator('#photo-import-hint')).toContainText('Direct clipboard reading is unavailable');
});

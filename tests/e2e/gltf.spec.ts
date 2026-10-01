import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { makeAnimatedGlb, makeGlb, makeGridGlb, makeTexturedGlb, makeTriangleGlb, readGlbSummary } from '../fixtures/gltf-binary';

const BIN_CHUNK = 0x004e4942;
const JSON_CHUNK = 0x4e4f534a;

function pad(text: string): Buffer {
  const bytes = Buffer.from(text, 'utf8');
  const padded = Buffer.alloc(Math.ceil(bytes.byteLength / 4) * 4, 0x20);
  bytes.copy(padded);
  return padded;
}

async function loadModel(page: Page, name = 'triangle.glb', bytes = makeTriangleGlb()) {
  await page.setInputFiles('#gltf-file', { name, mimeType: 'model/gltf-binary', buffer: bytes });
  await expect(page.locator('.status-line')).toContainText(/Loaded original bytes unchanged/i, { timeout: 30_000 });
}

test('binds optimized output to the current settings and exposes fit/preview controls', async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto('./#/tools/gltf-optimizer');
  await loadModel(page);

  await expect(page.getByRole('button', { name: 'Fit model to view' })).toBeEnabled({ timeout: 30_000 });
  await expect(page.getByTestId('gltf-animation-status')).toContainText('No animations');
  await expect(page.getByTestId('gltf-preview-model-key')).toHaveText('source-1');

  await page.getByRole('button', { name: 'Optimize GLB' }).click();
  await expect(page.getByRole('button', { name: 'Download optimized GLB' })).toBeEnabled({ timeout: 60_000 });
  const optimizationReport = page.locator('details').filter({ hasText: 'Optimization report' });
  await expect(optimizationReport).toContainText('Camera count preserved: yes');
  await expect(optimizationReport).toContainText('Animation count preserved: yes');

  await page.locator('#gltf-texture').selectOption('4096');
  await expect(page.getByRole('button', { name: 'Download optimized GLB' })).toBeDisabled();
  await expect(page.locator('.status-line')).toContainText(/settings changed|invalidated/i);

  await page.getByRole('button', { name: 'Optimize GLB' }).click();
  await page.locator('#gltf-texture').selectOption('8192');
  await expect(page.getByRole('button', { name: 'Download optimized GLB' })).toBeDisabled();
  await expect(page.locator('.status-line')).toContainText(/settings changed|invalidated/i);
  await page.waitForTimeout(750);
  await expect(page.getByRole('button', { name: 'Download optimized GLB' })).toBeDisabled();
});

test('blocks transformation when an unknown optional extension payload cannot be preserved', async ({ page }) => {
  await page.goto('./#/tools/gltf-optimizer');
  await loadModel(page, 'unknown-extension.glb', makeTriangleGlb({
    extensionsUsed: ['VENDOR_unknown_payload'],
    extensions: { VENDOR_unknown_payload: { importantId: '00123' } },
  }));

  await expect(page.getByTestId('gltf-extension-report')).toContainText('VENDOR_unknown_payload');
  await expect(page.getByTestId('gltf-extension-report')).toContainText(/blocked to preserve unknown payloads/i);
  await expect(page.getByRole('button', { name: 'Optimize GLB' })).toBeDisabled();
  await page.getByText('Extension and texture preflight', { exact: true }).click();
  await expect(page.getByRole('alert')).toContainText(/unregistered extension|preserv/i);
});

test('resets the preview model identity for a new source and reflows populated UI across target viewports', async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto('./#/tools/gltf-optimizer');
  await loadModel(page, 'first.glb');
  await expect(page.getByTestId('gltf-preview-model-key')).toHaveText('source-1');
  await expect(page.getByRole('button', { name: 'Fit model to view' })).toBeEnabled({ timeout: 30_000 });

  await loadModel(page, 'second.glb');
  await expect(page.getByTestId('gltf-preview-model-key')).toHaveText('source-2');
  await expect(page.getByRole('button', { name: 'Fit model to view' })).toBeEnabled({ timeout: 30_000 });

  for (const viewport of [{ width: 390, height: 844 }, { width: 844, height: 390 }, { width: 768, height: 1024 }]) {
    await page.setViewportSize(viewport);
    await expect(page.locator('#gltf-file')).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `${viewport.width}x${viewport.height} document overflow`).toBeLessThanOrEqual(1);
  }

  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations.filter((violation) => violation.impact === 'serious' || violation.impact === 'critical')).toEqual([]);
});

test('rejects a corrupt container without loading a model or offering optimization', async ({ page }) => {
  await page.goto('./#/tools/gltf-optimizer');
  const truncated = makeGlb([{ type: JSON_CHUNK, data: pad('{"asset":{"version":"2.0"}}') }, { type: BIN_CHUNK, data: Buffer.alloc(16) }], { declaredLength: 4096 });
  await page.setInputFiles('#gltf-file', { name: 'corrupt.glb', mimeType: 'model/gltf-binary', buffer: truncated });

  await expect(page.locator('.status-line')).toContainText(/inspection failed/i, { timeout: 30_000 });
  // The transform controls only exist for a loaded model, so a rejected upload must not create them.
  await expect(page.getByRole('button', { name: 'Optimize GLB' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Download optimized GLB' })).toHaveCount(0);
  await expect(page.locator('canvas')).toHaveCount(0);
  await expect(page.locator('.status-line')).toHaveClass(/error/);
});

test('reports the measured geometry outcome instead of the requested target', async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto('./#/tools/gltf-optimizer');
  await loadModel(page, 'grid.glb', makeGridGlb(40));
  await page.getByLabel(/Target polygon ratio/).fill('0.5');
  await page.getByRole('button', { name: 'Optimize GLB' }).click();
  await expect(page.getByRole('button', { name: 'Download optimized GLB' })).toBeEnabled({ timeout: 60_000 });

  const report = page.locator('details').filter({ hasText: 'Optimization report' });
  await expect(report).toContainText('Geometry result:');
  await expect(report).toContainText(/% of the original triangle count/);
  // The status line must carry a measured number, not the requested one echoed back.
  await expect(page.locator('.status-line')).toContainText(/\d+% of the original/);
  await expect(page.locator('.metric').filter({ hasText: 'Triangles' }).first()).not.toContainText('not available');
});

test('preserves cameras and animation targets and downloads a valid GLB with the expected name and type', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('./#/tools/gltf-optimizer');

  // Playwright's download event does not expose MIME, so capture the Blob the app actually handed to the browser.
  await page.evaluate(() => {
    const captured: Array<{ name: string; type: string; size: number }> = [];
    (window as unknown as { __gltfDownloads: typeof captured }).__gltfDownloads = captured;
    const original = URL.createObjectURL.bind(URL);
    URL.createObjectURL = (object: Blob | MediaSource) => {
      if (object instanceof Blob) captured.push({ name: '', type: object.type, size: object.size });
      return original(object);
    };
    const anchorClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function patched(this: HTMLAnchorElement) {
      const capture = captured[captured.length - 1];
      if (capture) capture.name = this.download;
      return anchorClick.call(this);
    };
  });

  await loadModel(page, 'animated-model.glb', makeAnimatedGlb());
  await page.getByRole('button', { name: 'Optimize GLB' }).click();
  await expect(page.getByRole('button', { name: 'Download optimized GLB' })).toBeEnabled({ timeout: 60_000 });

  const report = page.locator('details').filter({ hasText: 'Optimization report' });
  await expect(report).toContainText('Camera count preserved: yes');
  await expect(report).toContainText('Animation count preserved: yes');
  await expect(report).toContainText('Animation targets preserved: yes');

  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download optimized GLB' }).click();
  expect((await download).suggestedFilename()).toBe('animated-model.optimized.glb');

  const captured = await page.evaluate(() => (window as unknown as { __gltfDownloads: Array<{ name: string; type: string; size: number }> }).__gltfDownloads);
  expect(captured).toHaveLength(1);
  expect(captured[0].name).toBe('animated-model.optimized.glb');
  expect(captured[0].type).toBe('model/gltf-binary');
  expect(captured[0].size).toBeGreaterThan(0);
  await expect(page.locator('.status-line')).toContainText(/original file was not modified/i);
});

test('produces a downloadable file that is a valid GLB container with an intact scene', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('./#/tools/gltf-optimizer');

  // Read the exact bytes the page offers for download, rather than trusting the reported byte counts.
  await page.evaluate(() => {
    const captured: Array<{ type: string; bytes: number[] }> = [];
    (window as unknown as { __gltfBlob: typeof captured }).__gltfBlob = captured;
    const original = URL.createObjectURL.bind(URL);
    URL.createObjectURL = (object: Blob | MediaSource) => {
      if (object instanceof Blob) {
        void object.arrayBuffer().then((buffer) => {
          captured.push({ type: object.type, bytes: Array.from(new Uint8Array(buffer)) });
        });
      }
      return original(object);
    };
  });

  await loadModel(page, 'grid.glb', makeGridGlb(24));
  await page.getByRole('button', { name: 'Optimize GLB' }).click();
  await expect(page.getByRole('button', { name: 'Download optimized GLB' })).toBeEnabled({ timeout: 60_000 });
  await page.getByRole('button', { name: 'Download optimized GLB' }).click();

  await expect.poll(async () => page.evaluate(() => (window as unknown as { __gltfBlob: unknown[] }).__gltfBlob.length)).toBe(1);
  const captured = await page.evaluate(() => (window as unknown as { __gltfBlob: Array<{ type: string; bytes: number[] }> }).__gltfBlob[0]);
  expect(captured.type).toBe('model/gltf-binary');

  const summary = readGlbSummary(Buffer.from(captured.bytes));
  expect(summary.version).toBe(2);
  expect(summary.declaredLength).toBe(captured.bytes.length);
  expect(summary.chunkTypes[0]).toBe('4e4f534a');
  expect(summary.chunkTypes).toContain('004e4942');
  const json = summary.json as { meshes?: unknown[]; scenes?: unknown[]; accessors?: unknown[] };
  expect(json.meshes?.length ?? 0).toBeGreaterThan(0);
  expect(json.scenes?.length ?? 0).toBeGreaterThan(0);
  expect(json.accessors?.length ?? 0).toBeGreaterThan(0);
});

test('leaves textures in their original format by default and discloses the WebP consequence before running', async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto('./#/tools/gltf-optimizer');
  await loadModel(page, 'textured.glb', makeTexturedGlb());
  const webpToggle = page.locator('#gltf-webp');
  await expect(webpToggle).not.toBeChecked();
  // The consequence must be readable before the user commits, not discovered in the output file.
  await expect(page.locator('.workspace-grid')).toContainText(/EXT_texture_webp/i);
  await expect(page.locator('.workspace-grid')).toContainText(/no PNG\/JPEG fallback/i);

  await page.getByRole('button', { name: 'Optimize GLB' }).click();
  await expect(page.getByRole('button', { name: 'Download optimized GLB' })).toBeEnabled({ timeout: 60_000 });
  const report = page.locator('details').filter({ hasText: 'Optimization report' });
  await expect(report).toContainText(/textures kept in their original format/i);
  await expect(report).toContainText('Textures resized: 0 (0 converted to WebP)');
});

test('cancels a running optimization without producing a downloadable result', async ({ page }) => {
  test.setTimeout(120_000);

  // Hold the worker's first request so the run is provably still in flight. Racing a heavy model
  // instead is flaky: on a fast host the optimization can finish before the click lands, which
  // detaches the Cancel button. This gates delivery while keeping a real Worker and a real UI.
  await page.addInitScript(() => {
    const RealWorker = window.Worker;
    const instances: GatedWorker[] = [];
    class GatedWorker {
      private worker: Worker;
      private queued: unknown[] | null = null;
      onmessage: ((event: MessageEvent) => void) | null = null;
      onerror: ((event: ErrorEvent) => void) | null = null;
      onmessageerror: ((event: MessageEvent) => void) | null = null;
      terminated = false;
      constructor(url: string | URL, options?: WorkerOptions) {
        this.worker = new RealWorker(url, options);
        this.worker.addEventListener('message', (event) => this.onmessage?.(event));
        this.worker.addEventListener('error', (event) => this.onerror?.(event));
        this.worker.addEventListener('messageerror', (event) => this.onmessageerror?.(event));
        instances.push(this);
      }
      postMessage(message: unknown) { this.queued = [message]; }
      terminate() { this.terminated = true; this.worker.terminate(); }
      release() { if (this.queued) { this.worker.postMessage(this.queued[0]); this.queued = null; } }
    }
    const gate = {
      release: () => instances.forEach((instance) => instance.release()),
      terminated: () => instances.some((instance) => instance.terminated),
    };
    window.Worker = GatedWorker as unknown as typeof Worker;
    (window as unknown as { __gltfGate: typeof gate }).__gltfGate = gate;
  });

  // A small model is enough now that the gate, not model size, guarantees the run is still in flight.
  await page.goto('./#/tools/gltf-optimizer');
  await loadModel(page, 'grid.glb', makeGridGlb(24));
  await page.getByRole('button', { name: 'Optimize GLB' }).click();

  // The run is in flight because the worker has not received the bytes yet.
  const cancel = page.getByRole('button', { name: 'Cancel optimization' });
  await expect(cancel).toBeVisible();
  await expect(page.getByRole('progressbar')).toBeVisible();
  await cancel.click();

  await expect(page.locator('.status-line')).toContainText(/canceled/i, { timeout: 30_000 });
  await expect(page.getByRole('button', { name: 'Download optimized GLB' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Optimize GLB' })).toBeEnabled();

  // The worker must actually be terminated, so a late reply can never be accepted.
  expect(await page.evaluate(() => (window as unknown as { __gltfGate: { terminated: () => boolean } }).__gltfGate.terminated())).toBe(true);
  await page.evaluate(() => (window as unknown as { __gltfGate: { release: () => void } }).__gltfGate.release());
  await page.waitForTimeout(1500);
  await expect(page.getByRole('button', { name: 'Download optimized GLB' })).toBeDisabled();
});

test('disables optimization with an explanation when the browser has no Web Worker support', async ({ page }) => {
  await page.addInitScript(() => {
    // @ts-expect-error deleting a global to emulate an unsupported environment
    delete window.Worker;
  });
  await page.goto('./#/tools/gltf-optimizer');
  await expect(page.getByTestId('gltf-worker-unavailable')).toContainText(/no Web Worker support/i);

  await loadModel(page);
  await expect(page.getByRole('button', { name: 'Optimize GLB' })).toBeDisabled();
  // Inspection and preview must still work; only the transform is unavailable.
  await expect(page.getByRole('button', { name: 'Fit model to view' })).toBeEnabled({ timeout: 30_000 });
  await expect(page.locator('.status-line')).not.toContainText(/inspection failed/i);
});

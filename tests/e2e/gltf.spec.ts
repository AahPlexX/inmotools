import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

function makeTriangleGlb(extra: Record<string, unknown> = {}): Buffer {
  const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
  const indices = new Uint16Array([0, 1, 2]);
  const binary = new Uint8Array(44);
  binary.set(new Uint8Array(positions.buffer), 0);
  binary.set(new Uint8Array(indices.buffer), 36);
  const json = JSON.stringify({
    asset: { version: '2.0', generator: 'InmoTools browser fixture' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0, name: 'Triangle' }],
    meshes: [{ name: 'TriangleMesh', primitives: [{ attributes: { POSITION: 0 }, indices: 1 }] }],
    accessors: [
      { bufferView: 0, componentType: 5126, count: 3, type: 'VEC3', min: [0, 0, 0], max: [1, 1, 0] },
      { bufferView: 1, componentType: 5123, count: 3, type: 'SCALAR', min: [0], max: [2] },
    ],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: 36, target: 34962 },
      { buffer: 0, byteOffset: 36, byteLength: 6, target: 34963 },
    ],
    buffers: [{ byteLength: 44 }],
    ...extra,
  });
  const rawJson = new TextEncoder().encode(json);
  const jsonLength = Math.ceil(rawJson.length / 4) * 4;
  const totalLength = 12 + 8 + jsonLength + 8 + binary.length;
  const output = new Uint8Array(totalLength);
  const view = new DataView(output.buffer);
  view.setUint32(0, 0x46546c67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, totalLength, true);
  view.setUint32(12, jsonLength, true);
  view.setUint32(16, 0x4e4f534a, true);
  output.fill(0x20, 20, 20 + jsonLength);
  output.set(rawJson, 20);
  const binHeader = 20 + jsonLength;
  view.setUint32(binHeader, binary.length, true);
  view.setUint32(binHeader + 4, 0x004e4942, true);
  output.set(binary, binHeader + 8);
  return Buffer.from(output);
}

async function loadModel(page: import('@playwright/test').Page, name = 'triangle.glb', extra: Record<string, unknown> = {}) {
  await page.setInputFiles('#gltf-file', { name, mimeType: 'model/gltf-binary', buffer: makeTriangleGlb(extra) });
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
  await expect(page.getByText(/Camera count preserved:/)).toContainText('yes');
  await expect(page.getByText(/Animation count preserved:/)).toContainText('yes');

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
  await loadModel(page, 'unknown-extension.glb', {
    extensionsUsed: ['VENDOR_unknown_payload'],
    extensions: { VENDOR_unknown_payload: { importantId: '00123' } },
  });

  await expect(page.getByTestId('gltf-extension-report')).toContainText('VENDOR_unknown_payload');
  await expect(page.getByTestId('gltf-extension-report')).toContainText(/blocked to preserve unknown payloads/i);
  await expect(page.getByRole('button', { name: 'Optimize GLB' })).toBeDisabled();
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

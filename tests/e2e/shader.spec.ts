import { expect, test, type Page } from '@playwright/test';

const waitForLinkedShader = async (page: Page) => {
  await expect(page.locator('.status-line')).toContainText(/compiled and linked successfully|linked with \d+ compiler message/i, { timeout: 20_000 });
};

const readDownload = async (page: Page, buttonName: string) => {
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: buttonName }).click();
  const download = await downloadPromise;
  const stream = await download.createReadStream();
  if (!stream) throw new Error('Downloaded shader export did not expose a readable stream.');
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString('utf8');
};

test('a failed compile cannot replace the last linked shader used for export', async ({ page }) => {
  await page.goto('./#/tools/glsl-sandbox');
  await waitForLinkedShader(page);

  const source = page.getByLabel('Fragment shader source');
  await source.fill(`#version 300 es
precision highp float;
out vec4 outColor;
BROKEN_EXPORT_SENTINEL
void main(){outColor=vec4(1.0);}`);
  await page.getByRole('button', { name: 'Compile now' }).click();
  await expect(page.locator('.status-line')).toContainText(/compilation failed|linking failed/i, { timeout: 20_000 });

  const html = await readDownload(page, 'Export standalone HTML');
  expect(html).not.toContain('BROKEN_EXPORT_SENTINEL');
  expect(html).toContain('float pulse');
});

test('a paused preview redraws after its rendered size changes and stays bounded in short landscape', async ({ page }) => {
  await page.setViewportSize({ width: 1180, height: 760 });
  await page.goto('./#/tools/glsl-sandbox');
  await waitForLinkedShader(page);
  await page.getByRole('button', { name: 'Pause time' }).click();

  const canvas = page.getByLabel('Live WebGL2 fragment shader preview');
  const before = await canvas.evaluate((element: HTMLCanvasElement) => ({ width: element.width, height: element.height }));
  await page.setViewportSize({ width: 720, height: 500 });

  await expect.poll(async () => canvas.evaluate((element: HTMLCanvasElement) => element.width), { timeout: 5_000 }).not.toBe(before.width);
  const resized = await canvas.evaluate((element: HTMLCanvasElement) => ({
    width: element.width,
    clientWidth: element.clientWidth,
    dpr: window.devicePixelRatio || 1,
  }));
  expect(Math.abs(resized.width - Math.round(resized.clientWidth * resized.dpr))).toBeLessThanOrEqual(2);

  await page.setViewportSize({ width: 844, height: 390 });
  const shortLandscapeBox = await canvas.boundingBox();
  expect(shortLandscapeBox).not.toBeNull();
  expect(shortLandscapeBox!.height).toBeLessThanOrEqual(240);
});

test('a texture that finishes loading after a paused frame triggers another draw', async ({ page }) => {
  await page.goto('./#/tools/glsl-sandbox');
  await waitForLinkedShader(page);

  const source = page.getByLabel('Fragment shader source');
  await source.fill(`#version 300 es
precision highp float;
out vec4 outColor;
uniform sampler2D u_texture0;
void main(){outColor=texture(u_texture0,vec2(0.5));}`);
  await page.getByRole('button', { name: 'Compile now' }).click();
  await waitForLinkedShader(page);
  await page.getByRole('button', { name: 'Pause time' }).click();

  const canvas = page.getByLabel('Live WebGL2 fragment shader preview');
  await page.waitForTimeout(100);
  const placeholderFrame = await canvas.evaluate((element: HTMLCanvasElement) => element.toDataURL());

  const pngBase64 = await page.evaluate(() => {
    const imageCanvas = document.createElement('canvas');
    imageCanvas.width = 2048;
    imageCanvas.height = 2048;
    const context = imageCanvas.getContext('2d');
    if (!context) throw new Error('2D canvas unavailable for shader test fixture.');
    context.fillStyle = '#ff0000';
    context.fillRect(0, 0, imageCanvas.width, imageCanvas.height);
    return imageCanvas.toDataURL('image/png').split(',')[1]!;
  });

  await page.locator('#shader-texture-0').setInputFiles({
    name: 'slow-red.png',
    mimeType: 'image/png',
    buffer: Buffer.from(pngBase64, 'base64'),
  });
  await expect(page.locator('.status-line')).toContainText(/slow-red\.png ready/i);
  await page.waitForTimeout(400);

  const loadedFrame = await canvas.evaluate((element: HTMLCanvasElement) => element.toDataURL());
  expect(loadedFrame).not.toBe(placeholderFrame);
});

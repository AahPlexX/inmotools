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

const desktopOnly = (projectName: string) => test.skip(projectName !== 'desktop-chromium', 'Lifecycle detail is covered once in desktop Chromium.');

// WebGL clears its default drawing buffer after compositing. Sample synchronously
// after the real draw, without changing the application's context attributes.
const observeShaderPixels = async (page: Page) => {
  await page.addInitScript(() => {
    const drawArrays = WebGL2RenderingContext.prototype.drawArrays;
    WebGL2RenderingContext.prototype.drawArrays = function (...args) {
      drawArrays.apply(this, args);
      if (!(this.canvas instanceof HTMLCanvasElement)
        || this.canvas.getAttribute('aria-label') !== 'Live WebGL2 fragment shader preview') return;
      const pixel = new Uint8Array(4);
      this.readPixels(Math.floor(this.drawingBufferWidth / 2), Math.floor(this.drawingBufferHeight / 2),
        1, 1, this.RGBA, this.UNSIGNED_BYTE, pixel);
      (window as unknown as { shaderPixel: number[] }).shaderPixel = Array.from(pixel);
    };
  });
};

const readShaderPixel = (page: Page) => page.evaluate(() =>
  (window as unknown as { shaderPixel?: number[] }).shaderPixel ?? []);

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
  expect(Math.abs(resized.width - Math.round(resized.clientWidth * Math.min(2, resized.dpr)))).toBeLessThanOrEqual(2);

  await page.setViewportSize({ width: 844, height: 390 });
  const shortLandscapeBox = await canvas.boundingBox();
  expect(shortLandscapeBox).not.toBeNull();
  expect(shortLandscapeBox!.height).toBeLessThanOrEqual(240);
});

test('a texture that finishes loading after a paused frame triggers another draw', async ({ page }) => {
  await observeShaderPixels(page);
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

  await expect.poll(() => readShaderPixel(page)).toEqual([0, 0, 0, 255]);

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
  await expect(page.getByRole('button', { name: 'Remove texture 0' })).toBeVisible();
  await expect.poll(() => readShaderPixel(page)).toEqual([255, 0, 0, 255]);
});

test('texture decode failures are reported instead of silently leaving a placeholder', async ({ page }, testInfo) => {
  desktopOnly(testInfo.project.name);
  await page.goto('./#/tools/glsl-sandbox');
  await waitForLinkedShader(page);

  await page.locator('#shader-texture-0').setInputFiles({
    name: 'broken-texture.png',
    mimeType: 'image/png',
    buffer: Buffer.from('this is not a valid PNG'),
  });

  await expect(page.locator('.status-line')).toContainText(/texture 0.*could not be decoded|failed to decode.*texture 0/i, { timeout: 5_000 });
});

test('a lost WebGL context can be restored and rebuilds the linked shader resources', async ({ page }, testInfo) => {
  desktopOnly(testInfo.project.name);
  await page.goto('./#/tools/glsl-sandbox');
  await waitForLinkedShader(page);
  const canvas = page.getByLabel('Live WebGL2 fragment shader preview');

  const supported = await canvas.evaluate((element: HTMLCanvasElement) => Boolean(element.getContext('webgl2')?.getExtension('WEBGL_lose_context')));
  test.skip(!supported, 'WEBGL_lose_context is unavailable in this browser.');

  await canvas.evaluate((element: HTMLCanvasElement) => {
    const extension = element.getContext('webgl2')?.getExtension('WEBGL_lose_context');
    if (!extension) throw new Error('Context loss extension disappeared before the test.');
    (window as unknown as { restoreShaderContext: () => void }).restoreShaderContext = () => extension.restoreContext();
    extension.loseContext();
  });
  await expect(page.locator('.status-line')).toContainText('context lost');

  await page.evaluate(() => {
    (window as unknown as { restoreShaderContext: () => void }).restoreShaderContext();
  });
  await waitForLinkedShader(page);
});

test('keyboard arrows update u_mouse and redraw a paused focused preview', async ({ page }, testInfo) => {
  desktopOnly(testInfo.project.name);
  await observeShaderPixels(page);
  await page.goto('./#/tools/glsl-sandbox');
  await waitForLinkedShader(page);

  const source = page.getByLabel('Fragment shader source');
  await source.fill(`#version 300 es
precision highp float;
out vec4 outColor;
uniform vec2 u_resolution;
uniform vec2 u_mouse;
void main(){outColor=vec4(u_mouse.x/max(u_resolution.x,1.0),0.0,0.0,1.0);}`);
  await page.getByRole('button', { name: 'Compile now' }).click();
  await waitForLinkedShader(page);
  await page.getByRole('button', { name: 'Pause time' }).click();

  const canvas = page.getByLabel('Live WebGL2 fragment shader preview');
  await canvas.focus();
  await expect.poll(() => readShaderPixel(page)).toEqual([0, 0, 0, 255]);
  await page.keyboard.press('ArrowRight');
  await expect.poll(async () => (await readShaderPixel(page))[0]).toBeGreaterThan(127);
  expect((await readShaderPixel(page)).slice(1)).toEqual([0, 0, 255]);
});

const pngOf = async (page: Page, color: string) => Buffer.from(await page.evaluate((fill) => {
  const imageCanvas = document.createElement('canvas');
  imageCanvas.width = 8;
  imageCanvas.height = 8;
  const context = imageCanvas.getContext('2d');
  if (!context) throw new Error('2D canvas unavailable for shader test fixture.');
  context.fillStyle = fill;
  context.fillRect(0, 0, 8, 8);
  return imageCanvas.toDataURL('image/png').split(',')[1]!;
}, color), 'base64');

const compileShader = async (page: Page, body: string) => {
  await page.getByLabel('Fragment shader source').fill(`#version 300 es
precision highp float;
out vec4 outColor;
uniform vec2 u_resolution;
uniform float u_time;
uniform vec2 u_mouse;
uniform sampler2D u_texture0;
uniform sampler2D u_texture1;
${body}`);
  await page.getByRole('button', { name: 'Compile now' }).click();
  await waitForLinkedShader(page);
};

test('GLS-R01 edits compile automatically after 350 ms and Compile now compiles at once', async ({ page }) => {
  await observeShaderPixels(page);
  await page.goto('./#/tools/glsl-sandbox');
  await waitForLinkedShader(page);
  const source = page.getByLabel('Fragment shader source');
  const provenance = page.getByText(/^(Editor has uncompiled changes|Preview and export match|The latest compile candidate)/);
  await expect(provenance).toHaveText(/^Preview and export match/);

  const started = Date.now();
  await source.fill(`#version 300 es
precision highp float;
out vec4 outColor;
void main(){outColor=vec4(0.0,1.0,0.0,1.0);}`);
  await expect.poll(() => readShaderPixel(page), { timeout: 10_000 }).toEqual([0, 255, 0, 255]);
  expect(Date.now() - started).toBeGreaterThanOrEqual(350);
  await expect(provenance).toHaveText(/^Preview and export match/);

  await page.getByRole('checkbox', { name: 'Auto-compile after 350 ms' }).uncheck();
  await source.fill(`#version 300 es
precision highp float;
out vec4 outColor;
void main(){outColor=vec4(1.0,0.0,0.0,1.0);}`);
  await page.waitForTimeout(1_000);
  expect(await readShaderPixel(page)).toEqual([0, 255, 0, 255]);
  await expect(provenance).toHaveText(/^Editor has uncompiled changes/);
  await page.getByRole('button', { name: 'Compile now' }).click();
  await expect.poll(() => readShaderPixel(page)).toEqual([255, 0, 0, 255]);
  await expect(provenance).toHaveText(/^Preview and export match/);
});

test('GLS-R05 Pause holds u_time, Resume continues it and Reset time returns it to zero', async ({ page }) => {
  await observeShaderPixels(page);
  await page.goto('./#/tools/glsl-sandbox');
  await waitForLinkedShader(page);
  await compileShader(page, 'void main(){outColor=vec4(min(u_time/30.0,1.0),0.0,0.0,1.0);}');
  await page.getByRole('button', { name: 'Reset time' }).click();
  await expect.poll(async () => (await readShaderPixel(page))[0], { timeout: 10_000 }).toBeGreaterThanOrEqual(12);

  await page.getByRole('button', { name: 'Reset time' }).click();
  await expect.poll(async () => (await readShaderPixel(page))[0]).toBeLessThanOrEqual(6);
  await expect.poll(async () => (await readShaderPixel(page))[0], { timeout: 10_000 }).toBeGreaterThanOrEqual(10);

  await page.getByRole('button', { name: 'Pause time' }).click();
  await expect(page.getByRole('button', { name: 'Resume time' })).toBeVisible();
  await page.waitForTimeout(300);
  const held = (await readShaderPixel(page))[0];
  await page.waitForTimeout(1_200);
  const canvas = page.getByLabel('Live WebGL2 fragment shader preview');
  await canvas.focus();
  await page.evaluate(() => { (window as unknown as { shaderPixel?: number[] }).shaderPixel = undefined; });
  await page.keyboard.press('ArrowRight');
  await expect.poll(() => readShaderPixel(page)).toHaveLength(4);
  expect((await readShaderPixel(page))[0]).toBe(held);

  await page.getByRole('button', { name: 'Resume time' }).click();
  await expect(page.getByRole('button', { name: 'Pause time' })).toBeVisible();
  await expect.poll(async () => (await readShaderPixel(page))[0], { timeout: 10_000 }).toBeGreaterThanOrEqual(held + 5);

  await page.getByRole('button', { name: 'Pause time' }).click();
  await page.getByRole('button', { name: 'Reset time' }).click();
  await expect.poll(() => readShaderPixel(page)).toEqual([0, 0, 0, 255]);
});

test('GLS-R06 u_texture1 shows a black placeholder until an image is chosen and after it is removed', async ({ page }) => {
  await observeShaderPixels(page);
  await page.goto('./#/tools/glsl-sandbox');
  await waitForLinkedShader(page);
  await compileShader(page, 'void main(){outColor=texture(u_texture1,vec2(0.5))+vec4(0.0,0.0,0.0,1.0);}');
  await expect.poll(() => readShaderPixel(page)).toEqual([0, 0, 0, 255]);
  await page.locator('#shader-texture-1').setInputFiles({ name: 'green.png', mimeType: 'image/png', buffer: await pngOf(page, '#00ff00') });
  await expect(page.getByRole('button', { name: 'Remove texture 1' })).toBeVisible();
  await expect.poll(() => readShaderPixel(page)).toEqual([0, 255, 0, 255]);
  await page.getByRole('button', { name: 'Remove texture 1' }).click();
  await expect.poll(() => readShaderPixel(page)).toEqual([0, 0, 0, 255]);
});

test('GLS-R09 Editor, Split and Preview layouts switch views and Reset starter shader restores the starter', async ({ page }) => {
  await page.goto('./#/tools/glsl-sandbox');
  await waitForLinkedShader(page);
  const editor = page.getByLabel('Fragment shader source');
  const canvas = page.getByLabel('Live WebGL2 fragment shader preview');
  const button = (name: string) => page.getByRole('button', { name, exact: true });
  await expect(button('Split')).toHaveAttribute('aria-pressed', 'true');
  await expect(editor).toBeVisible();
  await expect(canvas).toBeVisible();

  await button('Editor').click();
  await expect(button('Editor')).toHaveAttribute('aria-pressed', 'true');
  await expect(button('Split')).toHaveAttribute('aria-pressed', 'false');
  await expect(editor).toBeVisible();
  await expect(canvas).toHaveCount(0);

  await button('Preview').click();
  await expect(button('Preview')).toHaveAttribute('aria-pressed', 'true');
  await expect(editor).toHaveCount(0);
  await expect(canvas).toBeVisible();
  await waitForLinkedShader(page);

  await button('Split').click();
  await expect(button('Split')).toHaveAttribute('aria-pressed', 'true');
  await expect(editor).toBeVisible();
  await expect(canvas).toBeVisible();

  await compileShader(page, 'void main(){outColor=vec4(0.5);} // CUSTOM_SENTINEL');
  await page.locator('#shader-texture-0').setInputFiles({ name: 'red.png', mimeType: 'image/png', buffer: await pngOf(page, '#ff0000') });
  await expect(button('Remove texture 0')).toBeVisible();
  await button('Reset starter shader').click();
  await expect(editor).toContainText('float pulse');
  await expect(editor).not.toContainText('CUSTOM_SENTINEL');
  await expect(button('Remove texture 0')).toHaveCount(0);
  const html = await readDownload(page, 'Export standalone HTML');
  expect(html).toContain('float pulse');
  expect(html).not.toContain('CUSTOM_SENTINEL');
  expect(html).toContain('const textureDataUrls=["",""];');
});

test('GLS-R10 the exported HTML runs on its own with uniforms, animation, pointer, resize and textures', async ({ page, context }, testInfo) => {
  desktopOnly(testInfo.project.name);
  await page.goto('./#/tools/glsl-sandbox');
  await waitForLinkedShader(page);
  await compileShader(page, 'void main(){outColor=vec4(u_mouse.x/max(u_resolution.x,1.0),min(u_time,1.0),texture(u_texture0,vec2(0.5)).r,1.0);}');
  await page.locator('#shader-texture-0').setInputFiles({ name: 'red.png', mimeType: 'image/png', buffer: await pngOf(page, '#ff0000') });
  await expect(page.getByRole('button', { name: 'Remove texture 0' })).toBeVisible();
  const html = await readDownload(page, 'Export standalone HTML');
  expect(html).not.toMatch(/<script[^>]+src=|<link[^>]+href=/);

  const exported = await context.newPage();
  const requests: string[] = [];
  await exported.route('**/*', async (route) => {
    if (route.request().url() === 'https://export.invalid/shader-demo.html') {
      await route.fulfill({ status: 200, contentType: 'text/html', body: html });
      return;
    }
    if (!route.request().url().endsWith('/favicon.ico')) requests.push(route.request().url());
    await route.abort();
  });
  await exported.addInitScript(() => {
    const drawArrays = WebGL2RenderingContext.prototype.drawArrays;
    WebGL2RenderingContext.prototype.drawArrays = function (...args) {
      drawArrays.apply(this, args);
      if (!(this.canvas instanceof HTMLCanvasElement) || this.canvas.id !== 'shader-canvas') return;
      const pixel = new Uint8Array(4);
      this.readPixels(Math.floor(this.drawingBufferWidth / 2), Math.floor(this.drawingBufferHeight / 2), 1, 1, this.RGBA, this.UNSIGNED_BYTE, pixel);
      (window as unknown as { exportPixel: number[] }).exportPixel = Array.from(pixel);
    };
  });
  const errors: string[] = [];
  exported.on('pageerror', (error) => errors.push(error.message));
  await exported.setViewportSize({ width: 400, height: 300 });
  await exported.goto('https://export.invalid/shader-demo.html');
  const pixel = () => exported.evaluate(() => (window as unknown as { exportPixel?: number[] }).exportPixel ?? []);
  await expect.poll(async () => (await pixel())[1], { timeout: 10_000 }).toBe(255);
  await expect.poll(async () => (await pixel())[2], { timeout: 10_000 }).toBe(255);
  expect((await pixel())[0]).toBe(0);

  await exported.mouse.move(399, 150);
  await expect.poll(async () => (await pixel())[0]).toBeGreaterThan(240);
  const canvas = exported.locator('#shader-canvas');
  const before = await canvas.evaluate((node: HTMLCanvasElement) => node.width);
  await exported.setViewportSize({ width: 640, height: 300 });
  await expect.poll(() => canvas.evaluate((node: HTMLCanvasElement) => node.width)).not.toBe(before);
  const resized = await canvas.evaluate((node: HTMLCanvasElement) => ({ width: node.width, clientWidth: node.clientWidth, dpr: window.devicePixelRatio || 1 }));
  expect(resized.width).toBe(Math.floor(resized.clientWidth * Math.min(2, resized.dpr)));
  expect(errors).toEqual([]);
  expect(requests).toEqual([]);
  await exported.close();
});

for (const width of [320, 375, 768, 1024, 1440, 1920, 2560]) {
  test(`GLS-R13 lays out without horizontal overflow at ${width} px`, async ({ page, isMobile }) => {
    test.skip(isMobile, 'viewport matrix runs on the desktop project');
    await page.setViewportSize({ width, height: width < 800 ? 800 : 1000 });
    await page.goto('./#/tools/glsl-sandbox');
    await waitForLinkedShader(page);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
    const controls = [
      ...['Editor', 'Split', 'Preview', 'Pause time', 'Reset time', 'Compile now', 'Export standalone HTML', 'Reset starter shader']
        .map((name) => page.getByRole('button', { name, exact: true })),
      page.getByRole('checkbox', { name: 'Auto-compile after 350 ms' }),
      page.locator('#shader-scale'),
      page.locator('#shader-texture-0'),
      page.locator('#shader-texture-1'),
      page.locator('.cm-editor'),
      page.getByLabel('Live WebGL2 fragment shader preview'),
    ];
    for (const control of controls) {
      const box = await control.boundingBox();
      expect(box && box.x >= 0 && box.x + box.width <= width + 1, `${control} inside viewport at ${width}px: ${JSON.stringify(box)}`).toBe(true);
    }
  });
}

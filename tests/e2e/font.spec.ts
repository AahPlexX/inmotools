import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import opentype from 'opentype.js';

const TINY_TTF_BASE64 = 'AAEAAAAKAIAAAwAgT1MvMkUhRCwAAAEoAAAAYGNtYXAADACVAAABlAAAADRnbHlmssEZlgAAAdAAAABMaGVhZC7goYoAAACsAAAANmhoZWEFKgIqAAAA5AAAACRobXR4BuoALQAAAYgAAAAMbG9jYQAZADMAAAHIAAAACG1heHAABQAGAAABCAAAACBuYW1lKwzfCgAAAhwAAAEscG9zdAApACUAAANIAAAAKAABAAAAAQAA6SrXUV8PPPUAAQPoAAAAAOa6LvcAAAAA5rou9wAyAAACJgK8AAAAAwACAAAAAAAAAAEAAAMg/zgAAAKKAAAAZAIIAAEAAAAAAAAAAAAAAAAAAAADAAEAAAADAAQAAQAAAAAAAgAAAAAAAAAAAAAAAAAAAAAAAwJOAZAABQAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAPz8/PwAAAEEAQgMg/zgAAAMgAMgAAAAAAAAAAAAAAAAAAAAgAAAB9AAAAooAFAJsABkAAAACAAAAAwAAABQAAwABAAAAFAAEACAAAAAEAAQAAQAAAEL//wAAAEH////AAAEAAAAAAAAADQAZACYAAQAyAAABwgK8AAMAADMhESEyAZD+cAK8AAABADIAAAImArwAAgAAMxMTMvr6Arz9RAABADIAAAH0ArwAAwAAMxEhETIBwgK8/UQAAAAACgB+AAEAAAAAAAEADAAAAAEAAAAAAAIABwAMAAEAAAAAAAMAEwATAAEAAAAAAAQAFAAmAAEAAAAAAAYAEwATAAMAAQQJAAEAGAA6AAMAAQQJAAIADgBSAAMAAQQJAAMAJgBgAAMAAQQJAAQAKACGAAMAAQQJAAYAJgBgSW5tbyBGaXh0dXJlUmVndWxhcklubW9GaXh0dXJlLVJlZ3VsYXJJbm1vIEZpeHR1cmUgUmVndWxhcgBJAG4AbQBvACAARgBpAHgAdAB1AHIAZQBSAGUAZwB1AGwAYQByAEkAbgBtAG8ARgBpAHgAdAB1AHIAZQAtAFIAZQBnAHUAbABhAHIASQBuAG0AbwAgAEYAaQB4AHQAdQByAGUAIABSAGUAZwB1AGwAYQByAAIAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAwAAACQAJQ==';

function fixtureWithWeight(weight: number): Buffer {
  const bytes = Buffer.from(TINY_TTF_BASE64, 'base64');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const count = view.getUint16(4, false);
  for (let index = 0; index < count; index += 1) {
    const entry = 12 + index * 16;
    if (bytes.subarray(entry, entry + 4).toString('ascii') !== 'OS/2') continue;
    const offset = view.getUint32(entry + 8, false);
    view.setUint16(offset + 4, weight, false);
    return bytes;
  }
  throw new Error('OS/2 table not found in fixture.');
}

async function loadFixture(page: import('@playwright/test').Page) {
  await page.goto('./#/tools/font-subsetter');
  await page.setInputFiles('#font-file', { name: 'fixture-bold.ttf', mimeType: 'font/ttf', buffer: fixtureWithWeight(700) });
  await expect(page.getByTestId('font-source-weight')).toHaveText('700');
  await expect(page.getByRole('button', { name: 'Build WOFF2 subset' })).toBeEnabled();
}

test('verifies generated weight metadata and invalidates exports when the selection changes', async ({ page }) => {
  test.setTimeout(90_000);
  await loadFixture(page);

  const downloadWoff2 = page.getByRole('button', { name: 'Download WOFF2', exact: true });
  await page.getByRole('button', { name: 'Build WOFF2 subset' }).click();
  await expect(page.getByTestId('font-metadata-comparison')).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId('font-output-weight')).toHaveText('700');
  await expect(downloadWoff2).toBeVisible();

  await page.locator('#font-custom').fill('A');
  await expect(downloadWoff2).toHaveCount(0);
  await expect(page.getByText(/rebuild the subset before exporting/i)).toBeVisible();

  await page.getByLabel('Basic Latin').uncheck();
  await expect(page.getByTestId('font-retained-summary')).toContainText('1 requested · 1 present');
  await page.getByRole('button', { name: 'Build WOFF2 subset' }).click();
  await expect(downloadWoff2).toBeVisible({ timeout: 60_000 });

  await page.locator('#font-custom').fill('😀');
  await expect(page.getByTestId('font-retained-summary')).toContainText('1 requested · 0 present');
  await expect(page.getByRole('button', { name: 'Build WOFF2 subset' })).toBeDisabled();
  await expect(downloadWoff2).toHaveCount(0);
});

test('reflows populated font inspection across phone portrait, landscape, and tablet viewports', async ({ page }) => {
  test.setTimeout(60_000);
  await loadFixture(page);
  await page.locator('#font-preview-text').fill('A very long preview string 0123456789 ABCDEFGHIJKLMNOPQRSTUVWXYZ '.repeat(4));

  for (const viewport of [{ width: 390, height: 844 }, { width: 844, height: 390 }, { width: 768, height: 1024 }]) {
    await page.setViewportSize(viewport);
    await expect(page.locator('#font-file')).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `${viewport.width}x${viewport.height} document overflow`).toBeLessThanOrEqual(1);
  }

  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations.filter((violation) => violation.impact === 'serious' || violation.impact === 'critical')).toEqual([]);
});

function manyGlyphFont(count: number): Buffer {
  const glyphs = [new opentype.Glyph({ name: '.notdef', advanceWidth: 500, path: new opentype.Path() })];
  for (let index = 0; index < count; index += 1) {
    const path = new opentype.Path();
    path.moveTo(50, 0); path.lineTo(450, 0); path.lineTo(250, 100 + index); path.close();
    glyphs.push(new opentype.Glyph({ name: `mark${index}`, unicode: 0x4e00 + index, advanceWidth: 500 + index, path }));
  }
  const font = new opentype.Font({ familyName: 'Inmo Many', styleName: 'Regular', unitsPerEm: 1000, ascender: 800, descender: -200, glyphs });
  return Buffer.from(font.toArrayBuffer());
}

async function readDownload(download: import('@playwright/test').Download) {
  const chunks: Buffer[] = [];
  for await (const chunk of await download.createReadStream()) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks);
}

test('FNT-R05 searches the paged glyph coverage list with names and advance widths', async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto('./#/tools/font-subsetter');
  await page.setInputFiles('#font-file', { name: 'many.otf', mimeType: 'font/otf', buffer: manyGlyphFont(250) });
  const list = page.getByRole('list', { name: 'Font glyph coverage' });
  await expect(list.getByRole('listitem')).toHaveCount(200);
  await expect(page.getByText('Page 1 of 2')).toBeVisible();
  await expect(list.getByRole('listitem').first()).toContainText('mark0');
  await expect(list.getByRole('listitem').first()).toContainText('U+4E00 · aw 500');
  await page.getByRole('button', { name: 'Next glyphs' }).click();
  await expect(page.getByText('Page 2 of 2')).toBeVisible();
  await expect(list.getByRole('listitem')).toHaveCount(50);
  await expect(list.getByRole('listitem').first()).toContainText('mark200');
  await expect(page.getByRole('button', { name: 'Next glyphs' })).toBeDisabled();
  await page.getByRole('button', { name: 'Previous glyphs' }).click();
  await expect(page.getByText('Page 1 of 2')).toBeVisible();

  await page.getByLabel('Search glyphs').fill('mark249');
  await expect(list.getByRole('listitem')).toHaveCount(1);
  await expect(list.getByRole('listitem')).toContainText('U+4EF9 · aw 749');
  await expect(page.getByRole('group', { name: 'Glyph pages' })).toHaveCount(0);
  await page.getByLabel('Search glyphs').fill('u+4e0a');
  await expect(list.getByRole('listitem')).toHaveCount(1);
  await expect(list.getByRole('listitem')).toContainText('mark10');
  await page.getByLabel('Search glyphs').fill(String.fromCodePoint(0x4e05));
  await expect(list.getByRole('listitem')).toHaveCount(1);
  await expect(list.getByRole('listitem')).toContainText('mark5');
});

test('FNT-R06 previews each listed glyph from its parsed outline', async ({ page }) => {
  await loadFixture(page);
  const list = page.getByRole('list', { name: 'Font glyph coverage' });
  const items = list.getByRole('listitem');
  await expect(items).toHaveCount(2);
  for (const item of await items.all()) {
    const path = item.getByTestId('font-glyph-outline').locator('path');
    await expect(path).toHaveAttribute('d', /^M[\d.\- ]+L/);
  }
  const boxes = await list.getByTestId('font-glyph-outline').evaluateAll((nodes) => nodes.map((node) => (node as SVGSVGElement).querySelector('path')!.getBBox().width));
  expect(boxes.every((width) => width > 0)).toBe(true);
});

test('FNT-R07 previews source and subset fonts in the browser', async ({ page }) => {
  test.setTimeout(90_000);
  await loadFixture(page);
  const loadedFamilies = () => page.evaluate(() => [...document.fonts].filter((face) => face.status === 'loaded').map((face) => face.family.replace(/["']/g, '')));
  await expect.poll(loadedFamilies).toEqual(expect.arrayContaining([expect.stringMatching(/^InmoSource-/)]));
  const sourcePreview = page.locator('.notice', { hasText: 'Source font' }).locator('div');
  await expect(sourcePreview).toHaveCSS('font-family', /InmoSource-\d+/);
  await page.getByRole('button', { name: 'Build WOFF2 subset' }).click();
  await expect(page.getByTestId('font-metadata-comparison')).toBeVisible({ timeout: 60_000 });
  await expect.poll(loadedFamilies).toEqual(expect.arrayContaining([expect.stringMatching(/^InmoSubset-/)]));
  const subsetPreview = page.locator('.notice', { hasText: 'Generated subset' }).locator('div');
  await expect(subsetPreview).toHaveCSS('font-family', /InmoSubset-\d+/);
  await expect(subsetPreview).toHaveText('Hamburgefontsiv 0123456789');
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('FNT-R07 explains when the browser cannot load the font for preview', async ({ page }) => {
  await page.addInitScript(() => {
    const Original = window.FontFace;
    class FailingFontFace extends Original {
      load(): Promise<FontFace> { return Promise.reject(new Error('simulated decode failure')); }
    }
    window.FontFace = FailingFontFace as typeof FontFace;
  });
  await loadFixture(page);
  await expect(page.getByRole('alert')).toContainText('Source preview could not load: simulated decode failure. Inspection remains valid.');
  await page.getByRole('button', { name: 'Build WOFF2 subset' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Generated subset preview could not load' })).toContainText('simulated decode failure. The verified file remains available.');
  await expect(page.getByRole('button', { name: 'Download WOFF2', exact: true })).toBeVisible();
});

test('FNT-R11 downloads the WOFF2, the CSS with a compact unicode-range, and the ZIP bundle', async ({ page }) => {
  test.setTimeout(90_000);
  await loadFixture(page);
  await page.getByRole('button', { name: 'Build WOFF2 subset' }).click();
  await expect(page.getByTestId('font-metadata-comparison')).toBeVisible({ timeout: 60_000 });

  let pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download WOFF2', exact: true }).click();
  const woff2 = await pending;
  expect(woff2.suggestedFilename()).toBe('fixture-bold.subset.woff2');
  const woff2Bytes = await readDownload(woff2);
  expect(woff2Bytes.subarray(0, 4).toString('latin1')).toBe('wOF2');

  pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download CSS', exact: true }).click();
  const css = await pending;
  expect(css.suggestedFilename()).toBe('fixture-bold.subset.css');
  const cssText = (await readDownload(css)).toString('utf8');
  expect(cssText).toContain("src: url('./fixture-bold.subset.woff2') format('woff2');");
  expect(cssText).toContain('font-weight: 700;');
  expect(cssText).toContain('unicode-range: U+41-42;');

  pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download WOFF2 + CSS ZIP' }).click();
  const zip = await pending;
  expect(zip.suggestedFilename()).toBe('fixture-bold.subset.zip');
  const zipBytes = await readDownload(zip);
  expect(zipBytes.subarray(0, 2).toString('latin1')).toBe('PK');
  expect(zipBytes.includes(Buffer.from('fixture-bold.subset.woff2'))).toBe(true);
  expect(zipBytes.includes(Buffer.from('fixture-bold.subset.css'))).toBe(true);

  const loaded = await page.evaluate(async (bytes) => {
    const face = new FontFace('DownloadedSubset', new Uint8Array(bytes).buffer);
    await face.load();
    return face.status;
  }, [...woff2Bytes]);
  expect(loaded).toBe('loaded');
});

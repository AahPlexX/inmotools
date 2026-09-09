import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

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

  await page.getByRole('button', { name: 'Build WOFF2 subset' }).click();
  await expect(page.getByTestId('font-metadata-comparison')).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId('font-output-weight')).toHaveText('700');
  await expect(page.getByRole('button', { name: 'Download WOFF2' })).toBeVisible();

  await page.locator('#font-custom').fill('A');
  await expect(page.getByRole('button', { name: 'Download WOFF2' })).toHaveCount(0);
  await expect(page.getByText(/rebuild the subset before exporting/i)).toBeVisible();

  await page.getByLabel('Basic Latin').uncheck();
  await expect(page.getByTestId('font-retained-summary')).toContainText('1 requested · 1 present');
  await page.getByRole('button', { name: 'Build WOFF2 subset' }).click();
  await expect(page.getByRole('button', { name: 'Download WOFF2' })).toBeVisible({ timeout: 60_000 });

  await page.locator('#font-custom').fill('😀');
  await expect(page.getByTestId('font-retained-summary')).toContainText('1 requested · 0 present');
  await expect(page.getByRole('button', { name: 'Build WOFF2 subset' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Download WOFF2' })).toHaveCount(0);
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

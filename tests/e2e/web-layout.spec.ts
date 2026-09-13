import { expect, test } from '@playwright/test';

test('edits a layout and exports the same content, theme and metadata', async ({ page }) => {
  await page.goto('./#/tools/web-layout-studio');
  await expect(page.getByTestId('web-layout-studio')).toBeVisible();
  await page.getByLabel('Page heading', { exact: true }).fill('A school project');
  await page.getByLabel('Desktop columns').fill('4');
  const preview = page.frameLocator('iframe[title="Layout at 375 pixels"]');
  await expect(preview.getByRole('heading', { name: 'A school project' })).toBeVisible();
  await page.getByRole('button', { name: 'Theme', exact: true }).click();
  await page.getByLabel('Theme', { exact: true }).selectOption('dark');
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  await page.getByLabel('Author', { exact: true }).fill('School team');
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download HTML', exact: true }).last().click();
  const stream = await (await downloadPromise).createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(chunk as Buffer);
  const html = Buffer.concat(chunks).toString('utf8');
  expect(html).toContain('<title>A school project</title>');
  expect(html).toContain('content="School team"');
  expect(html).toContain('calc((100% - 3 * var(--space)) / 4)');
  expect(html).toContain('color-scheme:dark');
  expect(html).not.toContain('<script');
});

test('keeps preview cards readable with extreme spacing and column settings', async ({ page }) => {
  await page.goto('./#/tools/web-layout-studio');
  await page.getByLabel('Desktop columns').fill('12');
  await page.getByLabel('Gap (px)', { exact: true }).fill('120');
  await page.getByLabel('Stack below (px)').fill('320');
  await page.getByLabel('Stack below (px)').press('Tab');
  const frame = page.frameLocator('iframe[title="Layout at 375 pixels"]');
  await expect(frame.locator('.layout')).toHaveCSS('display', 'grid');
  const measurements = await frame.locator('body').evaluate(body => ({
    overflow: body.ownerDocument.documentElement.scrollWidth - body.ownerDocument.documentElement.clientWidth,
    cardWidths: Array.from(body.querySelectorAll('.block'), block => block.getBoundingClientRect().width),
  }));
  expect(measurements.overflow).toBeLessThanOrEqual(1);
  expect(measurements.cardWidths.every(width => width >= 192)).toBe(true);
});

test('restores a local draft and rejects invalid import without replacing work', async ({ page }) => {
  await page.goto('./#/tools/web-layout-studio');
  await page.getByLabel('Page heading', { exact: true }).fill('Keep this project');
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  await page.getByLabel('Autosave on this browser').check();
  await expect(page.getByText('Saved on this browser.', { exact: true })).toBeVisible();
  await page.getByLabel('Open a project backup').setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{"version":99}') });
  await expect(page.locator('.wl-studio > .status-line')).toContainText('Import failed:');
  await page.reload();
  await expect(page.getByLabel('Page heading', { exact: true })).toHaveValue('Keep this project');
});

test('reflows editing controls in portrait and landscape without page overflow', async ({ page }) => {
  for (const viewport of [{ width: 320, height: 568 }, { width: 844, height: 390 }, { width: 1920, height: 1080 }]) {
    await page.setViewportSize(viewport);
    await page.goto('./#/tools/web-layout-studio');
    await expect(page.getByTestId('web-layout-studio')).toBeVisible();
    for (const name of ['Build', 'Theme', 'Preview', 'Export']) {
      await page.getByRole('button', { name, exact: true }).click();
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
    }
  }
});


test('switches the preview presentation orientation without changing CSS width', async ({ page }) => {
  await page.goto('./#/tools/web-layout-studio');
  await page.getByRole('button', { name: 'Preview', exact: true }).click();
  await page.getByLabel('Preview orientation', { exact: true }).selectOption('landscape');
  await expect(page.locator('section[aria-label="375 pixel landscape preview"]')).toBeVisible();
  await expect(page.locator('iframe[title="Layout at 375 pixels, landscape"]')).toBeVisible();
});

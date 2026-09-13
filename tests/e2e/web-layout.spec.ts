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
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  await expect(page.getByLabel('Autosave on this browser')).toBeChecked();
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
  const frame = page.frameLocator('iframe[title="Layout at 375 pixels"]');
  expect(await frame.locator('body').evaluate(body => ({ width: body.ownerDocument.defaultView!.innerWidth, landscape: body.ownerDocument.defaultView!.matchMedia('(orientation: landscape)').matches }))).toEqual({ width: 375, landscape: true });
  await page.getByLabel('Preview orientation', { exact: true }).selectOption('portrait');
  expect(await frame.locator('body').evaluate(body => body.ownerDocument.defaultView!.matchMedia('(orientation: portrait)').matches)).toBe(true);
});

test('applies area drafts, rejects invalid shapes and reflows named layouts', async ({ page }) => {
  await page.goto('./#/tools/web-layout-studio');
  const editor = page.getByLabel('Named grid areas', { exact: true });
  await editor.fill('a a b\na a c');
  await page.getByRole('button', { name: 'Apply areas', exact: true }).click();
  const wide = page.frameLocator('iframe[title="Layout at 1440 pixels"]');
  await expect(wide.locator('.layout')).toHaveCSS('grid-template-areas', '"a a b" "a a c"');
  await editor.fill('a a b\na b b');
  await page.getByRole('button', { name: 'Apply areas', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('rectangle');
  await expect(wide.locator('.layout')).toHaveCSS('grid-template-areas', '"a a b" "a a c"');
  await page.getByLabel('Gap (px)', { exact: true }).fill('120');
  await page.getByLabel('Gap (px)', { exact: true }).press('Tab');
  for (const width of [375, 768, 1440]) {
    const body = page.frameLocator(`iframe[title="Layout at ${width} pixels"]`).locator('body');
    expect(await body.evaluate(node => node.ownerDocument.documentElement.scrollWidth - node.ownerDocument.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  }
});


test('preserves area drafts, accepts fractional spacing and keeps backups available with invalid metadata', async ({ page }) => {
  await page.goto('./#/tools/web-layout-studio');
  const areas = page.getByLabel('Named grid areas', { exact: true });
  await areas.fill('a a b\na a c');
  await page.getByLabel('Page heading', { exact: true }).fill('Preserved draft');
  await expect(areas).toHaveValue('a a b\na a c');
  await page.getByRole('button', { name: 'Theme', exact: true }).click();
  await page.getByRole('button', { name: 'Build', exact: true }).click();
  await expect(areas).toHaveValue('a a b\na a c');
  await page.getByLabel('Gap (px)', { exact: true }).fill('24.5');
  await page.getByLabel('Gap (px)', { exact: true }).press('Tab');
  await expect(page.getByLabel('Gap (px)', { exact: true })).toHaveValue('24.5');
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  await page.getByLabel('Canonical URL', { exact: true }).fill('invalid');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download Project', exact: true }).click();
  expect((await download).suggestedFilename()).toBe('web-layout.project.json');
});

test('retains preview interaction until manual refresh and offers actual-size custom viewports', async ({ page }) => {
  await page.goto('./#/tools/web-layout-studio');
  await page.getByRole('button', { name: 'Preview', exact: true }).click();
  await page.getByLabel('Refresh previews while editing', { exact: true }).uncheck();
  const frame = page.frameLocator('iframe[title="Layout at 375 pixels"]');
  await frame.getByLabel('Email address', { exact: true }).fill('test@example.com');
  await page.getByRole('button', { name: 'Build', exact: true }).click();
  await page.getByLabel('Page heading', { exact: true }).fill('Refresh me');
  await expect(frame.getByLabel('Email address', { exact: true })).toHaveValue('test@example.com');
  await page.getByRole('button', { name: 'Preview', exact: true }).click();
  await page.getByRole('button', { name: 'Refresh previews', exact: true }).click();
  await expect(frame.getByRole('heading', { name: 'Refresh me', exact: true })).toBeVisible();
  await page.getByLabel('Custom viewport width (px)', { exact: true }).fill('1280');
  await page.getByRole('button', { name: 'Add viewport', exact: true }).click();
  await page.getByLabel('Actual-size view (scroll inside each frame)', { exact: true }).check();
  await expect(page.locator('iframe[title="Layout at 1280 pixels"]')).toHaveCSS('transform', 'matrix(1, 0, 0, 1, 0, 0)');
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
});

test('authors tracks and metadata and restores a saved starter snapshot', async ({ page }) => {
  await page.goto('./#/tools/web-layout-studio');
  await page.getByText('Starters, snapshots and reusable pages', { exact: true }).click();
  await page.getByRole('button', { name: 'Portfolio starter', exact: true }).click();
  await expect(page.getByLabel('Page heading', { exact: true })).toHaveValue('Work with purpose');
  await page.getByLabel('Snapshot name', { exact: true }).fill('Before edits');
  await page.getByRole('button', { name: 'Save snapshot', exact: true }).click();
  await page.getByLabel('Page heading', { exact: true }).fill('Changed');
  await page.getByRole('button', { name: 'Compare with current', exact: true }).click();
  await expect(page.locator('pre').filter({ hasText: 'Saved: "Work with purpose"' })).toContainText('Current: "Changed"');
  await page.getByRole('button', { name: 'Restore snapshot', exact: true }).click();
  await expect(page.getByLabel('Page heading', { exact: true })).toHaveValue('Work with purpose');
  await page.getByText('Tracks, wrapping and reading direction', { exact: true }).click();
  await page.getByLabel('Custom grid tracks', { exact: true }).fill('1fr 2fr 1fr');
  await page.getByRole('button', { name: 'Apply tracks', exact: true }).click();
  await page.getByLabel('Text direction', { exact: true }).selectOption('rtl');
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  await page.getByText('Custom document and social metadata', { exact: true }).click();
  await page.getByLabel('Document title', { exact: true }).fill('Published portfolio');
  await page.getByLabel('Tags / keywords', { exact: true }).fill('design, portfolio');
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download HTML', exact: true }).last().click();
  const stream = await (await downloadPromise).createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(chunk as Buffer);
  const html = Buffer.concat(chunks).toString('utf8');
  expect(html).toContain('<title>Published portfolio</title>');
  expect(html).toContain('dir="rtl"');
  expect(html).toContain('grid-template-columns:1fr 2fr 1fr');
  expect(html).toContain('name="keywords" content="design, portfolio"');
});

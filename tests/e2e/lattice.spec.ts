import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const SAMPLE = JSON.stringify({
  orderId: 8921,
  status: 'paid',
  email: 'buyer@example.com',
  items: [
    { sku: 'A1', qty: 2 },
    { sku: 'B4', qty: 5 },
  ],
}, null, 2);

const setSource = async (page: Parameters<typeof test>[0] extends never ? never : any, value: string) => {
  const editor = page.locator('[aria-label="JSON Lattice source"]');
  await expect(editor).toBeVisible();
  await editor.fill(value);
};

test('JSON Lattice catalog link, exact alias, and generic route open the same local workspace', async ({ page }) => {
  await page.goto('./#/');
  const catalogLink = page.getByRole('link', { name: /JSON Lattice Studio/ });
  await expect(catalogLink).toBeVisible();
  await expect(catalogLink).toHaveAttribute('href', '#/tools/json-lattice');
  await catalogLink.click();
  await expect(page.getByTestId('json-lattice-studio')).toBeVisible();

  await page.goto('./#/json-lattice');
  await expect(page.getByTestId('suite-title')).toContainText('JSON Lattice Studio');
  await expect(page.getByTestId('json-lattice-studio')).toBeVisible();
  await expect(page.getByLabel('Input format')).toHaveValue('json');
  await expect(page.getByTestId('privacy-status')).toContainText(/local|browser|device/i);

  await page.goto('./#/tools/json-lattice');
  await expect(page.getByTestId('json-lattice-studio')).toBeVisible();
});

test('edits bidirectionally, searches, collapses subtrees, and supports undo/redo', async ({ page }) => {
  await page.goto('./#/json-lattice');
  await setSource(page, SAMPLE);
  await expect(page.getByTestId('visible-node-count')).toHaveText('11');
  await expect(page.locator('[data-node-path="/status"]')).toContainText('paid');

  await page.getByLabel('Search graph').fill('paid');
  await expect(page.getByTestId('search-match-count')).toHaveText('1');

  await page.getByRole('button', { name: 'Collapse /items', exact: true }).click();
  await expect(page.getByTestId('visible-node-count')).toHaveText('5');
  await page.getByRole('button', { name: 'Expand /items', exact: true }).click();
  await expect(page.getByTestId('visible-node-count')).toHaveText('11');

  await page.locator('[data-node-path="/status"]').dblclick();
  const inlineEditor = page.getByLabel('Edit /status value');
  await inlineEditor.fill('refunded');
  await inlineEditor.press('Enter');
  await expect(page.locator('[data-node-path="/status"]')).toContainText('refunded');
  await expect(page.locator('[aria-label="JSON Lattice source"]')).toContainText('refunded');

  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.locator('[data-node-path="/status"]')).toContainText('paid');
  await page.getByRole('button', { name: 'Redo' }).click();
  await expect(page.locator('[data-node-path="/status"]')).toContainText('refunded');
});

test('provides privacy, diff, schema, JSONPath, and local DuckDB query workflows', async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto('./#/json-lattice');
  await setSource(page, SAMPLE);

  const privacy = page.getByRole('button', { name: 'Privacy Shield' });
  await privacy.click();
  await expect(privacy).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('privacy-summary')).not.toHaveText('0 protected values');
  await expect(page.locator('[data-node-path="/email"]')).toContainText(/REDACTED_EMAIL|mock/i);
  await expect(page.locator('[aria-label="JSON Lattice source"]')).toContainText('buyer@example.com');

  await page.getByRole('button', { name: 'Diff Mode' }).click();
  await page.getByLabel('Comparison JSON').fill(JSON.stringify({ orderId: 8921, status: 'failed', items: [] }, null, 2));
  await expect(page.getByTestId('diff-summary')).toContainText(/modified|deleted/i);

  await page.locator('details').filter({ hasText: 'Schema generator' }).locator('summary').click();
  await page.getByLabel('Schema target').selectOption('typescript');
  await expect(page.getByTestId('schema-output')).toContainText('export interface Root');

  await page.locator('details').filter({ hasText: 'JSONPath & DuckDB' }).locator('summary').click();
  await page.getByLabel('JSONPath query').fill('$.items[*].sku');
  await page.getByRole('button', { name: 'Run JSONPath' }).click();
  await expect(page.getByTestId('query-summary')).toContainText('2 matches');

  await page.getByLabel('SQL query').fill("SELECT path, value_text FROM json_tree WHERE key = 'status'");
  await page.getByRole('button', { name: 'Run SQL' }).click();
  await expect(page.getByTestId('sql-results')).toContainText('/status', { timeout: 30_000 });
  await expect(page.getByTestId('sql-results')).toContainText('paid');
});

test('blocks exports while source edits are pending or invalid instead of exporting the last valid revision', async ({ page }) => {
  await page.goto('./#/json-lattice');
  await setSource(page, SAMPLE);
  await expect(page.getByTestId('visible-node-count')).toHaveText('11');
  await expect(page.getByTestId('revision-status')).toContainText(/current|synced/i);

  const normalizedExports = ['Export SVG', 'Export PNG', 'Export JPEG', 'Export CSV', 'Export JSON', 'Export YAML', 'Export TOML', 'Export protected JSON'];
  const editor = page.locator('[aria-label="JSON Lattice source"]');
  await editor.fill('{"status":"pending"}');
  await expect(page.getByTestId('revision-status')).toContainText(/pending|uncommitted/i);
  for (const name of normalizedExports) await expect(page.getByRole('button', { name })).toBeDisabled();
  const rawExport = page.getByRole('button', { name: 'Export raw source' });
  await expect(rawExport).toBeEnabled();

  await expect(page.getByTestId('revision-status')).toContainText(/current|synced/i, { timeout: 2_000 });
  await expect(page.getByRole('button', { name: 'Export JSON' })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Export protected JSON' })).toBeEnabled();

  await editor.fill('{');
  await expect(page.getByTestId('revision-status')).toContainText(/invalid/i, { timeout: 2_000 });
  for (const name of normalizedExports) await expect(page.getByRole('button', { name })).toBeDisabled();
  await expect(rawExport).toBeEnabled();
  const rawDownload = page.waitForEvent('download');
  await rawExport.click();
  expect((await rawDownload).suggestedFilename()).toBe('json-lattice-source.json');
});

test('exposes local vector/raster/data exports without serious accessibility or overflow defects', async ({ page }) => {
  await page.goto('./#/json-lattice');
  await setSource(page, SAMPLE);

  for (const name of ['Export SVG', 'Export PNG', 'Export JPEG', 'Export CSV', 'Export JSON', 'Export YAML', 'Export TOML', 'Export raw source']) {
    await expect(page.getByRole('button', { name })).toBeVisible();
  }

  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export SVG' }).click();
  expect((await download).suggestedFilename()).toBe('json-lattice.svg');

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);

  const results = await new AxeBuilder({ page }).analyze();
  const severe = results.violations.filter((violation) => violation.impact === 'serious' || violation.impact === 'critical');
  expect(severe).toEqual([]);
});

test('reflows after real content load in phone portrait, phone landscape, and tablet viewports', async ({ page }) => {
  const viewports = [
    { width: 390, height: 844 },
    { width: 844, height: 390 },
    { width: 768, height: 1024 },
  ];
  const longKey = 'extremely-long-property-key-'.repeat(30);
  const longValue = 'extremely-long-value-token-'.repeat(40);

  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    await page.goto('./#/json-lattice');
    await setSource(page, JSON.stringify({ [longKey]: longValue, nested: { status: 'loaded' } }, null, 2));
    await expect(page.getByTestId('revision-status')).toContainText(/current|synced/i, { timeout: 2_000 });
    await expect(page.locator(`[data-node-path="/${longKey}"]`)).toBeVisible();
    const documentOverflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(documentOverflow).toBeLessThanOrEqual(1);
    await expect(page.getByRole('button', { name: 'Export raw source' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Export JSON' })).toBeVisible();
  }
});

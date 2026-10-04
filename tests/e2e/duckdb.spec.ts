import { expect, test } from '@playwright/test';

const csv = Buffer.from('category,value\na,1\na,2\nb,3\n');

test('queries local files losslessly with bounded capture, types, history, export, schema, and removal', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('./#/tools/duckdb-workbench');
  await page.getByLabel('Choose data files').setInputFiles({ name: 'data.csv', mimeType: 'text/csv', buffer: csv });
  await expect(page.getByText(/data\.csv.*ready/i)).toBeVisible({ timeout: 45_000 });

  const editor = page.getByRole('textbox', { name: 'SQL query', exact: true });
  await editor.fill(`SELECT sum(value) AS total FROM 'data.csv'`);
  await page.getByRole('button', { name: 'Run query' }).click();
  await expect(page.getByRole('cell', { name: '6' })).toBeVisible({ timeout: 45_000 });
  await expect(page.getByTestId('duckdb-result-metadata')).toContainText('total:');
  await expect(page.getByLabel('Query history')).toContainText("SELECT sum(value) AS total FROM 'data.csv'");

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export captured CSV' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/query-result\.csv$/);

  await editor.fill('SELECT 123.45::DECIMAL(5,2) AS amount, 9007199254740993::BIGINT AS exact_value, 1 AS duplicate, 2 AS duplicate');
  await page.getByRole('button', { name: 'Run query' }).click();
  await expect(page.getByRole('cell', { name: '123.45', exact: true })).toBeVisible({ timeout: 45_000 });
  await expect(page.getByRole('cell', { name: '9007199254740993', exact: true })).toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'duplicate', exact: true })).toHaveCount(2);
  await expect(page.getByRole('cell', { name: '1', exact: true })).toBeVisible();
  await expect(page.getByRole('cell', { name: '2', exact: true })).toBeVisible();

  await editor.fill("SELECT [1,2] AS items, {'name':'Ada','active':true} AS profile, NULL AS missing");
  await page.getByRole('button', { name: 'Run query' }).click();
  await expect(page.getByRole('cell', { name: '[1,2]', exact: true })).toBeVisible({ timeout: 45_000 });
  await expect(page.getByRole('cell', { name: '{\"name\":\"Ada\",\"active\":true}', exact: true })).toBeVisible();
  await expect(page.getByLabel('NULL')).toBeVisible();

  await page.getByLabel('Maximum captured rows').selectOption('1000');
  await editor.fill('SELECT i AS value FROM range(0, 1005) t(i)');
  await page.getByRole('button', { name: 'Run query' }).click();
  await expect(page.getByText(/1,000 rows captured.*Result incomplete.*1,000-row capture limit/)).toBeVisible({ timeout: 45_000 });
  await expect(page.getByTestId('duckdb-result-metadata')).toContainText('Incomplete capture');
  await expect(page.getByTestId('duckdb-results-range')).toContainText(/Rows 1–200 of 1,?000/);
  await page.getByLabel('Search displayed rows').fill('999');
  await expect(page.getByText('1 of 1,000 captured rows match.')).toBeVisible();
  await expect(page.getByRole('cell', { name: '999', exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Schema' }).click();
  await expect(page.getByText(/Schema for data\.csv:/)).toBeVisible({ timeout: 45_000 });
  await page.getByRole('button', { name: 'Remove' }).click();
  await expect(page.getByText('data.csv removed from the local DuckDB filesystem.')).toBeVisible();
});

async function streamText(download: import('@playwright/test').Download) {
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString('utf8');
}

async function openWorkbench(page: import('@playwright/test').Page) {
  await page.goto('./#/tools/duckdb-workbench');
  return {
    files: page.getByLabel('Choose data files'),
    editor: page.getByRole('textbox', { name: 'SQL query', exact: true }),
    run: page.getByRole('button', { name: 'Run query' }),
    status: page.locator('.workspace-body .status-line[role="status"]'),
  };
}

test('DDB-R02 a second selection keeps the first file and a same-name selection replaces it', async ({ page }) => {
  test.setTimeout(120_000);
  const { files, editor, run, status } = await openWorkbench(page);
  await files.setInputFiles({ name: 'data.csv', mimeType: 'text/csv', buffer: csv });
  await expect(status).toContainText('data.csv ready in the local DuckDB workspace. 1 file registered.', { timeout: 45_000 });
  await files.setInputFiles({ name: 'other.csv', mimeType: 'text/csv', buffer: Buffer.from('label\nsecond\n') });
  await expect(status).toContainText('other.csv ready in the local DuckDB workspace. 2 files registered.', { timeout: 45_000 });
  await expect(page.getByRole('button', { name: 'Schema' })).toHaveCount(2);

  await editor.fill(`SELECT (SELECT sum(value) FROM 'data.csv') AS first_total, (SELECT label FROM 'other.csv') AS second_label`);
  await run.click();
  await expect(page.getByRole('cell', { name: '6', exact: true })).toBeVisible({ timeout: 45_000 });
  await expect(page.getByRole('cell', { name: 'second', exact: true })).toBeVisible();

  await files.setInputFiles({ name: 'data.csv', mimeType: 'text/csv', buffer: Buffer.from('category,value\nz,40\nz,2\n') });
  await expect(status).toContainText('data.csv ready in the local DuckDB workspace. 2 files registered.', { timeout: 45_000 });
  await expect(page.getByRole('button', { name: 'Schema' })).toHaveCount(2);
  await editor.fill(`SELECT sum(value) AS total, count(*) AS row_count FROM 'data.csv'`);
  await run.click();
  await expect(page.getByRole('cell', { name: '42', exact: true })).toBeVisible({ timeout: 45_000 });
  await expect(page.getByRole('cell', { name: '2', exact: true })).toBeVisible();
});

test('DDB-R03 choosing one file fills the editor with an escaped starter query', async ({ page }) => {
  test.setTimeout(120_000);
  const { files, editor, run, status } = await openWorkbench(page);
  await files.setInputFiles({ name: "o'brien.csv", mimeType: 'text/csv', buffer: csv });
  await expect(status).toContainText("o'brien.csv ready", { timeout: 45_000 });
  await expect(editor).toHaveValue("SELECT * FROM 'o''brien.csv' LIMIT 100");
  await run.click();
  await expect(status).toContainText('Query complete: 3 rows captured.', { timeout: 45_000 });
  await expect(page.getByRole('cell', { name: 'b', exact: true })).toBeVisible();
});

test('DDB-R05 Ctrl+Enter and Cmd+Enter run the query from the editor', async ({ page }) => {
  test.setTimeout(120_000);
  const { files, editor, status } = await openWorkbench(page);
  await files.setInputFiles({ name: 'data.csv', mimeType: 'text/csv', buffer: csv });
  await expect(status).toContainText('data.csv ready', { timeout: 45_000 });
  await editor.fill('SELECT 41 + 1 AS answer');
  await editor.press('Control+Enter');
  await expect(page.getByRole('cell', { name: '42', exact: true })).toBeVisible({ timeout: 45_000 });
  await editor.fill('SELECT 7 * 6 + 1 AS answer');
  await editor.press('Meta+Enter');
  await expect(page.getByRole('cell', { name: '43', exact: true })).toBeVisible({ timeout: 45_000 });
  await expect(editor).toHaveValue('SELECT 7 * 6 + 1 AS answer');
});

test('DDB-R06 Cancel stops a running query, reports it, and the workspace stays usable', async ({ page }) => {
  test.setTimeout(120_000);
  const { files, editor, run, status } = await openWorkbench(page);
  await files.setInputFiles({ name: 'data.csv', mimeType: 'text/csv', buffer: csv });
  await expect(status).toContainText('data.csv ready', { timeout: 45_000 });
  await editor.fill('SELECT count(*) AS n FROM range(0, 100000000000) a(i)');
  await run.click();
  const cancel = page.getByRole('button', { name: 'Cancel query' });
  await expect(cancel).toBeEnabled({ timeout: 45_000 });
  await cancel.click();
  await expect(status).toHaveText('Query cancelled.', { timeout: 45_000 });
  await expect(cancel).toBeDisabled();
  await expect(page.getByTestId('duckdb-result-metadata')).toHaveCount(0);
  await editor.fill('SELECT 5 AS after_cancel');
  await run.click();
  await expect(page.getByRole('cell', { name: '5', exact: true })).toBeVisible({ timeout: 45_000 });
});

test('DDB-R07 capture stops before 32 MiB and is labeled incomplete', async ({ page }) => {
  test.setTimeout(120_000);
  const { files, editor, run, status } = await openWorkbench(page);
  await files.setInputFiles({ name: 'data.csv', mimeType: 'text/csv', buffer: csv });
  await expect(status).toContainText('data.csv ready', { timeout: 45_000 });
  await page.getByLabel('Maximum captured rows').selectOption('1000');
  await editor.fill("SELECT repeat('x', 100000) AS payload FROM range(0, 600) t(i)");
  await run.click();
  await expect(status).toContainText(/Query complete: \d+ rows captured\. Result incomplete: stopped before exceeding the 32 MiB capture limit\./, { timeout: 60_000 });
  const captured = Number((await status.textContent())?.match(/complete: (\d+) rows/)?.[1]);
  expect(captured).toBeGreaterThan(300);
  expect(captured).toBeLessThan(600);
  await expect(page.getByTestId('duckdb-result-metadata')).toContainText('Incomplete capture');
});

test('DDB-R13 a value longer than 120 characters is shortened and opens in full', async ({ page }) => {
  test.setTimeout(120_000);
  const { files, editor, run, status } = await openWorkbench(page);
  await files.setInputFiles({ name: 'data.csv', mimeType: 'text/csv', buffer: csv });
  await expect(status).toContainText('data.csv ready', { timeout: 45_000 });
  const long = `${'a'.repeat(130)}END`;
  await editor.fill(`SELECT '${long}' AS long_text, 'short' AS short_text`);
  await run.click();
  const shortened = page.getByRole('button', { name: `${'a'.repeat(117)}…`, exact: true });
  await expect(shortened).toBeVisible({ timeout: 45_000 });
  await expect(page.getByText(long, { exact: true })).toHaveCount(0);
  await expect(page.getByRole('cell', { name: 'short', exact: true })).toBeVisible();
  await shortened.click();
  await expect(page.locator('.notice pre')).toHaveText(long);
  await expect(page.locator('.notice', { has: page.locator('pre') }).locator('strong')).toHaveText('long_text');
});

test('DDB-R14 a query chosen from history fills the editor', async ({ page }) => {
  test.setTimeout(120_000);
  const { files, editor, run, status } = await openWorkbench(page);
  await files.setInputFiles({ name: 'data.csv', mimeType: 'text/csv', buffer: csv });
  await expect(status).toContainText('data.csv ready', { timeout: 45_000 });
  for (let index = 1; index <= 13; index += 1) {
    await editor.fill(`SELECT ${index} AS q`);
    await run.click();
    await expect(status).toContainText('Query complete: 1 row captured.', { timeout: 45_000 });
  }
  await editor.fill('SELECT 13 AS q');
  await run.click();
  await expect(status).toContainText('Query complete: 1 row captured.', { timeout: 45_000 });
  const history = page.getByLabel('Query history');
  const options = history.locator('option:not([value=""])');
  await expect(options).toHaveCount(12);
  await expect(options.first()).toHaveText('SELECT 13 AS q');
  await expect(options.last()).toHaveText('SELECT 2 AS q');
  await expect(history.locator('option', { hasText: 'SELECT 13 AS q' })).toHaveCount(1);
  await editor.fill('');
  await history.selectOption('SELECT 5 AS q');
  await expect(editor).toHaveValue('SELECT 5 AS q');
});

test('DDB-R18 JSON export contains columns, types, rows and completeness', async ({ page }) => {
  test.setTimeout(120_000);
  const { files, editor, run, status } = await openWorkbench(page);
  await files.setInputFiles({ name: 'data.csv', mimeType: 'text/csv', buffer: csv });
  await expect(status).toContainText('data.csv ready', { timeout: 45_000 });
  await editor.fill(`SELECT category, sum(value) AS total FROM 'data.csv' GROUP BY category ORDER BY category`);
  await run.click();
  await expect(status).toContainText('Query complete: 2 rows captured. Complete result captured.', { timeout: 45_000 });
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export captured JSON' }).click();
  expect((await download).suggestedFilename()).toBe('query-result.json');
  const exported = JSON.parse(await streamText(await download));
  expect(Object.keys(exported)).toEqual(expect.arrayContaining(['columns', 'types', 'rows', 'complete']));
  expect(exported.columns).toEqual(['category', 'total']);
  expect(exported.types).toHaveLength(2);
  expect(exported.types.every((type: unknown) => typeof type === 'string' && type !== 'unknown')).toBe(true);
  expect(exported.rows).toEqual([['a', expect.anything()], ['b', expect.anything()]]);
  expect(exported.rows.map((row: unknown[]) => String(row[1]))).toEqual(['3', '3']);
  expect(exported.complete).toBe(true);
  expect(exported.limitedBy).toBeNull();
});

test('DDB-R19 invalid SQL and an unreadable file report the reason and the workspace stays usable', async ({ page }) => {
  test.setTimeout(120_000);
  await page.addInitScript(() => {
    const original = File.prototype.arrayBuffer;
    File.prototype.arrayBuffer = function arrayBuffer(this: File) {
      if (this.name === 'locked.csv') return Promise.reject(new DOMException('The file could not be read.', 'NotReadableError'));
      return original.call(this);
    };
  });
  const { files, editor, run, status } = await openWorkbench(page);
  await files.setInputFiles({ name: 'locked.csv', mimeType: 'text/csv', buffer: csv });
  await expect(status).toHaveText('Could not open data locally: The file could not be read.', { timeout: 45_000 });
  await files.setInputFiles({ name: 'data.csv', mimeType: 'text/csv', buffer: csv });
  await expect(status).toContainText('data.csv ready in the local DuckDB workspace. 1 file registered.', { timeout: 45_000 });

  await editor.fill('SELEC broken FROM nowhere');
  await run.click();
  await expect(status).toContainText(/^Query failed: .*syntax error/i, { timeout: 45_000 });
  await expect(page.getByRole('button', { name: 'Run query' })).toBeEnabled();
  await editor.fill(`SELECT sum(value) AS total FROM 'data.csv'`);
  await run.click();
  await expect(page.getByRole('cell', { name: '6', exact: true })).toBeVisible({ timeout: 45_000 });
});

for (const width of [320, 375, 768, 1024, 1440, 1920, 2560]) {
  test(`DDB-R22 lays out without horizontal overflow at ${width} px`, async ({ page, isMobile }) => {
    test.skip(isMobile, 'viewport matrix runs on the desktop project');
    test.setTimeout(120_000);
    await page.setViewportSize({ width, height: width < 800 ? 800 : 1000 });
    const { files, editor, run, status } = await openWorkbench(page);
    await files.setInputFiles({ name: 'a-rather-long-file-name-for-layout-checks.csv', mimeType: 'text/csv', buffer: csv });
    await expect(status).toContainText('ready', { timeout: 45_000 });
    await editor.fill(`SELECT category, value, '${'w'.repeat(200)}' AS wide FROM 'a-rather-long-file-name-for-layout-checks.csv'`);
    await run.click();
    await expect(page.getByTestId('duckdb-result-metadata')).toBeVisible({ timeout: 45_000 });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
    for (const name of ['Run query', 'Cancel query', 'Export captured CSV', 'Export captured JSON', 'Schema', 'Remove']) {
      const box = await page.getByRole('button', { name, exact: true }).boundingBox();
      expect(box && box.x >= 0 && box.x + box.width <= width + 1, `${name} inside viewport at ${width}px`).toBe(true);
    }
    for (const label of ['SQL query', 'Maximum captured rows', 'Query history', 'Search displayed rows']) {
      const box = await page.getByLabel(label, { exact: true }).boundingBox();
      expect(box && box.x >= 0 && box.x + box.width <= width + 1, `${label} inside viewport at ${width}px`).toBe(true);
    }
  });
}

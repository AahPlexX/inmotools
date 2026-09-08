import { expect, test } from '@playwright/test';

const csv = Buffer.from('category,value\na,1\na,2\nb,3\n');

test('queries local files losslessly with pagination, search, export, schema, and removal', async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto('./#/tools/duckdb-workbench');
  await page.getByLabel('Choose data files').setInputFiles({ name: 'data.csv', mimeType: 'text/csv', buffer: csv });
  await expect(page.getByText(/data\.csv.*ready/i)).toBeVisible({ timeout: 45_000 });

  const editor = page.getByRole('textbox', { name: 'SQL query', exact: true });
  await editor.fill(`SELECT sum(value) AS total FROM 'data.csv'`);
  await page.getByRole('button', { name: 'Run query' }).click();
  await expect(page.getByRole('cell', { name: '6' })).toBeVisible({ timeout: 45_000 });

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export full CSV' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/query-result\.csv$/);

  await editor.fill('SELECT 9007199254740993::BIGINT AS exact_value, 1 AS duplicate, 2 AS duplicate');
  await page.getByRole('button', { name: 'Run query' }).click();
  await expect(page.getByRole('cell', { name: '9007199254740993', exact: true })).toBeVisible({ timeout: 45_000 });
  await expect(page.getByRole('columnheader', { name: 'duplicate', exact: true })).toHaveCount(2);
  await expect(page.getByRole('cell', { name: '1', exact: true })).toBeVisible();
  await expect(page.getByRole('cell', { name: '2', exact: true })).toBeVisible();

  await editor.fill('SELECT i AS value FROM range(0, 205) t(i)');
  await page.getByRole('button', { name: 'Run query' }).click();
  await expect(page.getByTestId('duckdb-results-range')).toContainText('Rows 1–200 of 205', { timeout: 45_000 });
  await page.getByLabel('Search displayed rows').fill('204');
  await expect(page.getByText('1 of 205 rows match.')).toBeVisible();
  await expect(page.getByRole('cell', { name: '204', exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Schema' }).click();
  await expect(page.getByText(/Schema for data\.csv:/)).toBeVisible({ timeout: 45_000 });
  await page.getByRole('button', { name: 'Remove' }).click();
  await expect(page.getByText('data.csv removed from the local DuckDB filesystem.')).toBeVisible();
});

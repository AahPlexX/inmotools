import { expect, test } from '@playwright/test';

const csv = Buffer.from('category,value\na,1\na,2\nb,3\n');

test('queries a local CSV and exports the result without upload', async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto('./#/tools/duckdb-workbench');
  await page.getByLabel('Choose data files').setInputFiles({ name: 'data.csv', mimeType: 'text/csv', buffer: csv });
  await expect(page.getByText(/data\.csv.*ready/i)).toBeVisible({ timeout: 45_000 });

  const editor = page.getByRole('textbox', { name: 'SQL query', exact: true });
  await editor.fill(`SELECT sum(value) AS total FROM 'data.csv'`);
  await page.getByRole('button', { name: 'Run query' }).click();
  await expect(page.getByRole('cell', { name: '6' })).toBeVisible({ timeout: 45_000 });

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export CSV' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/query-result\.csv$/);
});

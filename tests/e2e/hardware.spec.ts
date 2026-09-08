import { expect, test } from '@playwright/test';

test('simulator exercises framing, rules, filtering, counters, and retained export without hardware', async ({ page }) => {
  await page.goto('./#/tools/hardware-packet-inspector');

  await page.getByLabel('Simulator scenario').selectOption('unicode-split');
  await page.getByRole('button', { name: 'Run simulator scenario' }).click();
  await expect(page.getByTestId('packet-stream')).toContainText('price=10€ status=OK');
  await expect(page.getByTestId('packet-stream')).toContainText('[ok]');

  await page.getByLabel('Simulator scenario').selectOption('error-burst');
  await page.getByRole('button', { name: 'Run simulator scenario' }).click();
  await expect(page.getByTestId('packet-stream')).toContainText('[error]');

  await page.getByLabel('Search capture').fill('ERROR');
  await expect(page.getByTestId('packet-stream')).toContainText('status=ERROR');
  await expect(page.getByTestId('packet-stream')).not.toContainText('price=10€');

  await page.getByRole('button', { name: 'Add parsing rule' }).click();
  await page.getByLabel('Rule 3 label').fill('sensor');
  await page.getByLabel('Rule 3 pattern').fill('sensor=');
  await expect(page.getByRole('cell', { name: 'Valid', exact: true })).toHaveCount(3);

  await page.getByLabel('Search capture').fill('');
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export retained CSV' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('packet-capture.csv');
  await expect(page.locator('.status-line')).toContainText(/Exported .* retained capture entr/);
});

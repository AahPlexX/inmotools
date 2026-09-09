import { expect, test } from '@playwright/test';

async function downloadText(download: import('@playwright/test').Download) {
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString('utf8');
}

test('keeps a fixed reference instant across rerenders and exports a finite calendar snapshot', async ({ page }) => {
  await page.goto('./#/tools/cron-team-matrix');
  await page.getByLabel('Cron expression').fill('17 * * * * *');
  await page.getByLabel('Runs to project').fill('3');
  await page.getByLabel('Calculate from').fill('2026-09-09T12:00:00Z');

  await expect(page.getByTestId('cron-first-instant')).toHaveText('2026-09-09T12:00:17.000Z');
  await expect(page.getByTestId('cron-reference-value')).toHaveText('2026-09-09T12:00:00.000Z');

  const csvPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export matrix CSV' }).click();
  expect(await downloadText(await csvPromise)).toContain('2026-09-09T12:00:17.000Z');
  await expect(page.getByTestId('cron-first-instant')).toHaveText('2026-09-09T12:00:17.000Z');
  await expect(page.getByTestId('cron-reference-value')).toHaveText('2026-09-09T12:00:00.000Z');

  const calendarPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export finite calendar (.ics)' }).click();
  const calendar = await downloadText(await calendarPromise);
  expect(calendar.match(/BEGIN:VEVENT/g)).toHaveLength(3);
  expect(calendar).toContain('DTSTART:20260909T120017Z');
  expect(calendar).not.toContain('RRULE');
});

test('discovers supported timezones, reports offset changes, and labels working hours in text', async ({ page }) => {
  await page.goto('./#/tools/cron-team-matrix');
  await page.getByLabel('Find a timezone').fill('Tokyo');
  const tokyo = page.getByTestId('timezone-search-results').getByRole('button', { name: 'Asia/Tokyo' });
  await expect(tokyo).toBeVisible();
  await tokyo.click();
  await expect(page.getByRole('columnheader', { name: 'Asia/Tokyo' })).toBeVisible();

  await page.getByLabel('Source timezone').fill('America/New_York');
  await page.getByLabel('Calculate from').fill('2026-01-01T00:00:00Z');
  await expect(page.getByTestId('cron-offset-transitions')).toContainText('UTC−05:00 → UTC−04:00');

  await page.getByLabel('Cron expression').fill('0 14 * * *');
  await page.getByLabel('Calculate from').fill('2026-01-05T00:00:00Z');
  const firstRow = page.getByTestId('cron-runs').locator('tbody tr').first();
  await expect(firstRow).toContainText(/working hours|outside working hours/);
  await expect(firstRow.locator('[data-working-hours]')).not.toHaveCount(0);
});

test('diagnoses invalid source and comparison timezones without unmounting', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('./#/tools/cron-team-matrix');

  await page.getByLabel('Source timezone').fill('Mars/Olympus');
  await expect(page.locator('.status-line.error')).toContainText('not a timezone this browser recognizes');
  await page.getByLabel('Source timezone').fill('UTC');
  await page.getByLabel('Comparison timezones').fill('UTC\nMars/Olympus\nAsia/Tokyo');
  await expect(page.getByTestId('invalid-zones')).toContainText('Mars/Olympus');
  await expect(page.getByRole('columnheader', { name: 'Asia/Tokyo' })).toBeVisible();
  expect(errors).toEqual([]);
});

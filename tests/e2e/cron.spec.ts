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

test('CRN-R03 an invalid cron expression shows a plain error and the workspace stays usable', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('./#/tools/cron-team-matrix');
  await page.getByLabel('Calculate from').fill('2026-01-05T00:00:00Z');

  await page.getByLabel('Cron expression').fill('61 * * * *');
  await expect(page.locator('.status-line.error')).toHaveText('Constraint error, got value 61 expected range 0-59');
  await expect(page.getByTestId('cron-runs')).toHaveCount(0);
  await page.getByLabel('Cron expression').fill('not a cron');
  await expect(page.locator('.status-line.error')).toHaveText('Invalid characters, got value: a');

  await page.getByLabel('Cron expression').fill('0 9 * * *');
  await page.getByLabel('Runs to project').fill('2');
  await expect(page.getByTestId('cron-first-instant')).toHaveText('2026-01-05T09:00:00.000Z');
  await expect(page.getByTestId('cron-runs').locator('tbody tr')).toHaveCount(2);
  expect(errors).toEqual([]);
});

test('CRN-R09 the source timezone is always a matrix column', async ({ page }) => {
  await page.goto('./#/tools/cron-team-matrix');
  const headers = page.getByTestId('cron-runs').locator('thead th');
  await page.getByLabel('Source timezone').fill('Asia/Tokyo');

  await page.getByLabel('Comparison timezones').fill('Europe/London, America/Chicago');
  await expect(headers).toHaveText(['Run', 'UTC instant', 'Asia/Tokyo', 'Europe/London', 'America/Chicago']);
  await page.getByLabel('Comparison timezones').fill('');
  await expect(headers).toHaveText(['Run', 'UTC instant', 'Asia/Tokyo']);
  await page.getByLabel('Comparison timezones').fill('Europe/London\nAsia/Tokyo');
  await expect(headers).toHaveText(['Run', 'UTC instant', 'Asia/Tokyo', 'Europe/London']);
  await page.getByLabel('Comparison timezones').fill('Mars/Olympus');
  await expect(headers).toHaveText(['Run', 'UTC instant', 'Asia/Tokyo']);
});

test('CRN-R14 the 24-hour distribution counts runs per source-zone hour', async ({ page }) => {
  await page.goto('./#/tools/cron-team-matrix');
  const distribution = page.getByLabel('24-hour run distribution').locator('.metric');
  const counts = () => distribution.evaluateAll((items) => Object.fromEntries(items.map((item) => [item.querySelector('span')?.textContent, Number(item.querySelector('strong')?.textContent)])));
  await page.getByLabel('Cron expression').fill('0 9,14 * * *');
  await page.getByLabel('Runs to project').fill('7');
  await page.getByLabel('Calculate from').fill('2026-01-05T00:00:00Z');
  await expect(page.getByTestId('cron-runs').locator('tbody tr')).toHaveCount(7);

  await expect(distribution).toHaveCount(24);
  const utc = await counts();
  expect(utc['09:00']).toBe(4);
  expect(utc['14:00']).toBe(3);
  expect(Object.values(utc).reduce((sum, value) => sum + value, 0)).toBe(7);

  await page.getByLabel('Source timezone').fill('Asia/Kolkata');
  await expect(page.getByTestId('cron-first-instant')).toHaveText('2026-01-05T03:30:00.000Z');
  const kolkata = await counts();
  expect(kolkata['09:00']).toBe(4);
  expect(kolkata['14:00']).toBe(3);
  expect(Object.values(kolkata).reduce((sum, value) => sum + value, 0)).toBe(7);
});

test('CRN-R15 the run table is paged at 50 rows per page', async ({ page }) => {
  await page.goto('./#/tools/cron-team-matrix');
  await page.getByLabel('Cron expression').fill('0 * * * *');
  await page.getByLabel('Calculate from').fill('2026-01-05T00:00:00Z');
  await page.getByLabel('Runs to project').fill('120');
  const rows = page.getByTestId('cron-runs').locator('tbody tr');

  await expect(rows).toHaveCount(50);
  await expect(page.getByTestId('cron-runs-range')).toHaveText('Rows 1–50 of 120 · page 1 of 3');
  await expect(rows.first().locator('td').first()).toHaveText('1');
  await page.getByTestId('cron-runs').getByRole('button', { name: 'Next' }).click();
  await expect(page.getByTestId('cron-runs-range')).toHaveText('Rows 51–100 of 120 · page 2 of 3');
  await expect(rows.first().locator('td').first()).toHaveText('51');
  await page.getByTestId('cron-runs').getByRole('button', { name: 'Last' }).click();
  await expect(rows).toHaveCount(20);
  await expect(rows.last().locator('td').nth(1)).toHaveText('2026-01-10T00:00:00.000Z');

  await page.getByLabel('Runs to project').fill('50');
  await expect(rows).toHaveCount(50);
  await expect(page.getByTestId('cron-runs-range')).toHaveCount(0);
});

for (const width of [320, 375, 768, 1024, 1440, 1920, 2560]) {
  test(`CRN-R19 lays out without horizontal overflow at ${width} px`, async ({ page, isMobile }) => {
    test.skip(isMobile, 'viewport matrix runs on the desktop project');
    await page.setViewportSize({ width, height: width < 800 ? 800 : 1000 });
    await page.goto('./#/tools/cron-team-matrix');
    await page.getByLabel('Runs to project').fill('60');
    await expect(page.getByTestId('cron-runs-range')).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
    for (const control of [page.getByLabel('Cron expression'), page.getByLabel('Comparison timezones'), page.getByRole('button', { name: 'Refresh from now' }), page.getByRole('button', { name: 'Export matrix CSV' }), page.getByRole('button', { name: 'Export finite calendar (.ics)' }), page.getByTestId('cron-runs').getByRole('button', { name: 'Next' })]) {
      const box = await control.boundingBox();
      expect(box && box.x >= 0 && box.x + box.width <= width + 1, `control inside viewport at ${width}px`).toBe(true);
    }
  });
}

import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const hourlyFixture = () => {
  const start = Date.parse('2026-06-01T00:00:00Z');
  const time = Array.from({ length: 24 }, (_, index) => new Date(start + index * 3_600_000).toISOString());
  const constant = (value: number) => Array<number>(24).fill(value);
  return {
    latitude: 41.8,
    longitude: -71.4,
    timezone: 'America/New_York',
    hourly: {
      time,
      pm2_5: constant(8),
      pm10: constant(18),
      carbon_monoxide: constant(300),
      nitrogen_dioxide: constant(15),
      sulphur_dioxide: constant(10),
      ozone: constant(50),
      uv_index: constant(4),
      uv_index_clear_sky: constant(5),
      wind_speed_10m: constant(2),
      us_aqi: constant(42),
      european_aqi: constant(28),
    },
  };
};

const loadFixture = async (page: import('@playwright/test').Page) => {
  await page.goto('./#/tools/aethercast');
  await page.getByLabel('Import an air quality and UV data file').setInputFiles({
    name: 'air-quality.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(hourlyFixture())),
  });
  await expect(page.getByRole('table')).toBeVisible();
};

test('AetherCast exposes timestamp reconciliation, pollutant coverage, averaging windows, and provider-vs-calculated indices', async ({ page }) => {
  await loadFixture(page);

  await expect(page.getByTestId('aethercast-timestamp-reconciliation')).toContainText('24 of 24');
  await expect(page.getByTestId('aethercast-timestamp-reconciliation')).toContainText('ambiguous or nonexistent wall times are rejected');

  const snapshot = page.getByRole('region', { name: 'Selected snapshot' });
  await expect(snapshot).toContainText('Locally calculated US EPA AQI');
  await expect(snapshot).toContainText('Imported provider US AQI');
  await expect(snapshot).toContainText('42');
  await expect(snapshot).toContainText('Imported provider European AQI');
  await expect(snapshot).toContainText('28');
  await expect(page.getByTestId('aethercast-pollutant-coverage')).toContainText('6/6');

  const averaging = page.getByTestId('aethercast-averaging-availability');
  await expect(averaging.locator('li')).toHaveCount(6);
  await expect(averaging).toContainText('PM2.5');
  await expect(averaging).toContainText('SO2');

  const tableHead = page.getByRole('table').locator('thead');
  await expect(tableHead).toContainText('Pollutants contributing');
  await expect(tableHead).toContainText('Provider US AQI');
  await expect(tableHead).toContainText('Provider European AQI');

  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export CSV' }).click();
  const stream = await (await download).createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(chunk as Buffer);
  const csv = Buffer.concat(chunks).toString('utf8');
  expect(csv).toContain('calculation_origin');
  expect(csv).toContain('provider_us_aqi_imported');
  expect(csv).toContain('pm25_epa_status');
});

for (const viewport of [
  { name: 'phone portrait', width: 320, height: 700 },
  { name: 'phone landscape', width: 844, height: 390 },
  { name: 'tablet', width: 768, height: 1024 },
]) {
  test(`AetherCast reflows loaded content at ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await loadFixture(page);

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
    await expect(page.getByRole('button', { name: 'Export CSV' })).toBeVisible();
    await expect(page.getByTestId('aethercast-averaging-availability')).toBeVisible();

    const accessibility = await new AxeBuilder({ page }).analyze();
    const serious = accessibility.violations.filter((violation) => violation.impact === 'serious' || violation.impact === 'critical');
    expect(serious, serious.map((violation) => `${violation.id}: ${violation.description}`).join('\n')).toEqual([]);
  });
}

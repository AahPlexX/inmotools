import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const FIXED_NOW = Date.parse('2026-09-11T15:20:00Z');
const HOUR_MS = 3_600_000;

const formatChicagoHour = (epochMs: number): string => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(epochMs));
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}T${values.hour}:${values.minute}`;
};

const freezeBrowserNow = async (page: Page) => {
  await page.addInitScript((fixedNow) => {
    Date.now = () => fixedNow;
  }, FIXED_NOW);
};

const installDelayedGeolocation = async (page: Page, delayMs = 1_200) => {
  await page.addInitScript(({ delay }) => {
    const position = {
      coords: {
        latitude: 41.8,
        longitude: -71.4,
        accuracy: 10,
        altitude: null,
        altitudeAccuracy: null,
        heading: null,
        speed: null,
      },
      timestamp: Date.now(),
    } as GeolocationPosition;
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: {
        getCurrentPosition(success: PositionCallback) {
          window.setTimeout(() => success(position), delay);
        },
      },
    });
  }, { delay: delayMs });
};

const hourlyFixture = () => {
  const start = Date.parse('2026-06-01T00:00:00Z');
  const time = Array.from({ length: 24 }, (_, index) => new Date(start + index * HOUR_MS).toISOString());
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

const liveFixture = () => {
  const hour = Math.floor(FIXED_NOW / HOUR_MS) * HOUR_MS;
  const start = hour - 24 * HOUR_MS;
  const length = 96;
  const time = Array.from({ length }, (_, index) => formatChicagoHour(start + index * HOUR_MS));
  const constant = (value: number) => Array<number>(length).fill(value);
  const usAqi = constant(42);
  usAqi[24] = 77;
  usAqi[25] = 77;
  usAqi[length - 1] = 199;
  return {
    latitude: 30.404,
    longitude: -90.155,
    elevation: 4,
    timezone: 'America/Chicago',
    utc_offset_seconds: -18_000,
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
      us_aqi: usAqi,
      european_aqi: constant(28),
    },
  };
};

const installLiveApiMocks = async (page: Page) => {
  const air = liveFixture();
  const airRequests: URL[] = [];
  const weatherRequests: URL[] = [];
  const geocodingRequests: URL[] = [];

  await page.route('https://air-quality-api.open-meteo.com/**', async (route) => {
    airRequests.push(new URL(route.request().url()));
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(air) });
  });
  await page.route('https://api.open-meteo.com/v1/forecast**', async (route) => {
    weatherRequests.push(new URL(route.request().url()));
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        latitude: air.latitude,
        longitude: air.longitude,
        timezone: air.timezone,
        hourly: { time: air.hourly.time, wind_speed_10m: Array<number>(air.hourly.time.length).fill(2) },
      }),
    });
  });
  await page.route('https://geocoding-api.open-meteo.com/**', async (route) => {
    geocodingRequests.push(new URL(route.request().url()));
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        results: [{
          id: 4332455,
          name: 'Madisonville',
          latitude: air.latitude,
          longitude: air.longitude,
          timezone: air.timezone,
          country: 'United States',
          country_code: 'US',
          admin1: 'Louisiana',
        }],
      }),
    });
  });

  return { air, airRequests, weatherRequests, geocodingRequests };
};

const loadFixture = async (page: Page) => {
  await page.goto('./#/tools/aethercast');
  await page.getByLabel('Import an air quality and UV data file').setInputFiles({
    name: 'air-quality.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(hourlyFixture())),
  });
  await expect(page.getByRole('table')).toBeVisible();
};

test('AetherCast loads live Open-Meteo data from browser geolocation without requiring an upload', async ({ page, context }) => {
  await freezeBrowserNow(page);
  const { airRequests, weatherRequests } = await installLiveApiMocks(page);
  await context.setGeolocation({ latitude: 30.404, longitude: -90.155 });
  await context.grantPermissions(['geolocation']);

  await page.goto('./#/tools/aethercast');

  await expect(page.getByRole('table')).toBeVisible();
  await expect(page.getByTestId('aethercast-live-source')).toContainText('Current location');
  await expect(page.getByTestId('aethercast-live-source')).toContainText('Open-Meteo');
  await expect(page.getByLabel('Import an air quality and UV data file')).not.toBeVisible();
  await expect(page.getByText('Loaded rows: 96.')).toBeVisible();
  const reconciliation = page.getByTestId('aethercast-timestamp-reconciliation');
  await expect(reconciliation).toContainText('96 of 96');
  await expect(reconciliation).toContainText('0 carried an explicit UTC offset and 96 were timezone-resolved wall clocks');

  await expect.poll(() => airRequests.length).toBeGreaterThan(0);
  await expect.poll(() => weatherRequests.length).toBeGreaterThan(0);
  const airUrl = airRequests.at(-1)!;
  expect(airUrl.searchParams.get('latitude')).toBe('30.404');
  expect(airUrl.searchParams.get('longitude')).toBe('-90.155');
  expect(airUrl.searchParams.get('past_hours')).toBe('24');
  expect(airUrl.searchParams.get('forecast_hours')).toBe('72');
  expect(airUrl.searchParams.get('timezone')).toBe('auto');
  expect(airUrl.searchParams.get('hourly')?.split(',')).toEqual(expect.arrayContaining([
    'pm2_5', 'pm10', 'carbon_monoxide', 'nitrogen_dioxide', 'sulphur_dioxide', 'ozone',
    'uv_index', 'uv_index_clear_sky', 'us_aqi', 'european_aqi',
  ]));
  const weatherUrl = weatherRequests.at(-1)!;
  expect(weatherUrl.searchParams.get('latitude')).toBe('30.404');
  expect(weatherUrl.searchParams.get('longitude')).toBe('-90.155');
  expect(weatherUrl.searchParams.get('hourly')).toBe('wind_speed_10m');
  expect(weatherUrl.searchParams.get('wind_speed_unit')).toBe('ms');

  const snapshot = page.getByRole('region', { name: 'Selected snapshot' });
  await expect(snapshot.locator('p').filter({ hasText: 'Imported provider US AQI' })).toContainText('77');
  await expect(snapshot).not.toContainText('199');
});

for (const search of [
  { label: 'city', query: 'Madisonville, LA' },
  { label: 'postal code', query: '70447' },
]) {
  test(`AetherCast ${search.label} search is a no-upload fallback when geolocation is unavailable`, async ({ page }) => {
    await freezeBrowserNow(page);
    const { airRequests, weatherRequests, geocodingRequests } = await installLiveApiMocks(page);
    await page.goto('./#/tools/aethercast');

    await page.getByLabel('Search city or postal code').fill(search.query);
    await page.getByRole('button', { name: 'Search locations' }).click();
    const result = page.getByRole('button', { name: 'Madisonville, Louisiana, United States' });
    await expect(result).toBeVisible();
    await result.click();

    await expect(page.getByRole('table')).toBeVisible();
    await expect(page.getByTestId('aethercast-live-source')).toContainText('Madisonville, Louisiana, United States');
    await expect(page.getByTestId('aethercast-live-source')).toContainText('Open-Meteo');
    expect(geocodingRequests.at(-1)?.searchParams.get('name')).toBe(search.query);
    expect(airRequests.at(-1)?.searchParams.get('latitude')).toBe('30.404');
    expect(airRequests.at(-1)?.searchParams.get('longitude')).toBe('-90.155');
    expect(weatherRequests.at(-1)?.searchParams.get('latitude')).toBe('30.404');
    expect(weatherRequests.at(-1)?.searchParams.get('longitude')).toBe('-90.155');
  });
}

test('AetherCast keeps a manually selected location when initial geolocation resolves late', async ({ page }) => {
  await freezeBrowserNow(page);
  const { airRequests } = await installLiveApiMocks(page);
  await installDelayedGeolocation(page);
  await page.goto('./#/tools/aethercast');

  await page.getByLabel('Search city or postal code').fill('Madisonville, LA');
  await page.getByRole('button', { name: 'Search locations' }).click();
  await page.getByRole('button', { name: 'Madisonville, Louisiana, United States' }).click();
  await expect(page.getByTestId('aethercast-live-source')).toContainText('Madisonville, Louisiana, United States');

  await page.waitForTimeout(1_400);
  await expect(page.getByTestId('aethercast-live-source')).toContainText('Madisonville, Louisiana, United States');
  expect(airRequests.at(-1)?.searchParams.get('latitude')).toBe('30.404');
  expect(airRequests.at(-1)?.searchParams.get('longitude')).toBe('-90.155');
});

test('AetherCast keeps an imported fallback dataset when initial geolocation resolves late', async ({ page }) => {
  await freezeBrowserNow(page);
  const { airRequests } = await installLiveApiMocks(page);
  await installDelayedGeolocation(page);
  await page.goto('./#/tools/aethercast');

  await page.getByLabel('Import an air quality and UV data file').setInputFiles({
    name: 'air-quality.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(hourlyFixture())),
  });
  await expect(page.getByRole('table')).toBeVisible();
  const snapshot = page.getByRole('region', { name: 'Selected snapshot' });
  await expect(snapshot.locator('p').filter({ hasText: 'Imported provider US AQI' })).toContainText('42');

  await page.waitForTimeout(1_400);
  await expect(page.getByTestId('aethercast-live-source')).toHaveCount(0);
  await expect(snapshot.locator('p').filter({ hasText: 'Imported provider US AQI' })).toContainText('42');
  expect(airRequests).toHaveLength(0);
});

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

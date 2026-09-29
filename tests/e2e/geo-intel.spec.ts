import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

const fixture = (name: string) => readFileSync(new URL(`../fixtures/geo-intel/responses/${name}`, import.meta.url));

/** Every external request is answered from responses recorded on 2026-09-29; anything else fails. */
const ROUTES: Array<[RegExp, string]> = [
  [/photon\.komoot\.io\/api/, 'photon-search-berlin.json'],
  [/photon\.komoot\.io\/reverse/, 'photon-reverse.json'],
  [/api\.zippopotam\.us\/us\/90210/, 'zippopotam-us-90210.json'],
  [/api\.worldbank\.org\/v2\/country\/all\//, 'worldbank-all-density.json'],
  [/api\.worldbank\.org\/v2\/country\/DEU/, 'worldbank-de.json'],
  [/date\.nager\.at\/api\/v3\/PublicHolidays\/\d+\/DE/, 'nager-2026-de.json'],
  [/gisco-services\.ec\.europa\.eu/, 'gisco-nuts-berlin.json'],
  [/demo_r_pjanaggr3/, 'eurostat-pop-de300.json'],
  [/demo_r_d3dens/, 'eurostat-dens-de300.json'],
  [/nama_10r_3gdp/, 'eurostat-gdp-de300.json'],
  [/lfst_r_lfe2emprt/, 'eurostat-emp-de30.json'],
  [/api\.sunrise-sunset\.org/, 'sunrise-org-v2.json'],
  [/elevation-tiles-prod\/terrarium/, 'terrarium-12-2137-1448.png'],
  [/geoboundaries\.org\/api/, 'geoboundaries-lux-adm1.json'],
  [/media\.githubusercontent\.com/, 'geoboundaries-lux-adm1.geojson'],
];

async function mockNetwork(page: Page) {
  await page.route(/^https:\/\/(?!127\.0\.0\.1)/, async (route) => {
    const url = route.request().url();
    const hit = ROUTES.find(([pattern]) => pattern.test(url));
    if (!hit) return route.fulfill({ status: 503, body: 'offline in test' });
    return route.fulfill({ status: 200, body: fixture(hit[1]), headers: { 'access-control-allow-origin': '*', 'content-type': hit[1].endsWith('.png') ? 'image/png' : 'application/json' } });
  });
}

async function open(page: Page) {
  await mockNetwork(page);
  await page.goto('./#/tools/geo-intelligence-hub');
  await expect(page.getByTestId('geo-intel-hub')).toBeVisible();
  await expect(page.locator('[data-testid="gi-map"] .gi-country')).toHaveCount(242);
}

async function search(page: Page, text: string) {
  await page.getByTestId('gi-query').fill(text);
  await page.getByTestId('gi-search').click();
  await expect(page.getByTestId('gi-profile-title')).toBeVisible({ timeout: 20_000 });
}

const noHorizontalOverflow = async (page: Page) => {
  const { scroll, width } = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, width: window.innerWidth }));
  expect(scroll).toBeLessThanOrEqual(width + 1);
};

test('resolves a place into a provenance-tracked profile', async ({ page }) => {
  await open(page);
  await expect(page.getByTestId('gi-intro')).toBeVisible();
  await search(page, 'Berlin');
  const profile = page.getByTestId('gi-profile');
  await expect(page.getByTestId('gi-profile-title')).toHaveText('Berlin, Germany');
  await expect(profile.locator('[data-field="wb.SP.POP.TOTL"]')).toContainText('83');
  await expect(profile.locator('[data-field="eu.population.nuts3"]')).toBeVisible();
  await expect(profile.locator('[data-field="tz.name"]')).toContainText('Europe/Berlin');
  await expect(profile.getByRole('heading', { name: /Public holidays 2026/ })).toBeVisible();
  await profile.locator('[data-field="wb.SP.POP.TOTL"]').getByRole('button', { name: /Provenance/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Value provenance' });
  await expect(dialog).toContainText('World Bank Indicators API v2');
  await expect(dialog).toContainText('CC BY 4.0');
  await expect(dialog).toContainText('2025');
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await noHorizontalOverflow(page);
});

test('postal lookups show the geography used and never a postal-code population', async ({ page }) => {
  await open(page);
  await search(page, 'US 90210');
  await expect(page.getByTestId('gi-profile-title')).toHaveText('90210 Beverly Hills');
  await page.getByText(/notes? about this result/).click();
  await expect(page.getByText(/Population is not reported for postal codes/)).toBeVisible();
});

test('shows tooltips on hover and a viewport-safe context menu on right-click', async ({ page, isMobile }) => {
  test.skip(isMobile, 'hover and right-click are desktop interactions; long-press is covered below');
  await open(page);
  await search(page, 'Berlin');
  await page.getByRole('button', { name: 'Export…' }).hover();
  const tip = page.getByRole('tooltip');
  await expect(tip).toContainText('Export JSON');
  const box = await tip.boundingBox();
  const viewport = page.viewportSize();
  expect(box && viewport && box.x >= 0 && box.x + box.width <= viewport.width).toBe(true);
  await page.getByRole('region', { name: 'Resolved location' }).click({ button: 'right', position: { x: 5, y: 5 } });
  const menu = page.getByRole('menu');
  await expect(menu.getByRole('menuitem', { name: 'Copy coordinates' })).toBeFocused();
  await expect(menu.getByRole('menuitem')).toHaveText(['Copy coordinates', 'Open in OpenStreetMap', 'Star', 'Add to comparison', 'Export this location…', 'Delete from history']);
  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();
});

test('exports JSON with edited metadata and an RFC 5545 calendar', async ({ page }) => {
  await open(page);
  await search(page, 'Berlin');
  await page.getByRole('button', { name: 'Export…' }).click();
  const dialog = page.getByTestId('gi-export');
  await dialog.getByLabel('Project title').fill('Berlin field notes');
  await dialog.getByLabel('Author / organization').fill('Test Org');
  await dialog.getByLabel('Tags (comma-separated)').fill('survey, eu');
  const [json] = await Promise.all([page.waitForEvent('download'), dialog.getByTestId('gi-export-json').click()]);
  expect(json.suggestedFilename()).toBe('berlin-field-notes.json');
  const parsed = JSON.parse(readFileSync(await json.path(), 'utf8'));
  expect(parsed.metadata).toMatchObject({ title: 'Berlin field notes', author: 'Test Org', tags: ['survey', 'eu'] });
  expect(parsed.profiles[0].fields.every((item: Record<string, unknown>) => item.source && item.license && item.retrieved_at && item.confidence_class)).toBe(true);
  const [ics] = await Promise.all([page.waitForEvent('download'), dialog.getByTestId('gi-export-ics').click()]);
  const calendar = readFileSync(await ics.path(), 'utf8');
  expect(calendar.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
  expect(calendar).toContain('SUMMARY:German Unity Day');
  const [svg] = await Promise.all([page.waitForEvent('download'), dialog.getByTestId('gi-export-svg').click()]);
  expect(readFileSync(await svg.path(), 'utf8')).toContain('dc:creator="Test Org"');
  const [png] = await Promise.all([page.waitForEvent('download'), dialog.getByTestId('gi-export-png').click()]);
  expect(readFileSync(await png.path()).subarray(1, 4).toString()).toBe('PNG');
  const [zip] = await Promise.all([page.waitForEvent('download'), dialog.getByTestId('gi-export-zip').click()]);
  expect(zip.suggestedFilename()).toBe('berlin-field-notes.zip');
});

test('map click resolves a point and measure mode reports a distance', async ({ page, isMobile }) => {
  await open(page);
  const map = page.getByTestId('gi-map');
  const bounds = await map.boundingBox();
  if (!bounds) throw new Error('map not laid out');
  await map.click({ position: { x: bounds.width * 0.52, y: bounds.height * 0.3 } });
  await expect(page.getByTestId('gi-profile-title')).toBeVisible({ timeout: 20_000 });
  await page.getByTestId('gi-tab-tools').click();
  const tools = page.getByTestId('gi-tools');
  await expect(tools.getByText('MGRS', { exact: true })).toBeVisible();
  await tools.getByRole('button', { name: 'Measure on map' }).click();
  if (isMobile) await page.getByRole('button', { name: 'Close panel' }).click();
  await map.click({ position: { x: bounds.width * 0.3, y: bounds.height * 0.4 } });
  await map.click({ position: { x: bounds.width * 0.7, y: bounds.height * 0.4 } });
  await page.getByTestId('gi-tab-tools').click();
  await expect(page.getByTestId('gi-distance')).toContainText('km');
});

test('mobile uses a bottom tab bar and bottom sheets without horizontal scrolling', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'mobile layout only');
  await open(page);
  const tabs = page.getByRole('tablist', { name: 'Workspace sections' });
  const box = await tabs.boundingBox();
  const viewport = page.viewportSize();
  expect(box && viewport && box.y + box.height >= viewport.height - 2).toBe(true);
  await page.getByTestId('gi-tab-sources').click();
  const sheet = page.getByRole('dialog', { name: 'Sources' });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByText('Use OpenStreetMap Nominatim as a last-resort geocoder')).toBeVisible();
  await noHorizontalOverflow(page);
  await page.getByRole('button', { name: 'Close panel' }).click();
  await expect(sheet).toBeHidden();
  await search(page, 'Berlin');
  await noHorizontalOverflow(page);
});

test('keeps working offline from bundled data', async ({ page }) => {
  await page.route(/^https:\/\/(?!127\.0\.0\.1)/, (route) => route.abort('internetdisconnected'));
  await page.goto('./#/tools/geo-intelligence-hub');
  await search(page, '35.6762, 139.6503');
  const profile = page.getByTestId('gi-profile');
  await expect(profile.locator('[data-field="country.name"]')).toContainText('Japan');
  await expect(profile.locator('[data-field="tz.name"]')).toContainText('Asia/Tokyo');
  await expect(profile.locator('[data-field="solar.sunrise"]')).toBeVisible();
});

test('has no serious or critical axe violations with a profile, the export dialog and the provenance inspector open', async ({ page }) => {
  const { default: AxeBuilder } = await import('@axe-core/playwright');
  await open(page);
  await search(page, 'Berlin');
  const scan = async (label: string) => {
    const results = await new AxeBuilder({ page }).include('[data-testid="geo-intel-hub"]').analyze();
    const blocking = results.violations.filter((violation) => violation.impact === 'serious' || violation.impact === 'critical');
    expect(blocking, `${label}: ${blocking.map((item) => `${item.id}: ${item.help}`).join('\n')}`).toEqual([]);
  };
  await scan('profile');
  await page.getByRole('button', { name: 'Export…' }).click();
  await scan('export dialog');
  await page.getByRole('button', { name: 'Close export' }).click();
  await page.getByRole('button', { name: 'Provenance', exact: true }).click();
  await scan('provenance inspector');
});

for (const width of [320, 375, 768, 1024, 1440, 1920, 2560]) {
  test(`lays out without horizontal overflow at ${width} px`, async ({ page, isMobile }) => {
    test.skip(isMobile, 'viewport matrix runs on the desktop project');
    await page.setViewportSize({ width, height: width < 800 ? 800 : 1000 });
    await open(page);
    await search(page, 'Berlin');
    await noHorizontalOverflow(page);
    for (const testId of ['gi-query', 'gi-search', 'gi-map', 'gi-profile-title']) {
      const box = await page.getByTestId(testId).boundingBox();
      expect(box && box.x >= 0 && box.x + box.width <= width + 1, `${testId} inside viewport at ${width}px`).toBe(true);
    }
    const map = await page.getByTestId('gi-map').boundingBox();
    expect(map && map.height >= 200).toBe(true);
    await page.screenshot({ path: test.info().outputPath(`layout-${width}.png`), fullPage: false });
  });
}

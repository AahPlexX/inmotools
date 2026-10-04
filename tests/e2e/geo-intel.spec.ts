import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { SOURCES } from '../../src/tools/geo-intel/core/sources';

const fixture = (name: string) => readFileSync(new URL(`../fixtures/geo-intel/responses/${name}`, import.meta.url));

/** Every external request is answered from responses recorded on 2026-09-29; anything else fails. */
const ROUTES: Array<[RegExp, string]> = [
  [/photon\.komoot\.io\/api/, 'photon-search-berlin.json'],
  [/photon\.komoot\.io\/reverse/, 'photon-reverse.json'],
  [/api\.zippopotam\.us\/us\/90210/, 'zippopotam-us-90210.json'],
  [/api\.worldbank\.org\/v2\/country\/all\//, 'worldbank-all-density.json'],
  [/api\.worldbank\.org\/v2\/country\/DEU/, 'worldbank-de.json'],
  [/date\.nager\.at\/api\/v3\/PublicHolidays\/\d+\/DE/, 'nager-2026-de.json'],
  [/api\.sunrisesunset\.io/, 'sunrisesunset-io.json'],
  [/gisco-services\.ec\.europa\.eu/, 'gisco-nuts-berlin.json'],
  [/demo_r_pjanaggr3/, 'eurostat-pop-de300.json'],
  [/demo_r_d3dens/, 'eurostat-dens-de300.json'],
  [/nama_10r_3gdp/, 'eurostat-gdp-de300.json'],
  [/lfst_r_lfe2emprt/, 'eurostat-emp-de30.json'],
  [/api\.sunrise-sunset\.org/, 'sunrise-org-v2.json'],
  [/elevation-tiles-prod\/terrarium/, 'terrarium-12-2137-1448.png'],
  [/geoboundaries\.org\/api/, 'geoboundaries-lux-adm1.json'],
  [/media\.githubusercontent\.com/, 'geoboundaries-lux-adm1.geojson'],
  [/api\.bigdatacloud\.net\/data\/reverse-geocode-client/, 'bigdatacloud-paris.json'],
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
  await expect(menu.getByRole('menuitem')).toHaveText(['Copy coordinates', 'Copy summary as text', 'Copy share link', 'Open in OpenStreetMap', 'Star', 'Add to comparison', 'Export this location…', 'Delete from history']);
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

test('GIH-R67 has no serious or critical axe violations with a profile, the export dialog and the provenance inspector open', async ({ page }) => {
  // Three full-workspace axe runs take 20–48 s per run on a loaded 8-core runner.
  test.setTimeout(120_000);
  const { default: AxeBuilder } = await import('@axe-core/playwright');
  await open(page);
  await search(page, 'Berlin');
  // Settled: the lookup (history write and refresh included) has finished.
  await expect(page.locator('.gi-busy')).toHaveCount(0);
  await expect(page.getByTestId('gi-search')).toBeEnabled();
  const scan = async (label: string) => {
    const results = await new AxeBuilder({ page }).include('[data-testid="geo-intel-hub"]').analyze();
    const blocking = results.violations.filter((violation) => violation.impact === 'serious' || violation.impact === 'critical');
    expect(blocking, `${label}: ${blocking.map((item) => `${item.id} (${item.impact}): ${item.help} — ${item.nodes.map((node) => `${node.target.join(' ')} ${node.html.slice(0, 200)} ${node.failureSummary ?? ''}`).join(' | ')}`).join('\n')}`).toEqual([]);
  };
  await scan('profile');
  await page.getByRole('button', { name: 'Export…' }).click();
  const exportDialog = page.getByTestId('gi-export');
  await expect(exportDialog.getByLabel('Project title')).toBeFocused();
  await scan('export dialog');
  await page.getByRole('button', { name: 'Close export' }).click();
  await expect(exportDialog).toHaveCount(0);
  await page.getByRole('button', { name: 'Provenance', exact: true }).click();
  const inspector = page.getByRole('dialog', { name: 'Provenance inspector' });
  await expect(inspector.getByRole('button', { name: 'Close', exact: true })).toBeFocused();
  await expect(inspector.locator('tbody tr').first()).toBeVisible();
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

test('opens a shared link, offers other matches, and switches sun date and holiday year', async ({ page }) => {
  await mockNetwork(page);
  await page.goto('./#/tools/geo-intelligence-hub?q=Berlin');
  await expect(page.getByTestId('gi-profile-title')).toHaveText('Berlin, Germany', { timeout: 20_000 });
  expect(page.url()).toContain('?q=Berlin');
  const profile = page.getByTestId('gi-profile');
  await expect(profile.locator('[data-field="codes.geohash"]')).toBeVisible();
  await expect(profile.locator('[data-field="solar.moonPhase"]')).toBeVisible();
  await profile.getByLabel('Date').fill('2026-12-21');
  await expect(page.getByRole('status').filter({ hasText: 'Sun times for 2026-12-21.' }).first()).toBeAttached();
  await profile.getByRole('button', { name: 'Holidays for 2027' }).click();
  await expect(profile.getByRole('heading', { name: 'Public holidays 2027' })).toBeVisible();
});

test('exports GeoJSON and KML, and re-imports its own JSON', async ({ page }) => {
  await open(page);
  await search(page, 'Berlin');
  await page.getByRole('button', { name: 'Export…' }).click();
  const dialog = page.getByTestId('gi-export');
  const [geojson] = await Promise.all([page.waitForEvent('download'), dialog.getByTestId('gi-export-geojson').click()]);
  const geo = JSON.parse(readFileSync(await geojson.path(), 'utf8'));
  expect(geo.features[0].geometry.coordinates[0]).toBeCloseTo(13.395, 2);
  const [kml] = await Promise.all([page.waitForEvent('download'), dialog.getByTestId('gi-export-kml').click()]);
  expect(readFileSync(await kml.path(), 'utf8')).toContain('<Placemark');
  const [json] = await Promise.all([page.waitForEvent('download'), dialog.getByTestId('gi-export-json').click()]);
  const jsonPath = await json.path();
  await dialog.getByRole('button', { name: 'Close export' }).click();
  await page.getByTestId('gi-tab-history').click();
  await page.locator('input[type=file][accept*="json"]').setInputFiles(jsonPath);
  await expect(page.getByRole('status').filter({ hasText: /Imported 1 location/ }).first()).toBeAttached();
});

test('tabs follow the ARIA arrow-key pattern', async ({ page, isMobile }) => {
  test.skip(isMobile, 'keyboard pattern checked on desktop');
  await open(page);
  await page.getByTestId('gi-tab-profile').focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByTestId('gi-tab-compare')).toBeFocused();
  await expect(page.getByTestId('gi-tab-compare')).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('End');
  await expect(page.getByTestId('gi-tab-sources')).toBeFocused();
});

test('profile filter, row copy menu, sun chart and keyboard shortcuts', async ({ page, isMobile }) => {
  test.skip(isMobile, 'right-click and keyboard flows are desktop interactions');
  await open(page);
  await search(page, 'Berlin');
  const profile = page.getByTestId('gi-profile');
  await expect(profile.locator('.gi-sunchart svg')).toBeVisible();
  await expect(profile.locator('[data-field="population.geonames"]')).toHaveCount(0);
  await page.getByTestId('gi-profile-filter').fill('sunrise');
  await expect(profile.locator('[data-field="solar.sunrise"]')).toBeVisible();
  await expect(profile.locator('[data-field="country.capital"]')).toHaveCount(0);
  await page.getByTestId('gi-profile-filter').fill('');
  await profile.locator('[data-field="country.capital"]').click({ button: 'right' });
  await expect(page.getByRole('menu', { name: 'Capital' }).getByRole('menuitem')).toHaveText(['Copy value', 'Copy raw value', 'Copy value with source', 'Show provenance']);
  await page.keyboard.press('Escape');
  await page.locator('body').click({ position: { x: 2, y: 2 } });
  await page.keyboard.press('?');
  await expect(page.getByTestId('gi-keys')).toContainText('Jump to the search box');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('gi-keys')).toBeHidden();
  await expect(page.locator('.gi-map-scale')).toContainText(/\d+ (k?m)/);
});

test('meeting planner shifts compared local times', async ({ page }) => {
  await open(page);
  await search(page, 'Berlin');
  await page.getByRole('button', { name: 'Compare', exact: true }).click();
  await page.getByTestId('gi-tab-compare').click();
  const planner = page.getByTestId('gi-planner');
  await expect(planner).toBeVisible();
  const before = await page.locator('.gi-compare-card').getByText(/:\d\d/).first().innerText();
  await planner.fill('8');
  await expect(page.locator('.gi-planner output')).toHaveText('+4 h from now');
  await expect(page.locator('.gi-compare-card').getByText(/:\d\d/).first()).not.toHaveText(before);
});

test('GIH-R02 asks for consent before requesting device location and resolves it through BigDataCloud', async ({ page, context }) => {
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ latitude: 48.8584, longitude: 2.2945, accuracy: 25 });
  await page.addInitScript(() => {
    const w = window as unknown as { __geoCalls: number };
    w.__geoCalls = 0;
    const original = navigator.geolocation.getCurrentPosition.bind(navigator.geolocation);
    navigator.geolocation.getCurrentPosition = (...args: Parameters<Geolocation['getCurrentPosition']>) => { w.__geoCalls += 1; return original(...args); };
  });
  const bdc: string[] = [];
  page.on('request', (request) => { if (request.url().includes('bigdatacloud')) bdc.push(request.url()); });
  await open(page);
  const calls = () => page.evaluate(() => (window as unknown as { __geoCalls: number }).__geoCalls);
  await page.getByRole('button', { name: 'Use my location' }).click();
  const consent = page.getByRole('alertdialog', { name: 'Share this device’s location?' });
  await expect(consent).toContainText('BigDataCloud');
  expect(await calls()).toBe(0);
  await consent.getByRole('button', { name: 'Cancel' }).click();
  await expect(consent).toBeHidden();
  expect(await calls()).toBe(0);
  expect(bdc).toHaveLength(0);
  await page.getByRole('button', { name: 'Use my location' }).click();
  await consent.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByTestId('gi-profile-title')).toBeVisible({ timeout: 20_000 });
  expect(await calls()).toBe(1);
  expect(bdc.length).toBeGreaterThan(0);
  const profile = page.getByTestId('gi-profile');
  await expect(profile.locator('[data-field="country.name"]')).toContainText('France');
  await expect(profile.locator('footer.gi-attribution')).toContainText('BigDataCloud');
});

test('GIH-R20 compares up to six locations and refuses a seventh', async ({ page }) => {
  test.setTimeout(180_000);
  await open(page);
  const points = ['10, 10', '11, 11', '12, 12', '13, 13', '14, 14', '15, 15', '16, 16'];
  for (const [index, point] of points.entries()) {
    await page.getByTestId('gi-query').fill(point);
    await page.getByTestId('gi-search').click();
    await expect(page.getByTestId('gi-profile').getByRole('button', { name: 'Compare', exact: true })).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('.gi-coords .gi-link')).toContainText(`${10 + index}.000000`);
    await page.getByTestId('gi-profile').getByRole('button', { name: 'Compare', exact: true }).click();
    if (index < 6) await expect(page.getByTestId('gi-tab-compare').locator('.gi-count')).toHaveText(String(index + 1));
  }
  await expect(page.getByRole('status').filter({ hasText: 'The comparison holds 6 locations; remove one first.' }).first()).toBeAttached();
  await expect(page.getByTestId('gi-tab-compare').locator('.gi-count')).toHaveText('6');
  await page.getByTestId('gi-tab-compare').click();
  await expect(page.locator('.gi-compare-card')).toHaveCount(6);
});

test('GIH-R26 shows the live local clock with UTC offset and DST state', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-07-01T10:00:00Z'));
  await open(page);
  await search(page, 'Berlin');
  const clock = page.locator('.gi-clock');
  await expect(clock.locator('.gi-clock-time')).toContainText('12:00:00');
  await expect(clock.locator('.gi-clock-meta')).toContainText('UTC+02:00');
  await expect(clock.locator('.gi-clock-meta')).toContainText('July 1, 2026');
  const profile = page.getByTestId('gi-profile');
  await expect(profile.locator('[data-field="tz.observesDst"] .gi-value')).toHaveText(/yes|true/i);
});

test('GIH-R27 shows daylight duration, golden hour and blue hour for the location and date', async ({ page }) => {
  await open(page);
  await search(page, 'Berlin');
  const profile = page.getByTestId('gi-profile');
  for (const key of ['solar.dayLength', 'solar.goldenMorning', 'solar.goldenEvening', 'solar.blueMorning', 'solar.blueEvening']) {
    await expect(profile.locator(`[data-field="${key}"] .gi-value`), key).toHaveText(/\d/);
  }
  await expect(profile.locator('[data-field="solar.dayLength"] .gi-value')).toHaveText(/\d+\s*h/);
  await expect(profile.locator('.gi-daylight .gi-seg.golden')).toHaveCount(2);
  await expect(profile.locator('.gi-daylight .gi-seg.blue')).toHaveCount(2);
});

test('GIH-R14 filters public holidays by month', async ({ page }) => {
  await open(page);
  await search(page, 'Berlin');
  const card = page.getByRole('region', { name: /Public holidays 2026/ });
  const months = card.getByRole('group', { name: 'Filter holidays by month' });
  await months.getByRole('button', { name: 'Oct', exact: true }).click();
  await expect(months.getByRole('button', { name: 'Oct', exact: true })).toHaveAttribute('aria-pressed', 'true');
  const dates = await card.locator('.gi-holidays time').evaluateAll((items) => items.map((item) => item.getAttribute('datetime')));
  expect(dates).toEqual(['2026-10-03', '2026-10-31']);
  await expect(card).toContainText('German Unity Day');
  await months.getByRole('button', { name: 'Feb', exact: true }).click();
  await expect(card).toContainText('No public holidays in this month.');
  await months.getByRole('button', { name: 'All', exact: true }).click();
  await expect(card.locator('.gi-holidays li')).toHaveCount(19);
});

test('GIH-R42 sources tab shows each source state, and the Nominatim toggle and cache clearing take effect', async ({ page, isMobile }) => {
  test.skip(isMobile, 'sources panel flow checked on desktop; the mobile sheet is covered above');
  test.setTimeout(90_000);
  const nominatim: string[] = [];
  await open(page);
  await page.route(/photon\.komoot\.io\/api/, (route) => route.fulfill({ status: 200, body: JSON.stringify({ type: 'FeatureCollection', features: [] }), headers: { 'access-control-allow-origin': '*', 'content-type': 'application/json' } }));
  await page.route(/nominatim\.openstreetmap\.org\/search/, (route) => { nominatim.push(route.request().url()); return route.fulfill({ status: 200, body: fixture('nominatim-search.json'), headers: { 'access-control-allow-origin': '*', 'content-type': 'application/json' } }); });
  await page.getByTestId('gi-tab-sources').click();
  const sources = page.getByTestId('gi-sources');
  const table = sources.getByRole('region', { name: 'Source status' });
  const networkSources = Object.values(SOURCES).filter((source) => source.network);
  await expect(table.locator('tbody tr')).toHaveCount(networkSources.length);
  for (const source of networkSources) await expect(table.locator('tbody tr').filter({ has: page.getByRole('rowheader', { name: source.name }) }).locator('.gi-state')).toHaveText(/^(idle|closed|paused|half-open|disabled)$/);
  const nominatimRow = table.locator('tbody tr').filter({ has: page.getByRole('rowheader', { name: SOURCES.nominatim.name }) });
  await expect(nominatimRow.locator('.gi-state')).toHaveText('disabled');

  await page.getByTestId('gi-query').fill('Unfindable Place One');
  await page.getByTestId('gi-search').click();
  await expect(page.getByRole('alert')).toBeVisible({ timeout: 20_000 });
  expect(nominatim).toHaveLength(0);

  await page.getByTestId('gi-tab-sources').click();
  await sources.getByLabel('Use OpenStreetMap Nominatim as a last-resort geocoder').check();
  await expect(nominatimRow.locator('.gi-state')).toHaveText(/^(idle|closed)$/);
  await page.getByTestId('gi-query').fill('Unfindable Place Two');
  await page.getByTestId('gi-search').click();
  await expect(page.getByTestId('gi-profile-title')).toBeVisible({ timeout: 20_000 });
  expect(nominatim.length).toBeGreaterThan(0);
  await expect(page.getByTestId('gi-profile').locator('footer.gi-attribution')).toContainText(SOURCES.nominatim.name);

  await page.getByTestId('gi-tab-sources').click();
  await expect(nominatimRow.locator('.gi-state')).toHaveText('closed');
  await expect(sources.getByText(/^[1-9]\d* cached responses on this device$/)).toBeVisible();
  await sources.getByRole('button', { name: 'Clear response cache' }).click();
  await expect(sources.getByText('0 cached responses on this device')).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: 'Cleared cached responses. Saved locations are kept.' }).first()).toBeAttached();
});

test('GIH-R43 attribution footer lists exactly the sources the profile cites', async ({ page }) => {
  await open(page);
  await search(page, 'Berlin');
  await page.getByRole('button', { name: 'Export…' }).click();
  const dialog = page.getByTestId('gi-export');
  const [json] = await Promise.all([page.waitForEvent('download'), dialog.getByTestId('gi-export-json').click()]);
  await dialog.getByRole('button', { name: 'Close export' }).click();
  const parsed = JSON.parse(readFileSync(await json.path(), 'utf8')) as { profiles: Array<{ fields: Array<{ source: keyof typeof SOURCES }> }> };
  const cited = [...new Set(parsed.profiles[0].fields.map((item) => item.source))].filter((id) => !['computed', 'user', 'device'].includes(id)).map((id) => SOURCES[id].name).sort();
  const footer = page.getByTestId('gi-profile').locator('footer.gi-attribution li');
  const listed = (await footer.evaluateAll((items) => items.map((item) => (item.querySelector('a')?.textContent ?? item.textContent?.split(' — ')[0] ?? '').trim()))).sort();
  expect(cited.length).toBeGreaterThan(3);
  expect(listed).toEqual(cited);
});

test('GIH-R44 keyboard: / focuses search, arrow keys pan the map, +/- zoom, Escape closes overlays', async ({ page, isMobile }) => {
  test.skip(isMobile, 'keyboard flows are desktop interactions');
  await open(page);
  await page.locator('body').click({ position: { x: 2, y: 2 } });
  await page.keyboard.press('/');
  await expect(page.getByTestId('gi-query')).toBeFocused();
  const map = page.getByTestId('gi-map');
  const view = async () => (await map.getAttribute('viewBox'))!.split(' ').map(Number);
  await map.focus();
  const home = await view();
  await page.keyboard.press('+');
  await expect.poll(async () => (await view())[2]).toBeLessThan(home[2]);
  const zoomed = await view();
  await page.keyboard.press('ArrowRight');
  await expect.poll(async () => (await view())[0]).toBeGreaterThan(zoomed[0]);
  const right = await view();
  await page.keyboard.press('ArrowDown');
  await expect.poll(async () => (await view())[1]).toBeGreaterThan(right[1]);
  await page.keyboard.press('ArrowLeft');
  await expect.poll(async () => (await view())[0]).toBeLessThan(right[0]);
  await page.keyboard.press('ArrowUp');
  await expect.poll(async () => (await view())[1]).toBeCloseTo(zoomed[1], 3);
  await page.keyboard.press('+');
  await expect.poll(async () => (await view())[2]).toBeLessThan(zoomed[2]);
  await page.keyboard.press('-');
  await page.keyboard.press('-');
  await expect.poll(async () => (await view())[2]).toBeGreaterThan(zoomed[2]);
  await page.keyboard.press('?');
  await expect(page.getByTestId('gi-keys')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('gi-keys')).toBeHidden();
});

test('GIH-R54 copies the summary and the share link from the buttons and the context menu', async ({ page, context, isMobile }) => {
  test.skip(isMobile, 'clipboard and right-click checked on desktop');
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await open(page);
  await search(page, 'Berlin');
  const clipboard = () => page.evaluate(() => navigator.clipboard.readText());
  const profile = page.getByTestId('gi-profile');
  await profile.getByRole('button', { name: 'Copy summary', exact: true }).click();
  await expect.poll(clipboard).toMatch(/^Berlin, Germany\n52\.\d+, 13\.\d+ \(Plus Code [^)]+\)\nCountry: Germany[\s\S]*\nSources: /);
  await page.evaluate(() => navigator.clipboard.writeText(''));
  await profile.getByRole('button', { name: 'Share link', exact: true }).click();
  await expect.poll(clipboard).toMatch(/\/inmotools\/#\/tools\/geo-intelligence-hub\?q=Berlin$/);
  await page.evaluate(() => navigator.clipboard.writeText(''));
  await page.getByRole('region', { name: 'Resolved location' }).click({ button: 'right', position: { x: 5, y: 5 } });
  await page.getByRole('menu').getByRole('menuitem', { name: 'Copy summary as text' }).click();
  await expect.poll(clipboard).toMatch(/^Berlin, Germany\n/);
  await page.getByRole('region', { name: 'Resolved location' }).click({ button: 'right', position: { x: 5, y: 5 } });
  await page.getByRole('menu').getByRole('menuitem', { name: 'Copy share link' }).click();
  await expect.poll(clipboard).toMatch(/#\/tools\/geo-intelligence-hub\?q=Berlin$/);
});

test('GIH-R55 offers recent queries as search suggestions', async ({ page }) => {
  await open(page);
  await search(page, 'Berlin');
  await search(page, 'US 90210');
  await expect(page.getByTestId('gi-query')).toHaveAttribute('list', 'gi-recent');
  await expect.poll(() => page.locator('#gi-recent option').evaluateAll((items) => items.map((item) => (item as HTMLOptionElement).value).sort())).toEqual(['Berlin', 'US 90210']);
});

test('GIH-R56 dismisses an error message', async ({ page }) => {
  await open(page);
  await page.getByTestId('gi-query').fill('120, 45');
  await page.getByTestId('gi-search').click();
  const alert = page.locator('.gi-statusbar').getByRole('alert');
  await expect(alert).toContainText('Latitude is out of range');
  await alert.getByRole('button', { name: 'Dismiss' }).click();
  await expect(alert).toHaveCount(0);
});

test('GIH-R62 shows the live cursor latitude and longitude on the map', async ({ page, isMobile }) => {
  test.skip(isMobile, 'pointer hover is a desktop interaction');
  await open(page);
  const map = page.getByTestId('gi-map');
  const box = (await map.boundingBox())!;
  const readout = page.locator('.gi-map-cursor');
  const read = async () => (await readout.innerText()).split(',').map(Number);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await expect(readout).toHaveText(/^-?\d+\.\d{4}, -?\d+\.\d{4}$/);
  const [lat0, lon0] = await read();
  expect(Math.abs(lat0)).toBeLessThan(2);
  expect(Math.abs(lon0)).toBeLessThan(2);
  await page.mouse.move(box.x + box.width * 0.75, box.y + box.height * 0.3);
  await expect.poll(async () => (await read())[1]).toBeGreaterThan(lon0 + 30);
  const [lat1] = await read();
  expect(lat1).toBeGreaterThan(lat0 + 10);
  await page.mouse.move(box.x - 20, box.y - 20);
  await expect(readout).toHaveCount(0);
});

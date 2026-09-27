import { expect, test } from '@playwright/test';

test('parses a bare domain into a lexical breadcrumb and renders the composite scorecard', async ({ page }) => {
  await page.goto('./#/tools/site-intelligence-analyzer');
  await expect(page.getByRole('heading', { name: /Site Intelligence Analyzer/i })).toBeVisible();

  await page.getByLabel('URL, domain, or partial address').fill('paypa1.com/login?utm_source=test');
  await page.getByRole('button', { name: 'Analyze' }).click();

  // Group 1 lexical forensics render synchronously, before any network telemetry resolves.
  await expect(page.locator('.url-token-tld')).toHaveText('TLD: com');
  await expect(page.locator('.url-token-sld')).toHaveText('SLD: paypa1');
  await expect(page.getByText(/paypa1\.com vs paypal\.com/i)).toBeVisible();
  await expect(page.locator('.lexical-card li', { hasText: 'utm_source' })).toBeVisible();

  await page.getByRole('button', { name: 'Scorecard & Export' }).click();
  await expect(page.locator('svg.score-radar')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Export JSON' })).toBeVisible();
});

test('every tab in the sticky section nav is reachable and shows its heading', async ({ page }) => {
  await page.goto('./#/tools/site-intelligence-analyzer');
  await page.getByLabel('URL, domain, or partial address').fill('example.com');
  await page.getByRole('button', { name: 'Analyze' }).click();

  const tabs: Array<[string, RegExp]> = [
    ['DNS & Network', /DNS & Network/],
    ['Registration & History', /Registration & History/],
    ['SSL/TLS & Security', /SSL\/TLS & Security/],
    ['Email Authentication', /Email Authentication/],
    ['Performance & Tech', /Performance & Tech/],
  ];
  for (const [tabLabel, heading] of tabs) {
    await page.getByRole('button', { name: tabLabel }).click();
    await expect(page.getByRole('heading', { name: heading })).toBeVisible();
  }
});


test('short-link resolution is explicit and only contacts the destination after user action', async ({ page }) => {
  await page.addInitScript(() => {
    const nativeFetch = window.fetch.bind(window);
    Object.defineProperty(window, '__shortenerRequests', { value: 0, writable: true });
    window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const value = input instanceof Request ? input.url : input.toString();
      const url = new URL(value, window.location.href);
      if (url.hostname === 'bit.ly') {
        const state = window as typeof window & { __shortenerRequests: number };
        state.__shortenerRequests += 1;
        return {
          url: 'https://example.com/final-destination',
          redirected: true,
        } as Response;
      }
      return nativeFetch(input, init);
    }) as typeof window.fetch;
  });
  await page.route('https://**', (route) => route.abort());

  await page.goto('./#/tools/site-intelligence-analyzer');
  await page.getByLabel('URL, domain, or partial address').fill('https://bit.ly/demo');
  await page.getByRole('button', { name: 'Analyze' }).click();

  await expect(page.getByText(/masks its true destination/i)).toBeVisible();
  await expect.poll(() => page.evaluate(() =>
    (window as typeof window & { __shortenerRequests: number }).__shortenerRequests,
  )).toBe(0);

  await page.getByRole('button', { name: 'Resolve destination' }).click();
  await expect(page.getByText(/example\.com\/final-destination/i)).toBeVisible();
  await expect.poll(() => page.evaluate(() =>
    (window as typeof window & { __shortenerRequests: number }).__shortenerRequests,
  )).toBe(1);
});

test('hosting coordinates render an accessible GeoIP distribution minimap', async ({ page }) => {
  await page.route('https://**', async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname === 'cloudflare-dns.com') {
      const type = url.searchParams.get('type');
      await route.fulfill({
        status: 200,
        contentType: 'application/dns-json',
        headers: { 'access-control-allow-origin': '*' },
        body: JSON.stringify({
          Status: 0,
          AD: true,
          Answer: type === 'A'
            ? [{ name: 'example.com.', type: 1, TTL: 300, data: '203.0.113.10' }]
            : [],
        }),
      });
      return;
    }
    if (url.hostname === 'ipapi.co') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'access-control-allow-origin': '*' },
        body: JSON.stringify({
          ip: '203.0.113.10',
          asn: 'AS64500',
          org: 'Example Network',
          city: 'Exampleville',
          country_name: 'Exampleland',
          latitude: 29.95,
          longitude: -90.07,
        }),
      });
      return;
    }
    await route.abort();
  });

  await page.goto('./#/tools/site-intelligence-analyzer');
  await page.getByLabel('URL, domain, or partial address').fill('example.com');
  await page.getByRole('button', { name: 'Analyze' }).click();
  await page.getByRole('button', { name: 'DNS & Network' }).click();

  await expect(page.getByText(/203\.0\.113\.10 → Example Network/i)).toBeVisible({ timeout: 15_000 });
  const map = page.locator('.geoip-map');
  await expect(map).toBeVisible();
  await expect(map).toHaveAttribute('role', 'region');
  await expect(map).toHaveAttribute('aria-label', 'GeoIP distribution map');
  await expect(map.getByRole('button', { name: /203\.0\.113\.10.*Exampleville/i })).toBeVisible();
});

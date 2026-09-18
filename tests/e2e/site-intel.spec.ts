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

test('detects a known shortener and offers best-effort destination resolution', async ({ page }) => {
  await page.goto('./#/tools/site-intelligence-analyzer');
  await page.getByLabel('URL, domain, or partial address').fill('https://bit.ly/3xamPle');
  await page.getByRole('button', { name: 'Analyze' }).click();

  await expect(page.getByText(/Bitly masks its true destination/i)).toBeVisible();
  await page.getByRole('button', { name: 'Resolve destination' }).click();
  await expect(page.locator('[data-testid="shortener-resolved"], [data-testid="shortener-resolve-error"]')).toBeVisible({ timeout: 15000 });
});

test('renders a GeoIP minimap panel and generates a downloadable social card', async ({ page }) => {
  await page.goto('./#/tools/site-intelligence-analyzer');
  await page.getByLabel('URL, domain, or partial address').fill('example.com');
  await page.getByRole('button', { name: 'Analyze' }).click();

  await page.getByRole('button', { name: 'DNS & Network' }).click();
  await expect(page.locator('.geo-minimap, .geo-minimap-empty')).toBeVisible({ timeout: 15000 });

  await page.getByRole('button', { name: 'Scorecard & Export' }).click();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Generate social card' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('site-intelligence-card.png');
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(chunk as Buffer);
  expect(Buffer.concat(chunks).length).toBeGreaterThan(1000);
});

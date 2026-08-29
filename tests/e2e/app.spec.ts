import { expect, test } from '@playwright/test';

const toolSlugs = [
  'exif-scrubber',
  'duckdb-workbench',
  'subtitle-drift',
  'hardware-packet-inspector',
  'fluid-type-matrix',
  'pdf-sanitizer',
  'cron-team-matrix',
  'midi-harmony-lab',
  'svg-sprite-compiler',
  'regex-log-structurer',
];

test('landing page exposes every registered suite without ordinal numbering', async ({ page }) => {
  await page.goto('./');
  await expect(page.getByRole('heading', { name: 'Private tools. Serious work. Nothing uploaded.' })).toBeVisible();
  await expect(page.getByTestId('tool-catalog').getByRole('link')).toHaveCount(toolSlugs.length);

  for (const slug of toolSlugs) {
    await expect(page.locator(`[href="#/tools/${slug}"]`)).toBeVisible();
  }

  await expect(page.getByText(/^Tool \d+/)).toHaveCount(0);
});

test('every registered suite opens with guidance, privacy status, and a usable workspace', async ({ page }) => {
  for (const slug of toolSlugs) {
    await page.goto(`./#/tools/${slug}`);
    await expect(page.getByTestId('suite-title')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'How to use this tool' })).toBeVisible();
    await expect(page.getByTestId('privacy-status')).toContainText(/local|browser|device/i);
    await expect(page.getByTestId('suite-workspace')).toBeVisible();
  }
});

test('favorites and recent tools survive a reload', async ({ page }) => {
  await page.goto('./#/tools/subtitle-drift');
  await page.getByRole('button', { name: 'Add to favorites' }).click();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Remove from favorites' })).toBeVisible();

  await page.goto('./');
  await expect(page.getByTestId('recent-tools')).toContainText('Subtitle');
});

test('support action exists without exposing internal implementation instructions', async ({ page }) => {
  await page.goto('./');
  const support = page.getByRole('link', { name: 'Buy me a coffee' });
  await expect(support).toBeVisible();
  await expect(support).toHaveAttribute('href', /^https:\/\/buymeacoffee\.com\//);
  await expect(page.locator('body')).not.toContainText('internal prompt');
});

test('hardware suite offers simulator mode when hardware APIs are unavailable', async ({ page }) => {
  await page.goto('./#/tools/hardware-packet-inspector');
  await expect(page.getByRole('button', { name: 'Start simulator' })).toBeVisible();
  await page.getByRole('button', { name: 'Start simulator' }).click();
  await expect(page.getByTestId('packet-stream')).toContainText(/RX|SIM/i);
});

test('layout does not create accidental horizontal page overflow', async ({ page }) => {
  await page.goto('./');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);

  await page.goto('./#/tools/duckdb-workbench');
  const suiteOverflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(suiteOverflow).toBeLessThanOrEqual(1);
});

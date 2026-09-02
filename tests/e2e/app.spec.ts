import { expect, test } from '@playwright/test';
import { TOOLS } from '../../src/catalog';

const toolSlugs = TOOLS.map((tool) => tool.slug);

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
  const support = page.getByRole('link', { name: /Buy me a coffee/ });
  await expect(support).toBeVisible();
  await expect(support).toHaveAttribute('href', /^https:\/\/buymeacoffee\.com\//);
  await expect(page.locator('body')).not.toContainText('internal prompt');
});

test('ethical support prompt is globally available, optional, and non-modal', async ({ page }) => {
  await page.goto('./');
  await expect(page.getByRole('link', { name: '☕ Buy me a coffee ($3)' })).toBeVisible();

  await page.evaluate(() => {
    window.dispatchEvent(new CustomEvent('inmotools:support-prompt', {
      detail: {
        key: 'e2e-high-value-export',
        message: "Rendered full 1080p 60 FPS tactical animation locally. If this upgraded your team's match preparation, support independent sports tooling with a coffee.",
      },
    }));
  });

  const prompt = page.getByRole('status', { name: 'Support independent tooling' });
  await expect(prompt).toBeVisible();
  await expect(prompt).toContainText('Rendered full 1080p 60 FPS tactical animation locally.');
  await expect(prompt.getByRole('link', { name: '☕ Buy me a coffee ($3)' })).toHaveAttribute('href', /^https:\/\/buymeacoffee\.com\//);
  await prompt.getByRole('button', { name: 'Dismiss support prompt' }).click();
  await expect(prompt).toHaveCount(0);
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


test('stale lazy chunk failures recover by refreshing onto the current deployment', async ({ page }) => {
  let blocked = false;
  await page.route('**/assets/workspaces-*.js', async (route) => {
    if (!blocked) {
      blocked = true;
      await route.abort('failed');
      return;
    }
    await route.continue();
  });

  await page.goto('./');
  await page.getByRole('link', { name: /PlanCraft Studio/ }).click();
  await expect(page.getByTestId('suite-title')).toContainText('PlanCraft Studio');
  expect(blocked).toBe(true);
});

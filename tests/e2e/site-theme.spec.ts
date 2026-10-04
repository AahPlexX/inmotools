import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const STORAGE_KEY = 'inmotools.theme.v1';
const SHELL_TOOL = 'subtitle-drift';

const themeGroup = (page: Page) => page.getByRole('group', { name: 'Site theme' });
const html = (page: Page) => page.locator('html');

async function storeChoice(page: Page, choice: string) {
  await page.addInitScript(([key, value]) => { window.localStorage.setItem(key, value); }, [STORAGE_KEY, choice]);
}

async function blockingViolations(page: Page, exclude: string[] = []) {
  let builder = new AxeBuilder({ page });
  for (const selector of exclude) builder = builder.exclude(selector);
  const results = await builder.analyze();
  return results.violations
    .filter((violation) => violation.impact === 'serious' || violation.impact === 'critical')
    .map((violation) => `${violation.id}: ${violation.help} (${violation.nodes.map((node) => node.target.join(' ')).join(', ')})`);
}

test('the header control switches the theme and the choice survives a reload', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('./');
  const group = themeGroup(page);
  await expect(group.getByRole('radio', { name: 'System' })).toBeChecked();
  await expect(html(page)).toHaveAttribute('data-theme', 'light');

  await group.getByRole('radio', { name: 'Dark' }).check();
  await expect(html(page)).toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('meta[name="color-scheme"]')).toHaveAttribute('content', 'dark');
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#0e141b');
  expect(await page.evaluate((key) => window.localStorage.getItem(key), STORAGE_KEY)).toBe('dark');
  const paper = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(paper).toBe('rgb(14, 20, 27)');

  await page.reload();
  await expect(html(page)).toHaveAttribute('data-theme', 'dark');
  await expect(themeGroup(page).getByRole('radio', { name: 'Dark' })).toBeChecked();

  await themeGroup(page).getByRole('radio', { name: 'Light' }).check();
  await expect(html(page)).toHaveAttribute('data-theme', 'light');
  await expect(page.locator('meta[name="color-scheme"]')).toHaveAttribute('content', 'light');
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#f6f7f8');
  await page.reload();
  await expect(themeGroup(page).getByRole('radio', { name: 'Light' })).toBeChecked();
  await expect(html(page)).toHaveAttribute('data-theme', 'light');
});

test('the control is a labelled radio group operable from the keyboard', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await storeChoice(page, 'light');
  await page.goto('./');
  const group = themeGroup(page);
  await expect(group).toBeVisible();
  await expect(group.getByRole('radio')).toHaveCount(3);
  await group.getByRole('radio', { name: 'Light' }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(group.getByRole('radio', { name: 'Dark' })).toBeFocused();
  await expect(group.getByRole('radio', { name: 'Dark' })).toBeChecked();
  await expect(group.getByRole('radio', { name: 'Light' })).not.toBeChecked();
  await expect(html(page)).toHaveAttribute('data-theme', 'dark');
});

test('System follows the colour scheme, including live changes', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('./');
  await expect(themeGroup(page).getByRole('radio', { name: 'System' })).toBeChecked();
  await expect(html(page)).toHaveAttribute('data-theme', 'dark');

  await page.emulateMedia({ colorScheme: 'light' });
  await expect(html(page)).toHaveAttribute('data-theme', 'light');
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(html(page)).toHaveAttribute('data-theme', 'dark');

  // An explicit choice is not overridden by the system setting.
  await themeGroup(page).getByRole('radio', { name: 'Light' }).check();
  await expect(html(page)).toHaveAttribute('data-theme', 'light');
  await page.emulateMedia({ colorScheme: 'light' });
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(html(page)).toHaveAttribute('data-theme', 'light');
});

test('the stored theme is applied before first paint', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await storeChoice(page, 'dark');
  await page.addInitScript(() => {
    const record = window as unknown as { themeAtBody?: string | null; themeAtDomContentLoaded?: string | null };
    const observer = new MutationObserver(() => {
      if (!document.body) return;
      record.themeAtBody = document.documentElement.getAttribute('data-theme');
      observer.disconnect();
    });
    observer.observe(document, { childList: true, subtree: true });
    document.addEventListener('DOMContentLoaded', () => {
      record.themeAtDomContentLoaded = document.documentElement.getAttribute('data-theme');
    });
  });
  await page.goto('./');
  await expect(html(page)).toHaveAttribute('data-theme', 'dark');
  const recorded = await page.evaluate(() => {
    const record = window as unknown as { themeAtBody?: string | null; themeAtDomContentLoaded?: string | null };
    return { body: record.themeAtBody, domContentLoaded: record.themeAtDomContentLoaded };
  });
  expect(recorded).toEqual({ body: 'dark', domContentLoaded: 'dark' });
});

test('printing keeps the light palette in the dark theme', async ({ page }) => {
  await storeChoice(page, 'dark');
  await page.goto('./');
  await expect(html(page)).toHaveAttribute('data-theme', 'dark');
  expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe('rgb(14, 20, 27)');
  await page.emulateMedia({ media: 'print' });
  expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe('rgb(246, 247, 248)');
});

test('tool pages carry the tool slug for per-tool theme overrides', async ({ page }) => {
  await page.goto(`./#/tools/${SHELL_TOOL}`);
  await expect(page.locator('.suite-page')).toHaveAttribute('data-tool', SHELL_TOOL);
});

for (const theme of ['light', 'dark'] as const) {
  test(`landing page has no serious or critical axe violations in ${theme}`, async ({ page }) => {
    await storeChoice(page, theme);
    await page.goto('./');
    await expect(html(page)).toHaveAttribute('data-theme', theme);
    await expect(page.getByTestId('tool-catalog')).toBeVisible();
    expect(await blockingViolations(page)).toEqual([]);
  });

  test(`tool shell has no serious or critical axe violations in ${theme}`, async ({ page }) => {
    await storeChoice(page, theme);
    await page.goto(`./#/tools/${SHELL_TOOL}`);
    await expect(html(page)).toHaveAttribute('data-theme', theme);
    await expect(page.getByTestId('suite-workspace')).toBeVisible();
    // The workspace belongs to the tool; its theme is that tool's own requirement.
    expect(await blockingViolations(page, ['[data-testid="suite-workspace"]'])).toEqual([]);
  });
}

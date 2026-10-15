import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const route = './#/tools/tactical-matchboard-studio';

async function addVideoErrorProbe(page: Page) {
  return page.evaluate(() => {
    const workspace = document.querySelector<HTMLElement>('.tactical-matchboard-workspace');
    if (!workspace) throw new Error('Tactical Matchboard workspace is missing.');
    const probe = document.createElement('p');
    probe.className = 'tactical-video-error';
    probe.textContent = 'Theme contrast probe';
    workspace.append(probe);
    const style = getComputedStyle(probe);
    return {
      color: style.color,
      backgroundColor: style.backgroundColor,
      borderColor: style.borderTopColor,
    };
  });
}

test('TMS-R82 stored dark theme wins over a light operating-system preference and passes contrast', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.addInitScript(() => window.localStorage.setItem('inmotools.theme.v1', 'dark'));
  await page.goto(route);

  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  expect(await page.evaluate(() => window.matchMedia('(prefers-color-scheme: dark)').matches)).toBe(false);
  await expect(page.getByRole('heading', { name: 'Tactical Matchboard Studio', exact: true })).toBeVisible();

  expect(await addVideoErrorProbe(page)).toEqual({
    color: 'rgb(255, 215, 211)',
    backgroundColor: 'rgb(74, 29, 29)',
    borderColor: 'rgb(226, 170, 166)',
  });

  const results = await new AxeBuilder({ page })
    .include('.tactical-matchboard-workspace')
    .withRules(['color-contrast'])
    .analyze();
  expect(results.violations, results.violations.map((item) => `${item.id}: ${item.help}`).join('\n')).toEqual([]);
});

test('TMS-R82 stored light theme wins over a dark operating-system preference', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.addInitScript(() => window.localStorage.setItem('inmotools.theme.v1', 'light'));
  await page.goto(route);

  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  expect(await page.evaluate(() => window.matchMedia('(prefers-color-scheme: dark)').matches)).toBe(true);
  await expect(page.getByRole('heading', { name: 'Tactical Matchboard Studio', exact: true })).toBeVisible();

  expect(await addVideoErrorProbe(page)).toEqual({
    color: 'rgb(127, 29, 29)',
    backgroundColor: 'rgb(248, 232, 230)',
    borderColor: 'rgb(226, 170, 166)',
  });
});

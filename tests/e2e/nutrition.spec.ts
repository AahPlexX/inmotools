import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const documentOverflow = (page: import('@playwright/test').Page) => page.evaluate(() => ({
  scrollWidth: document.documentElement.scrollWidth,
  clientWidth: document.documentElement.clientWidth,
}));

test('catalog link, exact alias, and generic route open the same local workspace', async ({ page }) => {
  await page.goto('./#/');
  const catalogLink = page.getByRole('link', { name: /Energy & Macro Planner/ });
  await expect(catalogLink).toBeVisible();
  await expect(catalogLink).toHaveAttribute('href', '#/tools/energy-macro-planner');
  await catalogLink.click();
  await expect(page.getByTestId('planner-results')).toBeVisible();

  await page.goto('./#/energy-macro-planner');
  await expect(page.getByTestId('suite-title')).toContainText('Energy Expenditure & Macronutrient Planner');
  await expect(page.getByTestId('privacy-status')).toContainText(/local|browser|device/i);

  await page.goto('./#/tools/energy-macro-planner');
  await expect(page.getByTestId('planner-results')).toBeVisible();
});

test('computes basal rate, expenditure, target, and macronutrient grams', async ({ page }) => {
  await page.goto('./#/energy-macro-planner');
  await page.getByTestId('weight-input').fill('80');
  await page.getByTestId('height-input').fill('180');
  await page.getByTestId('age-input').fill('30');
  await page.getByTestId('sex-select').selectOption('male');
  await page.getByTestId('activity-select').selectOption('moderately_active');
  await page.getByTestId('goal-select').selectOption('maintenance');

  // Mifflin-St Jeor: 10*80 + 6.25*180 - 5*30 + 5 = 1780; TDEE = 1780 * 1.55 = 2759.
  await expect(page.getByTestId('bmr-primary')).toContainText('1,780');
  await expect(page.getByTestId('bmr-primary')).toContainText('Mifflin-St Jeor');
  await expect(page.getByTestId('tdee-kcal')).toContainText('2,759');
  await expect(page.getByTestId('target-kcal')).toHaveText('2,759');

  // Balanced split: protein 25% of 2759 = 689.75 kcal / 4 = 172 g.
  await expect(page.getByTestId('grams-protein')).toHaveText('172 g');
  await expect(page.getByTestId('katch-absent')).toBeVisible();
});

test('adds the Katch-McArdle equation when body fat is supplied', async ({ page }) => {
  await page.goto('./#/energy-macro-planner');
  await page.getByTestId('weight-input').fill('80');
  await page.getByTestId('height-input').fill('180');
  await page.getByTestId('age-input').fill('30');
  await expect(page.getByTestId('katch-absent')).toBeVisible();

  await page.getByTestId('body-fat-toggle').check();
  await page.getByTestId('body-fat-input').fill('20');

  // Lean mass 64 kg; 370 + 21.6*64 = 1752.4 -> 1752.
  await expect(page.getByTestId('katch-present')).toContainText('1,752');
  await expect(page.getByTestId('bmr-primary')).toContainText('Katch-McArdle');
});

test('rejects a custom split that does not total one hundred percent', async ({ page }) => {
  await page.goto('./#/energy-macro-planner');
  await page.getByTestId('split-select').selectOption('custom');
  await expect(page.getByTestId('custom-split-ok')).toBeVisible();

  await page.getByTestId('custom-protein').fill('50');
  await expect(page.getByTestId('custom-split-error')).toContainText('total 100');
  await expect(page.getByTestId('planner-blocked')).toBeVisible();

  await page.getByTestId('custom-fat').fill('20');
  await page.getByTestId('custom-carbohydrate').fill('30');
  await expect(page.getByTestId('custom-split-ok')).toBeVisible();
  await expect(page.getByTestId('planner-results')).toBeVisible();
});

test('reports a low-intake advisory without withholding the numbers', async ({ page }) => {
  await page.goto('./#/energy-macro-planner');
  await page.getByTestId('weight-input').fill('45');
  await page.getByTestId('height-input').fill('150');
  await page.getByTestId('age-input').fill('60');
  await page.getByTestId('sex-select').selectOption('female');
  await page.getByTestId('activity-select').selectOption('sedentary');
  await page.getByTestId('goal-select').selectOption('moderate_deficit');

  const advisories = page.getByTestId('planner-advisories');
  await expect(advisories).toContainText('planning floor');
  await expect(advisories).toContainText('not a clinical minimum');
  await expect(page.getByTestId('target-kcal')).not.toHaveText('0');
  await expect(page.getByTestId('macro-table')).toBeVisible();
});

test('switches units and keeps the underlying measurement', async ({ page }) => {
  await page.goto('./#/energy-macro-planner');
  await page.getByTestId('weight-input').fill('80');
  await page.getByTestId('height-input').fill('180');
  const target = await page.getByTestId('target-kcal').textContent();

  await page.getByRole('button', { name: 'Imperial' }).click();
  await expect(page.getByTestId('height-feet')).toBeVisible();
  // Converting the display must not change the computed plan.
  await expect(page.getByTestId('target-kcal')).toHaveText(target ?? '');

  await page.getByRole('button', { name: 'Metric' }).click();
  await expect(page.getByTestId('weight-input')).toHaveValue('80');
});

test('exposes export controls and restores autosaved measurements', async ({ page }) => {
  await page.goto('./#/energy-macro-planner');
  await page.getByTestId('weight-input').fill('93');
  await expect(page.getByRole('button', { name: 'Copy Markdown' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Download Markdown' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Download CSV' })).toBeVisible();

  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download CSV' }).click();
  expect((await download).suggestedFilename()).toBe('energy-plan.csv');

  await page.waitForTimeout(900);
  await page.reload();
  await expect(page.getByTestId('weight-input')).toHaveValue('93');

  await page.getByRole('button', { name: 'Reset' }).click();
  await expect(page.getByTestId('weight-input')).toHaveValue('80');
});

const viewports = [
  { name: '320 portrait phone', width: 320, height: 568 },
  { name: '390 portrait phone', width: 390, height: 844 },
  { name: '844 landscape phone', width: 844, height: 390 },
  { name: '768 tablet portrait', width: 768, height: 1024 },
  { name: '1440 desktop', width: 1440, height: 900 },
];

for (const viewport of viewports) {
  test(`stays readable without overflow or collisions at ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto('./#/energy-macro-planner');
    await page.getByTestId('body-fat-toggle').check();
    await expect(page.getByTestId('planner-results')).toBeVisible();

    const { scrollWidth, clientWidth } = await documentOverflow(page);
    expect(scrollWidth, `document must not scroll horizontally at ${viewport.name}`).toBeLessThanOrEqual(clientWidth + 1);

    // The headline figure and its label must not overlap, and text must stay legible.
    const collisions = await page.evaluate(() => {
      const boxes = [...document.querySelectorAll('.planner-headline-facts dt, .planner-headline-facts dd, .planner-headline-primary strong, .planner-headline-primary small, .planner-section h3, .planner-badge, .planner-range')]
        .map((node) => ({ text: (node.textContent ?? '').trim(), rect: node.getBoundingClientRect(), node }))
        .filter((item) => item.text.length > 0 && item.rect.width > 0 && item.rect.height > 0);
      const overlaps: string[] = [];
      for (let left = 0; left < boxes.length; left += 1) {
        for (let right = left + 1; right < boxes.length; right += 1) {
          const a = boxes[left]!; const b = boxes[right]!;
          if (a.node.contains(b.node) || b.node.contains(a.node)) continue;
          const intersectWidth = Math.min(a.rect.right, b.rect.right) - Math.max(a.rect.left, b.rect.left);
          const intersectHeight = Math.min(a.rect.bottom, b.rect.bottom) - Math.max(a.rect.top, b.rect.top);
          if (intersectWidth > 1 && intersectHeight > 1) overlaps.push(`"${a.text}" overlaps "${b.text}"`);
        }
      }
      return overlaps;
    });
    expect(collisions, `overlapping text at ${viewport.name}`).toEqual([]);

    // No element may be clipped by its own container, which is how text smooshes.
    const clipped = await page.evaluate(() => [...document.querySelectorAll('.planner-section, .planner-headline, .field, .planner-advisories li')]
      .filter((node) => node.scrollWidth > node.clientWidth + 1)
      .map((node) => `${node.className}: ${node.scrollWidth} > ${node.clientWidth}`));
    expect(clipped, `clipped containers at ${viewport.name}`).toEqual([]);

    const results = await new AxeBuilder({ page }).include('[data-testid="suite-workspace"]').analyze();
    const blocking = results.violations.filter((violation) => violation.impact === 'serious' || violation.impact === 'critical');
    expect(blocking.map((item) => `${item.id}: ${item.help}`)).toEqual([]);
  });
}

import { expect, test, type Page } from '@playwright/test';
import { texturedScenePng } from '../fixtures/photo-png';

test.use({ serviceWorkers: 'block' });

async function openMergePanel(page: Page) {
  await page.goto('/inmotools/#/tools/photo-studio');
  await expect(page.getByRole('heading', { name: 'Photo Studio', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Merge', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Merge photos' })).toBeVisible();
}

function frame(name: string, width: number, height: number, options: Parameters<typeof texturedScenePng>[2] = {}) {
  return { name, mimeType: 'image/png', buffer: texturedScenePng(width, height, options) };
}

test('an average stack of tripod frames opens as a new editable photo', async ({ page }) => {
  await openMergePanel(page);
  await page.getByLabel('Merge type').selectOption('average-stack');
  await page.setInputFiles('[data-testid="photo-merge-input"]', [
    frame('stack-1.png', 96, 64, { seed: 3 }),
    frame('stack-2.png', 96, 64, { seed: 3, exposure: 1.1 }),
    frame('stack-3.png', 96, 64, { seed: 3, exposure: 0.9 }),
  ]);
  await expect(page.getByTestId('photo-merge-source')).toHaveCount(3);
  await expect(page.getByTestId('photo-merge-plan')).toContainText('3 photos · 96 × 64');
  await page.getByLabel('Alignment').selectOption('none');
  await page.getByRole('button', { name: 'Create average stack' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Average stack finished' })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId('photo-source-dimensions')).toHaveText('96 × 64');
  await expect(page.getByTestId('photo-preview')).toBeVisible();
  // The result is an ordinary source: other editing panels work on it immediately.
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByLabel('Exposure value', { exact: true }).fill('0.5');
  await expect(page.getByRole('button', { name: 'Undo' })).toBeEnabled();
});

test('HDR is blocked until every photo has a distinct shutter speed', async ({ page }) => {
  await openMergePanel(page);
  await page.getByLabel('Merge type').selectOption('hdr');
  await page.setInputFiles('[data-testid="photo-merge-input"]', [
    frame('dark.png', 80, 60, { exposure: 0.5 }),
    frame('bright.png', 80, 60, { exposure: 2 }),
  ]);
  const create = page.getByRole('button', { name: 'Create hdr merge' });
  await expect(page.getByTestId('photo-merge-plan')).toContainText('Photo 1 needs a positive exposure time');
  await expect(create).toBeDisabled();
  await page.getByLabel('dark.png shutter speed').fill('1/200');
  await page.getByLabel('bright.png shutter speed').fill('1/200');
  await expect(page.getByTestId('photo-merge-plan')).toContainText('at least two different exposure times');
  await page.getByLabel('bright.png shutter speed').fill('1/50');
  await expect(create).toBeEnabled();
});

test('stacks refuse photos of different sizes and name the offending photo', async ({ page }) => {
  await openMergePanel(page);
  await page.getByLabel('Merge type').selectOption('median-stack');
  await page.setInputFiles('[data-testid="photo-merge-input"]', [
    frame('wide.png', 90, 60),
    frame('narrow.png', 70, 60),
  ]);
  await expect(page.getByTestId('photo-merge-plan')).toContainText('Photo 2 is 70 × 60 but photo 1 is 90 × 60');
  await expect(page.getByRole('button', { name: 'Create median stack' })).toBeDisabled();
  // Panorama accepts mixed sizes.
  await page.getByLabel('Merge type').selectOption('panorama');
  await expect(page.getByTestId('photo-merge-plan')).toContainText('mixed sizes allowed');
});

test('handheld exposure fusion aligns frames in the background engine and reports confidence', async ({ page }) => {
  test.setTimeout(120_000);
  await openMergePanel(page);
  await page.setInputFiles('[data-testid="photo-merge-input"]', [
    frame('under.png', 240, 180, { exposure: 0.55, seed: 29 }),
    frame('normal.png', 240, 180, { dx: 4, dy: -3, seed: 29 }),
    frame('over.png', 240, 180, { exposure: 1.7, dx: -3, dy: 2, seed: 29 }),
  ]);
  await expect(page.getByTestId('photo-merge-source')).toHaveCount(3);
  await page.getByRole('button', { name: 'Check alignment' }).click();
  await expect(page.getByTestId('photo-merge-confidence')).toHaveCount(3, { timeout: 90_000 });
  await expect(page.getByTestId('photo-merge-confidence').first()).toContainText('% match');
  await page.getByRole('button', { name: 'Create exposure fusion' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Exposure fusion finished' })).toBeVisible({ timeout: 90_000 });
  await expect(page.getByTestId('photo-preview')).toBeVisible();
  // Cropping to shared coverage trims the few edge pixels the shifted frames do not reach.
  const dimensions = await page.getByTestId('photo-source-dimensions').textContent();
  const [width, height] = (dimensions ?? '').split('×').map((value) => Number(value.trim()));
  expect(width).toBeGreaterThan(225);
  expect(width).toBeLessThanOrEqual(240);
  expect(height).toBeGreaterThan(165);
  expect(height).toBeLessThanOrEqual(180);
});

test('merge panel reflows without page-level horizontal scrolling at 320 CSS px', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await openMergePanel(page);
  await page.setInputFiles('[data-testid="photo-merge-input"]', [
    frame('a-very-long-file-name-from-a-camera-roll-0001.png', 64, 48),
    frame('a-very-long-file-name-from-a-camera-roll-0002.png', 64, 48),
  ]);
  await page.getByLabel('Merge type').selectOption('hdr');
  await expect(page.getByTestId('photo-merge-source')).toHaveCount(2);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

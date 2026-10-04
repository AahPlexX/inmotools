import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

test('composites alpha tokens, omits self pairs, and exposes labelled matrix controls',async({page})=>{
 await page.goto('./#/tools/apca-token-matrix');
 await page.locator('#contrast-tokens').fill('--glass: rgb(0 0 0 / 50%);\n--paper: #ffffff;');
 await expect(page.locator('.metric').filter({hasText:'Valid tokens'})).toContainText('2');
 await expect(page.locator('.metric').filter({hasText:'Directional pairings'})).toContainText('2');
 await expect(page.getByText(/α 0\.50/).first()).toBeVisible();
 await page.locator('#contrast-view').selectOption('heatmap');
 const heatmap=page.getByRole('region',{name:'Axis-labelled contrast heatmap'});
 await expect(heatmap.getByRole('columnheader',{name:'--paper'})).toBeVisible();
 await expect(heatmap.getByRole('rowheader',{name:'--glass'})).toBeVisible();
 await page.locator('#sandbox-fg').selectOption('--paper');
 await page.locator('#sandbox-bg').selectOption('--paper');
 await expect(page.getByText(/self-pairs are intentionally excluded/i)).toBeVisible();
});

test('rejects duplicate exported token names and exports filtered CSV',async({page})=>{
 await page.goto('./#/tools/apca-token-matrix');
 await page.locator('#contrast-tokens').fill('accent:#000;\nACCENT:#fff;\n--paper:#fff;');
 await expect(page.getByRole('listitem').filter({hasText:/Duplicate exported token name/i})).toBeVisible();
 await page.locator('#contrast-tokens').fill('--ink:#000;\n--paper:#fff;\n--muted:#777;');
 await page.locator('#contrast-filter').selectOption('fail');
 const downloadPromise=page.waitForEvent('download');
 await page.getByRole('button',{name:'Export current CSV'}).click();
 expect((await downloadPromise).suggestedFilename()).toBe('contrast-matrix.csv');
});

const THREE_TOKENS = '--ink: #000000;\n--paper: #ffffff;\n--muted: #777777;';

async function pairRows(page: import('@playwright/test').Page) {
  const rows = page.getByRole('region', { name: 'APCA and WCAG contrast matrix' }).locator('tbody tr');
  return rows.evaluateAll((items) => items.map((row) => {
    const cells = [...row.querySelectorAll('td')].map((cell) => cell.textContent?.trim() ?? '');
    return `${cells[0]} on ${cells[1]}`;
  }));
}

test('APC-R06 role guidance with a filter that shows only passing or failing pairs', async ({ page }) => {
  await page.goto('./#/tools/apca-token-matrix');
  await page.locator('#contrast-tokens').fill(THREE_TOKENS);
  await page.locator('#contrast-sort').selectOption('name');

  await page.locator('#contrast-filter').selectOption('pass');
  expect(await pairRows(page)).toEqual(['--ink on --paper', '--paper on --ink', '--paper on --muted']);
  const table = page.getByRole('region', { name: 'APCA and WCAG contrast matrix' });
  await expect(table.locator('tbody tr').filter({ hasText: 'meets selected body text target (|Lc| ≥ 75)' })).toHaveCount(3);

  await page.locator('#contrast-filter').selectOption('fail');
  expect(await pairRows(page)).toEqual(['--ink on --muted', '--muted on --ink', '--muted on --paper']);
  await expect(table.locator('tbody tr').filter({ hasText: 'below selected body text target (|Lc| < 75)' })).toHaveCount(3);

  await page.locator('#contrast-role').selectOption('large');
  expect(await pairRows(page)).toEqual(['--ink on --muted', '--muted on --ink']);
  await page.locator('#contrast-filter').selectOption('pass');
  expect(await pairRows(page)).toEqual(['--ink on --paper', '--muted on --paper', '--paper on --ink', '--paper on --muted']);
  await expect(table.locator('tbody tr').filter({ hasText: 'meets selected large text target (|Lc| ≥ 60)' })).toHaveCount(4);

  await page.locator('#contrast-role').selectOption('ui');
  await expect(table.locator('tbody tr').filter({ hasText: 'meets selected UI graphics/text target (|Lc| ≥ 45)' })).toHaveCount(4);
});

test('APC-R07 sorts pairings by token name, APCA magnitude or WCAG ratio', async ({ page }) => {
  await page.goto('./#/tools/apca-token-matrix');
  await page.locator('#contrast-tokens').fill(THREE_TOKENS);

  await page.locator('#contrast-sort').selectOption('apca-desc');
  expect(await pairRows(page)).toEqual(['--paper on --ink', '--ink on --paper', '--paper on --muted', '--muted on --paper', '--ink on --muted', '--muted on --ink']);
  await page.locator('#contrast-sort').selectOption('wcag-desc');
  expect(await pairRows(page)).toEqual(['--ink on --paper', '--paper on --ink', '--ink on --muted', '--muted on --ink', '--paper on --muted', '--muted on --paper']);
  await page.locator('#contrast-sort').selectOption('name');
  expect(await pairRows(page)).toEqual(['--ink on --muted', '--ink on --paper', '--muted on --ink', '--muted on --paper', '--paper on --ink', '--paper on --muted']);
});

test('APC-R10 the component sandbox renders protanopia, deuteranopia and tritanopia previews of the chosen pair', async ({ page }) => {
  await page.goto('./#/tools/apca-token-matrix');
  await page.locator('#contrast-tokens').fill('--ink: #000000;\n--red: #ff0000;\n--signal: #205bd6;');
  await page.locator('#sandbox-fg').selectOption('--signal');
  await page.locator('#sandbox-bg').selectOption('--red');
  const sample = page.locator('div', { has: page.getByText('Readable interface sample', { exact: true }) }).last();
  await expect(sample).toContainText('#205bd6 on #ff0000');
  const colours = () => sample.evaluate((element) => { const style = getComputedStyle(element); return [style.backgroundColor, style.color]; });
  expect(await colours()).toEqual(['rgb(255, 0, 0)', 'rgb(32, 91, 214)']);

  const cvd = page.getByLabel('Color-vision preview');
  await expect(cvd.locator('option')).toHaveText(['No simulation', 'Protanopia preview', 'Deuteranopia preview', 'Tritanopia preview']);
  await cvd.selectOption('protanopia');
  expect(await colours()).toEqual(['rgb(145, 142, 0)', 'rgb(58, 58, 184)']);
  await cvd.selectOption('deuteranopia');
  expect(await colours()).toEqual(['rgb(159, 179, 0)', 'rgb(54, 50, 177)']);
  await cvd.selectOption('tritanopia');
  expect(await colours()).toEqual(['rgb(242, 0, 0)', 'rgb(35, 161, 156)']);
  await expect(sample).toContainText('#205bd6 on #ff0000');
});

test('APC-R12 copied and downloaded CSS custom properties contain only the valid tokens', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('./#/tools/apca-token-matrix');
  await page.locator('#contrast-tokens').fill('--ink: #000;\nnot a token line\n--bad: notacolor;\naccent: oklch(60% 0.15 255);\n--ink: #fff;');
  await expect(page.locator('.metric').filter({ hasText: 'Source errors' })).toContainText('3');
  const expected = ':root {\n  --ink: #000;\n  --accent: oklch(60% 0.15 255);\n}\n';

  await page.getByRole('button', { name: 'Copy CSS variables' }).click();
  await expect(page.locator('.status-line')).toHaveText('Copied 2 CSS custom properties.');
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(expected);

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download CSS' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('color-tokens.css');
  expect(readFileSync(await download.path(), 'utf8')).toBe(expected);
});

for (const width of [320, 375, 768, 1024, 1440, 1920, 2560]) {
  test(`APC-R14 lays out without horizontal overflow at ${width} px`, async ({ page, isMobile }) => {
    test.skip(isMobile, 'viewport matrix runs on the desktop project');
    await page.setViewportSize({ width, height: width < 800 ? 800 : 1000 });
    await page.goto('./#/tools/apca-token-matrix');
    for (const view of ['table', 'heatmap']) {
      await page.locator('#contrast-view').selectOption(view);
      await expect(page.getByRole('heading', { name: 'Component sandbox' })).toBeVisible();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, `${view} view overflow at ${width}px`).toBeLessThanOrEqual(1);
      for (const control of [page.locator('#contrast-tokens'), page.locator('#contrast-filter'), page.locator('#sandbox-cvd'), page.getByRole('button', { name: 'Export current CSV' }), page.getByRole('button', { name: 'Download CSS' })]) {
        const box = await control.boundingBox();
        expect(box && box.x >= 0 && box.x + box.width <= width + 1, `control inside viewport at ${width}px`).toBe(true);
      }
    }
  });
}

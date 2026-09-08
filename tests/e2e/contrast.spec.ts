import { expect, test } from '@playwright/test';

test('composites alpha tokens, omits self pairs, and exposes labelled matrix controls',async({page})=>{
 await page.goto('./#/tools/apca-token-matrix');
 await page.locator('#contrast-tokens').fill('--glass: rgb(0 0 0 / 50%);\n--paper: #ffffff;');
 await expect(page.locator('.metric').filter({hasText:'Valid tokens'})).toContainText('2');
 await expect(page.locator('.metric').filter({hasText:'Directional pairings'})).toContainText('2');
 await expect(page.getByText(/α 0\.50/)).toBeVisible();
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
 await expect(page.getByText(/Duplicate exported token name/i)).toBeVisible();
 await page.locator('#contrast-tokens').fill('--ink:#000;\n--paper:#fff;\n--muted:#777;');
 await page.locator('#contrast-filter').selectOption('fail');
 const downloadPromise=page.waitForEvent('download');
 await page.getByRole('button',{name:'Export current CSV'}).click();
 expect((await downloadPromise).suggestedFilename()).toBe('contrast-matrix.csv');
});

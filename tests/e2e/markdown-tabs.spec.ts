import { expect, test, type Page } from '@playwright/test';

const editorOf = (page: Page) => page.getByRole('textbox', { name: 'Markdown source' });
const openInNewTab = async (page: Page, name: string, text: string) => {
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Open in new tab', exact: true }).click();
  await (await chooser).setFiles({ name, mimeType: 'text/markdown', buffer: Buffer.from(text) });
};
const noOverflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

test('MDW-R70 two opened documents keep their own text when switching tabs', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('./#/tools/markdown-workbench');
  await expect(page.getByRole('tablist')).toHaveCount(0);

  await openInNewTab(page, 'alpha.md', '# Alpha\n\nfirst body');
  await expect(page.getByRole('tablist', { name: 'Open documents' })).toBeVisible();
  await expect(page.getByRole('tab')).toHaveCount(2);
  await expect(editorOf(page)).toContainText('first body');

  await openInNewTab(page, 'beta.md', '# Beta\n\nsecond body');
  await expect(page.getByRole('tab')).toHaveCount(3);
  await expect(editorOf(page)).toContainText('second body');
  await expect(page.getByRole('tab', { name: 'beta', exact: true })).toHaveAttribute('aria-selected', 'true');

  // An edit in the active tab survives leaving and returning.
  await editorOf(page).click();
  await page.keyboard.insertText('EDITED ');
  await page.getByRole('tab', { name: 'alpha', exact: true }).click();
  await expect(editorOf(page)).toContainText('first body');
  await expect(editorOf(page)).not.toContainText('second body');
  await page.getByRole('tab', { name: 'beta', exact: true }).click();
  await expect(editorOf(page)).toContainText('EDITED');
  await expect(editorOf(page)).toContainText('second body');

  // The first tab still holds the untouched starter document.
  await page.getByRole('tab').first().click();
  await expect(editorOf(page)).toContainText('Untitled document');

  expect(await noOverflow(page)).toBe(true);
  expect(errors).toEqual([]);
});

test('MDW-R70 New tab, keyboard switching and closing a tab', async ({ page }) => {
  await page.goto('./#/tools/markdown-workbench');
  await editorOf(page).click();
  await editorOf(page).press('ControlOrMeta+A');
  await page.keyboard.insertText('# One');
  await page.getByRole('button', { name: 'New tab', exact: true }).click();
  await expect(page.getByRole('tab')).toHaveCount(2);
  await expect(editorOf(page)).toContainText('Untitled document');
  await editorOf(page).click();
  await editorOf(page).press('ControlOrMeta+A');
  await page.keyboard.insertText('# Two');

  const first = page.getByRole('tab').first();
  await page.getByRole('tab', { name: 'Two', exact: true }).focus();
  await page.keyboard.press('ArrowLeft');
  await expect(first).toHaveAttribute('aria-selected', 'true');
  await expect(first).toBeFocused();
  await expect(editorOf(page)).toContainText('# One');

  await page.getByRole('button', { name: 'Close tab One', exact: true }).click();
  await expect(page.getByRole('tab')).toHaveCount(0);
  await expect(editorOf(page)).toContainText('# Two');
  expect(await noOverflow(page)).toBe(true);
});

test('MDW-R70 many tabs with long names stay inside the viewport', async ({ page }) => {
  await page.goto('./#/tools/markdown-workbench');
  for (let index = 0; index < 4; index += 1) {
    await openInNewTab(page, `a-very-long-document-name-that-should-be-shortened-${index}.md`, `# Document ${index}`);
  }
  await expect(page.getByRole('tab')).toHaveCount(5);
  expect(await noOverflow(page)).toBe(true);
  const bar = page.getByRole('tablist');
  const box = await bar.boundingBox();
  const viewport = page.viewportSize();
  expect(box && viewport && box.x + box.width <= viewport.width + 0.5).toBe(true);
});

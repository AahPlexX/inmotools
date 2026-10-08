import { expect, test, type Page } from '@playwright/test';

const leaveRequested = (page: Page) => page.evaluate(() => {
  const event = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(event);
  return event.defaultPrevented;
});

test('MDW-R68 leaving with unsaved changes asks for confirmation and a clean document does not', async ({ page }) => {
  await page.goto('./#/tools/markdown-workbench');
  const editor = page.getByRole('textbox', { name: 'Markdown source' });
  await expect(editor).toBeVisible();
  expect(await leaveRequested(page)).toBe(false);

  await editor.click();
  await page.keyboard.insertText('unsaved words');
  await expect.poll(() => leaveRequested(page)).toBe(true);

  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect(page.getByTestId('markdown-save-state')).toContainText(/Saved/, { timeout: 15_000 });
  await expect(page.getByTestId('markdown-save-state')).not.toContainText('Unsaved');
  expect(await leaveRequested(page)).toBe(false);

  await editor.click();
  await page.keyboard.insertText(' more');
  await expect.poll(() => leaveRequested(page)).toBe(true);
});

test('MDW-R68 closing the page with unsaved changes raises the browser confirmation dialog', async ({ page }) => {
  await page.goto('./#/tools/markdown-workbench');
  const editor = page.getByRole('textbox', { name: 'Markdown source' });
  await editor.click();
  await page.keyboard.insertText('unsaved words');
  await expect.poll(() => leaveRequested(page)).toBe(true);
  const dialog = page.waitForEvent('dialog');
  await page.close({ runBeforeUnload: true });
  expect((await dialog).type()).toBe('beforeunload');
  await (await dialog).dismiss();
});

import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const metric = (page: Page, label: string) => page.getByTestId('markdown-document-metrics').locator('div').filter({ has: page.getByText(label, { exact: true }) }).locator('dd');
const load = async (page: Page, source: string) => page.setInputFiles('input[type="file"][accept*=".html"]', { name: 'readability.md', mimeType: 'text/markdown', buffer: Buffer.from(source) });
const flesch = 'Flesch–Kincaid grade (English estimate)';
const coleman = 'Coleman–Liau index (English estimate)';

test('MDW-R55 reference grades update through editing Undo reset draft restore and exact source export', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('./#/tools/markdown-workbench');
  const source = '---\r\nname: hidden metadata prose\r\n---\r\n\r\nThe cat sat. The dog ran.\r\n\r\n~~~js\r\nhidden code words\r\n~~~\r\n';
  await load(page, source);
  await page.getByText('Document metrics', { exact: true }).click();
  await expect(metric(page, 'Words')).toHaveText('6');
  await expect(metric(page, 'Characters')).toHaveText('18');
  await expect(metric(page, 'Sentences')).toHaveText('2');
  await expect(metric(page, flesch)).toHaveText('-2.6');
  await expect(metric(page, coleman)).toHaveText('-8.0');
  await expect(page.getByTestId('markdown-live-metrics')).toContainText('6 words');
  const original = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Markdown', exact: true }).click();
  expect((await readFile((await (await original).path())!)).equals(Buffer.from(source))).toBe(true);
  const editor = page.getByRole('textbox', { name: 'Markdown source' });
  await editor.click();
  await editor.press('ControlOrMeta+End');
  await page.keyboard.insertText('\n\nMorning reading.');
  await expect(metric(page, 'Words')).toHaveText('8');
  await expect(metric(page, 'Sentences')).toHaveText('3');
  await page.getByRole('button', { name: 'Undo document step', exact: true }).click();
  await expect(metric(page, 'Words')).toHaveText('6');
  await expect(metric(page, flesch)).toHaveText('-2.6');
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect(page.getByTestId('markdown-save-state')).toContainText(/Saved/, { timeout: 15_000 });
  await page.getByRole('button', { name: 'New', exact: true }).click();
  await expect(page.locator('.markdown-workbench-preview h1')).toContainText('Untitled document');
  await expect(metric(page, 'Words')).not.toHaveText('6');
  const drafts = page.getByTestId('markdown-draft-list');
  await page.locator('details').filter({ has: drafts }).locator('summary').click();
  await drafts.locator('li > button').first().click();
  await expect(metric(page, flesch)).toHaveText('-2.6');
  const restored = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Markdown', exact: true }).click();
  expect((await readFile((await (await restored).path())!)).equals(Buffer.from(source))).toBe(true);
  await load(page, 'There are more things in Heaven and Earth, Horatio, than are dreamt of in your philosophy.');
  await expect(metric(page, 'Words')).toHaveText('16');
  await expect(metric(page, coleman)).toHaveText('8.8');
  await load(page, '    code only prose\n');
  await expect(metric(page, 'Words')).toHaveText('0');
  await expect(metric(page, flesch)).toHaveText('Not available');
  await expect(metric(page, coleman)).toHaveText('Not available');
  await load(page, '東京の文章。 123456789?!');
  await expect(metric(page, 'Words')).toHaveText('2');
  await expect(metric(page, flesch)).toHaveText('Not available');
  await expect(metric(page, coleman)).toHaveText('Not available');
  const notice = await page.request.get(await page.getByRole('link', { name: 'Readability library notices', exact: true }).getAttribute('href') as string);
  expect(notice.ok()).toBe(true);
  expect(await notice.text()).toContain('Copyright (c) 2014 Titus Wormer');
  expect(await notice.text()).toContain('Copyright (c) 2013 Blake Embrey');
  expect(await notice.text()).toContain('Pablo Terradillos');
  expect(errors).toEqual([]);
});

test('MDW-R55 long metric labels and values fit phone orientations tablet and desktop without overlap', async ({ page }) => {
  await page.goto('./#/tools/markdown-workbench');
  await load(page, 'The cat sat. The dog ran.');
  await page.getByText('Document metrics', { exact: true }).click();
  for (const size of [{ width: 320, height: 568 }, { width: 844, height: 390 }, { width: 768, height: 1024 }, { width: 2560, height: 1440 }]) {
    await page.setViewportSize(size);
    const bounds = await page.getByTestId('markdown-document-metrics').evaluate(node => {
      const container = node.getBoundingClientRect();
      return { left: container.left, right: container.right, overflow: node.scrollWidth > node.clientWidth + 1, rows: [...node.querySelectorAll('div')].map(row => {
        const label = row.querySelector('dt')!.getBoundingClientRect();
        const value = row.querySelector('dd')!.getBoundingClientRect();
        return { labelLeft: label.left, labelRight: label.right, labelBottom: label.bottom, valueLeft: value.left, valueRight: value.right, valueTop: value.top };
      }) };
    });
    expect(bounds.left).toBeGreaterThanOrEqual(0);
    expect(bounds.right).toBeLessThanOrEqual(size.width);
    expect(bounds.overflow).toBe(false);
    for (const row of bounds.rows) {
      expect(row.labelLeft).toBeGreaterThanOrEqual(bounds.left);
      expect(row.labelRight).toBeLessThanOrEqual(bounds.right + 1);
      expect(row.valueLeft).toBeGreaterThanOrEqual(bounds.left);
      expect(row.valueRight).toBeLessThanOrEqual(bounds.right + 1);
      expect(row.valueTop).toBeGreaterThanOrEqual(row.labelBottom);
    }
    const live = await page.getByTestId('markdown-live-metrics').evaluate(node => ({ left: node.getBoundingClientRect().left, right: node.getBoundingClientRect().right, overflow: node.scrollWidth > node.clientWidth + 1 }));
    expect(live.left).toBeGreaterThanOrEqual(0);
    expect(live.right).toBeLessThanOrEqual(size.width);
    expect(live.overflow).toBe(false);
  }
});

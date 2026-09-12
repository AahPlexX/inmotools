import { expect, test } from '@playwright/test';
import JSZip from 'jszip';

const editorLocator = (page: import('@playwright/test').Page) =>
  page.locator('[aria-label="Markdown source"]');

const setSource = async (page: import('@playwright/test').Page, value: string) => {
  const editor = editorLocator(page);
  await expect(editor).toBeVisible();
  await editor.click();
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+a' : 'Control+a');
  await page.keyboard.press('Backspace');
  await editor.pressSequentially(value);
};

const readDownloadBytes = async (download: import('@playwright/test').Download): Promise<Buffer> => {
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks);
};

test('renders Mermaid in the real browser integration and preserves its source anchor', async ({ page }) => {
  await page.goto('./#/tools/markdown-workbench');
  await setSource(page, '# Diagram\n\n```mermaid\nflowchart LR\nA[Start] --> B[Done]\n```\n\n## After');

  const diagram = page.locator('.markdown-workbench-diagram').first();
  await expect(diagram.locator('svg')).toBeVisible({ timeout: 15_000 });
  await expect(diagram).toHaveAttribute('data-source-line', /\d+/);
  await expect(diagram).toContainText('Start');
  await expect(diagram).toContainText('Done');
});

test('shows Mermaid failures as visible accessible errors instead of title-only help', async ({ page }) => {
  await page.goto('./#/tools/markdown-workbench');
  await setSource(page, '```mermaid\nflowchart LR\nA--->\n```');

  const error = page.getByRole('alert').filter({ hasText: /mermaid|diagram|parse|syntax/i }).first();
  await expect(error).toBeVisible({ timeout: 15_000 });
  await expect(error).not.toHaveText('');
});

test('rejects oversized Mermaid source before the library can substitute a different diagram', async ({ page }) => {
  await page.goto('./#/tools/markdown-workbench');
  const oversized = `\`\`\`mermaid\nflowchart LR\nA-->B\n${'x'.repeat(50_100)}\n\`\`\``;
  await setSource(page, oversized);

  await expect(page.getByRole('alert')).toContainText(/too large/i, { timeout: 15_000 });
  await expect(page.locator('.markdown-workbench-diagram svg')).toHaveCount(0);
});

test('Source-view standalone HTML renders Mermaid instead of exporting its code fence', async ({ page }) => {
  await page.goto('./#/tools/markdown-workbench');
  await setSource(page, '# Export diagram\n\n```mermaid\nflowchart LR\nA-->B\n```');
  await page.getByRole('button', { name: 'Source', exact: true }).click();

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Standalone HTML', exact: true }).click();
  const html = (await readDownloadBytes(await downloadPromise)).toString('utf8');
  expect(html).toContain('markdown-workbench-diagram');
  expect(html).toContain('<svg');
  expect(html).not.toContain('language-mermaid');
});

test('Source-view EPUB packages rendered Mermaid SVG instead of its code fence', async ({ page }) => {
  await page.goto('./#/tools/markdown-workbench');
  await setSource(page, '# EPUB diagram\n\n```mermaid\nflowchart LR\nA-->B\n```');
  await page.getByRole('button', { name: 'Source', exact: true }).click();

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'EPUB (structural)', exact: true }).click();
  const zip = await JSZip.loadAsync(await readDownloadBytes(await downloadPromise));
  const chapter = await zip.file('OEBPS/document.xhtml')?.async('string');
  expect(chapter).toBeTruthy();
  expect(chapter).toContain('<svg');
  expect(chapter).not.toContain('language-mermaid');
});

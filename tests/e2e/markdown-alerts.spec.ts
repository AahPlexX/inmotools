import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import JSZip from 'jszip';

test('MDW-R31 DANGER previews preserve formatting and literal escapes through orientation changes', async ({ page }) => {
  await page.goto('./#/tools/markdown-workbench');
  const editor = page.getByRole('textbox', { name: 'Markdown source' });
  await editor.click();
  await editor.press('ControlOrMeta+a');
  await page.keyboard.insertText('> [!DANGER]\n> **Critical** warning.\n>\n> - Keep this list.\n\n> \\[!NOTE]\n> Literal marker.');
  const alert = page.locator('.markdown-workbench-preview .markdown-alert-danger');
  await expect(alert).toBeVisible();
  await expect(alert.locator('.markdown-alert-title')).toHaveText('Danger');
  await expect(alert.locator('strong')).toHaveText('Critical');
  await expect(alert.locator('li')).toContainText('Keep this list.');
  await expect(page.locator('.markdown-workbench-preview blockquote')).toContainText('[!NOTE]');
  for (const viewport of [{ width: 320, height: 568 }, { width: 844, height: 390 }]) {
    await page.setViewportSize(viewport);
    const bounds = await alert.boundingBox();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(viewport.width);
    expect(await alert.evaluate((node) => getComputedStyle(node).borderLeftWidth)).toBe('4px');
  }
  for (const dark of [false, true]) {
    await page.getByLabel('Dark workspace').setChecked(dark);
    const contrast = await alert.evaluate((node) => {
      const luminance = (rgb: string) => {
        const channels = rgb.match(/[\d.]+/g)!.slice(0, 3).map(Number).map((value) => {
          const channel = value / 255;
          return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
        });
        return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
      };
      const title = node.querySelector('.markdown-alert-title')!;
      const foreground = luminance(getComputedStyle(title).color);
      const background = luminance(getComputedStyle(node).backgroundColor);
      return (Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05);
    });
    expect(contrast).toBeGreaterThanOrEqual(4.5);
  }
  await page.getByRole('button', { name: 'Markdown help · Syntax guide', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('[!DANGER]');
});

test('MDW-R31 standalone HTML and EPUB retain the callout title, body and self-contained styling', async ({ page, context }) => {
  await page.goto('./#/tools/markdown-workbench');
  const editor = page.getByRole('textbox', { name: 'Markdown source' });
  await editor.click();
  await editor.press('ControlOrMeta+a');
  await page.keyboard.insertText('> [!DANGER]\n> Preserve this critical warning.');
  const htmlDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Standalone HTML', exact: true }).click();
  const html = await readFile((await (await htmlDownload).path())!, 'utf8');
  expect(html).toContain('markdown-alert-danger');
  expect(html).toContain('Preserve this critical warning.');
  expect(html.match(/<style>([\s\S]*?)<\/style>/)?.[1]).toContain('.markdown-alert-danger');
  const exported = await context.newPage();
  await exported.setViewportSize({ width: 320, height: 568 });
  await exported.setContent(html);
  const exportedAlert = exported.locator('.markdown-alert-danger');
  await expect(exportedAlert).toBeVisible();
  expect(await exportedAlert.evaluate((node) => getComputedStyle(node).borderLeftWidth)).toBe('4px');
  const exportedBounds = await exportedAlert.boundingBox();
  expect(exportedBounds!.x + exportedBounds!.width).toBeLessThanOrEqual(320);
  await exported.close();
  const epubDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'EPUB (structural)', exact: true }).click();
  const zip = await JSZip.loadAsync(await readFile((await (await epubDownload).path())!));
  expect(await zip.file('OEBPS/chapter1.xhtml')!.async('string')).toContain('markdown-alert-danger');
  expect(await zip.file('OEBPS/styles/markdown.css')!.async('string')).toContain('.markdown-alert-danger');
});

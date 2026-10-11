import { PDFDocument, StandardFonts } from 'pdf-lib';
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import fixtures from '../fixtures/pdf-password-fixtures.json' with { type: 'json' };

async function source(pages: number) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 1; i <= pages; i++) doc.addPage([300, 200]).drawText(`Thumbnail source page ${i}`, { x: 20, y: 100, font });
  return { name: `owned-${pages}-pages.pdf`, mimeType: 'application/pdf', buffer: Buffer.from(await doc.save()) };
}

test('PDF-R05 lazily renders a twenty-page rail and bounds larger groups while preserving page navigation and themes', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('./#/tools/pdf-sanitizer');
  await page.getByLabel('Add PDF files').setInputFiles(await source(20));
  const rail = page.getByTestId('pdf-thumbnail-rail');
  const thumbnails = page.getByTestId('pdf-thumbnail');
  await expect(thumbnails).toHaveCount(20);
  await rail.scrollIntoViewIfNeeded();
  await expect(thumbnails.first()).toHaveAttribute('data-rendered', 'true');
  expect(await page.locator('[data-testid="pdf-thumbnail"][data-rendered="true"]').count()).toBeLessThan(20);
  await rail.evaluate(element => { element.scrollLeft = element.scrollWidth; });
  await expect(thumbnails.last()).toHaveAttribute('data-rendered', 'true');
  await thumbnails.last().click();
  await expect(page.getByLabel('Preview page', { exact: true })).toHaveValue('20');
  await expect(page.getByTestId('pdf-render-canvas')).toHaveAttribute('data-rendered-page', '20');
  await expect(thumbnails.last()).toHaveAttribute('aria-current', 'page');
  await page.getByLabel('Preview zoom', { exact: true }).fill('200');
  await expect(page.getByTestId('pdf-render-status')).toContainText('200%');
  for (const size of [{ width: 320, height: 800 }, { width: 844, height: 390 }, { width: 768, height: 1024 }, { width: 1440, height: 900 }]) {
    await page.setViewportSize(size);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(size.width);
    const box = await rail.boundingBox(); expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0); expect(box!.x + box!.width).toBeLessThanOrEqual(size.width);
  }
  for (const theme of ['Light', 'Dark', 'System']) {
    await page.getByRole('radio', { name: theme, exact: true }).check();
    expect((await new AxeBuilder({ page }).include('.pdf-thumbnail-section').analyze()).violations).toEqual([]);
  }
  await page.getByRole('button', { name: 'Clear queue', exact: true }).click();
  await page.getByLabel('Add PDF files').setInputFiles(await source(45));
  await expect(thumbnails).toHaveCount(20);
  await page.getByRole('button', { name: 'Next thumbnail group', exact: true }).click();
  await expect(thumbnails.first()).toHaveAttribute('data-page', '21');
  await page.getByLabel('Preview page', { exact: true }).fill('42');
  await expect(thumbnails).toHaveCount(5);
  await expect(page.getByTestId('pdf-render-canvas')).toHaveAttribute('data-rendered-page', '42');
  await expect(page.getByRole('button', { name: 'Preview page 42 from thumbnails', exact: true })).toHaveAttribute('aria-current', 'page');
  await page.getByRole('button', { name: 'Clear queue', exact: true }).click();
  await expect(rail).toHaveCount(0);
  await expect.poll(() => page.workers().length).toBe(0);
  expect(errors).toEqual([]);
});

test('PDF-R05 protected thumbnails share the reader without another password and release workers on navigation', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  const fixture = fixtures.files.find(value => value.name === 'owned-aes256.pdf')!;
  await page.goto('./#/tools/pdf-sanitizer');
  await page.getByLabel('Add PDF files').setInputFiles({ name: fixture.name, mimeType: 'application/pdf', buffer: Buffer.from(fixture.base64, 'base64') });
  await page.getByLabel('PDF password', { exact: true }).fill(fixture.password);
  await page.getByRole('button', { name: 'Open read-only', exact: true }).click();
  await page.getByTestId('pdf-thumbnail-rail').scrollIntoViewIfNeeded();
  const thumb = page.getByRole('button', { name: 'Preview page 2 from thumbnails', exact: true });
  await thumb.scrollIntoViewIfNeeded();
  await expect(thumb).toHaveAttribute('data-rendered', 'true');
  await thumb.click();
  await expect(page.getByTestId('pdf-render-canvas')).toHaveAttribute('data-rendered-page', '2');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(page.workers()).toHaveLength(1);
  await expect(page.getByRole('button', { name: 'Process and download', exact: true })).toBeDisabled();
  await page.goto('./#/tools/markdown-workbench');
  await expect(page.getByRole('heading', { name: 'Markdown Workbench — Write, Preview & Export Markdown', exact: true })).toBeVisible();
  await expect.poll(() => page.workers().filter(worker => worker.url().includes('pdf.worker')).length).toBe(0);
  expect(errors).toEqual([]);
});

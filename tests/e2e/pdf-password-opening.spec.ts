import { createHash } from 'node:crypto';
import { PDFDocument } from 'pdf-lib';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import fixtures from '../fixtures/pdf-password-fixtures.json' with { type: 'json' };

const specimen = (name: string) => {
  const entry = fixtures.files.find((item) => item.name === name)!;
  const buffer = Buffer.from(entry.base64, 'base64');
  expect(createHash('sha256').update(buffer).digest('hex')).toBe(entry.sha256);
  return { ...entry, buffer, mimeType: 'application/pdf' };
};
async function plain(name: string) {
  const doc = await PDFDocument.create();
  doc.addPage([300, 200]);
  return { name, mimeType: 'application/pdf', buffer: Buffer.from(await doc.save()) };
}
async function unlock(page: Page, password: string) {
  await expect(page.getByRole('dialog', { name: 'Open protected PDF' })).toBeVisible();
  await page.getByLabel('PDF password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Open read-only', exact: true }).click();
}
async function rendered(page: Page, number = 1) {
  await expect(page.getByTestId('pdf-render-canvas')).toHaveAttribute('data-rendered-page', String(number));
  await expect(page.getByTestId('pdf-text-layer')).toContainText(`Owned specimen page ${number}`);
}
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const state = { started: 0, terminated: 0 };
    Object.defineProperty(window, '__pdfPasswordWorkers', { value: state });
    const NativeWorker = window.Worker;
    window.Worker = new Proxy(NativeWorker, { construct(target, args) {
      const worker = Reflect.construct(target, args) as Worker;
      if (String(args[0]).includes('pdf.worker')) {
        state.started += 1;
        const terminate = worker.terminate.bind(worker);
        worker.terminate = () => { state.terminated += 1; terminate(); };
      }
      return worker;
    } });
  });
  await page.goto('./#/tools/pdf-sanitizer');
});

test('PDF-R02 opens AES256 with password retry and actual reader text, search, pages and zoom', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', (error) => errors.push(error.message));
  const file = specimen('owned-aes256.pdf');
  await page.getByLabel('Add PDF files').setInputFiles(file);
  const input = page.getByLabel('PDF password', { exact: true });
  await expect(input).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(page.getByRole('button', { name: 'Cancel opening', exact: true })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(input).toBeFocused();
  const accessibility = await new AxeBuilder({ page }).include('.pdf-password-dialog').analyze();
  expect(accessibility.violations).toEqual([]);
  await expect(input).toHaveAttribute('type', 'password');
  await page.getByLabel('Show password', { exact: true }).check();
  await expect(input).toHaveAttribute('type', 'text');
  await input.fill('deliberately-wrong');
  await page.getByRole('button', { name: 'Open read-only', exact: true }).click();
  await expect(page.getByTestId('pdf-password-message')).toContainText('not accepted');
  await expect(input).toHaveValue('');
  await expect(input).toHaveAttribute('aria-invalid', 'true');
  await expect(input).toHaveAttribute('type', 'password');
  await unlock(page, file.password);
  await rendered(page);
  await expect(page.getByTestId('pdf-protected-item')).toContainText('2 pages');
  await expect(page.getByTestId('pdf-item')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Process and download' })).toBeDisabled();
  await page.getByLabel('Search document', { exact: true }).fill('page 2');
  await page.getByRole('button', { name: 'Search document', exact: true }).click();
  await expect(page.getByTestId('pdf-search-status')).toContainText('1 match');
  await page.getByRole('button', { name: 'Go to page 2' }).click();
  await rendered(page, 2);
  await page.getByLabel('Preview zoom').fill('150');
  await expect(page.getByTestId('pdf-render-status')).toContainText('150%');
  const pixels = await page.getByTestId('pdf-render-canvas').evaluate((element) => {
    const canvas = element as HTMLCanvasElement;
    const data = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data;
    let dark = 0; for (let n = 0; n < data.length; n += 4) if (data[n] < 180 && data[n + 1] < 180 && data[n + 2] < 180) dark += 1;
    return dark;
  });
  expect(pixels).toBeGreaterThan(500);
  expect(await page.evaluate(() => Object.values(localStorage).some((value) => String(value).includes('fixture-user')))).toBe(false);
  expect(errors).toEqual([]);
});

test('PDF-R02 preserves exact spaces and Unicode and opens AES128 without storing password text', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', (error) => errors.push(error.message));
  for (const name of ['owned-aes128.pdf', 'owned-password-spaces.pdf', 'owned-password-unicode.pdf']) {
    const file = specimen(name);
    await page.getByLabel('Add PDF files').setInputFiles(file);
    if (name.includes('spaces')) {
      await unlock(page, file.password.trim());
      await expect(page.getByTestId('pdf-password-message')).toContainText('not accepted');
    }
    await unlock(page, file.password);
    await rendered(page);
    await page.getByRole('button', { name: 'Next preview page', exact: true }).click();
    await rendered(page, 2);
    await page.getByRole('button', { name: 'Clear queue', exact: true }).click();
    await expect(page.getByTestId('pdf-protected-item')).toHaveCount(0);
    await expect(page.getByTestId('pdf-render-canvas')).toHaveCount(0);
  }
  expect(errors).toEqual([]);
});

test('PDF-R03 keeps empty-user protected documents read-only and produces no protected download', async ({ page }) => {
  const downloads: string[] = []; page.on('download', (download) => downloads.push(download.suggestedFilename()));
  await page.getByLabel('Add PDF files').setInputFiles(specimen('owned-permissions-only.pdf'));
  await rendered(page);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByTestId('pdf-protected-item')).toContainText('cannot be modified');
  await expect(page.getByRole('button', { name: 'Process and download' })).toBeDisabled();
  await expect(page.getByTestId('pdf-output-preview')).toHaveCount(0);
  expect(downloads).toEqual([]);
});

test('PDF-R02 keeps readable peers and the existing queue when protected and malformed files fail', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', (error) => errors.push(error.message));
  for (const protectedFirst of [false, true]) {
    await page.getByLabel('Add PDF files').setInputFiles(await plain('existing.pdf'));
    await expect(page.getByTestId('pdf-item')).toHaveCount(1);
    const group = [await plain('before.pdf'), specimen('owned-aes256.pdf'), { name: 'broken.pdf', mimeType: 'application/pdf', buffer: Buffer.from('not a PDF') }, await plain('after.pdf')];
    if (protectedFirst) group.unshift(group.splice(1, 1)[0]);
    await page.getByLabel('Add PDF files').setInputFiles(group);
    await expect(page.getByRole('dialog', { name: 'Open protected PDF' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('pdf-item')).toHaveCount(3);
    await expect(page.getByTestId('pdf-intake-issues')).toContainText('broken.pdf');
    await expect(page.getByTestId('pdf-intake-issues')).toContainText('cancelled');
    await expect(page.getByTestId('pdf-output-preview')).not.toContainText('owned-aes256');
    const pending = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Process and download' }).click();
    const download = await pending;
    const stream = await download.createReadStream(); const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(chunk as Buffer);
    expect((await PDFDocument.load(Buffer.concat(chunks))).getPageCount()).toBe(3);
    await page.getByRole('button', { name: 'Clear queue', exact: true }).click();
  }
  expect(errors).toEqual([]);
});

test('PDF-R02 cancels pending password work on navigation and can reopen the same file', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', (error) => errors.push(error.message));
  const file = specimen('owned-aes256.pdf');
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await page.getByLabel('Add PDF files').setInputFiles(file);
    await expect(page.getByRole('dialog', { name: 'Open protected PDF' })).toBeVisible();
    await expect(page.getByLabel('PDF password', { exact: true })).toHaveValue('');
    await page.getByLabel('PDF password', { exact: true }).fill('cancelled specimen text');
    await page.getByRole('button', { name: 'Cancel opening', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByLabel('Add PDF files')).toBeFocused();
  }
  await page.getByLabel('Add PDF files').setInputFiles(file);
  await expect(page.getByRole('dialog', { name: 'Open protected PDF' })).toBeVisible();
  await page.evaluate(() => { location.hash = '/'; });
  await expect(page.getByLabel('Add PDF files')).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => (window as typeof window & { __pdfPasswordWorkers: { terminated: number } }).__pdfPasswordWorkers.terminated)).toBeGreaterThanOrEqual(4);
  await page.evaluate(() => { location.hash = '/tools/pdf-sanitizer'; });
  await page.getByLabel('Add PDF files').setInputFiles(file);
  await unlock(page, file.password);
  await rendered(page);
  expect(errors).toEqual([]);
});

test('PDF-R02 switches protected and editable previews without another prompt and releases removed sessions', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', (error) => errors.push(error.message));
  await page.getByLabel('Add PDF files').setInputFiles(await plain('editable.pdf'));
  await expect(page.getByTestId('pdf-item')).toHaveCount(1);
  await page.getByLabel('Add PDF files').setInputFiles(specimen('owned-aes256.pdf'));
  await unlock(page, 'fixture-user');
  await rendered(page);
  await page.getByLabel('Preview source', { exact: true }).selectOption({ label: 'editable.pdf' });
  await expect(page.getByTestId('pdf-render-canvas')).toHaveAttribute('data-rendered-page', '1');
  await page.getByTestId('pdf-protected-item').getByRole('button', { name: 'View read-only', exact: true }).click();
  await rendered(page);
  await page.getByRole('button', { name: 'Next preview page', exact: true }).click();
  await rendered(page, 2);
  await page.getByTestId('pdf-protected-item').getByRole('button', { name: 'View read-only', exact: true }).click();
  await rendered(page);
  await page.getByLabel('Preview source', { exact: true }).selectOption({ label: 'editable.pdf' });
  await page.getByLabel('Preview source', { exact: true }).selectOption({ label: 'owned-aes256.pdf (read-only)' });
  await rendered(page);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: 'Remove read-only owned-aes256.pdf', exact: true }).click();
  await expect(page.getByTestId('pdf-protected-item')).toHaveCount(0);
  await expect(page.getByTestId('pdf-item')).toHaveCount(1);
  await page.getByRole('button', { name: 'Clear queue', exact: true }).click();
  await expect.poll(() => page.evaluate(() => {
    const state = (window as typeof window & { __pdfPasswordWorkers: { started: number; terminated: number } }).__pdfPasswordWorkers;
    return state.started - state.terminated;
  })).toBe(0);
  expect(errors).toEqual([]);
});

test('PDF-R02 password controls and long file names fit portrait, landscape, tablet and desktop', async ({ page }) => {
  await page.getByLabel('Add PDF files').setInputFiles({ ...specimen('owned-aes256.pdf'), name: `${'long-protected-name-'.repeat(12)}.pdf` });
  const dialog = page.getByRole('dialog', { name: 'Open protected PDF' });
  await expect(dialog).toBeVisible();
  for (const size of [{ width: 320, height: 800 }, { width: 844, height: 390 }, { width: 768, height: 1024 }, { width: 2560, height: 900 }]) {
    await page.setViewportSize(size);
    const geometry = await dialog.evaluate((element) => {
      const box = element.getBoundingClientRect();
      return { x: box.x, y: box.y, right: box.right, bottom: box.bottom, width: box.width, client: element.clientWidth, scroll: element.scrollWidth, viewportWidth: innerWidth, viewportHeight: innerHeight };
    });
    expect(geometry.x).toBeGreaterThanOrEqual(0); expect(geometry.y).toBeGreaterThanOrEqual(0);
    expect(geometry.right).toBeLessThanOrEqual(geometry.viewportWidth); expect(geometry.bottom).toBeLessThanOrEqual(geometry.viewportHeight);
    expect(geometry.scroll).toBeLessThanOrEqual(geometry.client + 1);
    await page.getByRole('button', { name: 'Cancel opening', exact: true }).scrollIntoViewIfNeeded();
    await expect(page.getByRole('button', { name: 'Cancel opening', exact: true })).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  }
  await unlock(page, 'fixture-user');
  await rendered(page);
  for (const size of [{ width: 320, height: 800 }, { width: 844, height: 390 }, { width: 768, height: 1024 }, { width: 2560, height: 900 }]) {
    await page.setViewportSize(size);
    await expect(page.getByTestId('pdf-protected-item')).toContainText('long-protected-name-'.repeat(12));
    await expect(page.locator('#pdf-viewer-source-name')).toHaveText(`Selected source: ${'long-protected-name-'.repeat(12)}.pdf · Read-only`);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    const box = await page.getByTestId('pdf-protected-item').boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0); expect(box!.x + box!.width).toBeLessThanOrEqual(size.width);
  }
  await page.getByRole('button', { name: /Remove read-only long-protected-name/, exact: false }).click();
});

test('PDF-R02 password and read-only controls remain accessible in dark, light and system themes', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', (error) => errors.push(error.message));
  for (const theme of ['Dark', 'Light', 'System']) {
    if (theme === 'System') await page.emulateMedia({ colorScheme: 'dark' });
    await page.getByRole('radio', { name: theme, exact: true }).check();
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme === 'Light' ? 'light' : 'dark');
    await page.getByLabel('Add PDF files').setInputFiles(specimen('owned-aes256.pdf'));
    await expect(page.getByRole('dialog', { name: 'Open protected PDF' })).toBeVisible();
    const textContrasts = await page.locator('.pdf-password-dialog').evaluate((dialog) => {
      const luminance = (color: string) => {
        const channels = color.match(/[\d.]+/g)!.slice(0, 3).map(Number).map((value) => {
          const channel = value / 255;
          return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
        });
        return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
      };
      const background = luminance(getComputedStyle(dialog).backgroundColor);
      return [...dialog.querySelectorAll('h2, .pdf-password-file, label')].map((element) => {
        const foreground = luminance(getComputedStyle(element).color);
        return { text: element.textContent, ratio: (Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05) };
      });
    });
    expect(textContrasts.length).toBeGreaterThanOrEqual(4);
    for (const result of textContrasts) expect(result.ratio, `${theme}: ${result.text}`).toBeGreaterThanOrEqual(4.5);
    const dialogAccessibility = await new AxeBuilder({ page }).include('.pdf-password-dialog').analyze();
    expect(dialogAccessibility.violations).toEqual([]);
    await unlock(page, 'fixture-user');
    await rendered(page);
    const controlsAccessibility = await new AxeBuilder({ page })
      .include('[data-testid="pdf-protected-item"]')
      .include('#pdf-viewer-source')
      .include('#pdf-viewer-source-name')
      .include('label[for="pdf-viewer-source"]')
      .analyze();
    expect(controlsAccessibility.violations).toEqual([]);
    await page.getByRole('button', { name: 'Clear queue', exact: true }).click();
  }
  expect(errors).toEqual([]);
});

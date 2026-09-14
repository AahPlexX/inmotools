import { expect, test } from '@playwright/test';
import { PDFDocument, StandardFonts } from 'pdf-lib';

async function renderedFixture() {
  const document = await PDFDocument.create();
  const font = await document.embedFont(StandardFonts.Helvetica);
  const first = document.addPage([320, 240]);
  first.drawText('Renderer page one', { x: 30, y: 180, size: 18, font });
  const second = document.addPage([400, 260]);
  second.drawText('Renderer page two', { x: 35, y: 195, size: 20, font });
  return Buffer.from(await document.save());
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const NativeWorker = window.Worker;
    const urls: string[] = [];
    Object.defineProperty(window, '__pdfWorkerUrls', { value: urls, configurable: false });
    window.Worker = new Proxy(NativeWorker, {
      construct(target, args, newTarget) {
        urls.push(String(args[0]));
        return Reflect.construct(target, args, newTarget);
      },
    });
  });
  await page.goto('/tools/pdf-sanitizer');
});

test('renders a queued PDF through a bundled real worker and supports page/zoom controls', async ({ page }) => {
  await page.getByLabel('Add PDF files').setInputFiles({
    name: 'render-me.pdf',
    mimeType: 'application/pdf',
    buffer: await renderedFixture(),
  });

  await expect(page.getByRole('heading', { name: 'Document viewer' })).toBeVisible();
  const canvas = page.getByTestId('pdf-render-canvas');
  await expect(canvas).toHaveAttribute('data-rendered-page', '1');

  await page.getByRole('button', { name: 'Next preview page' }).click();
  await expect(canvas).toHaveAttribute('data-rendered-page', '2');
  await expect(page.getByTestId('pdf-render-status')).toContainText('Rendered page 2');

  await page.getByLabel('Preview zoom').fill('150');
  await expect(page.getByTestId('pdf-render-status')).toContainText('150%');

  const metrics = await canvas.evaluate((element) => {
    const canvasElement = element as HTMLCanvasElement;
    return {
      pixelWidth: canvasElement.width,
      cssWidth: Number.parseFloat(canvasElement.style.width),
      outputScale: Number(canvasElement.dataset.outputScale),
      dpr: window.devicePixelRatio || 1,
    };
  });
  expect(metrics.pixelWidth).toBeGreaterThanOrEqual(metrics.cssWidth);
  expect(metrics.outputScale).toBe(Math.min(Math.max(metrics.dpr, 1), 3));
  if (metrics.dpr > 1) expect(metrics.pixelWidth).toBeGreaterThan(metrics.cssWidth);

  const workerUrls = await page.evaluate(() => (window as typeof window & { __pdfWorkerUrls?: string[] }).__pdfWorkerUrls ?? []);
  expect(workerUrls.length).toBeGreaterThan(0);
  expect(workerUrls.some((url) => url.includes('/inmotools/assets/') && url.includes('pdf.worker'))).toBe(true);
});

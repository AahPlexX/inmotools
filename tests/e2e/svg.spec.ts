import { expect, test } from '@playwright/test';

test('compiles collision-safe symbols, isolates bad files, previews safely, and reports viewBox uncertainty', async ({ page }) => {
  await page.goto('./#/tools/svg-sprite-compiler');
  const input = page.locator('#svg-files');
  await input.setInputFiles([
    { name: 'foo.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg viewBox="0 0 10 10"><defs><linearGradient id="paint"><stop offset="1"/></linearGradient></defs><rect fill="url(#paint)" width="10" height="10"/></svg>') },
    { name: 'foo-2.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg viewBox="0 0 10 10" fill="red"><path d="M0 0h10v10z"/></svg>') },
    { name: 'foo.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg viewBox="0 0 10 10"><path stroke="blue" d="M0 0h10"/></svg>') },
    { name: 'relative.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg width="2em" height="100%"><path d="M0 0h10v10z"/></svg>') },
    { name: 'broken.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('not svg') },
  ]);

  await page.getByRole('button', { name: 'Compile sprite' }).click();
  await expect(page.getByTestId('svg-errors')).toContainText('broken.svg');
  await expect(page.getByTestId('svg-warnings')).toContainText('relative.svg');
  await expect(page.getByTestId('svg-warnings')).toContainText(/viewBox/i);

  const source = page.getByLabel('Compiled SVG sprite source');
  await expect(source).toContainText('id="foo"');
  await expect(source).toContainText('id="foo-2"');
  await expect(source).toContainText('id="foo-3"');
  const text = await source.textContent();
  const internal = /id="(foo--[^"]+)"/.exec(text ?? '')?.[1];
  expect(internal).toBeTruthy();
  expect(text).toContain(`url(#${internal})`);

  // Every compiled symbol gets light/dark image-context previews instead of
  // injecting uploaded SVG markup directly into the application DOM.
  await expect(page.getByRole('img', { name: /preview/i })).toHaveCount(8);

  await page.getByRole('checkbox', { name: /Normalize literal/ }).uncheck();
  await expect(source).toHaveCount(0);
  await expect(page.getByRole('status')).toContainText(/Recompile/);
});

test('strips executable SVG content before output and never runs it in preview', async ({ page }) => {
  await page.addInitScript(() => { (window as unknown as { __svgExecuted: number }).__svgExecuted = 0; });
  await page.goto('./#/tools/svg-sprite-compiler');
  await page.locator('#svg-files').setInputFiles({
    name: 'unsafe.svg',
    mimeType: 'image/svg+xml',
    buffer: Buffer.from('<svg viewBox="0 0 10 10" onload="window.__svgExecuted=1"><script>window.__svgExecuted=2</script><rect onclick="window.__svgExecuted=3" width="10" height="10"/></svg>'),
  });
  await page.getByRole('button', { name: 'Compile sprite' }).click();

  const source = page.getByLabel('Compiled SVG sprite source');
  await expect(source).not.toContainText(/<script\b/i);
  await expect(source).not.toContainText(/on(?:load|click)=/i);
  await expect(page.getByRole('img', { name: /unsafe.*preview/i })).toHaveCount(2);
  expect(await page.evaluate(() => (window as unknown as { __svgExecuted: number }).__svgExecuted)).toBe(0);
});

test('allows the same SVG filename to be selected again after recompiling', async ({ page }) => {
  await page.goto('./#/tools/svg-sprite-compiler');
  const input = page.locator('#svg-files');

  await input.setInputFiles({ name: 'same.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg viewBox="0 0 10 10" class="first"><path d="M0 0h10v10z"/></svg>') });
  await page.getByRole('button', { name: 'Compile sprite' }).click();
  await expect(page.getByLabel('Compiled SVG sprite source')).toContainText('class="first"');

  await input.setInputFiles({ name: 'same.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg viewBox="0 0 10 10" class="second"><path d="M0 0h5v5z"/></svg>') });
  await expect(page.getByLabel('Compiled SVG sprite source')).toHaveCount(0);
  await page.getByRole('button', { name: 'Compile sprite' }).click();
  await expect(page.getByLabel('Compiled SVG sprite source')).toContainText('class="second"');
  await expect(page.getByLabel('Compiled SVG sprite source')).not.toContainText('class="first"');
});

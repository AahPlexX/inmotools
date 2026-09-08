import { expect, test } from '@playwright/test';

test('compiles collision-safe symbols, isolates bad files, and invalidates stale output', async ({ page }) => {
  await page.goto('./#/tools/svg-sprite-compiler');
  const input = page.locator('#svg-files');
  await input.setInputFiles([
    { name: 'foo.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg viewBox="0 0 10 10"><defs><linearGradient id="paint"><stop offset="1"/></linearGradient></defs><rect fill="url(#paint)" width="10" height="10"/></svg>') },
    { name: 'foo-2.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg viewBox="0 0 10 10" fill="red"><path d="M0 0h10v10z"/></svg>') },
    { name: 'foo.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg viewBox="0 0 10 10"><path stroke="blue" d="M0 0h10"/></svg>') },
    { name: 'broken.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('not svg') },
  ]);

  await page.getByRole('button', { name: 'Compile sprite' }).click();
  await expect(page.getByTestId('svg-errors')).toContainText('broken.svg');
  const source = page.getByLabel('Compiled SVG sprite source');
  await expect(source).toContainText('id="foo"');
  await expect(source).toContainText('id="foo-2"');
  await expect(source).toContainText('id="foo-3"');
  const text = await source.textContent();
  const internal = /id="(foo--[^"]+)"/.exec(text ?? '')?.[1];
  expect(internal).toBeTruthy();
  expect(text).toContain(`url(#${internal})`);

  await page.getByRole('checkbox', { name: /Normalize literal/ }).uncheck();
  await expect(source).toHaveCount(0);
  await expect(page.getByRole('status')).toContainText(/Recompile/);
});

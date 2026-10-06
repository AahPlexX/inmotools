import { expect, test } from '@playwright/test';

const openCode = async (page: import('@playwright/test').Page, source: string) => {
  await page.goto('./#/tools/markdown-workbench');
  const editor = page.getByRole('textbox', { name: 'Markdown source' });
  await expect(editor).toBeVisible({ timeout: 30_000 });
  await editor.click();
  await editor.press('ControlOrMeta+a');
  await page.keyboard.insertText(source);
  return editor;
};

test('MDW-R29 selecting code inside a task preserves its checkbox while ordinary task clicks still work', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', { value: {
      writeText: async () => { throw new DOMException('Test permission failure', 'NotAllowedError'); },
    } });
  });
  const editor = await openCode(page, '- [ ] Task\n\n  ```text\n  Full literal code\n  ```');
  const source = await editor.innerText();
  const frame = page.locator('.markdown-code-frame');
  await frame.getByRole('button', { name: /^Copy code/ }).click();
  const fallback = frame.getByRole('textbox', { name: /^Code ready to copy/ });
  await fallback.click();
  await expect(fallback).toBeVisible();
  await expect(editor).toHaveText(source);
  await frame.getByRole('button', { name: 'Select code', exact: true }).click();
  await expect(fallback).toBeFocused();
  await expect(editor).toHaveText(source);
  await page.locator('.markdown-workbench-preview li > p').first().click();
  await expect(editor).toContainText('- [x] Task');
});

test('MDW-R29 code controls wrap through orientation changes and print without clipping or copy controls', async ({ page }) => {
  const literal = 'A'.repeat(600);
  await openCode(page, '```text\n' + literal + '\nsecond line\n```');
  const frame = page.locator('.markdown-code-frame');
  const body = frame.getByRole('region', { name: /^Scrollable code block/ });
  for (const viewport of [{ width: 320, height: 568 }, { width: 844, height: 390 }]) {
    await page.setViewportSize(viewport);
    const frameBounds = await frame.boundingBox();
    expect(frameBounds!.x).toBeGreaterThanOrEqual(0);
    expect(frameBounds!.x + frameBounds!.width).toBeLessThanOrEqual(viewport.width);
    const copyBounds = await frame.getByRole('button', { name: /^Copy code/ }).boundingBox();
    expect(copyBounds!.height).toBeGreaterThanOrEqual(44);
    await body.focus();
    await expect(body).toBeFocused();
    await body.evaluate((node) => { node.scrollLeft = node.scrollWidth; });
    expect(await body.evaluate((node) => node.scrollLeft)).toBeGreaterThan(0);
    await expect(frame.locator('code')).toContainText(literal);
  }
  await page.emulateMedia({ media: 'print' });
  expect(await body.evaluate((node) => getComputedStyle(node).maxHeight)).toBe('none');
  expect(await body.evaluate((node) => getComputedStyle(node).overflow)).toBe('visible');
  await expect(frame.getByRole('button', { name: /^Copy code/ })).toBeHidden();
  expect(await frame.locator('code').evaluate((node) => getComputedStyle(node).whiteSpace)).toBe('pre-wrap');
});

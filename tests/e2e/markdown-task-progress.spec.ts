import { expect, test, type Page } from '@playwright/test';

async function setSource(page: Page, source: string) {
  const editor = page.getByRole('textbox', { name: 'Markdown source' });
  await editor.click();
  await editor.press('ControlOrMeta+a');
  await page.keyboard.insertText(source);
  return editor;
}

test('MDW-R38 native progress follows quoted preview tasks and both history controls', async ({ page }) => {
  await page.goto('./#/tools/markdown-workbench');
  const source = '---\ntitle: "- [x] metadata literal"\n---\n\n- [x] Done\n- [ ] Next\n\n> <details>\n> <summary>Hidden task</summary>\n>\n> - [X] Quoted done\n>\n> </details>\n\n```text\n- [x] code literal\n```';
  const editor = await setSource(page, source);
  const progress = page.getByTestId('markdown-task-progress');
  await expect(progress).toContainText('Tasks: 2/3 complete');
  const bar = page.getByRole('progressbar', { name: 'Completed tasks', exact: true });
  await expect(bar).toHaveAttribute('max', '3');
  await expect(bar).toHaveAttribute('value', '2');
  await expect(bar).toHaveAttribute('aria-valuetext', '2 of 3 tasks complete');
  await page.locator('.markdown-workbench-preview').getByText('Next', { exact: true }).click();
  await expect(progress).toContainText('Tasks: 3/3 complete');
  await editor.press('ControlOrMeta+z');
  await expect(progress).toContainText('Tasks: 2/3 complete');
  const redo = await page.evaluate(() => /Mac|iP(hone|ad|od)/.test(navigator.platform) ? 'Meta+Shift+z' : 'Control+y');
  await editor.press(redo);
  await expect(progress).toContainText('Tasks: 3/3 complete');
  await page.getByRole('button', { name: 'Undo document step', exact: true }).click();
  await expect(progress).toContainText('Tasks: 2/3 complete');
  await page.getByRole('button', { name: 'Redo document step', exact: true }).click();
  await expect(progress).toContainText('Tasks: 3/3 complete');
  await page.getByRole('button', { name: 'Undo document step', exact: true }).click();
  await expect(progress).toContainText('Tasks: 2/3 complete');
  const details = page.locator('.markdown-workbench-preview details.markdown-disclosure');
  await details.locator('summary').click();
  await details.getByText('Quoted done', { exact: true }).click();
  await expect(progress).toContainText('Tasks: 1/3 complete');
  await expect(editor).toContainText('> - [ ] Quoted done');
  await page.getByRole('button', { name: 'Auto-format', exact: true }).click();
  await expect(page.getByTestId('markdown-status')).toContainText('Markdown formatted.');
  await expect(progress).toContainText('Tasks: 1/3 complete');
});

test('MDW-R38 empty, imported and replaced documents have independent progress without changing exports', async ({ page }) => {
  await page.goto('./#/tools/markdown-workbench');
  const progress = page.getByTestId('markdown-task-progress');
  await setSource(page, 'No tasks.\n\n`- [ ] inline literal`\n\n    - [x] indented code');
  await expect(progress).toHaveText('Tasks: none');
  await expect(page.getByRole('progressbar', { name: 'Completed tasks', exact: true })).toHaveCount(0);
  const source = '- [ ] First\r\n- [ ] Second\r\n';
  await page.setInputFiles('input[type="file"][accept*=".html"]', { name: 'tasks.md', mimeType: 'text/markdown', buffer: Buffer.from(source) });
  await expect(progress).toContainText('Tasks: 0/2 complete');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Markdown', exact: true }).click();
  const file = await download;
  const stream = await file.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
  expect(Buffer.concat(chunks).toString('utf8')).toBe(source);
  await page.setInputFiles('input[type="file"][accept*=".html"]', { name: 'tasks.html', mimeType: 'text/html', buffer: Buffer.from('<ul><li><input type="checkbox" checked="false">Imported *completed*<ul><li><p> <!--comment--> <input type="checkbox">Nested open</p></li></ul></li><li>Ordinary <input type="checkbox" checked>form item</li></ul><input type="checkbox" checked><details><summary>Closed</summary><ul><li><input type="checkbox" checked>Hidden imported</li></ul></details>') });
  await expect(progress).toContainText('Tasks: 2/3 complete');
  await expect(page.getByRole('textbox', { name: 'Markdown source' })).toContainText('[x] Imported \\*completed\\*');
  await page.locator('.markdown-workbench-preview').getByText('Nested open', { exact: true }).click();
  await expect(progress).toContainText('Tasks: 3/3 complete');
  await page.getByRole('button', { name: 'New', exact: true }).click();
  await expect(page.getByTestId('markdown-status')).toContainText('Started a new document.');
  await expect(progress).toHaveText('Tasks: none');
  await setSource(page, 'Replacement without tasks.');
  await expect(progress).toHaveText('Tasks: none');
});

test('MDW-R38 task progress and status text wrap without overlap across viewport changes', async ({ page }) => {
  await page.goto('./#/tools/markdown-workbench');
  await setSource(page, Array.from({ length: 100 }, (_, i) => `- [${i < 60 ? 'x' : ' '}] Task ${i + 1}`).join('\n'));
  const progress = page.getByTestId('markdown-task-progress');
  await expect(progress).toContainText('Tasks: 60/100 complete');
  await expect(progress).toHaveAttribute('role', 'status');
  await expect(progress).toHaveAttribute('aria-live', 'polite');
  for (const viewport of [{ width: 320, height: 568 }, { width: 844, height: 390 }, { width: 768, height: 1024 }]) {
    await page.setViewportSize(viewport);
    await progress.scrollIntoViewIfNeeded();
    const bounds = await progress.evaluate(node => {
      const rect = node.getBoundingClientRect();
      const pieces = [...node.children].map(child => child.getBoundingClientRect());
      const statusPieces = [...node.parentElement!.children].map(child => child.getBoundingClientRect());
      const overlap = (a: DOMRect, b: DOMRect) => Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1;
      return { left: rect.left, right: rect.right, overflow: node.scrollWidth - node.clientWidth, pieceOverlap: pieces.some((a, i) => pieces.slice(i + 1).some(b => overlap(a, b))), statusOverlap: statusPieces.some((a, i) => statusPieces.slice(i + 1).some(b => overlap(a, b))) };
    });
    expect(bounds.left).toBeGreaterThanOrEqual(0);
    expect(bounds.right).toBeLessThanOrEqual(viewport.width);
    expect(bounds.overflow).toBeLessThanOrEqual(1);
    expect(bounds.pieceOverlap).toBe(false);
    expect(bounds.statusOverlap).toBe(false);
    await expect(progress).toContainText('Tasks: 60/100 complete');
  }
});

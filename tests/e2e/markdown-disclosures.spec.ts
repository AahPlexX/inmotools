import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import JSZip from 'jszip';

async function setSource(page: Page, source: string) {
  const editor = page.getByRole('textbox', { name: 'Markdown source' });
  await editor.click();
  await editor.press('ControlOrMeta+a');
  await page.keyboard.insertText(source);
  return editor;
}

test('MDW-R36 native controls retain group state, reveal closed targets and wrap through orientation changes', async ({ page, isMobile }) => {
  await page.goto('./#/tools/markdown-workbench');
  const caption = 'Information'.repeat(22);
  const source = '[Jump](#inside)\n\n<details name="sections">\n<summary>**' + caption + '**</summary>\n\n## Inside\n\nVisible body\n\n</details>\n\n<details name="sections"><summary>Other</summary>Other body</details>\n\n## Inside';
  await setSource(page, source);
  const preview = page.locator('.markdown-workbench-preview');
  const first = preview.locator('details.markdown-disclosure').first();
  const other = preview.locator('details.markdown-disclosure').nth(1);
  await expect(first).not.toHaveAttribute('open');
  await first.locator('summary').focus();
  await page.keyboard.press('Enter');
  await expect(first).toHaveAttribute('open', '');
  if (isMobile) await other.locator('summary').tap(); else await other.locator('summary').click();
  await expect(other).toHaveAttribute('open', '');
  await expect(first).not.toHaveAttribute('open');
  await preview.getByRole('link', { name: 'Jump', exact: true }).click();
  await expect(first).toHaveAttribute('open', '');
  await expect(first.getByRole('heading', { name: 'Inside', exact: true })).toBeVisible();
  await expect(other).not.toHaveAttribute('open');
  await other.locator('summary').click();
  await expect(first).not.toHaveAttribute('open');
  await page.locator('.markdown-workbench-panel > summary').filter({ hasText: /^Outline/ }).click();
  await page.getByRole('button', { name: 'Inside', exact: true }).first().click();
  await expect(first).toHaveAttribute('open', '');
  await setSource(page, source.replace('Visible body', 'Changed body'));
  await expect(first).toHaveAttribute('open', '');
  await expect(first).toContainText('Changed body');
  for (const viewport of [{ width: 320, height: 568 }, { width: 844, height: 390 }]) {
    await page.setViewportSize(viewport);
    const bounds = await first.evaluate(node => {
      const box = node.getBoundingClientRect();
      const summary = node.querySelector('summary')!.getBoundingClientRect();
      const body = node.querySelector('h2')!.getBoundingClientRect();
      return { left: box.left, right: box.right, overflow: node.scrollWidth - node.clientWidth, height: summary.height, gap: body.top - summary.bottom };
    });
    expect(bounds.left).toBeGreaterThanOrEqual(0);
    expect(bounds.right).toBeLessThanOrEqual(viewport.width);
    expect(bounds.overflow).toBeLessThanOrEqual(1);
    expect(bounds.height).toBeGreaterThanOrEqual(44);
    expect(bounds.gap).toBeGreaterThanOrEqual(0);
  }
  await page.setInputFiles('input[type="file"][accept*=".html"]', { name: 'new.md', mimeType: 'text/markdown', buffer: Buffer.from(source) });
  await expect(first).not.toHaveAttribute('open');
  await expect(preview.locator('#user-content-inside-1')).toHaveCount(1);
  await setSource(page, '[Missing](#missing)\n\n[Top](#)');
  await preview.getByRole('link', { name: 'Missing', exact: true }).click();
  await expect(page.getByTestId('markdown-status')).toContainText('not found');
  await expect(page).toHaveURL(/#\/tools\/markdown-workbench$/);
  await preview.getByRole('link', { name: 'Top', exact: true }).click();
  await expect(page).toHaveURL(/#\/tools\/markdown-workbench$/);
  await page.getByRole('button', { name: 'Markdown help · Syntax guide', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('Disclosure blocks');
});

test('MDW-R36 summary clicks leave surrounding tasks untouched and worker format supports Undo', async ({ page }) => {
  await page.goto('./#/tools/markdown-workbench');
  const block = '<details>\n  <summary>More</summary>\n\n  ## Inside\n\n  - [ ] Inner task\n\n  </details>';
  const source = '* before\n\n- [ ] Parent\n\n  ' + block + '\n\n* after';
  const editor = await setSource(page, source);
  const preview = page.locator('.markdown-workbench-preview');
  const details = preview.locator('details.markdown-disclosure');
  await expect(details).toHaveCount(1);
  await details.locator('summary').click();
  await expect(details).toHaveAttribute('open', '');
  await expect(editor).toContainText('- [ ] Parent');
  await details.getByText('Inner task', { exact: false }).click();
  await expect(editor).toContainText('- [x] Inner task');
  await expect(editor).toContainText('- [ ] Parent');
  await page.getByRole('button', { name: 'Auto-format', exact: true }).click();
  await expect(page.getByTestId('markdown-status')).toContainText('Markdown formatted.');
  await expect(editor).toContainText('- before');
  await expect(details).toHaveAttribute('open', '');
  await expect(details.getByRole('heading', { name: 'Inside', exact: true })).toBeVisible();
  await editor.press('ControlOrMeta+z');
  await expect(editor).toContainText('* before');
});

test('MDW-R36 actual exports retain native HTML, printable content, valid expanded XHTML and DOCX', async ({ page, context }) => {
  await page.goto('./#/tools/markdown-workbench');
  await setSource(page, '<details name="sections"><summary>More</summary>\n\n## Inside\n\nBody\n\n</details>\n\n<details open name="sections"><summary>Other</summary>Other body</details>');
  const download = async (label: string) => {
    const pending = page.waitForEvent('download');
    await page.getByRole('button', { name: label, exact: true }).click();
    return readFile((await (await pending).path())!);
  };
  const exported = await context.newPage();
  await exported.setContent((await download('Standalone HTML')).toString('utf8'));
  const first = exported.locator('details.markdown-disclosure').first();
  await expect(first).not.toHaveAttribute('open');
  await first.locator('summary').focus();
  await exported.keyboard.press('Space');
  await expect(first).toHaveAttribute('open', '');
  await first.locator('summary').click();
  await expect(first).not.toHaveAttribute('open');
  await exported.emulateMedia({ media: 'print' });
  expect(await first.locator('h2').evaluate(node => node.getBoundingClientRect().height)).toBeGreaterThan(0);
  await exported.close();
  const epub = await JSZip.loadAsync(await download('EPUB (structural)'));
  const chapter = await epub.file('OEBPS/chapter1.xhtml')!.async('string');
  expect(chapter.match(/<details\b[^>]*open="open"/g)).toHaveLength(2);
  expect(chapter).not.toMatch(/<details\b[^>]*\bname=/);
  expect(await page.evaluate(xml => new DOMParser().parseFromString(xml, 'application/xhtml+xml').querySelector('parsererror')?.textContent ?? null, chapter)).toBeNull();
  const docx = await JSZip.loadAsync(await download('DOCX'));
  const document = await docx.file('word/document.xml')!.async('string');
  for (const text of ['More', 'Inside', 'Body', 'Other body']) expect(document).toContain(text);
  expect(JSON.stringify(JSON.parse((await download('AST JSON')).toString('utf8')))).toContain('"type":"workbenchDisclosure"');
});

test('MDW-R36 local HTML import retains literal captions, nested bodies and empty disclosures', async ({ page }) => {
  await page.goto('./#/tools/markdown-workbench');
  await page.setInputFiles('input[type="file"][accept*=".html"]', {
    name: 'details.html', mimeType: 'text/html',
    buffer: Buffer.from('<details open name="a&amp;b" onclick="alert(1)"><summary>*Literal* &lt;img&gt;</summary><p>A <strong>body</strong>.</p><details><summary>Nested</summary><p>Inner body</p></details></details><details></details>'),
  });
  const preview = page.locator('.markdown-workbench-preview');
  await expect(preview.locator('details.markdown-disclosure')).toHaveCount(3);
  await expect(preview.locator('summary')).toHaveText(['*Literal* <img>', 'Nested', 'Details']);
  await expect(preview.locator('strong')).toHaveText('body');
  await expect(preview.locator('details').first()).toHaveAttribute('open', '');
  await expect(preview.locator('details').first()).toHaveAttribute('name', 'user-content-a&b');
  await expect(preview.locator('[onclick], img, script')).toHaveCount(0);
});

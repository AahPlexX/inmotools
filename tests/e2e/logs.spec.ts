import { expect, test } from '@playwright/test';

const EIGHT_MB = 8 * 1024 * 1024;

test('LGS-R01 cuts a file over 8 MB to its first 8 MB and says so', async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto('./#/tools/regex-log-structurer');
  const input = page.locator('#log-input');
  const note = page.locator('.field', { has: page.locator('#log-file') }).locator('small');

  await page.setInputFiles('#log-file', { name: 'small.log', mimeType: 'text/plain', buffer: Buffer.from('2026-08-29 INFO started\n') });
  await expect(note).toHaveText('Loaded small.log in this browser. Nothing was uploaded.');

  await page.setInputFiles('#log-file', { name: 'big.log', mimeType: 'text/plain', buffer: Buffer.alloc(EIGHT_MB + 1024, 'a') });
  await expect(note).toHaveText('big.log is larger than 8 MB, so only the first 8 MB was loaded.', { timeout: 30_000 });
  await expect.poll(() => input.evaluate((element) => (element as HTMLTextAreaElement).value.length), { timeout: 30_000 }).toBe(EIGHT_MB);

  // Two-byte characters: 4.5 M characters are 9 MB, so the cut is by bytes, not characters.
  await page.setInputFiles('#log-file', { name: 'wide.log', mimeType: 'text/plain', buffer: Buffer.from('é'.repeat(4_500_000), 'utf8') });
  await expect(note).toHaveText('wide.log is larger than 8 MB, so only the first 8 MB was loaded.', { timeout: 30_000 });
  await expect.poll(() => input.evaluate((element) => (element as HTMLTextAreaElement).value.length), { timeout: 30_000 }).toBe(EIGHT_MB / 2);
  expect(await input.evaluate((element) => /^é+$/.test((element as HTMLTextAreaElement).value))).toBe(true);

  await page.setInputFiles('#log-file', { name: 'small-again.log', mimeType: 'text/plain', buffer: Buffer.from('2026-08-29 INFO started\n') });
  await expect(note).toHaveText('Loaded small-again.log in this browser. Nothing was uploaded.');
});

test('LGS-R11 applies input changes once after a 300 ms pause', async ({ page }) => {
  await page.addInitScript(() => {
    const runs: string[] = [];
    (window as unknown as { __logRuns: string[] }).__logRuns = runs;
    const original = Worker.prototype.postMessage;
    Worker.prototype.postMessage = function patched(this: Worker, message: unknown, ...rest: unknown[]) {
      runs.push(String((message as { input?: unknown })?.input ?? ''));
      return (original as (...args: unknown[]) => void).call(this, message, ...rest);
    };
  });
  await page.clock.install();
  await page.goto('./#/tools/regex-log-structurer');
  const runs = () => page.evaluate(() => [...(window as unknown as { __logRuns: string[] }).__logRuns]);

  await expect(page.getByTestId('log-status')).toContainText('2 matched lines · 1 unmatched line');
  await page.clock.pauseAt(new Date((await page.evaluate(() => Date.now())) + 2000));
  const before = (await runs()).length;
  expect(before).toBe(1);

  const input = page.locator('#log-input');
  await input.fill('');
  await input.pressSequentially('2026-08-29 WARN low');
  await page.clock.runFor(299);
  expect((await runs()).length).toBe(before);
  await page.clock.runFor(1);
  await expect.poll(async () => (await runs()).length).toBe(before + 1);
  expect((await runs()).at(-1)).toBe('2026-08-29 WARN low');
  await expect(page.getByTestId('log-status')).toContainText('1 matched line · 0 unmatched lines');

  await page.locator('#log-pattern').fill('^(?<all>.+)$');
  await page.clock.runFor(150);
  await page.locator('#log-pattern').fill('^(?<line>.+)$');
  await page.clock.runFor(299);
  expect((await runs()).length).toBe(before + 1);
  await page.clock.runFor(1);
  await expect.poll(async () => (await runs()).length).toBe(before + 2);
  await expect(page.getByRole('columnheader', { name: 'line', exact: true })).toBeVisible();
});

test('LGS-R13 shortens long and multi-line cells behind a disclosure with the full value', async ({ page }) => {
  await page.goto('./#/tools/regex-log-structurer');
  const long = `2026-08-29 ERROR ${'x'.repeat(140)}END`;
  await page.locator('#log-input').fill(`${long}\n2026-08-29 INFO short`);
  await expect(page.getByTestId('log-status')).toContainText('2 matched lines', { timeout: 20_000 });
  const table = page.getByTestId('log-table');
  const disclosure = table.locator('details');
  await expect(disclosure).toHaveCount(1);
  const summary = disclosure.locator('summary');
  await expect(summary).toHaveText(`${'x'.repeat(140)}END`.slice(0, 100) + '…');
  await expect(disclosure.locator('pre')).toBeHidden();
  await summary.click();
  await expect(disclosure.locator('pre')).toBeVisible();
  await expect(disclosure.locator('pre')).toHaveText(`${'x'.repeat(140)}END`);
  await expect(table.locator('tbody tr').nth(1)).toContainText('short');

  await page.getByLabel('Scan').selectOption('document');
  await page.locator('#log-input').fill('BEGIN\nfirst detail\nsecond detail\nEND');
  await page.locator('#log-pattern').fill('BEGIN\\n(?<body>[\\s\\S]*?)\\nEND');
  await expect(page.getByTestId('log-status')).toContainText('1 matched line', { timeout: 20_000 });
  const multi = table.locator('details');
  await expect(multi.locator('summary')).toHaveText('first detail second detail');
  await multi.locator('summary').click();
  await expect(multi.locator('pre')).toHaveText('first detail\nsecond detail');
});

for (const width of [320, 375, 768, 1024, 1440, 1920, 2560]) {
  test(`LGS-R16 lays out without horizontal overflow at ${width} px`, async ({ page, isMobile }) => {
    test.skip(isMobile, 'viewport matrix runs on the desktop project');
    await page.setViewportSize({ width, height: width < 800 ? 800 : 1000 });
    await page.goto('./#/tools/regex-log-structurer');
    await page.locator('#log-input').fill(`2026-08-29 ERROR ${'long-message-'.repeat(20)}\n2026-08-29 INFO started\nunmatched line`);
    await expect(page.getByTestId('log-status')).toContainText('2 matched lines', { timeout: 20_000 });
    await page.getByText('Review unmatched lines (1)').click();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
    for (const name of ['Export CSV', 'Export JSON', 'Export Markdown', 'Export unmatched TSV']) {
      const box = await page.getByRole('button', { name }).boundingBox();
      expect(box && box.x >= 0 && box.x + box.width <= width + 1, `${name} inside viewport at ${width}px`).toBe(true);
    }
    for (const id of ['#log-pattern', '#log-mode', '#log-file', '#log-input']) {
      const box = await page.locator(id).boundingBox();
      expect(box && box.x >= 0 && box.x + box.width <= width + 1, `${id} inside viewport at ${width}px`).toBe(true);
    }
  });
}

import { expect, test } from '@playwright/test';

const harText = `{
  "log": {
    "version": "1.2",
    "_captureId": 9007199254740993,
    "entries": [
      {
        "startedDateTime": "2026-09-09T12:00:00.000Z",
        "time": 42,
        "request": {
          "method": "POST",
          "url": "https://alice:request-pass@example.test/api?token=query-secret&safe=yes",
          "headers": [{"name":"Authorization","value":"Bearer header-secret"}],
          "cookies": [],
          "queryString": [{"name":"token","value":"query-secret"}],
          "postData": {"mimeType":"application/json","text":"{\\"eventId\\":9007199254740993,\\"password\\":\\"body-secret\\"}"}
        },
        "response": {
          "status": 302,
          "redirectURL": "https://bob:redirect-pass@redirect.example.test/next?access_token=redirect-secret",
          "headers": [],
          "cookies": [],
          "content": {"mimeType":"application/json","text":"{\\"ok\\":true}"}
        },
        "timings": {"blocked":0,"dns":1,"connect":5,"ssl":2,"send":1,"wait":30,"receive":5}
      }
    ]
  }
}`;

test('prepares, reviews, and only then downloads a lossless sanitized HAR', async ({ page }) => {
  await page.goto('./#/tools/har-sanitizer');
  await page.locator('#har-file').setInputFiles({ name: 'capture.har', mimeType: 'application/json', buffer: Buffer.from(harText) });

  await expect(page.getByText('Original findings').locator('..')).toContainText(/\d+/);
  await expect(page.getByTestId('har-request-table')).toContainText('example.test');

  const downloadPrepared = page.getByRole('button', { name: 'Download prepared HAR' });
  await expect(downloadPrepared).toBeDisabled();
  await page.getByRole('button', { name: 'Prepare sanitized HAR' }).click();

  await expect(page.getByTestId('har-output-scan')).toContainText(/0 unsanitized locations remain/i);
  await expect(downloadPrepared).toBeEnabled();

  const download = page.waitForEvent('download');
  await downloadPrepared.click();
  const saved = await download;
  expect(saved.suggestedFilename()).toBe('capture.sanitized.har');
  const stream = await saved.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(chunk as Buffer);
  const output = Buffer.concat(chunks).toString('utf8');

  expect(output).toContain('9007199254740993');
  expect(output).not.toContain('9007199254740992');
  for (const secret of ['request-pass','query-secret','header-secret','body-secret','redirect-pass','redirect-secret']) expect(output).not.toContain(secret);
});

test('filters findings and exposes a bounded accessible request table', async ({ page }) => {
  await page.goto('./#/tools/har-sanitizer');
  await page.locator('#har-file').setInputFiles({ name: 'capture.har', mimeType: 'application/json', buffer: Buffer.from(harText) });

  await expect(page.getByTestId('har-request-table')).toBeVisible();
  await expect(page.getByTestId('har-request-table')).toContainText('POST');
  await expect(page.getByTestId('har-request-table')).toContainText('302');

  await page.getByLabel('Finding category').selectOption('query');
  await expect(page.getByTestId('har-findings')).toContainText(/URL|query/i);
  await expect(page.getByTestId('har-findings')).not.toContainText('Sensitive headers');

  const waterfall = page.getByLabel(/HAR waterfall with 1 requests/i);
  await waterfall.focus();
  await waterfall.press('Home');
  await expect(page.getByText(/POST · HTTP 302/)).toBeVisible();
});

function twoRequestHar() {
  const entry = (method: string, url: string, status: number, header: string) => ({
    startedDateTime: '2026-09-09T12:00:00.000Z', time: 10,
    request: { method, url, headers: [{ name: 'Authorization', value: header }], cookies: [], queryString: [] },
    response: { status, headers: [], cookies: [], content: { mimeType: 'application/json', text: '{}' } },
    timings: { blocked: 0, dns: 1, connect: 1, ssl: 0, send: 1, wait: 5, receive: 2 },
  });
  return JSON.stringify({ log: { version: '1.2', entries: [
    entry('GET', 'https://first.example.test/alpha', 200, 'Bearer first-secret'),
    entry('DELETE', 'https://second.example.test/beta', 404, 'Bearer second-secret'),
  ] } });
}

async function readDownload(download: import('@playwright/test').Download) {
  const chunks: Buffer[] = [];
  for await (const chunk of await download.createReadStream()) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString('utf8');
}

test('HAR-R01 loads a HAR by drag-and-drop and by the sample, and Clear empties it', async ({ page }) => {
  await page.goto('./#/tools/har-sanitizer');
  const dropZone = page.locator('.field', { has: page.locator('#har-file') });
  const dataTransfer = await page.evaluateHandle((text) => {
    const transfer = new DataTransfer();
    transfer.items.add(new File([text], 'dropped.har', { type: 'application/json' }));
    return transfer;
  }, harText);
  await dropZone.dispatchEvent('dragover', { dataTransfer });
  await dropZone.dispatchEvent('drop', { dataTransfer });
  await expect(page.locator('.workspace-body .status-line[role="status"]')).toContainText('1 requests loaded');
  await expect(page.getByTestId('har-request-table')).toContainText('example.test');

  await page.getByRole('button', { name: 'Clear capture' }).click();
  await expect(page.locator('.workspace-body .status-line[role="status"]')).toContainText('Capture cleared from this tab.');
  await expect(page.getByTestId('har-request-table')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Clear capture' })).toHaveCount(0);

  await page.getByRole('button', { name: 'Load a sample capture' }).click();
  await expect(page.locator('.workspace-body .status-line[role="status"]')).toContainText('1 requests loaded');
  await expect(page.getByTestId('har-request-table')).toContainText('api.example.test');
});

test('HAR-R09 any policy change invalidates the prepared file', async ({ page }) => {
  await page.goto('./#/tools/har-sanitizer');
  await page.locator('#har-file').setInputFiles({ name: 'capture.har', mimeType: 'application/json', buffer: Buffer.from(harText) });
  const prepare = page.getByRole('button', { name: 'Prepare sanitized HAR' });
  const download = page.getByRole('button', { name: 'Download prepared HAR' });
  const changes: Array<() => Promise<void>> = [
    () => page.getByRole('checkbox', { name: 'Cookies' }).click(),
    () => page.getByLabel('Replacement').selectOption('mask'),
    () => page.getByLabel('Mask text').fill('HIDDEN'),
    () => page.getByLabel('Extra field names').fill('x-internal-key'),
  ];
  for (const change of changes) {
    await prepare.click();
    await expect(download).toBeEnabled();
    await change();
    await expect(download).toBeDisabled();
    await expect(page.getByTestId('har-output-scan')).toHaveCount(0);
  }
});

test('HAR-R11 a finding jumps to its request', async ({ page }) => {
  await page.goto('./#/tools/har-sanitizer');
  await page.locator('#har-file').setInputFiles({ name: 'two.har', mimeType: 'application/json', buffer: Buffer.from(twoRequestHar()) });
  await expect(page.getByText('GET · HTTP 200')).toBeVisible();
  await page.getByLabel('Finding category').selectOption('headers');
  await page.getByTestId('har-findings').getByRole('button', { name: 'Show request 2' }).click();
  await expect(page.getByText('DELETE · HTTP 404')).toBeVisible();
  await expect(page.getByText('GET · HTTP 200')).toHaveCount(0);
  await page.getByTestId('har-findings').getByRole('button', { name: 'Show request 1' }).click();
  await expect(page.getByText('GET · HTTP 200')).toBeVisible();
});

test('HAR-R12 downloads a findings CSV with category, request number and path only', async ({ page }) => {
  await page.goto('./#/tools/har-sanitizer');
  await page.locator('#har-file').setInputFiles({ name: 'capture.har', mimeType: 'application/json', buffer: Buffer.from(harText) });
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download finding locations' }).click();
  const saved = await pending;
  expect(saved.suggestedFilename()).toBe('capture.findings.csv');
  const csv = await readDownload(saved);
  const lines = csv.split('\n');
  expect(lines[0]).toBe('category,request,path');
  expect(lines.length).toBeGreaterThan(1);
  for (const line of lines.slice(1)) expect(line).toMatch(/^(headers|cookies|query|bodies|emails|addresses),1,".*"$/);
  for (const secret of ['request-pass', 'query-secret', 'header-secret', 'body-secret', 'redirect-pass', 'redirect-secret']) expect(csv).not.toContain(secret);
  await expect(page.locator('.workspace-body .status-line[role="status"]')).toContainText('Values are not in that file.');
});

test('HAR-R13 search narrows the request table', async ({ page }) => {
  await page.goto('./#/tools/har-sanitizer');
  await page.locator('#har-file').setInputFiles({ name: 'two.har', mimeType: 'application/json', buffer: Buffer.from(twoRequestHar()) });
  const table = page.getByTestId('har-request-table');
  await expect(table).toContainText('first.example.test');
  await expect(table).toContainText('second.example.test');
  await page.getByLabel('Search visible requests').fill('beta');
  await expect(table).toContainText('second.example.test');
  await expect(table).not.toContainText('first.example.test');
  await expect(table).toContainText('404');
  await page.getByLabel('Search visible requests').fill('no-such-request');
  await expect(page.getByText('No requests match these filters.')).toBeVisible();
  await page.getByLabel('Search visible requests').fill('');
  await expect(table).toContainText('first.example.test');
});

test('HAR-R14 windows waterfall rows to the scrollport at the device pixel ratio', async ({ page }) => {
  const entries = Array.from({ length: 300 }, (_, index) => ({
    startedDateTime: '2026-09-09T12:00:00.000Z', time: 10,
    request: { method: 'GET', url: `https://host${index}.example.test/item`, headers: [], cookies: [], queryString: [] },
    response: { status: 200, headers: [], cookies: [], content: { mimeType: 'text/plain' } },
    timings: { blocked: -1, dns: -1, connect: -1, ssl: -1, send: 1, wait: 5, receive: 2 },
  }));
  await page.goto('./#/tools/har-sanitizer');
  await page.locator('#har-file').setInputFiles({ name: 'many.har', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ log: { entries } })) });
  const canvas = page.getByLabel(/HAR waterfall with 300 requests/i);
  await expect(canvas).toBeVisible();
  const metrics = await canvas.evaluate((element) => {
    const node = element as HTMLCanvasElement;
    const region = node.closest('[role="region"]') as HTMLElement;
    return { cssHeight: node.getBoundingClientRect().height, cssWidth: node.getBoundingClientRect().width, pixelWidth: node.width, pixelHeight: node.height, dpr: window.devicePixelRatio, scrollHeight: region.scrollHeight, clientHeight: region.clientHeight };
  });
  expect(metrics.scrollHeight).toBeGreaterThanOrEqual(28 + 300 * 32);
  expect(metrics.cssHeight).toBeLessThan(metrics.clientHeight + 8 * 32 + 40);
  expect(metrics.pixelHeight).toBe(Math.floor(metrics.cssHeight * metrics.dpr));
  expect(Math.abs(metrics.pixelWidth - metrics.cssWidth * metrics.dpr)).toBeLessThanOrEqual(metrics.dpr);
  await canvas.focus();
  await canvas.press('End');
  await expect(page.getByText(/GET · HTTP 200/)).toBeVisible();
  await expect(page.locator('.notice', { hasText: 'GET · HTTP 200' })).toContainText('https://host299.example.test/item');
  const scrolled = await canvas.evaluate((element) => (element.closest('[role="region"]') as HTMLElement).scrollTop);
  expect(scrolled).toBeGreaterThan(0);
});

for (const width of [320, 375, 768, 1024, 1440, 1920, 2560]) {
  test(`HAR-R16 lays out without horizontal overflow at ${width} px`, async ({ page, isMobile }) => {
    test.skip(isMobile, 'viewport matrix runs on the desktop project');
    await page.setViewportSize({ width, height: width < 800 ? 800 : 1000 });
    await page.goto('./#/tools/har-sanitizer');
    await page.locator('#har-file').setInputFiles({ name: 'capture.har', mimeType: 'application/json', buffer: Buffer.from(harText) });
    await page.getByRole('button', { name: 'Prepare sanitized HAR' }).click();
    await expect(page.getByTestId('har-output-scan')).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
    for (const name of ['Prepare sanitized HAR', 'Download prepared HAR', 'Download finding locations', 'Clear capture']) {
      const box = await page.getByRole('button', { name }).boundingBox();
      expect(box && box.x >= 0 && box.x + box.width <= width + 1, `${name} inside viewport at ${width}px`).toBe(true);
    }
  });
}

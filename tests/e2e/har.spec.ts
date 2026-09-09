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

  await expect(page.getByTestId('har-output-scan')).toContainText(/0 unsanitized credential-bearing locations remain/i);
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

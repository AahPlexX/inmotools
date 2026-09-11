import { expect, test } from '@playwright/test';

test('simulator exercises framing, pause-display capture, rules, filtering, counters, pagination, and retained export', async ({ page }) => {
  await page.goto('./#/tools/hardware-packet-inspector');

  await expect(page.getByLabel('Maximum newline frame size')).toHaveValue('65536');
  await expect(page.getByRole('button', { name: 'Older entries' })).toBeDisabled();

  await page.getByLabel('Simulator scenario').selectOption('unicode-split');
  await page.getByRole('button', { name: 'Run simulator scenario' }).click();
  await expect(page.getByTestId('packet-stream')).toContainText('price=10€ status=OK');
  await expect(page.getByTestId('packet-stream')).toContainText('[ok]');

  const pausedLog = await page.getByTestId('packet-stream').textContent();
  await page.getByRole('button', { name: 'Pause display' }).click();
  await expect(page.getByText(/Pause display freezes the visible log only.*Capture continues/i)).toBeVisible();
  await page.getByLabel('Simulator scenario').selectOption('error-burst');
  await page.getByRole('button', { name: 'Run simulator scenario' }).click();
  await expect(page.getByTestId('packet-stream')).toHaveText(pausedLog ?? '');
  await expect(page.getByTestId('packet-capture-summary')).toContainText('2 captured while display paused');
  await expect(page.getByTestId('packet-capture-summary')).toContainText('0 evicted');

  await page.getByRole('button', { name: 'Resume live display' }).click();
  await expect(page.getByTestId('packet-stream')).toContainText('[error]');

  await page.getByLabel('Search capture').fill('ERROR');
  await expect(page.getByTestId('packet-stream')).toContainText('status=ERROR');
  await expect(page.getByTestId('packet-stream')).not.toContainText('price=10€');

  await page.getByRole('button', { name: 'Add parsing rule' }).click();
  await page.getByLabel('Rule 3 label').fill('sensor');
  await page.getByLabel('Rule 3 pattern').fill('sensor=');
  await expect(page.getByRole('cell', { name: 'Valid', exact: true })).toHaveCount(3);

  await page.getByLabel('Search capture').fill('');
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export retained CSV' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('packet-capture.csv');
  await expect(page.locator('.status-line')).toContainText(/Exported .* retained capture entr/);
});

test('catches a locked Web Serial writer instead of escaping send error handling', async ({ page }) => {
  await page.addInitScript(() => {
    const writable = new WritableStream<Uint8Array>({ write() {} });
    const heldWriter = writable.getWriter();
    (window as unknown as { __heldSerialWriter?: WritableStreamDefaultWriter<Uint8Array> }).__heldSerialWriter = heldWriter;
    const port = { open: async () => {}, close: async () => {}, writable };
    Object.defineProperty(navigator, 'serial', {
      configurable: true,
      value: { requestPort: async () => port },
    });
  });

  await page.goto('./#/tools/hardware-packet-inspector');
  await page.getByRole('button', { name: 'Connect serial device' }).click();
  await expect(page.locator('.status-line')).toContainText(/connected.*did not expose a readable stream/i);
  await page.getByRole('button', { name: 'Send packet' }).click();
  await expect(page.locator('.status-line')).toContainText(/Serial write failed.*writer lock was released/i);
  await expect(page.getByRole('button', { name: 'Send packet' })).toBeEnabled();
  await page.evaluate(() => {
    (window as unknown as { __heldSerialWriter?: WritableStreamDefaultWriter<Uint8Array> }).__heldSerialWriter?.releaseLock();
  });
  await page.getByRole('button', { name: 'Disconnect' }).click();
});

test('cancels a pending connection attempt so a late picker result is never opened', async ({ page }) => {
  await page.addInitScript(() => {
    let resolvePort: ((port: unknown) => void) | undefined;
    const pending = new Promise((resolve) => { resolvePort = resolve; });
    const state = { openCalls: 0 };
    const port = {
      open: async () => { state.openCalls += 1; },
      close: async () => {},
    };
    (window as unknown as { __resolveSerialPort?: () => void; __serialState?: typeof state }).__resolveSerialPort = () => resolvePort?.(port);
    (window as unknown as { __resolveSerialPort?: () => void; __serialState?: typeof state }).__serialState = state;
    Object.defineProperty(navigator, 'serial', {
      configurable: true,
      value: { requestPort: () => pending },
    });
  });

  await page.goto('./#/tools/hardware-packet-inspector');
  await page.getByRole('button', { name: 'Connect serial device' }).click();
  await expect(page.getByRole('button', { name: 'Cancel connect' })).toBeEnabled();
  await page.getByRole('button', { name: 'Cancel connect' }).click();
  await expect(page.locator('.status-line')).toContainText(/Connection attempt canceled/i);
  await page.evaluate(() => {
    (window as unknown as { __resolveSerialPort?: () => void }).__resolveSerialPort?.();
  });
  await page.waitForTimeout(50);
  const openCalls = await page.evaluate(() => (window as unknown as { __serialState?: { openCalls: number } }).__serialState?.openCalls ?? -1);
  expect(openCalls).toBe(0);
  await expect(page.getByRole('button', { name: 'Connect serial device' })).toBeEnabled();
});

test('disables additional sends while a serial write is in flight', async ({ page }) => {
  await page.addInitScript(() => {
    let finishWrite: (() => void) | undefined;
    const writable = new WritableStream<Uint8Array>({
      write: () => new Promise<void>((resolve) => { finishWrite = resolve; }),
    });
    const port = { open: async () => {}, close: async () => {}, writable };
    (window as unknown as { __finishSerialWrite?: () => void }).__finishSerialWrite = () => finishWrite?.();
    Object.defineProperty(navigator, 'serial', {
      configurable: true,
      value: { requestPort: async () => port },
    });
  });

  await page.goto('./#/tools/hardware-packet-inspector');
  await page.getByRole('button', { name: 'Connect serial device' }).click();
  await expect(page.locator('.status-line')).toContainText(/connected.*did not expose a readable stream/i);
  await page.getByRole('button', { name: 'Send packet' }).click();
  await expect(page.getByRole('button', { name: 'Sending…' })).toBeDisabled();
  await page.evaluate(() => (window as unknown as { __finishSerialWrite?: () => void }).__finishSerialWrite?.());
  await expect(page.locator('.status-line')).toContainText('Packet transmitted.');
  await expect(page.getByRole('button', { name: 'Send packet' })).toBeEnabled();
  await page.getByRole('button', { name: 'Disconnect' }).click();
});

test('contains catastrophic rule matching and recovers after the rule is edited', async ({ page }) => {
  await page.goto('./#/tools/hardware-packet-inspector');
  await page.getByLabel('Rule 1 pattern').fill('(?:AA |AA AA )+$');
  await page.getByLabel('Transmit hexadecimal bytes').fill('AA '.repeat(70) + 'AB');
  await page.getByRole('button', { name: 'Send packet' }).click();
  await expect(page.getByTestId('packet-rule-status')).toContainText('time limit');
  await expect(page.getByRole('button', { name: 'Export retained CSV' })).toBeDisabled();
  await page.getByLabel('Rule 1 pattern').fill('AA');
  await expect(page.getByTestId('packet-stream')).toContainText('[error]');
  await expect(page.getByRole('button', { name: 'Export retained CSV' })).toBeEnabled();
});

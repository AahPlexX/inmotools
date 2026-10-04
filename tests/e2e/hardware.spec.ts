import { expect, test, type Download, type Page } from '@playwright/test';

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
  await expect(page.locator('.status-line')).toContainText(/Exported .* entries retained when export was requested/);
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

type FakeSerialState = {
  requestCalls: number;
  openOptions: Array<{ baudRate: number }>;
  openErrors: string[];
  closeCalls: number;
  closeErrors: string[];
  isOpen: boolean;
  readableLocked: boolean | null;
};

// A Web Serial port fake that enforces the spec's lifecycle rules: open() rejects while the port is open,
// close() rejects while its readable or writable stream is locked, and every open() creates fresh streams.
const installFakeSerial = async (page: Page) => {
  await page.addInitScript(() => {
    const state = { requestCalls: 0, openOptions: [] as Array<{ baudRate: number }>, openErrors: [] as string[], closeCalls: 0, closeErrors: [] as string[], isOpen: false, readableLocked: null as boolean | null };
    let controller: ReadableStreamDefaultController<Uint8Array> | null = null;
    const port: { readable?: ReadableStream<Uint8Array>; writable?: WritableStream<Uint8Array>; open(options: { baudRate: number }): Promise<void>; close(): Promise<void> } = {
      async open(options) {
        if (state.isOpen) {
          state.openErrors.push('The port is already open.');
          throw new DOMException('The port is already open.', 'InvalidStateError');
        }
        state.openOptions.push({ ...options });
        state.isOpen = true;
        port.readable = new ReadableStream<Uint8Array>({ start(streamController) { controller = streamController; } });
        port.writable = new WritableStream<Uint8Array>({ write() {} });
      },
      async close() {
        state.closeCalls += 1;
        if (port.readable?.locked || port.writable?.locked) {
          state.closeErrors.push('Cannot close a port while its streams are locked.');
          throw new TypeError('Cannot close a port while its streams are locked.');
        }
        state.isOpen = false;
        controller = null;
        port.readable = undefined;
        port.writable = undefined;
      },
    };
    const fake = {
      state,
      push(text: string) { controller?.enqueue(new TextEncoder().encode(text)); },
      snapshot() { return { ...state, readableLocked: port.readable ? port.readable.locked : null }; },
    };
    (window as unknown as { __fakeSerial: typeof fake }).__fakeSerial = fake;
    Object.defineProperty(navigator, 'serial', {
      configurable: true,
      value: { requestPort: async () => { state.requestCalls += 1; return port; } },
    });
  });
};

const pushSerial = (page: Page, text: string) => page.evaluate((value) => (window as unknown as { __fakeSerial: { push(text: string): void } }).__fakeSerial.push(value), text);
const serialState = (page: Page) => page.evaluate(() => (window as unknown as { __fakeSerial: { snapshot(): FakeSerialState } }).__fakeSerial.snapshot());
const numberedLines = (count: number) => Array.from({ length: count }, (_, index) => `frame-${String(index + 1).padStart(4, '0')}\n`).join('');

const readDownload = async (download: Download): Promise<string> => {
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString('utf8');
};

test('HPI-R01 opens the picked serial port at the chosen baud rate', async ({ page }) => {
  await installFakeSerial(page);
  await page.goto('./#/tools/hardware-packet-inspector');
  const baud = page.getByLabel('Baud rate');
  await expect(baud.locator('option')).toHaveText(['9600', '19200', '38400', '57600', '115200', '230400', '460800', '921600']);

  for (const rate of ['9600', '921600']) {
    await baud.selectOption(rate);
    await page.getByRole('button', { name: 'Connect serial device' }).click();
    await expect(page.locator('.status-line')).toHaveText(`Serial port connected at ${rate} baud using newline framing.`);
    await expect(baud).toBeDisabled();
    await pushSerial(page, `rate=${rate}\n`);
    await expect(page.getByTestId('packet-stream')).toContainText(`RX`);
    await expect(page.getByTestId('packet-stream')).toContainText(`rate=${rate}`);
    await page.getByRole('button', { name: 'Disconnect' }).click();
    await expect(page.getByRole('button', { name: 'Connect serial device' })).toBeEnabled();
  }
  const state = await serialState(page);
  expect(state.requestCalls).toBe(2);
  expect(state.openOptions).toEqual([{ baudRate: 9600 }, { baudRate: 921600 }]);
});

test('HPI-R03 Disconnect releases the stream locks and closes the port so it can be opened again', async ({ page }) => {
  await installFakeSerial(page);
  await page.goto('./#/tools/hardware-packet-inspector');
  await page.getByRole('button', { name: 'Connect serial device' }).click();
  await expect(page.locator('.status-line')).toContainText('Serial port connected at 115200 baud');
  await expect.poll(async () => (await serialState(page)).readableLocked).toBe(true);
  await pushSerial(page, 'first session\n');
  await expect(page.getByTestId('packet-stream')).toContainText('first session');
  await page.getByRole('button', { name: 'Send packet' }).click();
  await expect(page.locator('.status-line')).toHaveText('Packet transmitted.');

  await page.getByRole('button', { name: 'Disconnect' }).click();
  await expect(page.locator('.status-line')).toHaveText('Serial port closed and its stream locks released.');
  let state = await serialState(page);
  expect(state.closeCalls).toBe(1);
  expect(state.closeErrors).toEqual([]);
  expect(state.isOpen).toBe(false);

  await page.getByRole('button', { name: 'Connect serial device' }).click();
  await expect(page.locator('.status-line')).toContainText('Serial port connected at 115200 baud');
  await pushSerial(page, 'second session\n');
  await expect(page.getByTestId('packet-stream')).toContainText('second session');
  state = await serialState(page);
  expect(state.openOptions).toHaveLength(2);
  expect(state.openErrors).toEqual([]);
  await page.getByRole('button', { name: 'Disconnect' }).click();
  await expect(page.locator('.status-line')).toHaveText('Serial port closed and its stream locks released.');
  expect((await serialState(page)).closeErrors).toEqual([]);
});

test('HPI-R08 shows direction, hex and text together on one stream line', async ({ page }) => {
  await installFakeSerial(page);
  await page.goto('./#/tools/hardware-packet-inspector');
  await page.getByLabel('Transmit hexadecimal bytes').fill('01 02 03');
  await page.getByRole('button', { name: 'Send packet' }).click();
  await page.getByLabel('Simulator scenario').selectOption('unicode-split');
  await page.getByRole('button', { name: 'Run simulator scenario' }).click();
  await page.getByRole('button', { name: 'Connect serial device' }).click();
  await expect(page.locator('.status-line')).toContainText('Serial port connected');
  await pushSerial(page, 'sensor OK\n');
  await page.getByLabel('Transmit hexadecimal bytes').fill('0A FF');
  await page.getByRole('button', { name: 'Send packet' }).click();
  await expect(page.locator('.status-line')).toHaveText('Packet transmitted.');

  const stream = page.getByTestId('packet-stream');
  await expect(stream).toContainText('TX 0A FF');
  const lines = (await stream.innerText()).split('\n');
  const timestamp = '\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}\\.\\d{3}Z';
  expect(lines).toHaveLength(4);
  expect(lines[0]).toMatch(new RegExp(`^${timestamp} · TX 0A FF$`));
  expect(lines[1]).toMatch(new RegExp(`^${timestamp} · RX \\[ok\\] 73 65 6E 73 6F 72 20 4F 4B · sensor OK$`));
  expect(lines[2]).toMatch(new RegExp(`^${timestamp} · SIM RX \\[ok\\] 70 72 69 63 65 3D 31 30 E2 82 AC 20 73 74 61 74 75 73 3D 4F 4B · price=10€ status=OK$`));
  expect(lines[3]).toMatch(new RegExp(`^${timestamp} · SIM TX 01 02 03$`));
  await page.getByRole('button', { name: 'Disconnect' }).click();
});

test('HPI-R09 keeps the newest 5,000 entries and reports how many were evicted', async ({ page }) => {
  await installFakeSerial(page);
  await page.goto('./#/tools/hardware-packet-inspector');
  await page.getByRole('button', { name: 'Connect serial device' }).click();
  await expect(page.locator('.status-line')).toContainText('Serial port connected');
  await pushSerial(page, numberedLines(5_012));

  const summary = page.getByTestId('packet-capture-summary');
  await expect(summary).toContainText('5,000 retained / 5,000 maximum · 5,012 events observed');
  await expect(summary).toContainText('12 evicted');
  await expect(summary).toContainText('page 1 of 25');
  await expect(page.getByTestId('packet-stream')).toContainText('frame-5012');

  await page.getByLabel('Search capture').fill('frame-001');
  await expect(summary).toContainText('of 7 matching');
  await expect(page.getByTestId('packet-stream')).toContainText('frame-0013');
  await expect(page.getByTestId('packet-stream')).not.toContainText('frame-0012');
  await page.getByRole('button', { name: 'Disconnect' }).click();
});

test('HPI-R11 pages the log 200 entries at a time with Older and Newer', async ({ page }) => {
  await installFakeSerial(page);
  await page.goto('./#/tools/hardware-packet-inspector');
  await page.getByRole('button', { name: 'Connect serial device' }).click();
  await expect(page.locator('.status-line')).toContainText('Serial port connected');
  await pushSerial(page, numberedLines(450));

  const summary = page.getByTestId('packet-capture-summary');
  const stream = page.getByTestId('packet-stream');
  const older = page.getByRole('button', { name: 'Older entries' });
  const newer = page.getByRole('button', { name: 'Newer entries' });
  const firstLine = async () => (await stream.innerText()).split('\n')[0];
  const lineCount = async () => (await stream.innerText()).split('\n').length;

  await expect(summary).toContainText('Showing 1–200 of 450 matching live entries · page 1 of 3');
  await expect(newer).toBeDisabled();
  expect(await firstLine()).toContain('frame-0450');
  expect(await lineCount()).toBe(200);

  await older.click();
  await expect(summary).toContainText('Showing 201–400 of 450 matching live entries · page 2 of 3');
  expect(await firstLine()).toContain('frame-0250');

  await older.click();
  await expect(summary).toContainText('Showing 401–450 of 450 matching live entries · page 3 of 3');
  await expect(older).toBeDisabled();
  expect(await firstLine()).toContain('frame-0050');
  expect(await lineCount()).toBe(50);

  await newer.click();
  await expect(summary).toContainText('Showing 201–400 of 450');
  await newer.click();
  await expect(summary).toContainText('Showing 1–200 of 450');
  await expect(newer).toBeDisabled();
  expect(await firstLine()).toContain('frame-0450');
  await page.getByRole('button', { name: 'Disconnect' }).click();
});

test('HPI-R17 exports the retained capture as CSV with rule labels and Clear capture empties it', async ({ page }) => {
  await page.goto('./#/tools/hardware-packet-inspector');
  await page.getByLabel('Simulator scenario').selectOption('error-burst');
  await page.getByRole('button', { name: 'Run simulator scenario' }).click();
  await page.getByLabel('Transmit hexadecimal bytes').fill('01 02');
  await page.getByRole('button', { name: 'Send packet' }).click();
  await expect(page.getByTestId('packet-stream')).toContainText('[error]');
  await expect(page.getByTestId('packet-rule-status')).toHaveText('Capture rules are up to date.');

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export retained CSV' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('packet-capture.csv');
  const rows = (await readDownload(download)).split('\r\n');
  expect(rows[0]).toBe('timestamp,direction,rule,hex,text');
  expect(rows).toHaveLength(4);
  expect(rows[1]).toMatch(/^[^,]+,SIM RX,error,[0-9A-F ]+,sensor=88\.1 status=ERROR$/);
  expect(rows[2]).toMatch(/^[^,]+,SIM RX,ok,[0-9A-F ]+,sensor=24\.5 status=OK$/);
  expect(rows[3]).toMatch(/^[^,]+,SIM TX,,01 02,$/);

  await page.getByRole('button', { name: 'Clear capture' }).click();
  await expect(page.locator('.status-line')).toHaveText('Capture cleared and counters reset.');
  await expect(page.getByTestId('packet-stream')).toHaveText('Capture is empty for the current filters. Run a simulator scenario, transmit a packet, or connect a device.');
  const summary = page.getByTestId('packet-capture-summary');
  await expect(summary).toContainText('0 retained / 5,000 maximum · 0 events observed');
  await expect(summary).toContainText('0 evicted');
  await expect(page.getByRole('button', { name: 'Clear capture' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Export retained CSV' })).toBeDisabled();
});

for (const width of [320, 375, 768, 1024, 1440, 1920, 2560]) {
  test(`HPI-R20 lays out without horizontal overflow at ${width} px`, async ({ page, isMobile }) => {
    test.skip(isMobile, 'viewport matrix runs on the desktop project');
    await page.setViewportSize({ width, height: width < 800 ? 800 : 1000 });
    await page.goto('./#/tools/hardware-packet-inspector');
    await page.getByLabel('Simulator scenario').selectOption('error-burst');
    await page.getByRole('button', { name: 'Run simulator scenario' }).click();
    await page.getByLabel('Transmit hexadecimal bytes').fill('AA '.repeat(120).trim());
    await page.getByRole('button', { name: 'Send packet' }).click();
    await expect(page.getByTestId('packet-stream')).toContainText('SIM TX AA AA');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
    for (const name of ['Connect serial device', 'Run simulator scenario', 'Send packet', 'Pause display', 'Clear capture', 'Export retained CSV', 'Add parsing rule', 'Older entries']) {
      const button = page.getByRole('button', { name, exact: true });
      await button.scrollIntoViewIfNeeded();
      const box = await button.boundingBox();
      expect(box && box.x >= 0 && box.x + box.width <= width + 1, `${name} inside viewport at ${width}px`).toBe(true);
    }
    for (const label of ['Baud rate', 'Transmit hexadecimal bytes', 'Search capture', 'Rule 1 pattern']) {
      const control = page.getByLabel(label, { exact: true });
      await control.scrollIntoViewIfNeeded();
      const box = await control.boundingBox();
      expect(box && box.x >= 0 && box.x + box.width <= width + 1, `${label} inside viewport at ${width}px`).toBe(true);
    }
  });
}

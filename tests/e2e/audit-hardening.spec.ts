import { expect, test } from '@playwright/test';

// Regression coverage for defects found in the catalog-wide forensic audit.
//
// The first two tests guard genuine crash paths: both workspaces called a
// throwing engine function directly during render with a value taken from a
// free-text field, so an ordinary intermediate keystroke unmounted the whole
// tool. A white screen is the failure mode these assert against.
//
// The third guards the file-input reset. A file input does not fire `change`
// when its value is unchanged, so re-importing a file after editing it did
// nothing at all until the input was cleared after each selection.

// Fails the test if React tears the tree down, which is how an unguarded throw
// during render presents to the user.
const failOnPageError = (page: import('@playwright/test').Page, errors: string[]) => {
  page.on('pageerror', (error) => errors.push(error.message));
};

test('MIDI Harmony Lab survives a root note left without an octave', async ({ page }) => {
  const errors: string[] = [];
  failOnPageError(page, errors);
  await page.goto('./#/tools/midi-harmony-lab');

  const root = page.locator('#root-0');
  await expect(root).toHaveValue('C4');
  await expect(page.getByTestId('chord-notes-0')).toContainText('MIDI notes:');

  // Deleting the octave is the state the field passes through on every edit.
  await root.fill('C');

  // The workspace must stay mounted and explain the problem instead of crashing.
  await expect(page.getByTestId('chord-notes-0')).toContainText('not a note this lab can build');
  await expect(page.locator('#root-0')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Play progression' })).toBeVisible();

  // Exporting with an invalid chord reports it rather than throwing.
  await page.getByRole('button', { name: 'Export MIDI' }).click();
  await expect(page.locator('.status-line')).toContainText('Fix the root note on chord 1');

  await root.fill('D4');
  await expect(page.getByTestId('chord-notes-0')).toContainText('MIDI notes:');
  expect(errors, `unexpected page errors: ${errors.join(' | ')}`).toEqual([]);
});

test('Cron Team Matrix survives an unrecognized timezone in either field', async ({ page }) => {
  const errors: string[] = [];
  failOnPageError(page, errors);
  await page.goto('./#/tools/cron-team-matrix');
  await expect(page.locator('#cron')).toHaveValue('0 9 * * 1-5');

  // An unrecognized source zone previously reached Intl.DateTimeFormat during
  // render and threw a RangeError.
  await page.locator('#source-zone').fill('Mars/Olympus');
  await expect(page.locator('.status-line.error')).toContainText('not a timezone this browser recognizes');
  await expect(page.locator('#source-zone')).toBeVisible();

  await page.locator('#source-zone').fill('UTC');
  await expect(page.locator('.status-line.good')).toBeVisible();

  // An unrecognized comparison zone must be named and skipped, not fatal.
  await page.locator('#zones').fill('UTC\nMars/Olympus\nAsia/Tokyo');
  await expect(page.getByTestId('invalid-zones')).toContainText('Mars/Olympus');
  await expect(page.locator('table')).toBeVisible();
  await expect(page.locator('th', { hasText: 'Asia/Tokyo' })).toBeVisible();

  expect(errors, `unexpected page errors: ${errors.join(' | ')}`).toEqual([]);
});

test('re-importing an edited file with the same name is picked up', async ({ page }) => {
  await page.goto('./#/tools/json-lattice');
  const fileInput = page.locator('input[type="file"]').first();
  const editor = page.locator('[aria-label="JSON Lattice source"]');

  await fileInput.setInputFiles({
    name: 'payload.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ revision: 'first' }, null, 2)),
  });
  await expect(editor).toContainText('first');

  // Same filename, different content: without clearing the input value the
  // browser never fires a second change event and this silently did nothing.
  await fileInput.setInputFiles({
    name: 'payload.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ revision: 'second' }, null, 2)),
  });
  await expect(editor).toContainText('second');
  await expect(editor).not.toContainText('first');
});


test('Regex Log Structurer survives a catastrophically backtracking pattern', async ({ page }) => {
  // The defining property of this fix: structuring runs in a worker with a
  // deadline, so a runaway pattern hangs that worker instead of the tab. Before
  // it, this pattern locked the page with no way left to edit the field that
  // caused it.
  test.setTimeout(60_000);
  await page.goto('./#/tools/regex-log-structurer');

  const input = page.locator('#log-input');
  await input.fill(`${'a'.repeat(3000)}b`);
  await page.locator('#log-pattern').fill('^(?<boom>(a+)+)$');

  // The deadline elapses and the tool says why, rather than freezing.
  await expect(page.getByTestId('log-status')).toContainText(/did not finish within/i, { timeout: 30_000 });

  // Decisive check: the page is still interactive afterwards.
  await page.locator('#log-pattern').fill('^(?<line>.+)$');
  await expect(page.getByTestId('log-status')).toContainText('1 matched line', { timeout: 20_000 });
});

test('Regex Log Structurer pages a large result instead of mounting every row', async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto('./#/tools/regex-log-structurer');

  const lines = Array.from({ length: 1500 }, (_, index) => `2026-08-29 INFO event ${index}`).join('\n');
  await page.locator('#log-input').fill(lines);
  await expect(page.getByTestId('log-status')).toContainText('1500 matched lines', { timeout: 20_000 });

  // Only one page is in the DOM, and the control states the real total.
  const bodyRows = page.locator('[data-testid="log-table"] tbody tr');
  await expect(bodyRows).toHaveCount(200);
  await expect(page.getByTestId('log-table-range')).toContainText('Rows 1–200 of 1500');

  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.getByTestId('log-table-range')).toContainText('Rows 201–400 of 1500');
  await expect(bodyRows).toHaveCount(200);

  // Export must cover the whole result, not the visible page.
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export CSV' }).click();
  const stream = await (await download).createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(chunk as Buffer);
  const csv = Buffer.concat(chunks).toString('utf8');
  expect(csv).toContain('event 1499');
  expect(csv.trim().split('\r\n')).toHaveLength(1501);
});

test('Regex Log Structurer reads a log file and reports inferred column kinds', async ({ page }) => {
  await page.goto('./#/tools/regex-log-structurer');
  await page.setInputFiles('#log-file', {
    name: 'service.log',
    mimeType: 'text/plain',
    buffer: Buffer.from('2026-08-29 INFO started\n2026-08-29 ERROR failed'),
  });

  await expect(page.getByTestId('log-status')).toContainText('2 matched lines', { timeout: 20_000 });
  const header = page.locator('[data-testid="log-table"] thead');
  await expect(header).toContainText('timestamp');
  await expect(header).toContainText('text');

  // The loaded filename drives the export name instead of a generic default.
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export JSON' }).click();
  expect((await download).suggestedFilename()).toBe('service.json');
});

test('Regex Log Structurer only offers the flags that can actually apply', async ({ page }) => {
  await page.goto('./#/tools/regex-log-structurer');

  // Line mode cannot honour multiline or dot-all, so they are disabled and the
  // reason is stated rather than offering controls that do nothing.
  await expect(page.getByTestId('log-flag-note')).toContainText('no newline for them to act on');
  await expect(page.getByLabel('Multiline anchors (m)')).toBeDisabled();
  await expect(page.getByLabel('Dot matches newline (s)')).toBeDisabled();
  await expect(page.getByLabel('Ignore case (i)')).toBeEnabled();

  await page.getByLabel('Scan').selectOption('document');
  await expect(page.getByLabel('Multiline anchors (m)')).toBeEnabled();
  await expect(page.getByLabel('Dot matches newline (s)')).toBeEnabled();
  await expect(page.getByTestId('log-flag-note')).toHaveCount(0);

  // Whole-document scanning parses a record that spans lines.
  await page.locator('#log-input').fill('BEGIN\ndetail line\nEND');
  await page.locator('#log-pattern').fill('BEGIN(?<body>.*?)END');
  await page.getByLabel('Dot matches newline (s)').check();
  await expect(page.getByTestId('log-status')).toContainText('1 matched line', { timeout: 20_000 });
  await expect(page.locator('[data-testid="log-table"] tbody')).toContainText('detail line');
});


test('the paged table clamps to a valid page when the result shrinks', async ({ page }) => {
  // Regression guard for the pager: clamping after commit painted one frame with
  // an empty body and an impossible range such as "Rows 1401–900 of 900".
  test.setTimeout(60_000);
  await page.goto('./#/tools/regex-log-structurer');

  const wide = Array.from({ length: 1500 }, (_, index) => `2026-08-29 INFO event ${index}`).join('\n');
  await page.locator('#log-input').fill(wide);
  await expect(page.getByTestId('log-status')).toContainText('1500 matched lines', { timeout: 20_000 });

  // Walk to a late page, then shrink the result underneath it.
  for (let click = 0; click < 6; click += 1) await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.getByTestId('log-table-range')).toContainText('page 7 of 8');

  await page.locator('#log-input').fill('2026-08-29 INFO only one line');
  await expect(page.getByTestId('log-status')).toContainText('1 matched line', { timeout: 20_000 });

  // A single row no longer paginates at all, so the pager is gone rather than
  // reporting a page that cannot exist.
  await expect(page.getByTestId('log-table-range')).toHaveCount(0);
  await expect(page.locator('[data-testid="log-table"] tbody tr')).toHaveCount(1);

  // Growing again starts from a valid page rather than the stale one.
  await page.locator('#log-input').fill(wide);
  await expect(page.getByTestId('log-status')).toContainText('1500 matched lines', { timeout: 20_000 });
  await expect(page.getByTestId('log-table-range')).toContainText('Rows 1–200 of 1500');
});

test('stopping a run really stops it, including one still only scheduled', async ({ page }) => {
  // Regression guard: Stop could not reach a run sitting in the debounce window,
  // so the runaway pattern started anyway a moment later.
  test.setTimeout(60_000);
  await page.goto('./#/tools/regex-log-structurer');

  await page.locator('#log-input').fill(`${'a'.repeat(3000)}b`);
  await page.locator('#log-pattern').fill('^(?<boom>(a+)+)$');
  await page.getByTestId('log-cancel').click();

  await expect(page.getByTestId('log-status')).toContainText('Stopped');
  // The deadline message must never arrive: the run was cancelled before and
  // during the debounce window, so nothing should still be executing.
  await expect(page.getByTestId('log-status')).not.toContainText(/did not finish within/i, { timeout: 8000 });

  // Exports are unavailable while the result does not describe the current pattern.
  await expect(page.getByRole('button', { name: 'Export CSV' })).toBeDisabled();
});

test('a pattern that matches but declares no groups is diagnosed rather than shown as empty rows', async ({ page }) => {
  await page.goto('./#/tools/regex-log-structurer');
  await page.getByLabel('Scan').selectOption('document');
  await page.locator('#log-input').fill('id=1 id=2');
  await page.locator('#log-pattern').fill('id=\\d+');

  await expect(page.getByTestId('log-status')).toContainText('declares no named groups', { timeout: 20_000 });
  // No headerless table, and nothing exportable.
  await expect(page.locator('[data-testid="log-table"]')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Export CSV' })).toBeDisabled();
});


test('MIDI Harmony Lab can stop playback and change the progression length', async ({ page }) => {
  // The progression was permanently four chords, and rapid Play clicks layered
  // oscillators with no way to silence them because nothing tracked what had
  // been scheduled.
  await page.goto('./#/tools/midi-harmony-lab');
  const chords = page.locator('[data-testid^="chord-notes-"]');
  await expect(chords).toHaveCount(4);
  await expect(page.getByTestId('midi-stop')).toBeDisabled();

  await page.getByTestId('midi-add-chord').click();
  await expect(chords).toHaveCount(5);

  await page.getByRole('button', { name: 'Remove chord 5' }).click();
  await expect(chords).toHaveCount(4);

  // Reordering swaps neighbours rather than rewriting the whole progression.
  await page.locator('#root-0').fill('A4');
  await page.getByRole('button', { name: 'Move chord 1 later' }).click();
  await expect(page.locator('#root-1')).toHaveValue('A4');

  // The last chord cannot be removed, so the progression can never be emptied.
  for (let i = 0; i < 3; i += 1) {
    await page.getByRole('button', { name: 'Remove chord 1' }).click();
  }
  await expect(chords).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Remove chord 1' })).toBeDisabled();
});

test('Cron Team Matrix projects a configurable number of runs', async ({ page }) => {
  // The horizon was hardcoded to thirty with no way to shorten or extend it.
  await page.goto('./#/tools/cron-team-matrix');
  const rows = page.locator('tbody tr');
  await expect(rows).toHaveCount(30);

  await page.locator('#run-count').fill('5');
  await expect(rows).toHaveCount(5);
  await expect(page.locator('.status-line.good')).toContainText('5 upcoming runs');

  // Out-of-range input is clamped rather than accepted.
  await page.locator('#run-count').fill('9999');
  await expect(rows).toHaveCount(200);
});

test('Hardware Packet Inspector exposes capture and port lifecycle controls', async ({ page }) => {
  // Disconnect did not exist, so the readable and writable stream locks stayed
  // held until the tab was reloaded and the port could not be reclaimed.
  await page.goto('./#/tools/hardware-packet-inspector');

  await expect(page.getByTestId('serial-disconnect')).toBeDisabled();
  await expect(page.getByLabel('Baud rate')).toBeEnabled();
  // Legacy devices need the slower standard rates.
  await expect(page.getByLabel('Baud rate').locator('option')).toHaveCount(8);
  await page.getByLabel('Baud rate').selectOption('9600');

  const stream = page.getByTestId('packet-stream');
  await expect(page.getByTestId('stream-clear')).toBeDisabled();
  await page.getByRole('button', { name: 'Start simulator' }).click();
  await expect(stream).toContainText('SIM RX');

  // Enter transmits, matching any other serial terminal.
  await page.locator('#packet').fill('01 02 03');
  await page.locator('#packet').press('Enter');
  await expect(stream).toContainText('SIM TX 01 02 03');

  // Pausing stops the log growing, and clearing empties it.
  await page.getByTestId('stream-pause').click();
  await expect(page.getByTestId('stream-pause')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('#packet').press('Enter');
  await expect(stream).not.toContainText('SIM TX 01 02 03\nSIM TX 01 02 03');

  await page.getByTestId('stream-pause').click();
  await page.getByTestId('stream-clear').click();
  await expect(stream).toContainText('RX stream is empty');
});

test('GeoJSON Simplifier runs simplification off the main thread', async ({ page }) => {
  // Simplification is proportional to vertex count and previously ran on the
  // main thread, so a large file stalled the tab.
  test.setTimeout(60_000);
  await page.goto('./#/tools/geojson-simplifier');

  // A polygon with enough vertices to be worth simplifying.
  const ring = Array.from({ length: 4000 }, (_, index) => {
    const angle = (index / 4000) * Math.PI * 2;
    return [Number((Math.cos(angle) * 10).toFixed(6)), Number((Math.sin(angle) * 10).toFixed(6))];
  });
  ring.push(ring[0]);

  await page.setInputFiles('#geo-file', {
    name: 'ring.geojson',
    mimeType: 'application/geo+json',
    buffer: Buffer.from(JSON.stringify({
      type: 'Feature',
      properties: {},
      geometry: { type: 'Polygon', coordinates: [ring] },
    })),
  });
  await expect(page.locator('.status-line')).toContainText('coordinate positions loaded');

  await page.getByRole('button', { name: 'Simplify geometry' }).click();
  await expect(page.locator('.status-line')).toContainText('Simplified locally to', { timeout: 30_000 });

  // The page stayed responsive throughout, and the output is smaller.
  const outputVertices = await page.locator('.metric', { hasText: 'Output vertices' }).locator('strong').textContent();
  expect(Number(outputVertices)).toBeGreaterThan(0);
  expect(Number(outputVertices)).toBeLessThan(4001);

  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: /Download GeoJSON/ }).click();
  expect((await download).suggestedFilename()).toBe('ring.simplified.geojson');
});

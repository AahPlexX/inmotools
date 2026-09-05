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

import { expect, test } from '@playwright/test';

function makeMonoPcm16Wav(seconds = 2, sampleRate = 48_000, frequency = 220) {
  const frameCount = Math.round(seconds * sampleRate);
  const dataBytes = frameCount * 2;
  const bytes = Buffer.alloc(44 + dataBytes);
  bytes.write('RIFF', 0, 'ascii');
  bytes.writeUInt32LE(36 + dataBytes, 4);
  bytes.write('WAVE', 8, 'ascii');
  bytes.write('fmt ', 12, 'ascii');
  bytes.writeUInt32LE(16, 16);
  bytes.writeUInt16LE(1, 20);
  bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(sampleRate, 24);
  bytes.writeUInt32LE(sampleRate * 2, 28);
  bytes.writeUInt16LE(2, 32);
  bytes.writeUInt16LE(16, 34);
  bytes.write('data', 36, 'ascii');
  bytes.writeUInt32LE(dataBytes, 40);
  for (let frame = 0; frame < frameCount; frame += 1) {
    const sample = Math.sin(2 * Math.PI * frequency * frame / sampleRate) * 0.35;
    bytes.writeInt16LE(Math.round(sample * 32_767), 44 + frame * 2);
  }
  return bytes;
}
test('imports, auditions, edits, marks, and undoes a local master', async ({ page }) => {
  await page.goto('./#/tools/midi-harmony-lab');
  const masteringTab = page.getByRole('tab', { name: 'Mastering & audio editor' });
  await expect(masteringTab).toBeVisible({ timeout: 20_000 });
  await expect(masteringTab).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('heading', { name: 'Audio mastering workstation' })).toBeVisible();

  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeDisabled();
  await page.locator('.mastering-file-button input[type="file"]').setInputFiles({
    name: 'mastering-fixture.wav',
    mimeType: 'audio/wav',
    buffer: makeMonoPcm16Wav(),
  });
  await expect(page.locator('.status-line')).toContainText(/Loaded mastering-fixture\.wav/i);
  await expect(page.getByRole('heading', { name: 'Source inspector' })).toBeVisible();
  await expect(page.getByText('48,000 Hz', { exact: true })).toBeVisible();

  await expect(page.locator('.mastering-busy')).toHaveCount(0);
  const play = page.getByRole('button', { name: 'Play', exact: true });
  const pause = page.getByRole('button', { name: 'Pause', exact: true });
  await play.click();
  await expect(pause).toBeEnabled();
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press('Space');
  await expect(page.locator('.status-line')).toContainText(/Paused at/i);
  await page.getByRole('button', { name: 'Stop', exact: true }).click();
  await expect(page.getByLabel('Playhead time')).toHaveText('0:00.000');
  await page.keyboard.press('l');
  await expect(page.getByLabel('Loop')).toBeChecked();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByLabel('Playhead time')).toHaveText('0:01.000');
  await page.keyboard.press('ArrowLeft');
  await expect(page.getByLabel('Playhead time')).toHaveText('0:00.000');
  await page.keyboard.press('Space');
  await expect(pause).toBeEnabled();
  await page.keyboard.press('Escape');
  await expect(page.getByLabel('Playhead time')).toHaveText('0:00.000');

  await page.getByLabel('Selection start (seconds)').fill('0.25');
  await page.getByLabel('Selection end (seconds)').fill('0.75');
  await page.getByLabel('Snap crop and delete boundaries to nearby zero crossings').check();
  await page.getByRole('button', { name: 'Snap selection to zero crossings' }).click();
  await expect(page.locator('.status-line')).toContainText(/snapped to nearby zero crossings/i);

  await page.getByLabel('Marker name').fill('Intro point');
  await page.getByLabel('Region name').fill('Verse A');
  await page.getByRole('button', { name: 'Add marker at playhead' }).click();
  await page.getByRole('button', { name: 'Add region from selection' }).click();
  await expect(page.getByRole('heading', { name: 'Markers' })).toBeVisible();
  await expect(page.getByLabel('Marker 1 name')).toHaveValue('Intro point');
  await expect(page.getByRole('heading', { name: 'Regions' })).toBeVisible();
  await expect(page.getByLabel('Region 1 name')).toHaveValue('Verse A');

  await page.getByLabel('Gain to apply (dB)').fill('6');
  await page.getByRole('button', { name: 'Apply gain' }).click();
  const levelPanel = page.locator('.mastering-panel').filter({ hasText: 'Level operations' });
  await expect(levelPanel.getByLabel('Clip edits')).toHaveText('1');

  const selectionStartBeforeCrop = Number(await page.getByLabel('Selection start (seconds)').inputValue());
  const selectionEndBeforeCrop = Number(await page.getByLabel('Selection end (seconds)').inputValue());
  await page.getByRole('button', { name: 'Crop to selection' }).click();
  await expect(levelPanel.getByLabel('Clip edits')).toHaveText('2');
  const selectionPanel = page.locator('.mastering-panel').filter({ hasText: 'Selection & precision edits' });
  await expect(selectionPanel.locator('.mastering-readout')).toContainText(/0\.5\d* s/);
  await expect(page.getByRole('heading', { name: 'Markers' })).toHaveCount(0);

  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(levelPanel.getByLabel('Clip edits')).toHaveText('1');
  await expect(page.getByLabel('Marker 1 name')).toHaveValue('Intro point');
  await page.getByRole('button', { name: /^Select \d/ }).click();
  await expect(page.getByLabel('Selection start (seconds)')).toHaveValue(String(selectionStartBeforeCrop));
  await expect(page.getByLabel('Selection end (seconds)')).toHaveValue(String(selectionEndBeforeCrop));
  await expect(page.getByRole('button', { name: 'Redo', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Markers' })).toHaveCount(0);
  await expect(levelPanel.getByLabel('Clip edits')).toHaveText('2');
  await expect(page.getByRole('button', { name: 'Redo', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Reset clip edits' }).click();
  await expect(levelPanel.getByLabel('Clip edits')).toHaveText('0');
  await page.getByLabel('Selection start (seconds)').fill('0.25');
  await page.getByLabel('Selection end (seconds)').fill('0.75');
  await page.getByRole('button', { name: 'Delete selection' }).click();
  await expect(levelPanel.getByLabel('Clip edits')).toHaveText('1');
  await expect(page.locator('.status-line')).toContainText(/deleted 0:00\.250–0:00\.750/i);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(levelPanel.getByLabel('Clip edits')).toHaveText('0');

  const utilityPanel = page.locator('.mastering-panel').filter({ hasText: 'Repair & channel utilities' });
  await expect(utilityPanel.getByLabel('Working channels')).toHaveText('1');
  await page.getByRole('button', { name: 'Remove DC offset' }).click();
  await page.getByRole('button', { name: 'Invert polarity' }).click();
  await page.getByRole('button', { name: 'Reverse selection' }).click();
  await page.getByLabel('Silence duration (seconds)').fill('0.1');
  await page.getByRole('button', { name: 'Insert silence at playhead' }).click();
  await expect(levelPanel.getByLabel('Clip edits')).toHaveText('4');
  await expect(page.getByLabel('Playhead time')).toHaveText('0:00.100');

  await page.getByRole('button', { name: 'Create dual mono' }).click();
  await expect(utilityPanel.getByLabel('Working channels')).toHaveText('2');
  await page.getByRole('button', { name: 'Swap L/R' }).click();
  await page.getByRole('button', { name: 'Fold down to mono' }).click();
  await expect(utilityPanel.getByLabel('Working channels')).toHaveText('1');
  await expect(levelPanel.getByLabel('Clip edits')).toHaveText('7');

  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(utilityPanel.getByLabel('Working channels')).toHaveText('2');
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  await expect(utilityPanel.getByLabel('Working channels')).toHaveText('1');
  await page.getByRole('button', { name: 'Reset clip edits' }).click();
  await expect(levelPanel.getByLabel('Clip edits')).toHaveText('0');
});

test('arranges multiple tracks with split, nudge, fades, crossfade, and zoom', async ({ page }) => {
  await page.goto('./#/tools/midi-harmony-lab');
  await expect(page.getByRole('heading', { name: 'Audio mastering workstation' })).toBeVisible({ timeout: 20_000 });
  await page.locator('.mastering-file-button input[type="file"]').setInputFiles([
    { name: 'drums.wav', mimeType: 'audio/wav', buffer: makeMonoPcm16Wav(2, 48_000, 110) },
    { name: 'keys.wav', mimeType: 'audio/wav', buffer: makeMonoPcm16Wav(1, 44_100, 440) },
  ]);
  await expect(page.locator('.status-line')).toContainText(/Loaded drums\.wav, keys\.wav/);
  await expect(page.getByText('2 of 8 tracks in use')).toBeVisible();
  await expect(page.getByRole('button', { name: /drums\.wav on Track 1/ })).toHaveAttribute('aria-pressed', 'true');

  await page.getByRole('button', { name: /keys\.wav on Track 2/ }).click();
  await expect(page.getByRole('heading', { name: 'Selected clip: keys.wav' })).toBeVisible();
  await expect(page.getByText('Converted to the project rate of 48,000 Hz', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: /drums\.wav on Track 1/ }).click();

  await page.getByLabel('Track 2 name').fill('Keys');
  await page.getByLabel('Track 2 name').press('Enter');
  await expect(page.getByRole('button', { name: /keys\.wav on Keys/ })).toBeVisible();
  await page.getByRole('button', { name: 'Move Keys up' }).click();
  await expect(page.getByLabel('Track 1 name')).toHaveValue('Keys');
  await page.getByRole('button', { name: 'Solo' }).first().click();
  await expect(page.getByRole('button', { name: 'Solo' }).first()).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Solo' }).first()).toHaveAttribute('aria-pressed', 'false');

  await page.getByRole('button', { name: /drums\.wav on Track 1/ }).click();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByLabel('Playhead time')).toHaveText('0:01.000');
  await page.getByRole('button', { name: 'Split at playhead' }).click();
  await expect(page.locator('.status-line')).toContainText(/Split drums\.wav at 0:01\.000/);
  const chips = page.getByRole('group', { name: 'Clips on Track 1' }).getByRole('button');
  await expect(chips).toHaveCount(2);

  await page.getByLabel('Nudge step').selectOption({ label: '100 ms' });
  await page.getByRole('button', { name: 'Nudge later' }).click();
  await expect(page.getByLabel('Clip start (seconds)')).toHaveValue('1.1');
  await chips.first().click();
  await page.getByLabel('Fade-out length (seconds)').fill('0.05');
  await page.getByLabel('Fade-out length (seconds)').press('Enter');
  await page.getByLabel('Fade-out curve').selectOption('sCurve');
  await expect(page.locator('.status-line')).toContainText(/S-curve/);
  await page.getByLabel('Crossfade length (seconds)').fill('0.2');
  await page.getByLabel('Crossfade length (seconds)').press('Enter');
  await page.getByRole('button', { name: 'Apply crossfade' }).click();
  await expect(page.locator('.status-line')).toContainText(/Crossfaded drums\.wav into drums\.wav over 0\.200 s/);

  await page.getByRole('button', { name: 'Zoom in' }).click();
  await expect(page.getByRole('button', { name: 'Show all' })).toBeEnabled();
  await page.getByRole('button', { name: 'Show all' }).click();
  await expect(page.getByRole('button', { name: 'Zoom out' })).toBeDisabled();

  await page.getByRole('button', { name: 'New project' }).click();
  await page.getByRole('button', { name: 'Confirm new project' }).click();
  await expect(page.getByText('Add audio', { exact: true })).toBeVisible();
});

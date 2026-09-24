import { expect, test } from '@playwright/test';

function makeMonoPcm16Wav(seconds = 2, sampleRate = 48_000) {
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
    const sample = Math.sin(2 * Math.PI * 220 * frame / sampleRate) * 0.35;
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

  await page.locator('.mastering-file-button input[type="file"]').setInputFiles({
    name: 'mastering-fixture.wav',
    mimeType: 'audio/wav',
    buffer: makeMonoPcm16Wav(),
  });
  await expect(page.locator('.status-line')).toContainText(/Loaded mastering-fixture\.wav/i);
  await expect(page.getByRole('heading', { name: 'Source inspector' })).toBeVisible();
  await expect(page.getByText('48,000 Hz', { exact: true })).toBeVisible();

  const play = page.getByRole('button', { name: 'Play', exact: true });
  const pause = page.getByRole('button', { name: 'Pause', exact: true });
  await play.click();
  await expect(pause).toBeEnabled();
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press('Space');
  await expect(page.locator('.status-line')).toContainText(/Paused at/i);
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

  await page.getByLabel('Start (seconds)').fill('0.25');
  await page.getByLabel('End (seconds)').fill('0.75');
  await page.getByRole('button', { name: 'Snap to zero crossings' }).click();
  await expect(page.locator('.status-line')).toContainText(/snapped to nearby zero crossings/i);

  await page.getByLabel('Marker name').fill('Intro point');
  await page.getByLabel('Region name').fill('Verse A');
  await page.getByRole('button', { name: 'Add marker at playhead' }).click();
  await page.getByRole('button', { name: 'Add region from selection' }).click();
  await expect(page.getByRole('heading', { name: 'Markers' })).toBeVisible();
  await expect(page.getByLabel('Marker 1 name')).toHaveValue('Intro point');
  await expect(page.getByRole('heading', { name: 'Regions' })).toBeVisible();
  await expect(page.getByLabel('Region 1 name')).toHaveValue('Verse A');

  await page.getByLabel('Gain (dB)').fill('6');
  await page.getByRole('button', { name: 'Apply gain' }).click();
  const levelPanel = page.locator('.mastering-panel').filter({ hasText: 'Level operations' });
  await expect(levelPanel.getByLabel('Applied operations')).toHaveText('1');

  const selectionStartBeforeCrop = Number(await page.getByLabel('Start (seconds)').inputValue());
  const selectionEndBeforeCrop = Number(await page.getByLabel('End (seconds)').inputValue());
  await page.getByRole('button', { name: 'Crop to selection' }).click();
  await expect(levelPanel.getByLabel('Applied operations')).toHaveText('2');
  const selectionPanel = page.locator('.mastering-panel').filter({ hasText: 'Selection & precision edits' });
  await expect(selectionPanel.locator('.mastering-readout')).toContainText(/0\.5\d* s/);
  await expect(page.getByRole('heading', { name: 'Markers' })).toHaveCount(0);

  await page.getByRole('button', { name: 'Undo edit' }).click();
  await expect(levelPanel.getByLabel('Applied operations')).toHaveText('1');
  await expect(page.getByLabel('Marker 1 name')).toHaveValue('Intro point');
  await page.getByRole('button', { name: /^Select / }).click();
  await expect(page.getByLabel('Start (seconds)')).toHaveValue(String(selectionStartBeforeCrop));
  await expect(page.getByLabel('End (seconds)')).toHaveValue(String(selectionEndBeforeCrop));
  await expect(levelPanel.getByLabel('Redo available')).toHaveText('1');
  await page.getByRole('button', { name: 'Redo edit' }).click();
  await expect(page.getByRole('heading', { name: 'Markers' })).toHaveCount(0);
  await expect(levelPanel.getByLabel('Applied operations')).toHaveText('2');
  await expect(levelPanel.getByLabel('Redo available')).toHaveText('0');
  await page.getByRole('button', { name: 'Reset audio edits' }).click();
  await expect(levelPanel.getByLabel('Applied operations')).toHaveText('0');

  const utilityPanel = page.locator('.mastering-panel').filter({ hasText: 'Repair & channel utilities' });
  await expect(utilityPanel.getByLabel('Working channels')).toHaveText('1');
  await page.getByRole('button', { name: 'Remove DC offset' }).click();
  await page.getByRole('button', { name: 'Invert polarity' }).click();
  await page.getByRole('button', { name: 'Reverse selection' }).click();
  await page.getByLabel('Silence duration (seconds)').fill('0.1');
  await page.getByRole('button', { name: 'Insert silence at playhead' }).click();
  await expect(levelPanel.getByLabel('Applied operations')).toHaveText('4');
  await expect(page.getByLabel('Playhead time')).toHaveText('0:00.100');

  await page.getByRole('button', { name: 'Create dual mono' }).click();
  await expect(utilityPanel.getByLabel('Working channels')).toHaveText('2');
  await page.getByRole('button', { name: 'Swap L/R' }).click();
  await page.getByRole('button', { name: 'Fold down to mono' }).click();
  await expect(utilityPanel.getByLabel('Working channels')).toHaveText('1');
  await expect(levelPanel.getByLabel('Applied operations')).toHaveText('7');

  await page.getByRole('button', { name: 'Undo edit' }).click();
  await expect(utilityPanel.getByLabel('Working channels')).toHaveText('2');
  await page.getByRole('button', { name: 'Redo edit' }).click();
  await expect(utilityPanel.getByLabel('Working channels')).toHaveText('1');
  await page.getByRole('button', { name: 'Reset audio edits' }).click();
  await expect(levelPanel.getByLabel('Applied operations')).toHaveText('0');
});

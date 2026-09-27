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
  await expect(page.getByText('Converted to the project rate of 48,000 Hz', { exact: false })).toBeVisible();
  await page.getByRole('tab', { name: 'Arrange' }).click();
  await expect(page.getByRole('heading', { name: 'Selected clip: keys.wav' })).toBeVisible();
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

test('processes a clip with loudness, bit depth, stretch, pitch, room tone, and the sample pen', async ({ page }) => {
  await page.goto('./#/tools/midi-harmony-lab');
  await expect(page.getByRole('heading', { name: 'Audio mastering workstation' })).toBeVisible({ timeout: 20_000 });
  await page.locator('.mastering-file-button input[type="file"]').setInputFiles({ name: 'voice.wav', mimeType: 'audio/wav', buffer: makeMonoPcm16Wav(2, 48_000, 200) });
  await expect(page.locator('.status-line')).toContainText(/Loaded voice\.wav/);
  const editTab = page.getByRole('tab', { name: 'Edit', exact: true });
  await expect(editTab).toHaveAttribute('aria-selected', 'true');
  await editTab.press('ArrowRight');
  await expect(page.getByRole('tab', { name: 'Arrange' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('tab', { name: 'Arrange' })).toBeFocused();
  await page.getByRole('tab', { name: 'Arrange' }).press('ArrowLeft');
  await expect(editTab).toHaveAttribute('aria-selected', 'true');

  await page.getByLabel('Target (LUFS)').fill('-20');
  await page.getByRole('button', { name: 'Normalize level' }).click();
  await expect(page.locator('.status-line')).toContainText(/Normalized to -20\.0 LUFS/);
  await page.getByLabel('Reduce to').selectOption('8');
  await page.getByRole('button', { name: 'Apply bit depth' }).click();
  await expect(page.getByLabel('Clip edits')).toHaveText('2');

  await page.getByRole('tab', { name: 'Time & pitch' }).click();
  await page.getByLabel('New length (% of current, 25–400)').fill('150');
  await expect(page.getByText(/voice\.wav: 0:02\.000 → 0:03\.000/)).toBeVisible();
  await page.getByRole('button', { name: 'Apply time stretch' }).click();
  await expect(page.getByLabel('Visible range')).toHaveText(/0:03\.000$/, { timeout: 20_000 });
  await page.getByLabel('Semitones (−24 to 24)').fill('3');
  await page.getByRole('button', { name: 'Apply pitch shift' }).click();
  await expect(page.locator('.status-line')).toContainText(/Shifted pitch by 3 semitones with formants preserved/);
  await expect(page.locator('.mastering-busy')).toHaveCount(0, { timeout: 30_000 });

  await page.getByRole('tab', { name: 'Edit', exact: true }).click();
  await page.getByLabel('Selection start (seconds)').fill('0.1');
  await page.getByLabel('Selection end (seconds)').fill('0.8');
  await page.getByRole('tab', { name: 'Repair' }).click();
  await page.getByRole('button', { name: 'Capture selection as room tone' }).click();
  await expect(page.getByText(/0:00\.100–0:00\.800 \(0\.70 s\)/)).toBeVisible();
  await page.getByRole('tab', { name: 'Edit', exact: true }).click();
  await page.getByLabel('Selection start (seconds)').fill('1.5');
  await page.getByLabel('Selection end (seconds)').fill('2');
  await page.getByRole('tab', { name: 'Repair' }).click();
  await page.getByRole('button', { name: 'Fill selection with room tone' }).click();
  await expect(page.locator('.status-line')).toContainText(/Filled 0:01\.500–0:02\.000 with room tone/);

  await page.getByLabel('Sample number in clip').fill('100');
  await page.getByLabel('New value (−1 to 1)').fill('0.25');
  await page.getByRole('button', { name: 'Set sample' }).click();
  await expect(page.locator('.status-line')).toContainText(/Set sample 100 on channel 1 to 0\.25/);
  const pen = page.locator('.mastering-pen-canvas');
  await expect(page.getByText(/^\d+–\d+$/)).toBeVisible();
  await pen.scrollIntoViewIfNeeded();
  const box = await pen.boundingBox();
  if (!box) throw new Error('pen canvas missing');
  await page.mouse.move(box.x + box.width * 0.4, box.y + box.height * 0.3);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.45, box.y + box.height * 0.6, { steps: 4 });
  await page.mouse.up();
  await expect(page.locator('.status-line')).toContainText(/Redrew \d+ samples with the pen/);
  await page.getByRole('tab', { name: 'Edit', exact: true }).click();
  await page.getByLabel('Selection start (seconds)').fill('1');
  await page.getByLabel('Selection end (seconds)').fill('1.001');
  await page.getByRole('tab', { name: 'Repair' }).click();
  await page.getByRole('button', { name: 'Interpolate selected samples' }).click();
  await expect(page.locator('.status-line')).toContainText(/Rebuilt 48 samples/);
  await page.getByRole('tab', { name: 'Edit', exact: true }).click();
  await expect(page.getByLabel('Clip edits')).toHaveText('8');
});

test('runs every restoration tool on a clip or a selection', async ({ page }) => {
  await page.goto('./#/tools/midi-harmony-lab');
  await expect(page.getByRole('heading', { name: 'Audio mastering workstation' })).toBeVisible({ timeout: 20_000 });
  await page.locator('.mastering-file-button input[type="file"]').setInputFiles({ name: 'interview.wav', mimeType: 'audio/wav', buffer: makeMonoPcm16Wav(3, 48_000, 180) });
  await expect(page.locator('.status-line')).toContainText(/Loaded interview\.wav/);
  const status = page.locator('.status-line');
  const clipEdits = page.getByLabel('Clip edits');
  const setSelection = async (start: string, end: string) => {
    await page.getByRole('tab', { name: 'Edit', exact: true }).click();
    await page.getByLabel('Selection start (seconds)').fill(start);
    await page.getByLabel('Selection end (seconds)').fill(end);
    await page.getByRole('tab', { name: 'Repair' }).click();
  };

  await setSelection('0.2', '0.9');
  await page.getByRole('button', { name: 'Capture noise fingerprint' }).click();
  await expect(page.getByText('0:00.200–0:00.900', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Reduce noise' }).click();
  await expect(status).toContainText(/Reduced noise by up to 12 dB on all of interview\.wav/);

  const open = async (tool: string) => page.locator('summary').filter({ hasText: tool }).click();
  await open('Hum removal');
  await page.getByRole('button', { name: 'Remove hum' }).click();
  await expect(status).toContainText(/Removed 60 Hz hum and 7 harmonics/);
  await open('Click removal');
  await page.getByRole('button', { name: 'Remove clicks' }).click();
  await open('Crackle reduction');
  await page.getByRole('button', { name: 'Reduce crackle' }).click();
  await open('Plosive control');
  await page.getByRole('button', { name: 'Soften plosives' }).click();
  await open('De-esser');
  await page.getByRole('button', { name: 'De-ess' }).click();
  await open('Hiss gate');
  await page.getByRole('button', { name: 'Gate hiss' }).click();
  await page.getByLabel('Selection only', { exact: false }).check();
  await open('De-clip');
  await page.getByRole('button', { name: 'De-clip' }).click();
  await expect(status).toContainText(/Rebuilt clipped peaks on 0:00\.200–0:00\.900/);

  await setSelection('1.5', '1.55');
  await open('Burst repair');
  await page.getByRole('button', { name: 'Rebuild selection' }).click();
  await expect(status).toContainText(/Rebuilt 0:01\.500–0:01\.550 from its surroundings/);
  await open('Frequency band repair');
  await page.getByRole('button', { name: 'Attenuate band' }).click();
  await page.getByRole('button', { name: 'Heal band' }).click();
  await expect(status).toContainText(/Healed 2000–4000 Hz/);
  await expect(page.locator('.mastering-busy')).toHaveCount(0, { timeout: 30_000 });
  await expect(status).not.toContainText(/Could not/);
  await page.getByRole('tab', { name: 'Edit', exact: true }).click();
  await expect(clipEdits).toHaveText('11');
});

test('masters the mix with the realtime chain, meters, monitoring, and an offline render', async ({ page }) => {
  await page.goto('./#/tools/midi-harmony-lab');
  await expect(page.getByRole('heading', { name: 'Audio mastering workstation' })).toBeVisible({ timeout: 20_000 });
  await page.locator('.mastering-file-button input[type="file"]').first().setInputFiles({ name: 'song.wav', mimeType: 'audio/wav', buffer: makeMonoPcm16Wav(6, 48_000, 440) });
  await expect(page.locator('.status-line')).toContainText(/Loaded song\.wav/);
  const status = page.locator('.status-line');

  await page.getByRole('tab', { name: 'Master', exact: true }).click();
  await page.locator('summary').filter({ hasText: 'Equalizer' }).click();
  await page.getByLabel('Equalizer on').check();
  await page.locator('summary').filter({ hasText: 'Band 6' }).click();
  await page.getByLabel('Band 6 on').check();
  await page.getByRole('spinbutton', { name: 'Band 6 gain' }).fill('4');
  await page.getByRole('spinbutton', { name: 'Band 6 gain' }).press('Enter');
  await expect(status).toContainText(/Band 6 gain \+4\.0 dB/);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.getByRole('spinbutton', { name: 'Band 6 gain' })).toHaveValue('0');
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  await expect(page.getByRole('spinbutton', { name: 'Band 6 gain' })).toHaveValue('4');

  await page.locator('summary').filter({ hasText: 'True-peak limiter' }).click();
  await page.getByLabel('True-peak limiter on').check();
  await page.getByRole('button', { name: 'Find resonances in whole mix' }).click();
  await expect(page.getByRole('list', { name: /Resonances in the whole mix/ })).toBeVisible();
  await page.getByRole('list', { name: /Resonances in the whole mix/ }).getByRole('button').first().click();
  await expect(status).toContainText(/cut at 440 Hz/);

  await page.getByRole('button', { name: 'Render and measure master' }).click();
  await expect(page.getByRole('table').filter({ hasText: 'Integrated loudness' })).toBeVisible({ timeout: 20_000 });
  await expect(status).toContainText(/Master rendered offline: .* LUFS integrated/);

  await page.getByRole('tab', { name: 'Meters' }).click();
  await expect(page.getByRole('radio', { name: 'Reference' })).toBeDisabled();
  await page.locator('.mastering-file-secondary input[type="file"]').setInputFiles({ name: 'reference.wav', mimeType: 'audio/wav', buffer: makeMonoPcm16Wav(4, 44_100, 330) });
  await expect(status).toContainText(/Loaded reference\.wav as the reference/);
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeEnabled();
  await expect(status).not.toContainText(/without the master chain/);
  await page.getByRole('radio', { name: 'Reference' }).click();
  await expect(status).toContainText(/reference track, loudness-matched/);
  await expect(page.getByLabel('Integrated loudness', { exact: true })).not.toHaveText('— LUFS', { timeout: 10_000 });
  await page.getByRole('radio', { name: 'Original' }).click();
  await expect(status).toContainText(/original mix, loudness-matched/);
  await page.getByRole('radio', { name: 'Difference' }).click();
  await page.getByLabel('Mono check (sum to mono)').check();
  await page.getByRole('radio', { name: 'Side only', exact: true }).check();
  await page.getByRole('radio', { name: 'Processed' }).click();
  await expect(page.getByRole('meter', { name: 'Phase correlation' })).toBeVisible();
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await expect(status).toContainText(/Paused at/);
});

test('shows a synced spectrogram and repairs a painted region', async ({ page }) => {
  await page.goto('./#/tools/midi-harmony-lab');
  await expect(page.getByRole('heading', { name: 'Audio mastering workstation' })).toBeVisible({ timeout: 20_000 });
  await page.locator('.mastering-file-button input[type="file"]').first().setInputFiles({ name: 'birdsong.wav', mimeType: 'audio/wav', buffer: makeMonoPcm16Wav(3, 48_000, 2000) });
  await expect(page.locator('.status-line')).toContainText(/Loaded birdsong\.wav/);
  await page.getByLabel('Show spectrogram').check();
  const overlay = page.locator('.mastering-spectrogram-overlay');
  await expect(overlay).toHaveAttribute('aria-label', /Spectrogram from 0:00\.000 to 0:03\.000/);
  await expect(page.locator('.mastering-spectrogram .mastering-busy')).toHaveCount(0, { timeout: 15_000 });

  await page.getByRole('radio', { name: 'Paint regions' }).click();
  await overlay.scrollIntoViewIfNeeded();
  const box = await overlay.boundingBox();
  if (!box) throw new Error('spectrogram missing');
  await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.5, { steps: 5 });
  await page.mouse.up();
  await expect(page.getByRole('list', { name: 'Painted regions' }).getByRole('listitem')).toHaveCount(1);
  await page.getByRole('button', { name: 'Attenuate painted regions' }).click();
  await expect(page.locator('.status-line')).toContainText(/Lowered 1 painted region by 18 dB/);
  await expect(page.getByRole('list', { name: 'Painted regions' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.getByLabel('Clip edits')).toHaveText('0');

  await page.getByRole('radio', { name: 'Select time' }).click();
  await page.mouse.move(box.x + box.width * 0.1, box.y + box.height * 0.5);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.5, { steps: 3 });
  await page.mouse.up();
  await expect(page.getByLabel('Selection start (seconds)')).not.toHaveValue('0');
});

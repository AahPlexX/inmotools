import { expect, test, type Page } from '@playwright/test';

async function installAudioProbe(page: Page) {
  await page.addInitScript(() => {
    const probe: {
      mode: 'ok' | 'pending' | 'resume-error' | 'schedule-error';
      starts: number;
      closes: number;
      resumeCalls: number;
      resolveResume: null | (() => void);
    } = { mode: 'ok', starts: 0, closes: 0, resumeCalls: 0, resolveResume: null };
    (window as unknown as { __audioProbe: typeof probe }).__audioProbe = probe;

    class FakeParam {
      value = 0;
      setValueAtTime() {}
      exponentialRampToValueAtTime() {}
    }

    class FakeNode {
      connect<T>(target: T): T { return target; }
      disconnect() {}
    }

    class FakeOscillator extends FakeNode {
      frequency = new FakeParam();
      type = 'sine';
      start() { probe.starts += 1; }
      stop() {}
    }

    class FakeGain extends FakeNode {
      gain = new FakeParam();
    }

    class FakeAudioContext {
      currentTime = 0;
      destination = new FakeNode();
      state: AudioContextState = 'suspended';

      constructor() {}

      resume() {
        probe.resumeCalls += 1;
        if (probe.mode === 'resume-error') return Promise.reject(new Error('resume blocked by test'));
        if (probe.mode === 'pending') {
          return new Promise<void>((resolve) => {
            probe.resolveResume = () => {
              if (this.state !== 'closed') this.state = 'running';
              resolve();
            };
          });
        }
        this.state = 'running';
        return Promise.resolve();
      }

      close() {
        if (this.state !== 'closed') {
          this.state = 'closed';
          probe.closes += 1;
        }
        return Promise.resolve();
      }

      createOscillator() {
        if (probe.mode === 'schedule-error') throw new Error('oscillator scheduling failed by test');
        return new FakeOscillator();
      }

      createGain() { return new FakeGain(); }
    }

    Object.defineProperty(window, 'AudioContext', { configurable: true, writable: true, value: FakeAudioContext });
  });
}

async function audioProbe(page: Page) {
  return page.evaluate(() => {
    const probe = (window as unknown as { __audioProbe: { mode: string; starts: number; closes: number; resumeCalls: number } }).__audioProbe;
    return { mode: probe.mode, starts: probe.starts, closes: probe.closes, resumeCalls: probe.resumeCalls };
  });
}

test('starts and explicitly stops the local Web Audio progression', async ({ page }) => {
  await page.goto('./#/tools/midi-harmony-lab');
  const play = page.getByRole('button', { name: 'Play progression' });
  const stop = page.getByRole('button', { name: 'Stop' });
  await expect(stop).toBeDisabled();
  await play.click();
  await expect(stop).toBeEnabled();
  await stop.click();
  await expect(stop).toBeDisabled();
  await expect(page.locator('.status-line')).toContainText(/audio graph was released/i);
});

test('owns a pending AudioContext before resume resolves and cannot schedule after Stop', async ({ page }) => {
  await installAudioProbe(page);
  await page.goto('./#/tools/midi-harmony-lab');
  await page.evaluate(() => { (window as unknown as { __audioProbe: { mode: string } }).__audioProbe.mode = 'pending'; });

  await page.getByRole('button', { name: 'Play progression' }).click();
  await expect(page.locator('.status-line')).toContainText(/starting audio/i);
  await expect(page.getByTestId('midi-stop')).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Play progression' })).toBeDisabled();

  await page.getByTestId('midi-stop').click();
  await expect(page.getByTestId('midi-stop')).toBeDisabled();
  expect(await audioProbe(page)).toMatchObject({ starts: 0, closes: 1, resumeCalls: 1 });

  await page.evaluate(() => {
    const probe = (window as unknown as { __audioProbe: { resolveResume: null | (() => void) } }).__audioProbe;
    probe.resolveResume?.();
  });
  await page.waitForTimeout(50);
  expect((await audioProbe(page)).starts).toBe(0);
});

test('surfaces resume and scheduling failures and releases failed contexts', async ({ page }) => {
  await installAudioProbe(page);
  await page.goto('./#/tools/midi-harmony-lab');

  await page.evaluate(() => { (window as unknown as { __audioProbe: { mode: string } }).__audioProbe.mode = 'resume-error'; });
  await page.getByRole('button', { name: 'Play progression' }).click();
  await expect(page.locator('.status-line')).toContainText(/resume blocked by test/i);
  await expect(page.getByRole('button', { name: 'Play progression' })).toBeEnabled();
  await expect(page.getByTestId('midi-stop')).toBeDisabled();
  expect((await audioProbe(page)).closes).toBe(1);

  await page.evaluate(() => { (window as unknown as { __audioProbe: { mode: string } }).__audioProbe.mode = 'schedule-error'; });
  await page.getByRole('button', { name: 'Play progression' }).click();
  await expect(page.locator('.status-line')).toContainText(/oscillator scheduling failed by test/i);
  await expect(page.getByRole('button', { name: 'Play progression' })).toBeEnabled();
  expect((await audioProbe(page)).closes).toBe(2);
});

test('loops a snapshot, identifies the active chord, and applies edits on the next audition', async ({ page }) => {
  await installAudioProbe(page);
  await page.goto('./#/tools/midi-harmony-lab');

  // Short one-chord cycle makes loop behavior fast and deterministic.
  for (const chord of [4, 3, 2]) await page.getByRole('button', { name: `Remove chord ${chord}` }).click();
  await page.getByLabel('Tempo (BPM)').fill('300');
  await page.getByLabel('Beats').fill('0.25');
  await page.getByLabel('Loop audition').check();
  await page.getByRole('button', { name: 'Play progression' }).click();

  await expect(page.getByTestId('midi-active-chord')).toContainText(/Chord 1.*C4/i);
  await page.locator('#root-0').fill('D4');
  await expect(page.getByTestId('midi-active-chord')).toContainText(/Chord 1.*C4/i);
  await page.waitForTimeout(350);
  await expect(page.getByTestId('midi-stop')).toBeEnabled();
  expect((await audioProbe(page)).starts).toBeGreaterThan(3);

  await page.getByTestId('midi-stop').click();
  await page.getByLabel('Loop audition').uncheck();
  await page.getByRole('button', { name: 'Play progression' }).click();
  await expect(page.getByTestId('midi-active-chord')).toContainText(/Chord 1.*D4/i);
});

test('saves and loads a versioned progression JSON document', async ({ page }) => {
  await page.goto('./#/tools/midi-harmony-lab');
  await expect(page.getByText(/edits made during playback apply to the next audition/i)).toBeVisible();

  const imported = {
    version: 1,
    bpm: 90,
    chords: [
      { root: 'D4', quality: 'minor', inversion: 0, beats: 2 },
      { root: 'A4', quality: 'sus4', inversion: 1, beats: 3 },
    ],
  };
  await page.getByLabel('Load progression JSON').setInputFiles({
    name: 'progression.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(imported)),
  });
  await expect(page.getByLabel('Tempo (BPM)')).toHaveValue('90');
  await expect(page.locator('#root-0')).toHaveValue('D4');
  await expect(page.locator('[data-testid^="chord-notes-"]')).toHaveCount(2);

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save progression JSON' }).click();
  const stream = await (await downloadPromise).createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(chunk as Buffer);
  expect(JSON.parse(Buffer.concat(chunks).toString('utf8'))).toEqual(imported);
});

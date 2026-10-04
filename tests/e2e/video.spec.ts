import { readFileSync } from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { buildVideoFixture, summarizeMedia, type VideoFixtureOptions } from './video-fixture';

/** Lets a test hold every Blob read (stream() or, on WebKit user agents, arrayBuffer()) until it releases them. */
async function installReadGate(page: Page) {
  await page.addInitScript(() => {
    let gate: Promise<void> | null = null;
    let release = () => undefined as void;
    const holder = window as unknown as { __holdVideoReads: () => void; __releaseVideoReads: () => void };
    holder.__holdVideoReads = () => { gate = new Promise<void>((resolve) => { release = resolve; }); };
    holder.__releaseVideoReads = () => { gate = null; release(); };
    const original = Blob.prototype.stream;
    Blob.prototype.stream = function stream(this: Blob) {
      const reader = original.call(this).getReader();
      return new ReadableStream<Uint8Array>({
        async pull(controller) {
          if (gate) await gate;
          const { done, value } = await reader.read();
          if (done) controller.close();
          else controller.enqueue(value);
        },
        cancel(reason) { return reader.cancel(reason); },
      }) as ReturnType<Blob['stream']>;
    } as Blob['stream'];
    const originalArrayBuffer = Blob.prototype.arrayBuffer;
    Blob.prototype.arrayBuffer = async function arrayBuffer(this: Blob) {
      if (gate) await gate;
      return originalArrayBuffer.call(this);
    };
  });
}

const holdReads = (page: Page) => page.evaluate(() => (window as unknown as { __holdVideoReads: () => void }).__holdVideoReads());
const releaseReads = (page: Page) => page.evaluate(() => (window as unknown as { __releaseVideoReads: () => void }).__releaseVideoReads());

async function chooseFixture(page: Page, options: VideoFixtureOptions) {
  const buffer = await buildVideoFixture(options);
  await page.locator('#video-file').setInputFiles({ name: 'fixture.webm', mimeType: 'video/webm', buffer });
  return buffer;
}

async function openWithFixture(page: Page, options: VideoFixtureOptions) {
  await page.goto('./#/tools/video-keyframe-slicer');
  const buffer = await chooseFixture(page, options);
  await expect(keyframeRows(page).first()).toBeVisible();
  return buffer;
}

const statusLine = (page: Page) => page.locator('.status-line');
const keyframeRows = (page: Page) => page.getByLabel('Verified keyframe list').locator('tbody tr');
const sourceTime = (page: Page) => page.getByLabel('Source media preview').evaluate((video: HTMLVideoElement) => video.currentTime);

async function setRange(page: Page, start: string, end: string) {
  await page.locator('#trim-start').fill(start);
  await page.locator('#trim-end').fill(end);
}

async function exportSlice(page: Page) {
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export lossless packet slice' }).click();
  const download = await downloadPromise;
  const filePath = await download.path();
  return { name: download.suggestedFilename(), bytes: new Uint8Array(readFileSync(filePath)) };
}

test('explains exact selected-track preview policy and reflows across target viewports', async ({ page }) => {
  await page.goto('./#/tools/video-keyframe-slicer');

  const policy = page.getByTestId('video-preview-policy');
  await expect(policy).toBeVisible();
  await expect(policy).toContainText(/source preview/i);
  await expect(policy).toContainText(/selected-track preview/i);

  for (const viewport of [{ width: 390, height: 844 }, { width: 844, height: 390 }, { width: 768, height: 1024 }]) {
    await page.setViewportSize(viewport);
    await expect(page.locator('#video-file')).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `${viewport.width}x${viewport.height} document overflow`).toBeLessThanOrEqual(1);
  }

  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations.filter((violation) => violation.impact === 'serious' || violation.impact === 'critical')).toEqual([]);
});

test('VKS-R01 inspection lists verified keyframes and Cancel inspection stops it', async ({ page }) => {
  await installReadGate(page);
  await page.goto('./#/tools/video-keyframe-slicer');

  await holdReads(page);
  await chooseFixture(page, { gops: 4, withAudio: true });
  await expect(statusLine(page)).toHaveText(/Reading all media tracks and verifying video keyframes/);
  await page.getByRole('button', { name: 'Cancel inspection' }).click();
  await expect(statusLine(page)).toHaveText('Inspection canceled.');
  await releaseReads(page);
  await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 300)));
  await expect(statusLine(page)).toHaveText('Inspection canceled.');
  await expect(page.getByLabel('Verified keyframe list')).toHaveCount(0);

  await chooseFixture(page, { gops: 4, withAudio: true });
  await expect(keyframeRows(page)).toHaveCount(4);
  await expect(keyframeRows(page).locator('td:nth-child(2)')).toHaveText(['0:00.000', '0:00.200', '0:00.400', '0:00.600']);
  await expect(statusLine(page)).toContainText('1 video track and 1 audio track inventoried. 4 verified keyframes');
});

test('VKS-R02 the chosen video and audio tracks are the ones written to the export', async ({ page }) => {
  await openWithFixture(page, { gops: 3, withAudio: true, secondVideoName: 'Wide angle' });

  const wide = await page.locator('#video-track option', { hasText: 'Wide angle' }).getAttribute('value');
  await page.locator('#video-track').selectOption(wide!);
  await page.locator('#audio-track').selectOption('none');
  const report = page.getByTestId('video-track-report');
  await expect(report).toContainText('Retained video: Track 2 · Wide angle');
  await expect(report).toContainText('Retained audio: none');
  await expect(report).toContainText('Omitted video: Track 1 · Main angle');
  const wideExport = await summarizeMedia((await exportSlice(page)).bytes);
  expect(wideExport.videos.map((track) => track.name)).toEqual(['Wide angle']);
  expect(wideExport.audios).toEqual([]);

  const main = await page.locator('#video-track option', { hasText: 'Main angle' }).getAttribute('value');
  await page.locator('#video-track').selectOption(main!);
  const commentary = await page.locator('#audio-track option', { hasText: 'Commentary' }).getAttribute('value');
  await page.locator('#audio-track').selectOption(commentary!);
  await expect(report).toContainText('Retained audio: Track 1 · Commentary');
  const mainExport = await summarizeMedia((await exportSlice(page)).bytes);
  expect(mainExport.videos.map((track) => track.name)).toEqual(['Main angle']);
  expect(mainExport.audios.map((track) => track.name)).toEqual(['Commentary']);
});

test('VKS-R04 shows the snapped In and Out next to the requested range before export', async ({ page }) => {
  await openWithFixture(page, { gops: 4 });

  await setRange(page, '0.25', '0.45');
  const requested = page.locator('.notice', { hasText: /^Requested/ });
  const snapped = page.locator('.notice', { hasText: 'Packet-safe export' });
  await expect(requested).toContainText('0:00.250 → 0:00.450');
  await expect(snapped).toContainText('0:00.200 → 0:00.600');
  await expect(snapped).toContainText('Adjusted to verified keyframes.');

  await setRange(page, '0.2', '0.4');
  await expect(requested).toContainText('0:00.200 → 0:00.400');
  await expect(snapped).toContainText('0:00.200 → 0:00.400');
  await expect(snapped).toContainText('Requested boundaries are already packet-safe.');
});

test('VKS-R05 keyframe navigation, Set In/Out at the playhead and Preview snapped In/Out', async ({ page }) => {
  await openWithFixture(page, { gops: 4 });
  const previous = page.getByRole('button', { name: 'Previous keyframe' });
  const next = page.getByRole('button', { name: 'Next keyframe' });

  await expect(previous).toBeDisabled();
  await next.click();
  await expect.poll(() => sourceTime(page)).toBeCloseTo(0.2, 3);
  await next.click();
  await expect.poll(() => sourceTime(page)).toBeCloseTo(0.4, 3);
  await previous.click();
  await expect.poll(() => sourceTime(page)).toBeCloseTo(0.2, 3);
  await page.getByRole('button', { name: 'Set In at playhead' }).click();
  await expect(page.locator('#trim-start')).toHaveValue('0.2');

  await next.click();
  await next.click();
  await expect.poll(() => sourceTime(page)).toBeCloseTo(0.6, 3);
  await expect(next).toBeDisabled();
  await page.getByRole('button', { name: 'Set Out at playhead' }).click();
  await expect(page.locator('#trim-end')).toHaveValue('0.6');

  await setRange(page, '0.25', '0.45');
  await page.getByRole('button', { name: 'Preview snapped In' }).click();
  await expect.poll(() => sourceTime(page)).toBeCloseTo(0.2, 3);
  await page.getByRole('button', { name: 'Preview snapped Out' }).click();
  await expect.poll(() => sourceTime(page)).toBeCloseTo(0.6, 3);
});

test('VKS-R06 pages verified keyframes 100 at a time and Seek moves the playhead', async ({ page }) => {
  await openWithFixture(page, { gops: 120 });

  await expect(keyframeRows(page)).toHaveCount(100);
  await expect(page.getByText('Page 1 of 2')).toBeVisible();
  await expect(keyframeRows(page).first()).toContainText('0:00.000');
  await expect(keyframeRows(page).last()).toContainText('100');
  await expect(keyframeRows(page).last()).toContainText('0:19.800');
  await page.getByRole('button', { name: 'Next keyframes' }).click();
  await expect(page.getByText('Page 2 of 2')).toBeVisible();
  await expect(keyframeRows(page)).toHaveCount(20);
  await expect(keyframeRows(page).first()).toContainText('101');
  await expect(keyframeRows(page).first()).toContainText('0:20.000');

  await keyframeRows(page).filter({ hasText: '0:20.800' }).getByRole('button', { name: 'Seek' }).click();
  await expect.poll(() => sourceTime(page)).toBeCloseTo(20.8, 3);
  await page.getByRole('button', { name: 'Set In at playhead' }).click();
  await expect(page.locator('#trim-start')).toHaveValue('20.8');
});

test('VKS-R07 shows the source preview and a selected-track preview of the loaded file with the policy', async ({ page }) => {
  await openWithFixture(page, { gops: 4, withAudio: true });

  await expect(page.getByTestId('video-preview-policy')).toBeVisible();
  const source = page.getByLabel('Source media preview');
  await expect(source).toBeVisible();
  await expect.poll(() => source.evaluate((video: HTMLVideoElement) => video.readyState)).toBeGreaterThanOrEqual(1);
  await expect(page.getByLabel('Selected-track preview')).toHaveCount(0);

  await page.getByRole('button', { name: 'Build selected-track preview' }).click();
  const selected = page.getByLabel('Selected-track preview');
  await expect(selected).toBeVisible();
  await expect.poll(() => selected.evaluate((video: HTMLVideoElement) => video.readyState)).toBeGreaterThanOrEqual(1);
  expect(await selected.evaluate((video: HTMLVideoElement) => video.error)).toBeNull();
});

test('VKS-R08 exports a playable file whose packets are byte-identical to the snapped source range, with progress', async ({ page }) => {
  await installReadGate(page);
  const source = await summarizeMedia(await openWithFixture(page, { gops: 4, withAudio: true }));
  await setRange(page, '0.25', '0.45');

  await holdReads(page);
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export lossless packet slice' }).click();
  await expect(page.getByRole('progressbar', { name: 'export progress' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Cancel export' })).toBeVisible();
  await releaseReads(page);
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('fixture.0.200-0.600.webm');
  const bytes = new Uint8Array(readFileSync(await download.path()));

  const exported = await summarizeMedia(bytes);
  expect(exported.videos).toHaveLength(1);
  expect(exported.videos[0].keyframes).toEqual([0, 0.2]);
  expect(exported.videos[0].packets).toEqual(source.videos[0].packets.slice(5, 15));
  expect(exported.audios[0].packetCount).toBe(20);

  const playback = await page.evaluate(async (data) => {
    const video = document.createElement('video');
    video.muted = true;
    video.src = URL.createObjectURL(new Blob([new Uint8Array(data)], { type: 'video/webm' }));
    return new Promise<{ width: number; height: number } | string>((resolve) => {
      video.addEventListener('loadeddata', () => resolve({ width: video.videoWidth, height: video.videoHeight }), { once: true });
      video.addEventListener('error', () => resolve(`error ${video.error?.code}`), { once: true });
    });
  }, Array.from(bytes));
  expect(playback).toEqual({ width: 160, height: 90 });
});

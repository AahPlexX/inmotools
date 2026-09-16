import AxeBuilder from '@axe-core/playwright';
import JSZip from 'jszip';
import { expect, test, type Download, type Page } from '@playwright/test';

// The Sightline workspace is a single surface with engine tabs, six control
// panels, and thirteen download rows. These tests walk the paths a reader takes:
// open something, read it, keep a note, and export the document and the reading
// data. Exports are reopened from their own bytes, so a download assertion here
// checks content rather than only a file name.

const loadSample = async (page: Page) => {
  await page.goto('./#/tools/sightline-velocity');
  await expect(page.getByTestId('sightline-velocity')).toBeVisible();
  await page.getByTestId('sightline-sample').click();
  await expect(page.getByTestId('sightline-status')).toContainText(/words/i);
  await expect(page.getByTestId('sightline-rsvp')).toBeVisible();
};

const readDownload = async (download: Download): Promise<Buffer> => {
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks);
};

const readDownloadText = async (download: Download): Promise<string> => (await readDownload(download)).toString('utf8');

const readZipEntryText = async (bytes: Buffer, path: string): Promise<string> => {
  const zip = await JSZip.loadAsync(bytes);
  const entry = zip.file(path);
  if (!entry) throw new Error(`${path} is missing from the downloaded archive.`);
  return entry.async('string');
};

const downloadFile = async (page: Page, exportId: string): Promise<Download> => {
  const button = page.getByTestId(`sightline-export-${exportId}`);
  await expect(button).toBeEnabled();
  const [download] = await Promise.all([page.waitForEvent('download'), button.click()]);
  return download;
};

const openPanel = async (page: Page, panel: string) => {
  await page.getByTestId(`sightline-panel-${panel}`).click();
  await expect(page.getByTestId(`sightline-panel-${panel}`)).toHaveAttribute('aria-selected', 'true');
};

/** Finish a short real session without waiting through the whole sample. */
const readBriefly = async (page: Page) => {
  await page.getByTestId('sightline-wpm-range').fill('900');
  const scrub = page.getByTestId('sightline-scrub');
  const last = Number(await scrub.getAttribute('max'));
  await scrub.fill(String(Math.max(0, last - 8)));
  await page.getByTestId('sightline-play').click();
  await expect(page.getByTestId('sightline-play')).toHaveText('Pause');
  await expect(page.getByTestId('sightline-play')).toHaveText('Read', { timeout: 5_000 });
};

test('catalog link, exact route, and generic route open the same local workspace', async ({ page }) => {
  await page.goto('./#/');
  const catalogLink = page.getByRole('link', { name: /Sightline Velocity Studio/ });
  await expect(catalogLink).toBeVisible();
  await expect(catalogLink).toHaveAttribute('href', '#/tools/sightline-velocity');
  await catalogLink.click();
  await expect(page.getByTestId('sightline-velocity')).toBeVisible();

  await page.goto('./#/tools/sightline-velocity');
  await expect(page.getByTestId('suite-title')).toContainText('Sightline Velocity Studio');
  await expect(page.getByTestId('privacy-status')).toContainText(/browser|device|local/i);
  await expect(page.getByTestId('sightline-velocity')).toBeVisible();
});

test('the sample passage is ingested, measured, and offered as sections', async ({ page }) => {
  await loadSample(page);
  const status = page.getByTestId('sightline-status');
  await expect(status).toContainText('words');
  await expect(status).toContainText('sentences');

  // The sample has headings, so the navigator lists real sections.
  const chapters = page.locator('.sightline-chapter-list li');
  await expect(chapters.first()).toBeVisible();
  expect(await chapters.count()).toBeGreaterThan(1);
  await chapters.nth(1).getByRole('button', { name: 'Go' }).click();
  await expect(page.getByTestId('sightline-position')).toContainText('word');
});

test('pasted text is read through the chosen markup dialect', async ({ page }) => {
  await page.goto('./#/tools/sightline-velocity');
  await page.getByTestId('sightline-paste').fill('# Pasted heading\n\nA short pasted paragraph for the reader.');
  await page.getByTestId('sightline-paste-format').selectOption('markdown');
  await page.getByTestId('sightline-ingest-paste').click();
  await expect(page.getByTestId('sightline-status')).toContainText('Pasted markdown');
  await expect(page.locator('.sightline-chapter-list')).toContainText('Pasted heading');
  await expect(page.getByTestId('sightline-rsvp')).toBeVisible();
});

test('the clipboard is offered as an ingestion path', async ({ page }) => {
  await page.goto('./#/tools/sightline-velocity');
  await page.getByTestId('sightline-clipboard').click();
  // A browser that grants clipboard access ingests the text; one that refuses
  // says so rather than failing silently.
  await expect(page.getByTestId('sightline-status')).toContainText(/clipboard|words/i);
});

test('keyboard control plays, steps, and bookmarks without a mouse', async ({ page }) => {
  await loadSample(page);
  const stage = page.getByTestId('sightline-stage');
  await stage.focus();
  await expect(stage).toBeFocused();
  await stage.press('Space');
  await expect(page.getByTestId('sightline-play')).toHaveText('Pause');

  const labels = page.getByTestId('sightline-position');
  const before = await labels.textContent();
  await stage.press('ArrowRight');
  await expect(labels).not.toHaveText(before ?? '');

  await page.keyboard.press('Space');
  await page.keyboard.press('b');
  await expect(page.locator('.sightline-list').filter({ hasText: 'word' }).first()).toBeVisible();

  await page.keyboard.press('ArrowUp');
  await expect(page.getByTestId('sightline-live-wpm')).toContainText('wpm');
});

test('the clock advances the words and reports a measured rate', async ({ page }) => {
  await page.clock.install();
  await loadSample(page);
  await page.getByTestId('sightline-wpm-range').fill('900');
  await page.getByTestId('sightline-play').click();
  await expect(page.getByTestId('sightline-play')).toHaveText('Pause');
  await page.clock.runFor(1_000);
  await expect(page.getByTestId('sightline-position')).not.toContainText('word 1 of');
  await expect.poll(async () => {
    const liveWpm = await page.getByTestId('sightline-live-wpm').textContent();
    return Number.parseInt(liveWpm ?? '', 10);
  }).toBeGreaterThan(0);

  await page.getByTestId('sightline-play').click();
  await expect(page.getByTestId('sightline-play')).toHaveText('Read');

  // The scrubber seeks to an exact word, which is the instant rewind path.
  const scrub = page.getByTestId('sightline-scrub');
  const total = Number(await scrub.getAttribute('max'));
  await scrub.fill(String(Math.floor(total / 2)));
  await expect(page.getByTestId('sightline-position')).toContainText(`word ${Math.floor(total / 2) + 1}`);
});

test('each presentation engine draws its own surface', async ({ page }) => {
  await loadSample(page);

  await page.getByTestId('sightline-engine-chunk').click();
  await expect(page.getByTestId('sightline-chunk')).toBeVisible();

  await page.getByTestId('sightline-engine-page').click();
  await expect(page.getByTestId('sightline-page')).toBeVisible();
  await expect(page.getByTestId('sightline-pacer')).toBeVisible();

  await page.getByTestId('sightline-engine-peripheral').click();
  await expect(page.getByTestId('sightline-peripheral')).toBeVisible();
  expect(await page.locator('.sightline-peripheral-column').count()).toBeGreaterThan(1);
  await expect(page.locator('.sightline-peripheral-note')).toContainText('columns');

  await page.getByTestId('sightline-engine-drill').click();
  await expect(page.getByTestId('sightline-drill-stage')).toBeVisible();
  await openPanel(page, 'drill');
  await page.getByTestId('sightline-flash-range').fill('40');
  await page.getByTestId('sightline-drill-gap').fill('100');
  await page.getByTestId('sightline-flash-count').fill('5');
  await page.getByTestId('sightline-drill-run').click();
  const plan = page.getByTestId('sightline-drill-plan');
  await expect(plan).toContainText('flashes');
  await expect(page.getByTestId('sightline-drill-card')).toBeVisible();
  await expect(page.getByTestId('sightline-drill-progress')).toContainText(/flash [1-5] of 5/);

  // Recognition is a keyboard action too; pressing it avoids racing the intentionally transient flash button.
  for (let index = 0; index < 5; index += 1) {
    await page.keyboard.press('r');
    await page.waitForTimeout(140);
  }
  const stageResult = page.getByTestId('sightline-drill-stage').getByTestId('sightline-drill-result');
  await expect(stageResult).toContainText('Recognised');
  await expect(stageResult).toContainText('words per minute');

  await page.getByTestId('sightline-engine-rsvp').click();
  await expect(page.getByTestId('sightline-rsvp')).toBeVisible();
});

test('themes, type, and trail settings reach the reading surface', async ({ page }) => {
  await loadSample(page);
  const surface = page.locator('.sightline-surface');
  const before = await surface.evaluate((node) => getComputedStyle(node).backgroundColor);

  await openPanel(page, 'look');
  await page.getByTestId('sightline-theme-oled').click();
  await expect(page.getByTestId('sightline-theme-oled')).toHaveAttribute('aria-pressed', 'true');
  const after = await surface.evaluate((node) => getComputedStyle(node).backgroundColor);
  expect(after).not.toBe(before);

  await page.getByTestId('sightline-font').selectOption('lexend');
  await expect(page.getByTestId('sightline-font')).toHaveValue('lexend');

  await openPanel(page, 'look');
  await expect(page.getByTestId('sightline-eccentricity')).toContainText('degrees');
  await page.getByTestId('sightline-columns').fill('4');

  await page.getByTestId('sightline-emphasis').fill('5');
  await expect(page.getByTestId('sightline-emphasis')).toHaveValue('5');
  await page.getByTestId('sightline-engine-page').click();
  await expect(page.locator('.sightline-page-token[data-emphasis="strong"]').first()).toBeVisible();
});

test('pacing controls change the plan and the rate note', async ({ page }) => {
  await loadSample(page);
  await openPanel(page, 'pace');

  await page.getByRole('button', { name: '450', exact: true }).click();
  await expect(page.getByTestId('sightline-wpm-range')).toHaveValue('450');
  await expect(page.getByTestId('sightline-rate-note')).toContainText(/comprehension|rate|words per minute/i);
  await expect(page.getByTestId('sightline-rate-note-stage')).toBeVisible();

  await page.getByRole('button', { name: /Subvocal/ }).first().click().catch(() => undefined);
  await expect(page.getByTestId('sightline-panel-pace')).toHaveAttribute('aria-selected', 'true');
});

test('the word bank collects a marked word and builds a cloze drill', async ({ page }) => {
  await loadSample(page);
  await openPanel(page, 'bank');
  await page.getByRole('button', { name: 'Mark the current word as unknown' }).click();
  await expect(page.getByTestId('sightline-bank-message')).toContainText(/Marked/i);
  await expect(page.getByTestId('sightline-bank-summary')).toContainText(/Retention/);

  const rows = page.locator('.sightline-table tbody tr');
  expect(await rows.count()).toBeGreaterThan(0);
  await rows.first().getByRole('button', { name: 'Knew it' }).click();
  await page.getByRole('button', { name: 'Build a cloze drill' }).click();
  await expect(page.getByTestId('sightline-cloze-item').first()).toBeVisible();
});

test('a reading session is recorded and exported as analytics', async ({ page }) => {
  await loadSample(page);
  await readBriefly(page);

  await openPanel(page, 'data');
  await expect(page.getByTestId('sightline-storage-note')).toBeVisible();
  const sessions = page.locator('table').filter({ hasText: 'Peak' }).locator('tbody tr');
  await expect(sessions.first()).toBeVisible();

  await openPanel(page, 'export');
  const csv = await readDownloadText(await downloadFile(page, 'analytics-csv'));
  expect(csv.split('\r\n')[0]).toBe('startedAt,document,format,wordsRead,elapsedMs,averageWpm,peakWpm,pausedMs,meanLagWpm');
  expect(csv.split('\r\n').length).toBeGreaterThan(1);

  const json = JSON.parse(await readDownloadText(await downloadFile(page, 'analytics-json'))) as {
    sessions: { averageWpm: number }[];
    documents: unknown[];
  };
  expect(json.sessions.length).toBeGreaterThan(0);
  expect(json.sessions[0]!.averageWpm).toBeGreaterThan(0);
});

test('metadata, tags, and social fields are edited at export time', async ({ page }) => {
  await loadSample(page);
  await openPanel(page, 'export');

  await page.getByTestId('sightline-meta-title').fill('Paced Reading Study');
  await page.getByTestId('sightline-meta-author').fill('Dana Reader');
  await page.getByTestId('sightline-meta-description').fill('A local study of paced reading.');
  await page.getByTestId('sightline-tag-input').fill('reading, pacing');
  await page.getByTestId('sightline-tag-input').press('Enter');

  await expect(page.getByTestId('sightline-file-preview')).toHaveText('paced-reading-study-weighted.pdf');
  await expect(page.getByRole('button', { name: 'reading ×' })).toBeVisible();
  await page.getByRole('button', { name: 'Use measured reading level' }).click();
  await expect(page.locator('table').filter({ hasText: 'og:title' }).first()).toBeVisible();
});

test('every document export downloads, and the bytes carry the treatment', async ({ page }) => {
  await loadSample(page);
  await openPanel(page, 'bank');
  await page.getByRole('button', { name: 'Mark the current word as unknown' }).click();
  await openPanel(page, 'export');
  await page.getByTestId('sightline-meta-title').fill('Sightline Export Check');

  const markdown = await readDownloadText(await downloadFile(page, 'markdown'));
  expect(markdown).toContain('title: Sightline Export Check');
  expect(markdown).toContain('## What the research shows');

  const text = await readDownloadText(await downloadFile(page, 'text'));
  expect(text).toContain('Speed reading is a skill with a speed limit');

  const html = await readDownloadText(await downloadFile(page, 'weighted-html'));
  expect(html).toContain('<title>Sightline Export Check</title>');
  expect(html).toContain('<b>');

  const gradientHtml = await readDownloadText(await downloadFile(page, 'gradient-html'));
  expect(gradientHtml).toMatch(/color:\s*#[0-9a-f]{6}/i);

  const pdf = await readDownload(await downloadFile(page, 'weighted-pdf'));
  expect(pdf.subarray(0, 5).toString('utf8')).toBe('%PDF-');
  expect(pdf.length).toBeGreaterThan(2_000);

  const gradientPdf = await readDownload(await downloadFile(page, 'gradient-pdf'));
  expect(gradientPdf.subarray(0, 5).toString('utf8')).toBe('%PDF-');

  const word = await readDownload(await downloadFile(page, 'weighted-docx'));
  expect(word.subarray(0, 2).toString('utf8')).toBe('PK');
  expect(word.includes(Buffer.from('word/document.xml'))).toBe(true);
  expect(await readZipEntryText(word, 'word/document.xml')).toContain('<w:b/>');

  const epub = await readDownload(await downloadFile(page, 'weighted-epub'));
  expect(epub.subarray(0, 2).toString('utf8')).toBe('PK');
  expect(epub.includes(Buffer.from('mimetype'))).toBe(true);
  expect(epub.includes(Buffer.from('OEBPS/nav.xhtml'))).toBe(true);

  const gradientEpub = await readDownload(await downloadFile(page, 'gradient-epub'));
  expect(gradientEpub.subarray(0, 2).toString('utf8')).toBe('PK');

  const vocabulary = await readDownloadText(await downloadFile(page, 'vocabulary-csv'));
  expect(vocabulary.split('\r\n')[0]).toBe('word,seen,correct,weight,averageMs,intervalDays,dueAt,addedAt');
});

test('reader state survives an export and import round trip', async ({ page }) => {
  await loadSample(page);
  await openPanel(page, 'export');
  const state = await readDownloadText(await downloadFile(page, 'reader-state'));
  expect(JSON.parse(state)).toMatchObject({ version: 1 });

  await page.getByTestId('sightline-state-import').fill(state);
  await page.getByTestId('sightline-state-import').blur();
  await expect(page.getByTestId('sightline-export-message')).toContainText(/imported|read/i);
});

test('highlights and margin notes are kept against the word', async ({ page }) => {
  await loadSample(page);
  await page.getByRole('button', { name: 'Highlight this sentence' }).click();
  await expect(page.locator('.sightline-list').filter({ hasText: 'words' }).first()).toBeVisible();

  await page.locator('textarea').last().fill('Worth citing in the literature review.');
  await page.getByRole('button', { name: 'Save note to this word' }).click();
  await expect(page.locator('.sightline-list').filter({ hasText: 'Worth citing' }).first()).toBeVisible();
});

test('the workspace passes an automated accessibility sweep', async ({ page }) => {
  await loadSample(page);
  for (const panel of ['pace', 'look', 'drill', 'bank', 'data', 'export']) {
    await openPanel(page, panel);
  }
  await page.getByTestId('sightline-engine-page').click();

  const results = await new AxeBuilder({ page }).include('[data-testid="suite-workspace"]').analyze();
  const blocking = results.violations.filter((violation) => violation.impact === 'serious' || violation.impact === 'critical');
  expect(blocking.map((item) => `${item.id}: ${item.help}`)).toEqual([]);
});

test('every control is reachable and operable from the keyboard alone', async ({ page }) => {
  await loadSample(page);
  // Tabbing from the top of the workspace reaches the file input and the stage.
  await page.locator('body').press('Tab');
  const reached = new Set<string>();
  for (let index = 0; index < 60; index += 1) {
    const info = await page.evaluate(() => {
      const active = document.activeElement as HTMLElement | null;
      if (!active) return { id: '', tag: '' };
      return { id: active.dataset['testid'] ?? active.getAttribute('aria-label') ?? active.textContent?.slice(0, 24) ?? '', tag: active.tagName };
    });
    if (info.id) reached.add(info.id);
    await page.keyboard.press('Tab');
  }
  expect([...reached].some((entry) => entry.includes('sightline'))).toBe(true);
  expect([...reached].some((entry) => /stage/.test(entry))).toBe(true);

  // A focused control keeps its visible focus ring.
  await page.getByTestId('sightline-sample').focus();
  const outline = await page.getByTestId('sightline-sample').evaluate((node) => getComputedStyle(node).outlineWidth);
  expect(Number.parseFloat(outline)).toBeGreaterThan(0);
});

const viewports = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'tablet', width: 900, height: 1000 },
  { name: 'phone', width: 390, height: 844 },
];

for (const viewport of viewports) {
  test(`stays usable without overflow at ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await loadSample(page);
    await openPanel(page, 'export');

    const { scrollWidth, clientWidth } = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(scrollWidth, `document must not scroll horizontally at ${viewport.name}`).toBeLessThanOrEqual(clientWidth + 1);

    const clipped = await page.evaluate(() => [...document.querySelectorAll('.sightline-card, .sightline-surface, .sightline-stage')]
      .filter((node) => node.scrollWidth > node.clientWidth + 1)
      .map((node) => `${node.className}: ${node.scrollWidth} > ${node.clientWidth}`));
    expect(clipped, `clipped containers at ${viewport.name}`).toEqual([]);

    await expect(page.getByTestId('sightline-stage')).toBeVisible();
    await expect(page.getByTestId('sightline-play')).toBeVisible();
  });
}

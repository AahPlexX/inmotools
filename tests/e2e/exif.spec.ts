import { deflateSync, crc32 } from 'node:zlib';
import { expect, test, type Download, type Page } from '@playwright/test';

const onePixelPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);

test('sanitizes an image locally, reinspects it, and produces a download', async ({ page }) => {
  await page.goto('./#/tools/exif-scrubber');
  await page.getByLabel('Choose image').setInputFiles({ name: 'private.png', mimeType: 'image/png', buffer: onePixelPng });
  await expect(page.getByText('Checked. No location, device, identity, or time fields found.', { exact: true })).toBeVisible();

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Sanitize and download' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('private-sanitized.png');
  await expect(page.getByText('Checked again. No privacy fields found.')).toBeVisible();
  await expect(page.getByAltText('Sanitized preview of private.png')).toBeVisible();
});

test('supports batch ZIP, per-file removal, and explicit JPEG background selection', async ({ page }) => {
  await page.goto('./#/tools/exif-scrubber');
  await page.getByLabel('Choose image').setInputFiles([
    { name: 'first.png', mimeType: 'image/png', buffer: onePixelPng },
    { name: 'second.png', mimeType: 'image/png', buffer: onePixelPng },
  ]);
  await expect(page.getByRole('cell', { name: 'first.png', exact: true })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'second.png', exact: true })).toBeVisible();

  await page.getByLabel('Output format').selectOption('image/jpeg');
  await expect(page.getByLabel('JPEG transparency background')).toBeVisible();
  await expect(page.getByLabel('JPEG transparency background')).toHaveValue('#ffffff');
  await page.getByRole('button', { name: 'Sanitize files' }).click();
  await expect(page.getByText(/2 sanitized copies created and checked again/)).toBeVisible();
  await expect(page.getByRole('button', { name: /Download sanitized/ })).toHaveCount(2);

  const zipDownloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download batch ZIP' }).click();
  const zipDownload = await zipDownloadPromise;
  expect(zipDownload.suggestedFilename()).toBe('exif-sanitized-batch.zip');

  await page.getByRole('button', { name: 'Remove first.png', exact: true }).click();
  await expect(page.getByRole('cell', { name: 'first.png', exact: true })).toHaveCount(0);
  await expect(page.getByRole('cell', { name: 'second.png', exact: true })).toBeVisible();
});

test('leaving during encoding prevents a later download', async ({ page }) => {
  await page.goto('./#/tools/exif-scrubber');
  await page.getByLabel('Choose image').setInputFiles({ name: 'pending.png', mimeType: 'image/png', buffer: onePixelPng });
  await page.getByLabel('Sanitize method').selectOption('rebuild');
  await expect(page.getByRole('button', { name: 'Sanitize and download' })).toBeEnabled();
  await page.evaluate(() => {
    const original = HTMLCanvasElement.prototype.toBlob;
    HTMLCanvasElement.prototype.toBlob = function (callback, ...args) {
      original.call(this, (blob) => { (window as any).finishAuditEncoding = () => callback(blob); }, ...args);
    };
  });
  const downloads: string[] = [];
  page.on('download', (download) => downloads.push(download.suggestedFilename()));
  await page.getByRole('button', { name: 'Sanitize and download' }).click();
  await expect.poll(() => page.evaluate(() => typeof (window as any).finishAuditEncoding)).toBe('function');
  await page.getByRole('link', { name: '← All tools', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Local workbench', exact: true })).toBeVisible();
  await page.evaluate(() => (window as any).finishAuditEncoding());
  await page.waitForTimeout(300);
  expect(downloads).toEqual([]);
});

const u32 = (value: number) => { const out = Buffer.alloc(4); out.writeUInt32BE(value >>> 0); return out; };
const u16 = (value: number) => { const out = Buffer.alloc(2); out.writeUInt16BE(value); return out; };

type TiffEntry = { tag: number; ascii?: string; short?: number };
const tiff = (entries: TiffEntry[]) => {
  const sorted = [...entries].sort((left, right) => left.tag - right.tag);
  let dataOffset = 8 + 2 + sorted.length * 12 + 4;
  const data: Buffer[] = [];
  const fields = sorted.map(({ tag, ascii, short }) => {
    if (short !== undefined) return Buffer.concat([u16(tag), u16(3), u32(1), u16(short), u16(0)]);
    const value = Buffer.from(`${ascii}\0`, 'latin1');
    if (value.length <= 4) return Buffer.concat([u16(tag), u16(2), u32(value.length), value, Buffer.alloc(4 - value.length)]);
    const field = Buffer.concat([u16(tag), u16(2), u32(value.length), u32(dataOffset)]);
    data.push(value);
    dataOffset += value.length;
    return field;
  });
  return Buffer.concat([Buffer.from('MM\0\x2a', 'latin1'), u32(8), u16(sorted.length), ...fields, u32(0), ...data]);
};

const privateTiff = () => tiff([
  { tag: 0x010f, ascii: 'CameraCo' },
  { tag: 0x0110, ascii: 'Model X' },
  { tag: 0x0112, short: 1 },
  { tag: 0x0132, ascii: '2026:10:01 09:00:00' },
  { tag: 0x013b, ascii: 'Jane Doe' },
]);

const jpegSegment = (marker: number, payload: Buffer) => Buffer.concat([Buffer.from([0xff, marker]), u16(payload.length + 2), payload]);

const iccProfile = () => {
  const header = Buffer.alloc(128);
  header.writeUInt32BE(132, 0);
  header.writeUInt32BE(0x02100000, 8);
  header.write('mntr', 12, 'latin1');
  header.write('RGB ', 16, 'latin1');
  header.write('XYZ ', 20, 'latin1');
  header.write('acsp', 36, 'latin1');
  return Buffer.concat([header, u32(0)]);
};

const jpegWithMetadata = (baseJpeg: Buffer, options: { icc?: boolean } = {}) => Buffer.concat([
  baseJpeg.subarray(0, 2),
  jpegSegment(0xe1, Buffer.concat([Buffer.from('Exif\0\0', 'latin1'), privateTiff()])),
  ...(options.icc ? [jpegSegment(0xe2, Buffer.concat([Buffer.from('ICC_PROFILE\0', 'latin1'), Buffer.from([1, 1]), iccProfile()]))] : []),
  baseJpeg.subarray(2),
]);

const isoBox = (type: string, ...parts: Buffer[]) => {
  const body = Buffer.concat(parts);
  return Buffer.concat([u32(8 + body.length), Buffer.from(type, 'latin1'), body]);
};
const isoFullBox = (type: string, version: number, ...parts: Buffer[]) => isoBox(type, Buffer.from([version, 0, 0, 0]), ...parts);

const heicWithExif = () => {
  const exifItem = Buffer.concat([u32(0), privateTiff()]);
  const ftyp = isoBox('ftyp', Buffer.from('heic', 'latin1'), u32(0), Buffer.from('mif1heic', 'latin1'));
  const hdlr = isoFullBox('hdlr', 0, u32(0), Buffer.from('pict', 'latin1'), Buffer.alloc(12), Buffer.from([0]));
  const iinf = isoFullBox('iinf', 0, u16(1), isoFullBox('infe', 2, u16(1), u16(0), Buffer.from('Exif', 'latin1'), Buffer.from([0])));
  const meta = (offset: number) => isoFullBox('meta', 0, hdlr, iinf,
    isoFullBox('iloc', 0, Buffer.from([0x44, 0x00]), u16(1), u16(1), u16(0), u16(1), u32(offset), u32(exifItem.length)));
  const mdatContentOffset = ftyp.length + meta(0).length + 8;
  return Buffer.concat([ftyp, meta(mdatContentOffset), isoBox('mdat', exifItem)]);
};

const pngChunk = (type: string, data: Buffer = Buffer.alloc(0)) => {
  const typed = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  return Buffer.concat([u32(data.length), typed, u32(crc32(typed))]);
};

const buildPng = (options: { width: number; height: number; pixel: (x: number, y: number) => number[]; frames?: number }) => {
  const { width, height, pixel, frames = 1 } = options;
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) Buffer.from(pixel(x, y)).copy(raw, y * (width * 4 + 1) + 1 + x * 4);
  }
  const idat = deflateSync(raw);
  const frameControl = (sequence: number) => Buffer.concat([u32(sequence), u32(width), u32(height), u32(0), u32(0), u16(1), u16(1), Buffer.from([0, 0])]);
  const parts = [Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), pngChunk('IHDR', Buffer.concat([u32(width), u32(height), Buffer.from([8, 6, 0, 0, 0])]))];
  if (frames > 1) {
    parts.push(pngChunk('acTL', Buffer.concat([u32(frames), u32(0)])), pngChunk('fcTL', frameControl(0)), pngChunk('IDAT', idat));
    for (let frame = 1, sequence = 1; frame < frames; frame += 1, sequence += 2) {
      parts.push(pngChunk('fcTL', frameControl(sequence)), pngChunk('fdAT', Buffer.concat([u32(sequence + 1), idat])));
    }
  } else {
    parts.push(pngChunk('IDAT', idat));
  }
  parts.push(pngChunk('IEND'));
  return Buffer.concat(parts);
};

const canvasImage = async (page: Page, mime: 'image/jpeg' | 'image/webp') => {
  const dataUrl = await page.evaluate((type) => {
    const canvas = document.createElement('canvas');
    canvas.width = 8;
    canvas.height = 8;
    const context = canvas.getContext('2d')!;
    context.fillStyle = '#3366cc';
    context.fillRect(0, 0, 8, 8);
    return canvas.toDataURL(type, 0.9);
  }, mime);
  return Buffer.from(dataUrl.split(',')[1], 'base64');
};

const readDownload = async (download: Download): Promise<Buffer> => {
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks);
};

const sanitizeOne = async (page: Page) => {
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Sanitize and download' }).click();
  return downloadPromise;
};

test('EXF-R01 accepts JPEG, PNG, WebP and HEIC files dropped on the drop zone', async ({ page }) => {
  await page.goto('./#/tools/exif-scrubber');
  const files = [
    { name: 'drop.jpg', type: 'image/jpeg', bytes: [...await canvasImage(page, 'image/jpeg')] },
    { name: 'drop.png', type: 'image/png', bytes: [...onePixelPng] },
    { name: 'drop.webp', type: 'image/webp', bytes: [...await canvasImage(page, 'image/webp')] },
    { name: 'drop.heic', type: 'image/heic', bytes: [...heicWithExif()] },
  ];
  const drop = (payload: Array<{ name: string; type: string; bytes: number[] }>) => page.locator('.exif-drop').evaluate((zone, entries) => {
    const transfer = new DataTransfer();
    entries.forEach((entry) => transfer.items.add(new File([new Uint8Array(entry.bytes)], entry.name, { type: entry.type })));
    zone.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: transfer }));
    zone.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: transfer }));
  }, payload);

  await drop([{ name: 'notes.txt', type: 'text/plain', bytes: [...Buffer.from('hello')] }]);
  await expect(page.locator('.status-line')).toHaveText('Drop a JPEG, PNG, WebP, or HEIC image.');

  await drop(files);
  for (const file of files) await expect(page.getByRole('cell', { name: file.name, exact: true })).toBeVisible();
  await expect(page.locator('.status-line')).toContainText('across 4 images');
});

test('EXF-R04 filters the shown fields and copies a value and the privacy-field list', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('./#/tools/exif-scrubber');
  const jpeg = jpegWithMetadata(await canvasImage(page, 'image/jpeg'));
  await page.getByLabel('Choose image').setInputFiles({ name: 'private.jpg', mimeType: 'image/jpeg', buffer: jpeg });
  const table = page.locator('[aria-label=\"Metadata for private.jpg\"]');
  await expect(table.getByRole('cell', { name: 'Artist', exact: true })).toBeVisible();
  await expect(table.getByRole('cell', { name: 'Orientation', exact: true })).toBeVisible();
  const allRows = await table.locator('tbody tr').count();
  expect(allRows).toBeGreaterThan(3);

  await page.getByLabel('Filter fields').fill('make');
  await expect(table.locator('tbody tr')).toHaveCount(1);
  await expect(table.getByRole('cell', { name: 'Make', exact: true })).toBeVisible();
  await page.getByLabel('Filter fields').fill('identity');
  await expect(table.locator('tbody tr')).toHaveCount(1);
  await expect(table.getByRole('cell', { name: 'Artist', exact: true })).toBeVisible();
  await page.getByLabel('Filter fields').fill('no-such-field');
  await expect(page.getByText('No fields match this filter.')).toBeVisible();
  await page.getByLabel('Filter fields').fill('');
  await expect(table.locator('tbody tr')).toHaveCount(allRows);

  await table.locator('tr', { has: page.getByRole('cell', { name: 'Make', exact: true }) }).getByText('View value').click();
  await table.getByRole('button', { name: 'Copy Make' }).click();
  await expect(page.locator('.status-line')).toHaveText('Copied the field value.');
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('CameraCo');

  await page.getByRole('button', { name: 'Copy privacy fields' }).click();
  await expect(page.locator('.status-line')).toHaveText('Copied the field value.');
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied.split('\n')).toEqual(expect.arrayContaining(['Make: CameraCo', 'Model: Model X', 'Artist: Jane Doe', 'DateTime: 2026:10:01 09:00:00']));
  expect(copied).not.toContain('Orientation');
});

test('EXF-R06 keeps the JPEG color profile unless the option is turned off', async ({ page }) => {
  await page.goto('./#/tools/exif-scrubber');
  const jpeg = jpegWithMetadata(await canvasImage(page, 'image/jpeg'), { icc: true });
  await page.getByLabel('Choose image').setInputFiles({ name: 'profiled.jpg', mimeType: 'image/jpeg', buffer: jpeg });
  const keep = page.getByLabel('Keep the JPEG color profile');
  await expect(keep).toBeChecked();

  const kept = await readDownload(await sanitizeOne(page));
  expect(kept.includes(Buffer.from('ICC_PROFILE\0', 'latin1'))).toBe(true);
  expect(kept.includes(Buffer.from('Exif\0\0', 'latin1'))).toBe(false);
  expect(kept.includes(Buffer.from('CameraCo', 'latin1'))).toBe(false);
  await expect(page.getByRole('cell', { name: /Checked again\. No privacy fields found\. Stripped embedded metadata\./ })).toBeVisible();

  await keep.uncheck();
  const removed = await readDownload(await sanitizeOne(page));
  expect(removed.includes(Buffer.from('ICC_PROFILE\0', 'latin1'))).toBe(false);
  expect(removed.includes(Buffer.from('Exif\0\0', 'latin1'))).toBe(false);
  expect(removed.subarray(0, 2)).toEqual(Buffer.from([0xff, 0xd8]));
});

test('EXF-R08 flattens an animation only after explicit confirmation when rebuilding', async ({ page }) => {
  await page.goto('./#/tools/exif-scrubber');
  const apng = buildPng({ width: 2, height: 2, pixel: () => [255, 0, 0, 255], frames: 2 });
  await page.getByLabel('Choose image').setInputFiles({ name: 'moving.png', mimeType: 'image/png', buffer: apng });
  await expect(page.getByRole('cell', { name: /Animated source\./ })).toBeVisible();

  await page.getByLabel('Sanitize method').selectOption('rebuild');
  await expect(page.getByText('This will flatten the animation.')).toBeVisible();
  const sanitize = page.getByRole('button', { name: 'Sanitize and download' });
  await expect(sanitize).toBeDisabled();
  await page.getByLabel('Allow animated images to be flattened to the first frame.').check();
  await expect(sanitize).toBeEnabled();

  const flattened = await readDownload(await sanitizeOne(page));
  expect(flattened.subarray(1, 4).toString('latin1')).toBe('PNG');
  expect(flattened.includes(Buffer.from('acTL', 'latin1'))).toBe(false);
  await expect(page.getByRole('cell', { name: /Checked again\. No privacy fields found\. Rebuilt pixels\./ })).toBeVisible();
});

test('EXF-R08 rebuilds pixels into another format, applies quality and paints JPEG transparency on the chosen background', async ({ page }) => {
  await page.goto('./#/tools/exif-scrubber');
  const noisy = buildPng({ width: 96, height: 96, pixel: (x, y) => [(x * 37 + y * 11) % 256, (x * 7 + y * 53) % 256, (x * y) % 256, 255] });
  await page.getByLabel('Choose image').setInputFiles({ name: 'noisy.png', mimeType: 'image/png', buffer: noisy });
  await page.getByLabel('Output format').selectOption('image/webp');
  const quality = page.locator('#exif-quality');
  await expect(quality).toBeEnabled();
  await quality.fill('1');
  const high = await sanitizeOne(page);
  expect(high.suggestedFilename()).toBe('noisy-sanitized.webp');
  const highBytes = await readDownload(high);
  expect(highBytes.subarray(0, 4).toString('latin1')).toBe('RIFF');
  expect(highBytes.subarray(8, 12).toString('latin1')).toBe('WEBP');
  await quality.fill('0.1');
  const lowBytes = await readDownload(await sanitizeOne(page));
  expect(lowBytes.length).toBeLessThan(highBytes.length);

  const transparent = buildPng({ width: 4, height: 4, pixel: () => [0, 0, 0, 0] });
  await page.getByLabel('Choose image').setInputFiles({ name: 'clear.png', mimeType: 'image/png', buffer: transparent });
  await page.getByLabel('Output format').selectOption('image/jpeg');
  await page.getByLabel('JPEG transparency background').fill('#ff0000');
  const jpeg = await sanitizeOne(page);
  expect(jpeg.suggestedFilename()).toBe('clear-sanitized.jpg');
  const jpegBytes = await readDownload(jpeg);
  const pixel = await page.evaluate(async (bytes) => {
    const bitmap = await createImageBitmap(new Blob([new Uint8Array(bytes)], { type: 'image/jpeg' }));
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext('2d')!;
    context.drawImage(bitmap, 0, 0);
    return Array.from(context.getImageData(1, 1, 1, 1).data);
  }, [...jpegBytes]);
  expect(pixel[0]).toBeGreaterThan(230);
  expect(pixel[1]).toBeLessThan(25);
  expect(pixel[2]).toBeLessThan(25);
});

test('EXF-R09 inspects HEIC, explains that stripping is refused, and rebuilds only when the browser can decode it', async ({ page }) => {
  await page.goto('./#/tools/exif-scrubber');
  await page.getByLabel('Choose image').setInputFiles({ name: 'camera.heic', mimeType: 'image/heic', buffer: heicWithExif() });
  await expect(page.getByRole('cell', { name: /Found 4 privacy fields/ })).toBeVisible();
  const table = page.locator('[aria-label=\"Metadata for camera.heic\"]');
  await expect(table.getByRole('cell', { name: 'Make', exact: true })).toBeVisible();

  const downloads: string[] = [];
  page.on('download', (download) => downloads.push(download.suggestedFilename()));
  await page.getByRole('button', { name: 'Sanitize and download' }).click();
  await expect(page.getByRole('cell', { name: 'Sanitizing failed: HEIC and other camera formats can be inspected here, but this browser cannot strip them without rebuilding pixels. Switch to Rebuild pixels.' })).toBeVisible();
  await expect(page.locator('.status-line')).toHaveText('0 images sanitized. 1 failed and can be retried.');

  const canDecodeHeic = await page.evaluate(async (bytes) => {
    try {
      (await createImageBitmap(new Blob([new Uint8Array(bytes)], { type: 'image/heic' }))).close();
      return true;
    } catch {
      return false;
    }
  }, [...heicWithExif()]);
  expect(canDecodeHeic).toBe(false);
  await page.getByLabel('Sanitize method').selectOption('rebuild');
  await page.getByRole('button', { name: 'Sanitize and download' }).click();
  await expect(page.getByRole('cell', { name: /^Sanitizing failed: / })).toBeVisible();
  expect(downloads).toEqual([]);

  await page.evaluate((pngBytes) => {
    const decode = window.createImageBitmap.bind(window);
    const standIn = new Blob([new Uint8Array(pngBytes)], { type: 'image/png' });
    (window as unknown as { createImageBitmap: typeof createImageBitmap }).createImageBitmap = ((source: ImageBitmapSource, ...rest: unknown[]) =>
      source instanceof Blob && source.type === 'image/heic'
        ? decode(standIn, ...(rest as [ImageBitmapOptions]))
        : decode(source, ...(rest as [ImageBitmapOptions]))) as typeof createImageBitmap;
  }, [...onePixelPng]);
  await page.getByRole('button', { name: 'Retry camera.heic' }).click();
  await expect(page.getByRole('cell', { name: /Checked again\. No privacy fields found\. Rebuilt pixels\./ })).toBeVisible();
  await expect.poll(() => downloads).toEqual(['camera-sanitized.png']);
});

test('EXF-R12 retries a file whose sanitizing failed', async ({ page }) => {
  await page.goto('./#/tools/exif-scrubber');
  await page.getByLabel('Choose image').setInputFiles([
    { name: 'first.png', mimeType: 'image/png', buffer: onePixelPng },
    { name: 'second.png', mimeType: 'image/png', buffer: onePixelPng },
  ]);
  await expect(page.getByRole('cell', { name: 'second.png', exact: true })).toBeVisible();
  await page.getByLabel('Sanitize method').selectOption('rebuild');
  await page.evaluate(() => {
    const original = HTMLCanvasElement.prototype.toBlob;
    let failNext = true;
    HTMLCanvasElement.prototype.toBlob = function (callback, ...args) {
      if (failNext) {
        failNext = false;
        callback(null);
        return;
      }
      original.call(this, callback, ...args);
    };
  });
  await page.getByRole('button', { name: 'Sanitize files' }).click();
  await expect(page.locator('.status-line')).toHaveText('1 image sanitized. 1 failed and can be retried.');
  await expect(page.getByRole('cell', { name: 'Sanitizing failed: Image encoding failed.' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Download sanitized/ })).toHaveCount(1);

  await page.getByRole('button', { name: 'Retry first.png' }).click();
  await expect(page.locator('.status-line')).toHaveText('1 selected image sanitized and checked again.');
  await expect(page.getByRole('button', { name: /Download sanitized/ })).toHaveCount(2);
  await expect(page.getByRole('button', { name: /^Retry / })).toHaveCount(0);
});

test('EXF-R14 downloads a local JSON inspection report with the original values', async ({ page }) => {
  await page.goto('./#/tools/exif-scrubber');
  const jpeg = jpegWithMetadata(await canvasImage(page, 'image/jpeg'));
  await page.getByLabel('Choose image').setInputFiles([
    { name: 'private.jpg', mimeType: 'image/jpeg', buffer: jpeg },
    { name: 'plain.png', mimeType: 'image/png', buffer: onePixelPng },
  ]);
  await expect(page.locator('.status-line')).toContainText('across 2 images');
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download inspection report' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('exif-inspection-report.json');
  const report = JSON.parse((await readDownload(download)).toString('utf8')) as {
    images: Array<{ name: string; type: string; bytes: number; privacyFields: Array<{ key: string; value: string }>; otherFields: Array<{ key: string }> }>;
  };
  expect(report.images.map((image) => image.name)).toEqual(['private.jpg', 'plain.png']);
  expect(report.images[0]).toMatchObject({ type: 'image/jpeg', bytes: jpeg.length });
  expect(report.images[0].privacyFields).toEqual(expect.arrayContaining([
    { key: 'Make', value: 'CameraCo' },
    { key: 'Model', value: 'Model X' },
    { key: 'Artist', value: 'Jane Doe' },
    { key: 'DateTime', value: '2026:10:01 09:00:00' },
  ]));
  expect(report.images[0].otherFields.map((field) => field.key)).toContain('Orientation');
  expect(report.images[1].privacyFields).toEqual([]);
  await expect(page.locator('.status-line')).toHaveText('Inspection report sent to your downloads. It contains the original metadata values.');
});

for (const width of [320, 375, 768, 1024, 1440, 1920, 2560]) {
  test(`EXF-R18 lays out without horizontal overflow at ${width} px`, async ({ page, isMobile }) => {
    test.skip(isMobile, 'viewport matrix runs on the desktop project');
    await page.setViewportSize({ width, height: width < 800 ? 800 : 1000 });
    await page.goto('./#/tools/exif-scrubber');
    const jpeg = jpegWithMetadata(await canvasImage(page, 'image/jpeg'));
    await page.getByLabel('Choose image').setInputFiles([
      { name: 'a-very-long-file-name-from-a-camera-roll-0001.jpg', mimeType: 'image/jpeg', buffer: jpeg },
      { name: 'second.png', mimeType: 'image/png', buffer: onePixelPng },
    ]);
    await expect(page.locator('.status-line')).toContainText('across 2 images');
    await page.getByLabel('Output format').selectOption('image/jpeg');
    await page.getByRole('button', { name: 'Sanitize files' }).click();
    await expect(page.getByRole('button', { name: 'Download batch ZIP' })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
    for (const name of ['Sanitize files', 'Download batch ZIP', 'Download inspection report', 'Copy privacy fields']) {
      const button = page.getByRole('button', { name, exact: true });
      await button.scrollIntoViewIfNeeded();
      const box = await button.boundingBox();
      expect(box && box.x >= 0 && box.x + box.width <= width + 1, `${name} inside viewport at ${width}px`).toBe(true);
    }
    for (const label of ['Sanitize method', 'Output format', 'Filter fields']) {
      const box = await page.getByLabel(label).boundingBox();
      expect(box && box.x >= 0 && box.x + box.width <= width + 1, `${label} inside viewport at ${width}px`).toBe(true);
    }
  });
}

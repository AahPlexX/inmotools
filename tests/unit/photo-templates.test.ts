import { describe, expect, test } from 'vitest';
import { DEFAULT_RECIPE } from '../../src/tools/photo/photo-engine';
import {
  DEFAULT_EXPORT_SETTINGS,
  PHOTO_FORMAT_FACTS,
  normalizeExportSettings,
  renderFilenamePattern,
  uniqueFilename,
} from '../../src/tools/photo/photo-export-settings';
import { TEXT_LAYER_PADDING } from '../../src/tools/photo/photo-layers';
import {
  applyMetadataTemplate,
  createMemoryTemplateAdapter,
  createPhotoTemplateStore,
  metadataTemplateHasLocation,
  normalizeMetadataTemplate,
  normalizeWatermarkPreset,
  parseTemplateFile,
  planWatermark,
  recipeWithWatermark,
  serializeTemplate,
  suggestTemplateFilename,
} from '../../src/tools/photo/photo-templates';

describe('export settings', () => {
  test('stored settings are rebuilt field by field with safe fallbacks', () => {
    const normalized = normalizeExportSettings({ outputMime: 'image/bmp', quality: Number.NaN, resizeMode: 'percent', resizeValue: 9000, resampling: 'lanczos3', jpegBackground: 'red', filenamePattern: '  {name}-web  ' });
    expect(normalized).toEqual({ ...DEFAULT_EXPORT_SETTINGS, resizeMode: 'percent', resizeValue: 400, resampling: 'lanczos3', filenamePattern: '{name}-web' });
  });

  test('file name rules expand tokens, keep typos visible, and always end in the right extension', () => {
    const date = new Date(2026, 8, 24);
    expect(renderFilenamePattern('{name}_{n:3}_{w}x{h}', 'image/jpeg', { sourceName: 'IMG_0042.CR3', index: 7, total: 20, width: 1600, height: 1067, date })).toBe('IMG_0042_007_1600x1067.jpg');
    expect(renderFilenamePattern('{date} {preset}', 'image/tiff', { sourceName: 'a.png', index: 1, total: 1, presetName: 'Print', date })).toBe('2026-09-24 Print.tif');
    expect(renderFilenamePattern('{nme}', 'image/png', { sourceName: 'a.png', index: 1, total: 1 })).toBe('{nme}.png');
    expect(renderFilenamePattern('bad/name:here.jpg', 'image/webp', { sourceName: 'a.png', index: 1, total: 1 })).toBe('bad-name-here.webp');
    expect(renderFilenamePattern('   ', 'image/png', { sourceName: 'beach.jpg', index: 1, total: 1 })).toBe('beach.png');
  });

  test('duplicate names get numbered copies, case-insensitively', () => {
    const used = new Set<string>();
    expect(uniqueFilename('photo.jpg', used)).toBe('photo.jpg');
    expect(uniqueFilename('PHOTO.jpg', used)).toBe('PHOTO (2).jpg');
    expect(uniqueFilename('photo.jpg', used)).toBe('photo (3).jpg');
    expect(uniqueFilename('notes', used)).toBe('notes');
  });

  test('each format states whether it is lossless or lossy', () => {
    expect(PHOTO_FORMAT_FACTS['image/png'].compression).toBe('lossless');
    expect(PHOTO_FORMAT_FACTS['image/tiff'].compression).toBe('lossless');
    expect(PHOTO_FORMAT_FACTS['image/jpeg'].usesQuality).toBe(true);
    expect(PHOTO_FORMAT_FACTS['image/webp'].compression).toBe('lossy');
  });
});

describe('metadata templates', () => {
  const source = { metadata: { creator: 'Sam Rivera', copyright: '© 2026 Sam Rivera', city: 'Lisbon', latitude: 38.72, keywords: ['travel', ' ', 'city'] } };

  test('location is dropped unless the template explicitly opts in', () => {
    const withoutLocation = normalizeMetadataTemplate(source);
    expect(withoutLocation.metadata).toEqual({ creator: 'Sam Rivera', copyright: '© 2026 Sam Rivera', keywords: ['travel', 'city'] });
    expect(metadataTemplateHasLocation(withoutLocation)).toBe(false);
    const withLocation = normalizeMetadataTemplate({ ...source, includeLocation: true });
    expect(withLocation.metadata.city).toBe('Lisbon');
    expect(metadataTemplateHasLocation(withLocation)).toBe(true);
  });

  test('applying a template fills empty fields and only overwrites when asked', () => {
    const template = normalizeMetadataTemplate(source);
    expect(applyMetadataTemplate({ creator: 'Already set', ppi: 300 }, template)).toEqual({ creator: 'Already set', ppi: 300, copyright: '© 2026 Sam Rivera', keywords: ['travel', 'city'] });
    expect(applyMetadataTemplate({ creator: 'Already set' }, template, true).creator).toBe('Sam Rivera');
  });
});

describe('watermark presets', () => {
  const measure = (text: string, fontSize: number) => text.length * fontSize * 0.5;

  test('text watermarks scale with the frame and stay inside the margin', () => {
    const preset = normalizeWatermarkPreset({ kind: 'text', text: '© Sam', size: 0.1, margin: 0.05, anchor: 'bottom-right' });
    for (const [w, h] of [[400, 300], [6000, 4000]]) {
      const plan = planWatermark(preset, w, h, measure);
      const short = Math.min(w, h);
      expect(plan.height).toBeCloseTo(0.1 * short, 6);
      // Right and bottom edges sit exactly one margin from the frame edge.
      expect(plan.x * w + plan.width / 2).toBeCloseTo(w - 0.05 * short, 6);
      expect(plan.y * h + plan.height / 2).toBeCloseTo(h - 0.05 * short, 6);
      // The rendered text box (glyphs plus the renderer's fixed padding) is scaled as a whole.
      const box = { width: Math.ceil(measure('© Sam', plan.fontSize)) + TEXT_LAYER_PADDING * 2, height: Math.ceil(plan.fontSize * 1.4) + TEXT_LAYER_PADDING };
      expect(plan.scale).toBeCloseTo(plan.height / box.height, 9);
      expect(plan.width).toBeCloseTo(box.width * plan.scale, 9);
    }
  });

  test('image watermarks size by height and centre anchors ignore the margin', () => {
    const image = normalizeWatermarkPreset({ kind: 'image', imageDataUrl: 'data:image/png;base64,iVBORw0KGgo=', imageWidth: 200, imageHeight: 100, size: 0.2, anchor: 'center' });
    const plan = planWatermark(image, 1000, 500, measure);
    expect(plan.scale).toBeCloseTo(1, 6);
    expect([plan.x, plan.y]).toEqual([0.5, 0.5]);
  });

  test('a malformed image falls back to a text watermark', () => {
    expect(normalizeWatermarkPreset({ kind: 'image', imageDataUrl: 'javascript:alert(1)', imageWidth: 10, imageHeight: 10 }).kind).toBe('text');
  });

  test('stamping a watermark returns a new recipe and leaves the original untouched', () => {
    const original = { ...DEFAULT_RECIPE, layers: [] };
    const stamped = recipeWithWatermark(original, normalizeWatermarkPreset({ text: 'Proof', opacity: 0.4 }), 800, 600, measure);
    expect(original.layers).toHaveLength(0);
    expect(stamped.layers).toHaveLength(1);
    expect(stamped.layers?.[0]).toMatchObject({ role: 'text', text: 'Proof', opacity: 0.4 });
  });
});

describe('template store and sharing', () => {
  test('saves, updates in place, lists by kind, and removes', async () => {
    let clock = 1000; let ids = 0;
    const store = createPhotoTemplateStore(createMemoryTemplateAdapter(), true, () => clock, () => `id-${++ids}`);
    const saved = await store.save({ kind: 'export', name: ' Web ', data: { ...DEFAULT_EXPORT_SETTINGS, resizeMode: 'long-edge', resizeValue: 1600 } });
    expect(saved).toMatchObject({ id: 'id-1', name: 'Web', createdAt: 1000, updatedAt: 1000 });
    await store.save({ kind: 'metadata', name: 'Rights', data: normalizeMetadataTemplate({ metadata: { creator: 'Sam' } }) });
    clock = 2000;
    const updated = await store.save({ id: 'id-1', kind: 'export', name: 'Web large', data: saved.data });
    expect(updated).toMatchObject({ id: 'id-1', createdAt: 1000, updatedAt: 2000, name: 'Web large' });
    expect((await store.list('export')).map((record) => record.name)).toEqual(['Web large']);
    expect((await store.list('metadata')).map((record) => record.name)).toEqual(['Rights']);
    await store.remove('id-1');
    expect(await store.list('export')).toEqual([]);
    await expect(store.save({ kind: 'export', name: '   ', data: DEFAULT_EXPORT_SETTINGS })).rejects.toThrow(/name/);
  });

  test('template files round-trip and foreign files are refused', async () => {
    const store = createPhotoTemplateStore(createMemoryTemplateAdapter(), true, () => 1, () => 'x');
    const record = await store.save({ kind: 'watermark', name: 'Studio mark', data: normalizeWatermarkPreset({ text: 'Studio' }) });
    const parsed = parseTemplateFile(serializeTemplate(record));
    expect(parsed).toEqual({ kind: 'watermark', name: 'Studio mark', data: record.data });
    expect(suggestTemplateFilename(record)).toBe('studio-mark.watermark-template.json');
    expect(() => parseTemplateFile('{"kind":"something-else"}')).toThrow(/not a Photo Studio template/);
    expect(() => parseTemplateFile('not json')).toThrow(/not valid JSON/);
  });
});

import { describe, expect, test } from 'vitest';
import { DEFAULT_RECIPE } from '../../src/tools/photo/photo-engine';
import {
  createPhotoExport,
  photoMetadataForPolicy,
  recipeWithOutputSharpening,
  type PhotoExportServices,
} from '../../src/tools/photo/photo-export';
import type { PhotoExportMetadata } from '../../src/tools/photo/photo-types';

function services(options?: { embedFails?: boolean }): PhotoExportServices {
  return {
    render: async (request) => ({
      revision: request.revision,
      blob: new Blob(['pixels'], { type: request.outputMime ?? 'image/png' }),
      width: 1200,
      height: 800,
      sourceWidth: 1200,
      sourceHeight: 800,
      scaledForSafety: false,
      histogram: { red: [], green: [], blue: [], luminance: [] },
      outputMime: request.outputMime ?? 'image/png',
    }),
    embed: async (blob, _mime, xmp) => {
      if (options?.embedFails) throw new Error('metadata too large');
      return new Blob([await blob.arrayBuffer(), xmp], { type: blob.type });
    },
  };
}

describe('Photo Studio export orchestration', () => {
  test('strip policy exports only rendered pixels with a safe edited filename', async () => {
    const result = await createPhotoExport({
      file: new Blob(['source'], { type: 'image/jpeg' }),
      sourceName: 'portrait.CR2',
      requestedName: '',
      recipe: DEFAULT_RECIPE,
      outputMime: 'image/jpeg',
      quality: 0.9,
      metadataPolicy: 'strip',
      metadata: { title: 'Should not embed' },
      revision: 1,
    }, services());

    expect(result.filename).toBe('portrait-edited.jpg');
    expect(result.metadataEmbedded).toBe(false);
    expect(await result.blob.text()).toBe('pixels');
  });

  test('reviewed metadata is embedded when the container writer succeeds', async () => {
    const result = await createPhotoExport({
      file: new Blob(['source'], { type: 'image/png' }),
      sourceName: 'source.png',
      requestedName: 'Client Final',
      recipe: DEFAULT_RECIPE,
      outputMime: 'image/png',
      quality: 1,
      metadataPolicy: 'custom',
      metadata: { title: 'Launch image', city: 'New Orleans' },
      revision: 2,
    }, services());

    expect(result.filename).toBe('Client Final.png');
    expect(result.metadataEmbedded).toBe(true);
    expect(result.metadataError).toBeUndefined();
    expect(await result.blob.text()).toContain('Launch image');
  });

  test('metadata packaging failure preserves the rendered pixel export and reports fallback', async () => {
    const result = await createPhotoExport({
      file: new Blob(['source'], { type: 'image/webp' }),
      sourceName: 'source.webp',
      requestedName: 'Finished',
      recipe: DEFAULT_RECIPE,
      outputMime: 'image/webp',
      quality: 0.9,
      metadataPolicy: 'rights',
      metadata: { title: 'Title', copyright: 'Copyright 2026' },
      revision: 3,
    }, services({ embedFails: true }));

    expect(result.filename).toBe('Finished.webp');
    expect(result.metadataEmbedded).toBe(false);
    expect(result.metadataError).toBe('metadata too large');
    expect(await result.blob.text()).toBe('pixels');
  });

  test('rights policy excludes location while custom policy retains explicit location', () => {
    const metadata: PhotoExportMetadata = {
      title: 'Title', creator: 'Creator', copyright: 'Copyright', city: 'New Orleans', latitude: 29.95, longitude: -90.07,
    };
    expect(photoMetadataForPolicy(metadata, 'rights')).toMatchObject({ title: 'Title', creator: 'Creator', copyright: 'Copyright' });
    expect(photoMetadataForPolicy(metadata, 'rights').city).toBeUndefined();
    expect(photoMetadataForPolicy(metadata, 'custom').city).toBe('New Orleans');
    expect(photoMetadataForPolicy(metadata, 'strip')).toEqual({});
  });

  test('output sharpening is additive, bounded, and does not mutate the edit recipe', () => {
    const source = { ...DEFAULT_RECIPE, sharpenAmount: 0.4 };
    expect(recipeWithOutputSharpening(source, 'none').sharpenAmount).toBe(0.4);
    expect(recipeWithOutputSharpening(source, 'standard').sharpenAmount).toBeGreaterThan(0.4);
    expect(recipeWithOutputSharpening({ ...source, sharpenAmount: 1.9 }, 'strong').sharpenAmount).toBe(2);
    expect(source.sharpenAmount).toBe(0.4);
  });
});
import { describe, expect, test } from 'vitest';
import { DEFAULT_RECIPE, normalizeRecipe } from '../../src/tools/photo/photo-engine';
import {
  MAX_ICC_PROFILE_BYTES,
  PHOTO_LCMS_VERSION,
  applyAssignedPhotoProfile,
  applyPhotoOutputProfile,
  applyPhotoSoftProof,
  normalizePhotoColorManagement,
  parsePhotoIccProfile,
} from '../../src/tools/photo/color/photo-color-management';
import { processPhotoColorPipeline } from '../../src/tools/photo/color/photo-color-pipeline';
import { embedPhotoIcc } from '../../src/tools/photo/photo-metadata-embed';
import { photoSrgbProfileBytes, photoSrgbProfileFile } from '../fixtures/photo-srgb-profile';

const encoder = new TextEncoder();
const latin1 = new TextDecoder('latin1');

function minimalPng(): Uint8Array {
  return new Uint8Array([
    137, 80, 78, 71, 13, 10, 26, 10,
    0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130,
  ]);
}

function writeUint32Le(bytes: Uint8Array, offset: number, value: number): void {
  bytes[offset] = value & 0xff;
  bytes[offset + 1] = (value >>> 8) & 0xff;
  bytes[offset + 2] = (value >>> 16) & 0xff;
  bytes[offset + 3] = (value >>> 24) & 0xff;
}

function minimalWebp(): Uint8Array {
  const payload = new Uint8Array([0x2f, 0, 0, 0, 0]);
  const output = new Uint8Array(12 + 8 + payload.length + 1);
  output.set(encoder.encode('RIFF'), 0);
  writeUint32Le(output, 4, output.length - 8);
  output.set(encoder.encode('WEBP'), 8);
  output.set(encoder.encode('VP8L'), 12);
  writeUint32Le(output, 16, payload.length);
  output.set(payload, 20);
  return output;
}

function expectPixelsNear(actual: Uint8ClampedArray, expected: Uint8ClampedArray, tolerance = 2): void {
  expect(actual).toHaveLength(expected.length);
  for (let index = 0; index < actual.length; index += 1) {
    expect(Math.abs(actual[index] - expected[index]), `channel ${index}`).toBeLessThanOrEqual(tolerance);
  }
}

describe('Photo Studio ICC color management', () => {
  test('opens a bounded real ICC profile and records stable profile facts', async () => {
    const profile = await parsePhotoIccProfile(photoSrgbProfileFile());
    expect(profile.colorSpace).toBe('RGB');
    expect(profile.description).toMatch(/Photo Studio Test RGB/i);
    expect(profile.fileName).toBe('Photo Studio Test RGB.icc');
    expect(profile.size).toBe(photoSrgbProfileBytes().length);
    expect(profile.fingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(PHOTO_LCMS_VERSION).toBe(2160);
  });

  test('rejects malformed, truncated, and oversized profile payloads before LittleCMS', async () => {
    await expect(parsePhotoIccProfile(new File([new Uint8Array(127)], 'short.icc'))).rejects.toThrow(/128-byte header/i);
    const broken = photoSrgbProfileBytes();
    broken[36] = 0;
    await expect(parsePhotoIccProfile(new File([broken], 'broken.icc'))).rejects.toThrow(/not an ICC/i);
    const oversized = new Blob([new Uint8Array(MAX_ICC_PROFILE_BYTES + 1)]) as Blob & { name?: string };
    Object.defineProperty(oversized, 'name', { value: 'huge.icc' });
    await expect(parsePhotoIccProfile(oversized)).rejects.toThrow(/2 MiB/i);
  });

  test('normalizes legacy recipes and keeps proof toggles impossible without a proof profile', () => {
    const legacy = normalizeRecipe({ ...DEFAULT_RECIPE, colorManagement: undefined } as typeof DEFAULT_RECIPE);
    expect(legacy.colorManagement).toEqual({
      assignedProfile: null,
      outputProfile: null,
      proofProfile: null,
      renderingIntent: 'relative-colorimetric',
      proofIntent: 'relative-colorimetric',
      blackPointCompensation: true,
      softProof: false,
      gamutWarning: false,
    });
    expect(normalizePhotoColorManagement({
      ...legacy.colorManagement!,
      softProof: true,
      gamutWarning: true,
    })).toMatchObject({ softProof: false, gamutWarning: false });
  });

  test('performs real sRGB assign, output, and proof transforms while preserving alpha', async () => {
    const profile = await parsePhotoIccProfile(photoSrgbProfileFile());
    const source = new Uint8ClampedArray([0, 64, 128, 17, 240, 120, 12, 199]);

    const assigned = new Uint8ClampedArray(source);
    await applyAssignedPhotoProfile(assigned, profile, 'relative-colorimetric', true);
    expect(assigned[3]).toBe(17);
    expect(assigned[7]).toBe(199);
    await applyPhotoOutputProfile(assigned, profile, 'relative-colorimetric', true);
    expectPixelsNear(assigned, source, 3);

    const proofed = new Uint8ClampedArray(source);
    const gamutPixels = await applyPhotoSoftProof(
      proofed,
      profile,
      'relative-colorimetric',
      'relative-colorimetric',
      true,
      true,
    );
    expect(gamutPixels).toBe(0);
    expectPixelsNear(proofed, source, 3);
    expect(proofed[3]).toBe(17);
    expect(proofed[7]).toBe(199);
  });

  test('keeps an unproofed buffer for proof-aware sampling and never proof-processes export', async () => {
    const profile = await parsePhotoIccProfile(photoSrgbProfileFile());
    const recipe = normalizeRecipe({
      ...DEFAULT_RECIPE,
      exposure: 0.5,
      colorManagement: {
        ...DEFAULT_RECIPE.colorManagement!,
        proofProfile: profile,
        softProof: true,
      },
    });
    const source = new Uint8ClampedArray([80, 100, 120, 255]);
    const preview = await processPhotoColorPipeline(new Uint8ClampedArray(source), 1, 1, recipe, 'preview');
    expect(preview.proofBasePixels).toBeDefined();
    expectPixelsNear(preview.pixels, preview.proofBasePixels!, 2);

    const exported = await processPhotoColorPipeline(new Uint8ClampedArray(source), 1, 1, recipe, 'export');
    expect(exported.proofBasePixels).toBeUndefined();
  });

  test('composites JPEG transparency in working RGB before any output transform', async () => {
    const result = await processPhotoColorPipeline(
      new Uint8ClampedArray([255, 0, 0, 128]),
      1,
      1,
      DEFAULT_RECIPE,
      'export',
      [0, 0, 255],
    );
    expect([...result.pixels]).toEqual([128, 0, 127, 255]);
  });

  test('embeds the selected profile in JPEG APP2, PNG iCCP, and WebP ICCP containers', async () => {
    const profile = await parsePhotoIccProfile(photoSrgbProfileFile());
    const options = { width: 1, height: 1 };
    const jpeg = await embedPhotoIcc(new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])], { type: 'image/jpeg' }), 'image/jpeg', profile, options);
    const png = await embedPhotoIcc(new Blob([minimalPng()], { type: 'image/png' }), 'image/png', profile, options);
    const webp = await embedPhotoIcc(new Blob([minimalWebp()], { type: 'image/webp' }), 'image/webp', profile, options);

    expect(latin1.decode(await jpeg.arrayBuffer())).toContain('ICC_PROFILE');
    expect(latin1.decode(await png.arrayBuffer())).toContain('iCCP');
    const webpBytes = new Uint8Array(await webp.arrayBuffer());
    expect(latin1.decode(webpBytes)).toContain('ICCP');
    expect(webpBytes[20] & 0x20).toBe(0x20);
  });
});

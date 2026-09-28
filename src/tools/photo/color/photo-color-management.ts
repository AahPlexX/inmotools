import {
  INTENT_ABSOLUTE_COLORIMETRIC,
  INTENT_PERCEPTUAL,
  INTENT_RELATIVE_COLORIMETRIC,
  INTENT_SATURATION,
  LCMS_VERSION,
  TYPE_RGB_8,
  cmsFLAGS_BLACKPOINTCOMPENSATION,
  cmsFLAGS_GAMUTCHECK,
  cmsFLAGS_NOCACHE,
  cmsFLAGS_SOFTPROOFING,
  cmsInfoDescription,
  instantiate,
  type LcmsModule,
} from 'lcms-wasm';
import lcmsWasmUrl from 'lcms-wasm/dist/lcms.wasm?url';
import type {
  PhotoColorManagement,
  PhotoIccColorSpace,
  PhotoIccProfile,
  PhotoRenderingIntent,
} from '../photo-types';

export const MAX_ICC_PROFILE_BYTES = 2 * 1024 * 1024;
export const PHOTO_LCMS_VERSION = LCMS_VERSION;
const ICC_HEADER_BYTES = 128;
const PROFILE_CACHE_LIMIT = 4;
const TRANSFORM_CHUNK_PIXELS = 262_144;
const ICC_SIGNATURE_OFFSET = 36;
const ICC_COLOR_SPACE_OFFSET = 16;
const allowedIntents = new Set<PhotoRenderingIntent>([
  'perceptual',
  'relative-colorimetric',
  'saturation',
  'absolute-colorimetric',
]);
const allowedColorSpaces = new Set<PhotoIccColorSpace>(['RGB', 'CMYK', 'GRAY']);

let lcmsPromise: Promise<LcmsModule> | null = null;
const decodedProfiles = new Map<string, Uint8Array>();

function isBrowserRuntime(): boolean {
  return typeof window !== 'undefined'
    || (typeof WorkerGlobalScope !== 'undefined' && globalThis instanceof WorkerGlobalScope);
}

function getLcms(): Promise<LcmsModule> {
  if (!lcmsPromise) {
    lcmsPromise = instantiate(isBrowserRuntime() ? { locateFile: () => lcmsWasmUrl } : undefined);
  }
  return lcmsPromise;
}

function ascii(bytes: Uint8Array, offset: number, length: number): string {
  let result = '';
  for (let index = 0; index < length; index += 1) result += String.fromCharCode(bytes[offset + index]);
  return result;
}

function readUint32Be(bytes: Uint8Array, offset: number): number {
  return (((bytes[offset] << 24) >>> 0)
    | (bytes[offset + 1] << 16)
    | (bytes[offset + 2] << 8)
    | bytes[offset + 3]) >>> 0;
}

function base64FromBytes(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

function bytesFromBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function sanitizeName(value: string, fallback: string): string {
  const sanitized = value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  return (sanitized || fallback).slice(0, 160);
}

function headerColorSpace(bytes: Uint8Array): PhotoIccColorSpace | null {
  const value = ascii(bytes, ICC_COLOR_SPACE_OFFSET, 4).trim();
  if (value === 'RGB') return 'RGB';
  if (value === 'CMYK') return 'CMYK';
  if (value === 'GRAY') return 'GRAY';
  return null;
}

function validateIccBytes(input: Uint8Array): Uint8Array {
  if (input.length < ICC_HEADER_BYTES) throw new Error('ICC profiles must contain a complete 128-byte header.');
  if (input.length > MAX_ICC_PROFILE_BYTES) throw new Error('ICC profiles must be 2 MiB or smaller.');
  const declaredLength = readUint32Be(input, 0);
  if (declaredLength < ICC_HEADER_BYTES || declaredLength > input.length || declaredLength > MAX_ICC_PROFILE_BYTES) {
    throw new Error('The ICC profile declares an invalid or truncated byte length.');
  }
  if (ascii(input, ICC_SIGNATURE_OFFSET, 4) !== 'acsp') throw new Error('The selected file is not an ICC/ICM profile.');
  if (!headerColorSpace(input)) throw new Error('Photo Studio supports RGB, CMYK, and grayscale ICC profiles.');
  return input.slice(0, declaredLength);
}

async function fingerprint(bytes: Uint8Array): Promise<string> {
  if (globalThis.crypto?.subtle) {
    const owned = new Uint8Array(bytes);
    const digest = new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', owned.buffer));
    return Array.from(digest, (value) => value.toString(16).padStart(2, '0')).join('');
  }
  let hash = 0x811c9dc5;
  for (const byte of bytes) hash = Math.imul(hash ^ byte, 0x01000193) >>> 0;
  return `${bytes.length.toString(16)}-${hash.toString(16).padStart(8, '0')}`;
}

function cacheProfile(profile: PhotoIccProfile, bytes: Uint8Array): void {
  decodedProfiles.delete(profile.fingerprint);
  decodedProfiles.set(profile.fingerprint, bytes);
  while (decodedProfiles.size > PROFILE_CACHE_LIMIT) {
    const oldest = decodedProfiles.keys().next().value as string | undefined;
    if (!oldest) break;
    decodedProfiles.delete(oldest);
  }
}

export async function parsePhotoIccProfile(file: Blob & { name?: string }): Promise<PhotoIccProfile> {
  if (file.size > MAX_ICC_PROFILE_BYTES) throw new Error('ICC profiles must be 2 MiB or smaller.');
  const bytes = validateIccBytes(new Uint8Array(await file.arrayBuffer()));
  const lcms = await getLcms();
  const handle = lcms.cmsOpenProfileFromMem(bytes, bytes.length);
  if (!handle) throw new Error('LittleCMS could not open this ICC profile.');
  try {
    const rawSpace = lcms.cmsGetColorSpaceASCII(handle);
    const colorSpace = rawSpace && allowedColorSpaces.has(rawSpace as PhotoIccColorSpace)
      ? rawSpace as PhotoIccColorSpace
      : null;
    if (!colorSpace) throw new Error('Photo Studio supports RGB, CMYK, and grayscale ICC profiles.');
    const fileName = sanitizeName(file.name ?? 'profile.icc', 'profile.icc');
    const description = sanitizeName(
      lcms.cmsGetProfileInfoASCII(handle, cmsInfoDescription, 'en', 'US'),
      fileName,
    );
    const profile: PhotoIccProfile = {
      fileName,
      description,
      colorSpace,
      data: base64FromBytes(bytes),
      size: bytes.length,
      fingerprint: await fingerprint(bytes),
    };
    cacheProfile(profile, bytes);
    return profile;
  } finally {
    lcms.cmsCloseProfile(handle);
  }
}

export function normalizePhotoIccProfile(value: PhotoIccProfile | null | undefined): PhotoIccProfile | null {
  if (!value || typeof value !== 'object') return null;
  const size = Math.floor(Number(value.size));
  if (!Number.isFinite(size) || size < ICC_HEADER_BYTES || size > MAX_ICC_PROFILE_BYTES) return null;
  if (!allowedColorSpaces.has(value.colorSpace)) return null;
  if (typeof value.data !== 'string' || value.data.length < 4 || value.data.length > Math.ceil(MAX_ICC_PROFILE_BYTES / 3) * 4 + 8) return null;
  if (typeof value.fingerprint !== 'string' || !/^[a-f0-9-]{8,128}$/i.test(value.fingerprint)) return null;
  return {
    fileName: sanitizeName(String(value.fileName ?? ''), 'profile.icc'),
    description: sanitizeName(String(value.description ?? ''), 'ICC profile'),
    colorSpace: value.colorSpace,
    data: value.data,
    size,
    fingerprint: value.fingerprint.slice(0, 128),
  };
}

export function normalizePhotoColorManagement(value: PhotoColorManagement | undefined): PhotoColorManagement {
  const assignedProfile = normalizePhotoIccProfile(value?.assignedProfile);
  const outputProfile = normalizePhotoIccProfile(value?.outputProfile);
  const proofProfile = normalizePhotoIccProfile(value?.proofProfile);
  const renderingIntent = value && allowedIntents.has(value.renderingIntent)
    ? value.renderingIntent
    : 'relative-colorimetric';
  const proofIntent = value && allowedIntents.has(value.proofIntent)
    ? value.proofIntent
    : 'relative-colorimetric';
  const softProof = Boolean(proofProfile && value?.softProof);
  return {
    assignedProfile: assignedProfile?.colorSpace === 'RGB' ? assignedProfile : null,
    outputProfile: outputProfile?.colorSpace === 'RGB' ? outputProfile : null,
    proofProfile,
    renderingIntent,
    proofIntent,
    blackPointCompensation: value?.blackPointCompensation !== false,
    softProof,
    gamutWarning: Boolean(softProof && value?.gamutWarning),
  };
}

function intentValue(intent: PhotoRenderingIntent): number {
  if (intent === 'perceptual') return INTENT_PERCEPTUAL;
  if (intent === 'saturation') return INTENT_SATURATION;
  if (intent === 'absolute-colorimetric') return INTENT_ABSOLUTE_COLORIMETRIC;
  return INTENT_RELATIVE_COLORIMETRIC;
}

function bytesForProfile(profile: PhotoIccProfile): Uint8Array {
  const cached = decodedProfiles.get(profile.fingerprint);
  if (cached) {
    decodedProfiles.delete(profile.fingerprint);
    decodedProfiles.set(profile.fingerprint, cached);
    return cached;
  }
  const bytes = validateIccBytes(bytesFromBase64(profile.data));
  if (bytes.length !== profile.size) throw new Error('The stored ICC profile length does not match its recipe metadata.');
  cacheProfile(profile, bytes);
  return bytes;
}

function openProfile(lcms: LcmsModule, profile: PhotoIccProfile): number {
  const bytes = bytesForProfile(profile);
  const handle = lcms.cmsOpenProfileFromMem(bytes, bytes.length);
  if (!handle) throw new Error(`LittleCMS could not open ${profile.fileName}.`);
  return handle;
}

function flagsFor(blackPointCompensation: boolean): number {
  return cmsFLAGS_NOCACHE | (blackPointCompensation ? cmsFLAGS_BLACKPOINTCOMPENSATION : 0);
}

function transformPixels(
  lcms: LcmsModule,
  pixels: Uint8ClampedArray,
  transform: number,
): void {
  const pixelCount = Math.floor(pixels.length / 4);
  for (let first = 0; first < pixelCount; first += TRANSFORM_CHUNK_PIXELS) {
    const count = Math.min(TRANSFORM_CHUNK_PIXELS, pixelCount - first);
    const input = new Uint8Array(count * 3);
    for (let index = 0; index < count; index += 1) {
      const source = (first + index) * 4;
      const target = index * 3;
      input[target] = pixels[source];
      input[target + 1] = pixels[source + 1];
      input[target + 2] = pixels[source + 2];
    }
    const output = lcms.cmsDoTransform(transform, input, count);
    for (let index = 0; index < count; index += 1) {
      const source = index * 3;
      const target = (first + index) * 4;
      pixels[target] = output[source];
      pixels[target + 1] = output[source + 1];
      pixels[target + 2] = output[source + 2];
    }
  }
}

async function ordinaryTransform(
  pixels: Uint8ClampedArray,
  inputProfile: PhotoIccProfile | null,
  outputProfile: PhotoIccProfile | null,
  intent: PhotoRenderingIntent,
  blackPointCompensation: boolean,
): Promise<void> {
  const lcms = await getLcms();
  const input = inputProfile ? openProfile(lcms, inputProfile) : lcms.cmsCreate_sRGBProfile();
  const output = outputProfile ? openProfile(lcms, outputProfile) : lcms.cmsCreate_sRGBProfile();
  let transform = 0;
  try {
    transform = lcms.cmsCreateTransform(
      input,
      TYPE_RGB_8,
      output,
      TYPE_RGB_8,
      intentValue(intent),
      flagsFor(blackPointCompensation),
    );
    if (!transform) throw new Error('LittleCMS could not create the requested ICC transform.');
    transformPixels(lcms, pixels, transform);
  } finally {
    if (transform) lcms.cmsDeleteTransform(transform);
    lcms.cmsCloseProfile(input);
    lcms.cmsCloseProfile(output);
  }
}

export async function applyAssignedPhotoProfile(
  pixels: Uint8ClampedArray,
  profile: PhotoIccProfile,
  intent: PhotoRenderingIntent,
  blackPointCompensation: boolean,
): Promise<void> {
  if (profile.colorSpace !== 'RGB') throw new Error('Assigned source profiles must describe RGB samples.');
  await ordinaryTransform(pixels, profile, null, intent, blackPointCompensation);
}

export async function applyPhotoOutputProfile(
  pixels: Uint8ClampedArray,
  profile: PhotoIccProfile,
  intent: PhotoRenderingIntent,
  blackPointCompensation: boolean,
): Promise<void> {
  if (profile.colorSpace !== 'RGB') throw new Error('Output profiles must describe RGB samples.');
  await ordinaryTransform(pixels, null, profile, intent, blackPointCompensation);
}

export async function applyPhotoSoftProof(
  pixels: Uint8ClampedArray,
  profile: PhotoIccProfile,
  intent: PhotoRenderingIntent,
  proofIntent: PhotoRenderingIntent,
  blackPointCompensation: boolean,
  gamutWarning: boolean,
): Promise<number> {
  const lcms = await getLcms();
  const input = lcms.cmsCreate_sRGBProfile();
  const output = lcms.cmsCreate_sRGBProfile();
  const proof = openProfile(lcms, profile);
  let proofTransform = 0;
  let gamutTransform = 0;
  let gamutPixels = 0;
  try {
    const sharedFlags = flagsFor(blackPointCompensation) | cmsFLAGS_SOFTPROOFING;
    proofTransform = lcms.cmsCreateProofingTransform(
      input,
      TYPE_RGB_8,
      output,
      TYPE_RGB_8,
      proof,
      intentValue(intent),
      intentValue(proofIntent),
      sharedFlags,
    );
    if (!proofTransform) throw new Error('LittleCMS could not create the soft-proof transform.');
    if (gamutWarning) {
      gamutTransform = lcms.cmsCreateProofingTransform(
        input,
        TYPE_RGB_8,
        output,
        TYPE_RGB_8,
        proof,
        intentValue(intent),
        intentValue(proofIntent),
        sharedFlags | cmsFLAGS_GAMUTCHECK,
      );
      if (!gamutTransform) throw new Error('LittleCMS could not create the gamut-check transform.');
    }

    const pixelCount = Math.floor(pixels.length / 4);
    for (let first = 0; first < pixelCount; first += TRANSFORM_CHUNK_PIXELS) {
      const count = Math.min(TRANSFORM_CHUNK_PIXELS, pixelCount - first);
      const inputChunk = new Uint8Array(count * 3);
      for (let index = 0; index < count; index += 1) {
        const source = (first + index) * 4;
        const target = index * 3;
        inputChunk[target] = pixels[source];
        inputChunk[target + 1] = pixels[source + 1];
        inputChunk[target + 2] = pixels[source + 2];
      }
      const proofed = lcms.cmsDoTransform(proofTransform, inputChunk, count);
      const gamut = gamutTransform ? lcms.cmsDoTransform(gamutTransform, inputChunk, count) : null;
      for (let index = 0; index < count; index += 1) {
        const source = index * 3;
        const target = (first + index) * 4;
        const isAlarm = Boolean(gamut
          && gamut[source] === 127
          && gamut[source + 1] === 127
          && gamut[source + 2] === 127
          && (proofed[source] !== 127 || proofed[source + 1] !== 127 || proofed[source + 2] !== 127));
        if (isAlarm) {
          pixels[target] = 255;
          pixels[target + 1] = 0;
          pixels[target + 2] = 255;
          gamutPixels += 1;
        } else {
          pixels[target] = proofed[source];
          pixels[target + 1] = proofed[source + 1];
          pixels[target + 2] = proofed[source + 2];
        }
      }
    }
    return gamutPixels;
  } finally {
    if (gamutTransform) lcms.cmsDeleteTransform(gamutTransform);
    if (proofTransform) lcms.cmsDeleteTransform(proofTransform);
    lcms.cmsCloseProfile(proof);
    lcms.cmsCloseProfile(output);
    lcms.cmsCloseProfile(input);
  }
}

export function photoIccProfileBytes(profile: PhotoIccProfile): Uint8Array {
  const bytes = bytesForProfile(profile);
  return new Uint8Array(bytes);
}

export function resetPhotoColorManagementForTests(): void {
  decodedProfiles.clear();
  lcmsPromise = null;
}

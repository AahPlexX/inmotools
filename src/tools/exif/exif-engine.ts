const SENSITIVE_PATTERNS = [
  /^GPS/i, /serial/i, /owner/i, /artist/i, /author/i, /location/i, /latitude/i, /longitude/i,
  /^city$/i, /province/i, /^state/i, /country/i, /by-?line/i, /creator/i,
];

export interface MetadataTag { description?: string | number; value?: unknown }
export interface SensitiveMetadata { key: string; value: string }

function ascii(bytes: Uint8Array, offset: number, length: number): string {
  return String.fromCharCode(...bytes.subarray(offset, offset + length));
}

function readUint32Be(bytes: Uint8Array, offset: number): number {
  return (((bytes[offset] << 24) >>> 0)
    | (bytes[offset + 1] << 16)
    | (bytes[offset + 2] << 8)
    | bytes[offset + 3]) >>> 0;
}

function readUint32Le(bytes: Uint8Array, offset: number): number {
  return (bytes[offset]
    | (bytes[offset + 1] << 8)
    | (bytes[offset + 2] << 16)
    | ((bytes[offset + 3] << 24) >>> 0)) >>> 0;
}

export function isAnimatedImage(bytes: Uint8Array, mimeType: string): boolean {
  if (mimeType === 'image/png') {
    if (bytes.length < 20 || ascii(bytes, 1, 3) !== 'PNG') return false;
    let offset = 8;
    while (offset + 12 <= bytes.length) {
      const chunkLength = readUint32Be(bytes, offset);
      const chunkType = ascii(bytes, offset + 4, 4);
      if (chunkType === 'acTL') return true;
      if (chunkType === 'IDAT') return false;
      const nextOffset = offset + 12 + chunkLength;
      if (nextOffset <= offset || nextOffset > bytes.length) return false;
      offset = nextOffset;
    }
    return false;
  }

  if (mimeType === 'image/webp') {
    if (bytes.length < 20 || ascii(bytes, 0, 4) !== 'RIFF' || ascii(bytes, 8, 4) !== 'WEBP') return false;
    let offset = 12;
    while (offset + 8 <= bytes.length) {
      const chunkType = ascii(bytes, offset, 4);
      const chunkLength = readUint32Le(bytes, offset + 4);
      const dataOffset = offset + 8;
      if (chunkType === 'ANIM' || chunkType === 'ANMF') return true;
      if (chunkType === 'VP8X' && chunkLength >= 1 && dataOffset < bytes.length && (bytes[dataOffset] & 0x02) !== 0) return true;
      const nextOffset = dataOffset + chunkLength + (chunkLength & 1);
      if (nextOffset <= offset || nextOffset > bytes.length) return false;
      offset = nextOffset;
    }
  }

  return false;
}

export function listSensitiveMetadata(tags: Record<string, MetadataTag | unknown>): SensitiveMetadata[] {
  return Object.entries(tags)
    .filter(([key]) => SENSITIVE_PATTERNS.some((pattern) => pattern.test(key)))
    .map(([key, raw]) => {
      const tag = raw as MetadataTag;
      const value = tag?.description ?? tag?.value ?? raw;
      return { key, value: typeof value === 'string' ? value : JSON.stringify(value) };
    });
}

export function buildSanitizedFilename(filename: string, mimeType: string): string {
  const extension = mimeType === 'image/png' ? 'png' : mimeType === 'image/webp' ? 'webp' : 'jpg';
  const stem = filename.replace(/\.[^.]+$/, '');
  return `${stem}-sanitized.${extension}`;
}

export function buildSanitizedFilenameFromBlob(filename: string, blob: Pick<Blob, 'type'>): string {
  return buildSanitizedFilename(filename, blob.type);
}

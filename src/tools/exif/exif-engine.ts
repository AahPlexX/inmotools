const SENSITIVE_PATTERNS = [
  /^GPS/i, /serial/i, /owner/i, /artist/i, /author/i, /location/i, /latitude/i, /longitude/i,
  /^city$/i, /province/i, /^state/i, /country/i, /by-?line/i, /creator/i,
];

export interface MetadataTag { description?: string | number; value?: unknown }
export interface SensitiveMetadata { key: string; value: string }

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

/** Read-only facts about the original photo file (camera, exposure, lens, capture time, location,
 * embedded colour profile). Shown for inspection only: exports never copy them — what leaves the
 * app is decided solely by the export dialog's metadata policy. */

export interface PhotoSourceFact {
  label: string;
  value: string;
}

export interface PhotoSourceMetadata {
  camera: PhotoSourceFact[];
  capture: PhotoSourceFact[];
  location: { latitude: number; longitude: number; altitude?: number } | null;
  colorProfile: { description: string; colorSpace: string; deviceClass: string; version: string } | null;
  /** True when the file carried any metadata at all. */
  found: boolean;
}

interface TagLike { description?: unknown; value?: unknown }
type TagGroup = Record<string, TagLike | undefined> | undefined;

export interface ExpandedTagsLike {
  exif?: TagGroup;
  icc?: TagGroup;
  gps?: { Latitude?: unknown; Longitude?: unknown; Altitude?: unknown } | undefined;
  xmp?: TagGroup;
}

function text(tag: TagLike | undefined, max = 120): string | null {
  const value = typeof tag?.description === 'string' ? tag.description : typeof tag?.value === 'string' ? tag.value : null;
  if (!value) return null;
  // Metadata is untrusted file content: strip control characters and bound its length.
  const cleaned = value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  return cleaned ? cleaned.slice(0, max) : null;
}

function finite(value: unknown, min: number, max: number): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max ? value : null;
}

/** Builds display facts from ExifReader's expanded tag groups. Pure, so it is unit-testable. */
export function summarizeSourceTags(tags: ExpandedTagsLike): PhotoSourceMetadata {
  const exif = tags.exif ?? {};
  const icc = tags.icc ?? {};
  const add = (list: PhotoSourceFact[], label: string, value: string | null) => { if (value) list.push({ label, value }); };

  const camera: PhotoSourceFact[] = [];
  const make = text(exif.Make, 60);
  const model = text(exif.Model, 80);
  add(camera, 'Camera', make && model && !model.toLowerCase().startsWith(make.toLowerCase()) ? `${make} ${model}` : model ?? make);
  add(camera, 'Lens', text(exif.LensModel, 100));
  add(camera, 'Software', text(exif.Software, 80));

  const capture: PhotoSourceFact[] = [];
  add(capture, 'Taken', text(exif.DateTimeOriginal, 40) ?? text(exif.DateTime, 40));
  add(capture, 'Shutter', text(exif.ExposureTime, 20));
  add(capture, 'Aperture', text(exif.FNumber, 20));
  add(capture, 'ISO', text(exif.ISOSpeedRatings, 20));
  const focal = text(exif.FocalLength, 20);
  const focal35 = text(exif.FocalLengthIn35mmFilm, 20);
  add(capture, 'Focal length', focal && focal35 ? `${focal} (${focal35.replace(/\s*mm$/, '')} mm full-frame equivalent)` : focal ?? focal35);
  add(capture, 'Exposure compensation', text(exif.ExposureBiasValue, 20));
  add(capture, 'Flash', text(exif.Flash, 80));

  const latitude = finite(tags.gps?.Latitude, -90, 90);
  const longitude = finite(tags.gps?.Longitude, -180, 180);
  const altitude = finite(tags.gps?.Altitude, -100_000, 100_000);
  const location = latitude !== null && longitude !== null ? { latitude, longitude, ...(altitude !== null ? { altitude } : {}) } : null;

  const description = text(icc['ICC Description'], 120);
  const colorProfile = description || text(icc['Color Space'])
    ? {
      description: description ?? 'Unnamed profile',
      colorSpace: text(icc['Color Space'], 20) ?? 'unknown',
      deviceClass: text(icc['Profile/Device class'], 60) ?? 'unknown',
      version: text(icc['Profile Version'], 20) ?? 'unknown',
    }
    : null;

  return { camera, capture, location, colorProfile, found: Boolean(camera.length || capture.length || location || colorProfile) };
}

/** Reads the original file's metadata. Any parse failure means "no metadata", never an error. */
export async function readPhotoSourceMetadata(file: Blob): Promise<PhotoSourceMetadata> {
  try {
    const { default: ExifReader } = await import('exifreader');
    const tags = await ExifReader.load(await file.arrayBuffer(), { expanded: true, async: true });
    return summarizeSourceTags(tags as unknown as ExpandedTagsLike);
  } catch {
    return { camera: [], capture: [], location: null, colorProfile: null, found: false };
  }
}

// --- Duplicate source detection (capability 12) ---

/** Lowercase hex SHA-256 of a file's bytes, or null where Web Crypto is unavailable. */
export async function fingerprintPhotoSource(file: Blob): Promise<string | null> {
  if (typeof crypto === 'undefined' || !crypto.subtle) return null;
  try {
    const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
  } catch {
    return null;
  }
}

export interface DuplicateCandidate {
  id: string;
  name: string;
  updatedAt: number;
  source: { name: string; size: number; lastModified: number; sha256?: string };
}

/** The saved project holding the same photo, if any. A stored fingerprint must match exactly;
 * projects saved before fingerprinting match only on identical name, size, and modified time. */
export function findDuplicateProject<T extends DuplicateCandidate>(projects: T[], file: { name: string; size: number; lastModified: number }, sha256: string | null, excludeId?: string | null): T | null {
  const candidates = projects.filter((project) => project.id !== excludeId);
  const byHash = sha256 ? candidates.filter((project) => project.source.sha256 === sha256) : [];
  const legacy = candidates.filter((project) => !project.source.sha256
    && project.source.name === file.name && project.source.size === file.size && project.source.lastModified === file.lastModified);
  const matches = [...byHash, ...legacy].sort((a, b) => b.updatedAt - a.updatedAt);
  return matches[0] ?? null;
}

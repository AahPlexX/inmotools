import { DEFAULT_EXPORT_SETTINGS, normalizeExportSettings, type PhotoExportSettings } from './photo-export-settings';
import { normalizeRecipe } from './photo-engine';
import { TEXT_LAYER_PADDING, createImageLayer, createTextLayer } from './photo-layers';
import { stripLocationMetadata } from './photo-metadata';
import type { PhotoExportMetadata, PhotoRecipe } from './photo-types';

/** Reusable, named, locally stored settings: export presets (format/size/metadata/watermark/name
 * rule), metadata templates, and watermark presets. They live in their own small IndexedDB
 * database so adding them never migrates the project database that holds users' photos. */

export type PhotoTemplateKind = 'export' | 'metadata' | 'watermark';

export type PhotoWatermarkAnchor = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'center';

export interface PhotoMetadataTemplateData {
  metadata: PhotoExportMetadata;
  /** Location fields (city, GPS…) are kept only when the user explicitly opts in. */
  includeLocation: boolean;
}

export interface PhotoWatermarkPresetData {
  kind: 'text' | 'image';
  text: string;
  textColor: string;
  imageDataUrl: string;
  imageWidth: number;
  imageHeight: number;
  anchor: PhotoWatermarkAnchor;
  /** Watermark height as a fraction of the output frame's shorter side (0.01–0.5), so the mark
   * looks the same on a thumbnail and on a full-resolution export. */
  size: number;
  /** Gap to the nearest frame edges as a fraction of the shorter side (0–0.25). */
  margin: number;
  opacity: number;
}

interface TemplateDataByKind {
  export: PhotoExportSettings;
  metadata: PhotoMetadataTemplateData;
  watermark: PhotoWatermarkPresetData;
}

export interface PhotoTemplateRecord<K extends PhotoTemplateKind = PhotoTemplateKind> {
  schemaVersion: 1;
  id: string;
  kind: K;
  name: string;
  createdAt: number;
  updatedAt: number;
  data: TemplateDataByKind[K];
}

export const MAX_WATERMARK_IMAGE_CHARS = 2 * 1024 * 1024;
const LOCATION_FIELDS: Array<keyof PhotoExportMetadata> = ['city', 'state', 'country', 'sublocation', 'latitude', 'longitude', 'altitude'];

export const DEFAULT_WATERMARK_PRESET: PhotoWatermarkPresetData = {
  kind: 'text',
  text: '© Your name',
  textColor: '#ffffff',
  imageDataUrl: '',
  imageWidth: 0,
  imageHeight: 0,
  anchor: 'bottom-right',
  size: 0.05,
  margin: 0.03,
  opacity: 0.7,
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function text(value: unknown, max: number): string | undefined {
  return typeof value === 'string' && value.trim() ? value.slice(0, max) : undefined;
}

function number(value: unknown, min: number, max: number): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : undefined;
}

function list(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const items = value.filter((item): item is string => typeof item === 'string' && item.trim() !== '').map((item) => item.trim().slice(0, 120)).slice(0, 100);
  return items.length ? items : undefined;
}

function compact<T extends object>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined)) as T;
}

export function normalizeMetadataTemplate(value: unknown): PhotoMetadataTemplateData {
  const input = isObject(value) ? value : {};
  const raw = isObject(input.metadata) ? input.metadata : {};
  const includeLocation = input.includeLocation === true;
  const metadata: PhotoExportMetadata = compact({
    title: text(raw.title, 500),
    headline: text(raw.headline, 500),
    description: text(raw.description, 4000),
    creator: text(raw.creator, 300),
    credit: text(raw.credit, 300),
    copyright: text(raw.copyright, 500),
    usageTerms: text(raw.usageTerms, 2000),
    source: text(raw.source, 300),
    jobIdentifier: text(raw.jobIdentifier, 200),
    rating: number(raw.rating, 0, 5),
    label: text(raw.label, 100),
    keywords: list(raw.keywords),
    hierarchicalKeywords: list(raw.hierarchicalKeywords),
    city: text(raw.city, 200),
    state: text(raw.state, 200),
    country: text(raw.country, 200),
    sublocation: text(raw.sublocation, 200),
    latitude: number(raw.latitude, -90, 90),
    longitude: number(raw.longitude, -180, 180),
    altitude: number(raw.altitude, -100_000, 100_000),
    creationDate: text(raw.creationDate, 40),
    altText: text(raw.altText, 1000),
    extendedDescription: text(raw.extendedDescription, 4000),
    ppi: number(raw.ppi, 1, 2400),
  });
  return { metadata: includeLocation ? metadata : stripLocationMetadata(metadata), includeLocation };
}

/** True when a template carries any location field — shown as a warning next to its name. */
export function metadataTemplateHasLocation(data: PhotoMetadataTemplateData): boolean {
  return LOCATION_FIELDS.some((field) => data.metadata[field] !== undefined);
}

/** Template fields fill in the export form without erasing values the user already typed for
 * this photo, unless `overwrite` is set. */
export function applyMetadataTemplate(current: PhotoExportMetadata, template: PhotoMetadataTemplateData, overwrite = false): PhotoExportMetadata {
  const next: PhotoExportMetadata = { ...current };
  for (const [key, value] of Object.entries(template.metadata) as Array<[keyof PhotoExportMetadata, unknown]>) {
    const existing = next[key];
    const empty = existing === undefined || existing === '' || (Array.isArray(existing) && existing.length === 0);
    if (overwrite || empty) (next as Record<string, unknown>)[key] = Array.isArray(value) ? [...value] : value;
  }
  return next;
}

const DATA_URL = /^data:image\/(png|jpeg|webp);base64,[a-z0-9+/=]+$/i;

export function normalizeWatermarkPreset(value: unknown): PhotoWatermarkPresetData {
  const input = isObject(value) ? value : {};
  const d = DEFAULT_WATERMARK_PRESET;
  const imageDataUrl = typeof input.imageDataUrl === 'string' && input.imageDataUrl.length <= MAX_WATERMARK_IMAGE_CHARS && DATA_URL.test(input.imageDataUrl) ? input.imageDataUrl : '';
  const imageWidth = Math.round(number(input.imageWidth, 0, 16_384) ?? 0);
  const imageHeight = Math.round(number(input.imageHeight, 0, 16_384) ?? 0);
  const kind = input.kind === 'image' && imageDataUrl && imageWidth > 0 && imageHeight > 0 ? 'image' : 'text';
  return {
    kind,
    text: typeof input.text === 'string' ? input.text.slice(0, 200) : d.text,
    textColor: typeof input.textColor === 'string' && /^#[0-9a-f]{6}$/i.test(input.textColor) ? input.textColor.toLowerCase() : d.textColor,
    imageDataUrl: kind === 'image' ? imageDataUrl : '',
    imageWidth: kind === 'image' ? imageWidth : 0,
    imageHeight: kind === 'image' ? imageHeight : 0,
    anchor: (['top-left', 'top-right', 'bottom-left', 'bottom-right', 'center'] as const).includes(input.anchor as PhotoWatermarkAnchor) ? input.anchor as PhotoWatermarkAnchor : d.anchor,
    size: number(input.size, 0.01, 0.5) ?? d.size,
    margin: number(input.margin, 0, 0.25) ?? d.margin,
    opacity: number(input.opacity, 0, 1) ?? d.opacity,
  };
}

/** Width of `text` in pixels at `fontSize`, measured with the font the layer renderer uses. */
export type PhotoTextMeasure = (text: string, fontSize: number) => number;

export function measureWatermarkText(value: string, fontSize: number): number {
  const canvas = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(1, 1) : document.createElement('canvas');
  const context = canvas.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
  if (!context) return value.length * fontSize * 0.6;
  context.font = `${fontSize}px sans-serif`;
  return context.measureText(value).width;
}

/** Output-pixel box of a watermark on a `frameWidth × frameHeight` export, plus the layer
 * settings that produce it. Mirrors the renderer's text-layer box (padding and 1.4 line height). */
export function planWatermark(preset: PhotoWatermarkPresetData, frameWidth: number, frameHeight: number, measure: PhotoTextMeasure = measureWatermarkText) {
  const data = normalizeWatermarkPreset(preset);
  const shortSide = Math.max(1, Math.min(frameWidth, frameHeight));
  const targetHeight = Math.max(4, data.size * shortSide);
  let width: number; let height: number; let fontSize = 48; let scale = 1;
  if (data.kind === 'image') {
    scale = targetHeight / data.imageHeight;
    width = data.imageWidth * scale;
    height = targetHeight;
  } else {
    // The renderer pads text by a fixed number of pixels, so render the glyphs at a comfortable
    // size and shrink the whole box with the layer scale to hit the exact target height.
    fontSize = Math.max(48, Math.round(targetHeight));
    const boxWidth = Math.ceil(measure(data.text || ' ', fontSize)) + TEXT_LAYER_PADDING * 2;
    const boxHeight = Math.ceil(fontSize * 1.4) + TEXT_LAYER_PADDING;
    scale = targetHeight / boxHeight;
    width = boxWidth * scale;
    height = targetHeight;
  }
  const gap = data.margin * shortSide;
  const x = data.anchor === 'center' ? frameWidth / 2 : data.anchor.endsWith('left') ? gap + width / 2 : frameWidth - gap - width / 2;
  const y = data.anchor === 'center' ? frameHeight / 2 : data.anchor.startsWith('top') ? gap + height / 2 : frameHeight - gap - height / 2;
  return { data, width, height, fontSize, scale, x: x / frameWidth, y: y / frameHeight };
}

/** Returns a copy of `recipe` with the watermark added as the top layer, sized and placed for a
 * `frameWidth × frameHeight` output. Used at export time only, so the project's own recipe (and
 * its undo history) is never changed by stamping a watermark. */
export function recipeWithWatermark(recipe: PhotoRecipe, preset: PhotoWatermarkPresetData, frameWidth: number, frameHeight: number, measure?: PhotoTextMeasure, name = 'Watermark'): PhotoRecipe {
  const plan = planWatermark(preset, frameWidth, frameHeight, measure);
  const id = `export-watermark-${Math.random().toString(36).slice(2)}`;
  const layer = plan.data.kind === 'image'
    ? createImageLayer(id, name, plan.data.imageDataUrl, plan.data.imageWidth, plan.data.imageHeight, true)
    : { ...createTextLayer(id, name, plan.data.text || ' '), textColor: plan.data.textColor, fontSize: plan.fontSize };
  layer.transform = { ...layer.transform, x: plan.x, y: plan.y, scale: plan.scale };
  layer.opacity = plan.data.opacity;
  const base = normalizeRecipe(recipe);
  return normalizeRecipe({ ...base, layers: [...(base.layers ?? []), layer] });
}

export function normalizeTemplateData<K extends PhotoTemplateKind>(kind: K, data: unknown): TemplateDataByKind[K] {
  if (kind === 'export') return normalizeExportSettings(data) as TemplateDataByKind[K];
  if (kind === 'metadata') return normalizeMetadataTemplate(data) as TemplateDataByKind[K];
  return normalizeWatermarkPreset(data) as TemplateDataByKind[K];
}

export function normalizeTemplateRecord(value: unknown): PhotoTemplateRecord | null {
  if (!isObject(value)) return null;
  const kind = value.kind;
  if (kind !== 'export' && kind !== 'metadata' && kind !== 'watermark') return null;
  const id = typeof value.id === 'string' && value.id ? value.id.slice(0, 120) : null;
  const name = typeof value.name === 'string' && value.name.trim() ? value.name.trim().slice(0, 80) : null;
  if (!id || !name) return null;
  const createdAt = number(value.createdAt, 0, Number.MAX_SAFE_INTEGER) ?? 0;
  return {
    schemaVersion: 1,
    id,
    kind,
    name,
    createdAt,
    updatedAt: number(value.updatedAt, 0, Number.MAX_SAFE_INTEGER) ?? createdAt,
    data: normalizeTemplateData(kind, value.data),
  };
}

// --- Sharing as files ---

const FILE_KIND = 'inmotools-photo-template';

export function serializeTemplate(record: PhotoTemplateRecord): string {
  return JSON.stringify({ kind: FILE_KIND, version: 1, template: { kind: record.kind, name: record.name, data: record.data } }, null, 2);
}

export function parseTemplateFile(textValue: string): { kind: PhotoTemplateKind; name: string; data: TemplateDataByKind[PhotoTemplateKind] } {
  let parsed: unknown;
  try { parsed = JSON.parse(textValue); } catch { throw new Error('This file is not valid JSON.'); }
  if (!isObject(parsed) || parsed.kind !== FILE_KIND || parsed.version !== 1 || !isObject(parsed.template)) throw new Error('This is not a Photo Studio template file.');
  const record = normalizeTemplateRecord({ ...parsed.template, id: 'imported', createdAt: 0 });
  if (!record) throw new Error('The template file is missing its type or name.');
  return { kind: record.kind, name: record.name, data: record.data };
}

export function suggestTemplateFilename(record: Pick<PhotoTemplateRecord, 'kind' | 'name'>): string {
  const stem = record.name.replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-').toLowerCase().slice(0, 60) || 'template';
  return `${stem}.${record.kind}-template.json`;
}

// --- Storage ---

export interface PhotoTemplateAdapter {
  list(): Promise<unknown[]>;
  put(record: PhotoTemplateRecord): Promise<void>;
  remove(id: string): Promise<void>;
}

export interface PhotoTemplateStore {
  /** False when the browser refused IndexedDB and templates last only for this visit. */
  readonly durable: boolean;
  list<K extends PhotoTemplateKind>(kind: K): Promise<Array<PhotoTemplateRecord<K>>>;
  save<K extends PhotoTemplateKind>(input: { id?: string; kind: K; name: string; data: TemplateDataByKind[K] }): Promise<PhotoTemplateRecord<K>>;
  remove(id: string): Promise<void>;
}

export function createMemoryTemplateAdapter(): PhotoTemplateAdapter {
  const records = new Map<string, PhotoTemplateRecord>();
  return {
    async list() { return [...records.values()].map((record) => structuredClone(record)); },
    async put(record) { records.set(record.id, structuredClone(record)); },
    async remove(id) { records.delete(id); },
  };
}

export function createPhotoTemplateStore(adapter: PhotoTemplateAdapter, durable: boolean, now: () => number = Date.now, newId: () => string = () => crypto.randomUUID()): PhotoTemplateStore {
  return {
    durable,
    async list<K extends PhotoTemplateKind>(kind: K) {
      const records = (await adapter.list()).map(normalizeTemplateRecord).filter((record): record is PhotoTemplateRecord => record !== null && record.kind === kind);
      return records.sort((a, b) => a.name.localeCompare(b.name) || a.createdAt - b.createdAt) as Array<PhotoTemplateRecord<K>>;
    },
    async save<K extends PhotoTemplateKind>(input: { id?: string; kind: K; name: string; data: TemplateDataByKind[K] }) {
      const name = input.name.trim().slice(0, 80);
      if (!name) throw new Error('Give the template a name first.');
      const existing = input.id ? (await adapter.list()).map(normalizeTemplateRecord).find((record) => record?.id === input.id) : undefined;
      const time = now();
      const record: PhotoTemplateRecord<K> = {
        schemaVersion: 1,
        id: existing?.id ?? input.id ?? newId(),
        kind: input.kind,
        name,
        createdAt: existing?.createdAt ?? time,
        updatedAt: time,
        data: normalizeTemplateData(input.kind, input.data),
      };
      await adapter.put(record);
      return record;
    },
    async remove(id: string) {
      await adapter.remove(id);
    },
  };
}

const TEMPLATE_DB = 'inmotools.photo-studio.templates';
const TEMPLATE_STORE = 'templates';

function openTemplateDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(TEMPLATE_DB, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(TEMPLATE_STORE)) request.result.createObjectStore(TEMPLATE_STORE, { keyPath: 'id' });
    };
    request.onsuccess = () => {
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
    request.onerror = () => reject(request.error ?? new Error('Template storage could not open.'));
    request.onblocked = () => reject(new Error('Template storage is blocked by another open tab.'));
  });
}

async function transact<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  const db = await openTemplateDatabase();
  try {
    return await new Promise<T | undefined>((resolve, reject) => {
      const transaction = db.transaction(TEMPLATE_STORE, mode);
      const request = action(transaction.objectStore(TEMPLATE_STORE));
      transaction.oncomplete = () => resolve(request ? request.result : undefined);
      transaction.onerror = () => reject(transaction.error ?? new Error('Template storage failed.'));
      transaction.onabort = () => reject(transaction.error ?? new Error('Template storage was interrupted.'));
    });
  } finally {
    db.close();
  }
}

export function createIndexedDbTemplateAdapter(): PhotoTemplateAdapter {
  return {
    async list() { return (await transact<unknown[]>('readonly', (store) => store.getAll())) ?? []; },
    async put(record) { await transact('readwrite', (store) => { store.put(record); }); },
    async remove(id) { await transact('readwrite', (store) => { store.delete(id); }); },
  };
}

/** Durable IndexedDB store when available; otherwise a session-only store the UI labels as such. */
export async function createBrowserTemplateStore(): Promise<PhotoTemplateStore> {
  if (typeof indexedDB !== 'undefined') {
    try {
      const adapter = createIndexedDbTemplateAdapter();
      await adapter.list();
      return createPhotoTemplateStore(adapter, true);
    } catch {
      // Private browsing modes can refuse IndexedDB; fall through to session storage in memory.
    }
  }
  return createPhotoTemplateStore(createMemoryTemplateAdapter(), false);
}

export { DEFAULT_EXPORT_SETTINGS };

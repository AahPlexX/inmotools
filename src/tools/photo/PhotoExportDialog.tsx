import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { downloadBlob } from '../../lib/download';
import PhotoContactSheetPanel from './PhotoContactSheetPanel';
import PhotoQueueList from './PhotoQueueList';
import { PHOTO_FILE_ACCEPT, isPhotoImportFile, preparePhotoRaster, releasePhotoRaster } from './photo-import';
import { photoMetadataForPolicy, type PhotoMetadataPolicy, type PhotoOutputSharpening } from './photo-export';
import { planPhotoExportSize, type PhotoResizeMode } from './photo-export-dimensions';
import {
  buildExportManifest,
  createDownloadSink,
  createFolderSink,
  createQueueItems,
  fileSystemAccess,
  isPickerCancel,
  manifestToCsv,
  moveQueueItem,
  retryQueueItems,
  runPhotoQueue,
  type PhotoManifestEntry,
  type PhotoOutputSink,
  type PhotoQueueItem,
} from './photo-export-queue';
import { DEFAULT_RECIPE } from './photo-engine';
import { runPhotoExport } from './photo-export-run';
import {
  DEFAULT_EXPORT_SETTINGS,
  FILENAME_TOKENS,
  PHOTO_FORMAT_FACTS,
  PHOTO_RESIZE_PRESETS,
  normalizeExportSettings,
  renderFilenamePattern,
  type PhotoExportSettings,
} from './photo-export-settings';
import { safePhotoFilename, safeRequestedPhotoFilename, serializePhotoXmp } from './photo-metadata';
import { PHOTO_PAPER_SIZES, fitPrint, fromInches, paperById, pixelsForPrint, printQuality, printSizeAt, toInches, type PrintUnit } from './photo-print';
import { PHOTO_RECIPE_GROUPS, DEFAULT_COPY_GROUPS, applyRecipeGroups, type PhotoRecipeGroup } from './photo-recipe-groups';
import { PHOTO_RESAMPLING_KERNELS, type PhotoResamplingKernel } from './photo-resample';
import {
  DEFAULT_WATERMARK_PRESET,
  MAX_WATERMARK_IMAGE_CHARS,
  applyMetadataTemplate,
  createBrowserTemplateStore,
  metadataTemplateHasLocation,
  normalizeMetadataTemplate,
  parseTemplateFile,
  serializeTemplate,
  suggestTemplateFilename,
  type PhotoTemplateKind,
  type PhotoTemplateRecord,
  type PhotoTemplateStore,
  type PhotoWatermarkAnchor,
  type PhotoWatermarkPresetData,
} from './photo-templates';
import type { PhotoCapabilities, PhotoExportMetadata, PhotoOutputMime, PhotoRecipe } from './photo-types';
import './photo-export-dialog.css';

interface ExportSourcePhoto {
  file: File;
  name: string;
  width: number;
  height: number;
}

interface PhotoExportDialogProps {
  open: boolean;
  source: ExportSourcePhoto | null;
  recipe: PhotoRecipe;
  capabilities: PhotoCapabilities | null;
  onClose: () => void;
  onStatus: (message: string) => void;
}

interface BatchPayload { file: File }
interface MultiPayload { presetId: string }

const TIFF_ACCEPT = { 'image/tiff': ['.tif', '.tiff'] };
const SAVE_TYPES: Record<PhotoOutputMime, Record<string, string[]>> = {
  'image/jpeg': { 'image/jpeg': ['.jpg', '.jpeg'] },
  'image/png': { 'image/png': ['.png'] },
  'image/webp': { 'image/webp': ['.webp'] },
  'image/tiff': TIFF_ACCEPT,
  'image/avif': { 'image/avif': ['.avif'] },
};

function readNumber(value: string, fallback: number): number {
  if (value.trim() === '') return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function sidecarFilename(requestedName: string, sourceName: string, mime: PhotoOutputMime): string {
  return safeRequestedPhotoFilename(requestedName, sourceName, mime).replace(/\.[^.]+$/, '.xmp');
}

function resizeValueLabel(mode: PhotoResizeMode): string {
  if (mode === 'percent') return 'Percent';
  if (mode === 'width') return 'Width in pixels';
  if (mode === 'height') return 'Height in pixels';
  if (mode === 'long-edge') return 'Long edge in pixels';
  return 'Short edge in pixels';
}

function formatInches(inches: number, unit: PrintUnit): string {
  const value = fromInches(inches, unit);
  return `${value >= 10 ? value.toFixed(1) : value.toFixed(2)} ${unit}`;
}

/** Reads a logo for a watermark preset, shrinking it (never enlarging) until its data URL fits
 * the stored-preset bound so a large source image can still be used as a mark. */
async function readWatermarkImage(file: File): Promise<{ dataUrl: string; width: number; height: number }> {
  const bitmap = await createImageBitmap(file);
  try {
    for (const maxEdge of [Infinity, 2048, 1024, 512, 256]) {
      const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
      const width = Math.max(1, Math.round(bitmap.width * scale));
      const height = Math.max(1, Math.round(bitmap.height * scale));
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('2D canvas rendering is unavailable in this browser.');
      context.drawImage(bitmap, 0, 0, width, height);
      const dataUrl = canvas.toDataURL('image/png');
      if (dataUrl.length <= MAX_WATERMARK_IMAGE_CHARS) return { dataUrl, width, height };
    }
    throw new Error('This image is too detailed to store as a watermark, even when reduced.');
  } finally {
    bitmap.close();
  }
}

export default function PhotoExportDialog({
  open,
  source,
  recipe,
  capabilities,
  onClose,
  onStatus,
}: PhotoExportDialogProps) {
  const [settings, setSettings] = useState<PhotoExportSettings>(DEFAULT_EXPORT_SETTINGS);
  const [metadata, setMetadata] = useState<PhotoExportMetadata>({ ppi: 300 });
  const [requestedName, setRequestedName] = useState('photo-edited.jpg');
  const [exportBusy, setExportBusy] = useState(false);

  const [templateStore, setTemplateStore] = useState<PhotoTemplateStore | null>(null);
  const [exportPresets, setExportPresets] = useState<Array<PhotoTemplateRecord<'export'>>>([]);
  const [metadataTemplates, setMetadataTemplates] = useState<Array<PhotoTemplateRecord<'metadata'>>>([]);
  const [watermarkPresets, setWatermarkPresets] = useState<Array<PhotoTemplateRecord<'watermark'>>>([]);
  const [activePresetId, setActivePresetId] = useState('');
  const [presetName, setPresetName] = useState('');
  const [metadataTemplateName, setMetadataTemplateName] = useState('');
  const [includeLocationInTemplate, setIncludeLocationInTemplate] = useState(false);
  const [watermarkDraft, setWatermarkDraft] = useState<PhotoWatermarkPresetData>(DEFAULT_WATERMARK_PRESET);
  const [watermarkName, setWatermarkName] = useState('');
  const [editingWatermarkId, setEditingWatermarkId] = useState<string | null>(null);

  const [batchItems, setBatchItems] = useState<Array<PhotoQueueItem<BatchPayload>>>([]);
  const [batchBusy, setBatchBusy] = useState(false);
  const [batchGroups, setBatchGroups] = useState<'all' | PhotoRecipeGroup[]>('all');
  const [multiSelection, setMultiSelection] = useState<string[]>([]);
  const [multiItems, setMultiItems] = useState<Array<PhotoQueueItem<MultiPayload>>>([]);
  const [multiBusy, setMultiBusy] = useState(false);
  const [manifest, setManifest] = useState<{ entries: PhotoManifestEntry[]; destination: string; settings: Record<string, unknown> } | null>(null);

  const [printPaperId, setPrintPaperId] = useState('A4');
  const [printUnit, setPrintUnit] = useState<PrintUnit>('in');
  const [customPrintWidth, setCustomPrintWidth] = useState('');
  const [customPrintHeight, setCustomPrintHeight] = useState('');
  const [targetPpi, setTargetPpi] = useState(300);

  const revisionRef = useRef(0);
  const cancelledRef = useRef(new Set<string>());
  const dialogRef = useRef<HTMLElement | null>(null);
  const templateInputRef = useRef<HTMLInputElement | null>(null);
  const watermarkImageRef = useRef<HTMLInputElement | null>(null);
  const fsa = fileSystemAccess();
  const canSaveFile = typeof fsa.showSaveFilePicker === 'function';
  const canPickFolder = typeof fsa.showDirectoryPicker === 'function';

  const patchSettings = useCallback((patch: Partial<PhotoExportSettings>) => {
    setSettings((current) => normalizeExportSettings({ ...current, ...patch }));
    setActivePresetId('');
  }, []);

  const refreshTemplates = useCallback(async (store: PhotoTemplateStore | null = templateStore) => {
    if (!store) return;
    const [exportList, metadataList, watermarkList] = await Promise.all([store.list('export'), store.list('metadata'), store.list('watermark')]);
    setExportPresets(exportList);
    setMetadataTemplates(metadataList);
    setWatermarkPresets(watermarkList);
  }, [templateStore]);

  useEffect(() => {
    let active = true;
    void createBrowserTemplateStore().then(async (store) => {
      if (!active) return;
      setTemplateStore(store);
      const [exportList, metadataList, watermarkList] = await Promise.all([store.list('export'), store.list('metadata'), store.list('watermark')]);
      if (!active) return;
      setExportPresets(exportList);
      setMetadataTemplates(metadataList);
      setWatermarkPresets(watermarkList);
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!source) return;
    // Re-run only when the photo changes, using whatever format is current at that moment.
    setRequestedName(safePhotoFilename(source.name, settings.outputMime));
    setMetadata({ ppi: 300 });
    setBatchItems([]);
    setMultiItems([]);
    setManifest(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source?.file]);

  // Keyboard users land inside the dialog and can dismiss it with Escape.
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    dialogRef.current?.querySelector<HTMLElement>('.photo-export-presets select')?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !exportBusy && !batchBusy && !multiBusy) {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      previous?.focus?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const encoderSupport: Record<PhotoOutputMime, boolean> = useMemo(() => ({
    'image/jpeg': capabilities?.jpeg ?? true,
    'image/png': capabilities?.png ?? true,
    'image/webp': capabilities?.webp ?? true,
    'image/tiff': capabilities?.tiff ?? true,
    // AVIF output cannot carry the ICC profile a color-managed export requires.
    'image/avif': (capabilities?.avif ?? true) && !recipe.colorManagement?.outputProfile,
  }), [capabilities, recipe.colorManagement?.outputProfile]);

  const sizePlan = useMemo(() => {
    if (!source) return null;
    return planPhotoExportSize(
      source.width,
      source.height,
      recipe,
      settings.resizeMode,
      settings.resizeValue,
      capabilities?.maxCanvasEdge ?? 4096,
      capabilities?.maxCanvasArea ?? 4096 * 4096,
      settings.allowEnlarge,
    );
  }, [capabilities?.maxCanvasArea, capabilities?.maxCanvasEdge, recipe, settings.resizeMode, settings.resizeValue, settings.allowEnlarge, source]);

  const singleSizeUnsafe = sizePlan?.requiresSafetyScaling ?? false;
  const formatFacts = PHOTO_FORMAT_FACTS[settings.outputMime];
  const templates = { metadata: metadataTemplates, watermark: watermarkPresets };
  const selectedMetadataTemplate = metadataTemplates.find((record) => record.id === settings.metadataTemplateId);

  function changeMime(nextMime: PhotoOutputMime) {
    setRequestedName((current) => safeRequestedPhotoFilename(current, source?.name ?? 'photo', nextMime));
    patchSettings({ outputMime: nextMime });
  }

  function useVerifiedSafeSize() {
    if (!sizePlan) return;
    const safeLongEdge = Math.max(sizePlan.safe.width, sizePlan.safe.height);
    patchSettings({ resizeMode: 'long-edge', resizeValue: safeLongEdge });
    onStatus(`Export size changed to the verified-safe ${sizePlan.safe.width} × ${sizePlan.safe.height} plan.`);
  }

  // --- Export presets ---

  function applyPreset(id: string) {
    const preset = exportPresets.find((record) => record.id === id);
    if (!preset) { setActivePresetId(''); return; }
    setSettings(normalizeExportSettings(preset.data));
    setRequestedName((current) => safeRequestedPhotoFilename(current, source?.name ?? 'photo', preset.data.outputMime));
    setActivePresetId(id);
    setPresetName(preset.name);
    onStatus(`Export preset “${preset.name}” applied.`);
  }

  async function savePreset(update: boolean) {
    if (!templateStore) return;
    try {
      const saved = await templateStore.save({ id: update ? activePresetId || undefined : undefined, kind: 'export', name: presetName, data: settings });
      await refreshTemplates();
      setActivePresetId(saved.id);
      onStatus(`Export preset “${saved.name}” ${update ? 'updated' : 'saved'}${templateStore.durable ? '' : ' for this visit only (this browser is not keeping local data)'}.`);
    } catch (error) {
      onStatus(error instanceof Error ? error.message : 'The export preset could not be saved.');
    }
  }

  async function removeTemplate(kind: PhotoTemplateKind, record: PhotoTemplateRecord) {
    if (!templateStore) return;
    await templateStore.remove(record.id);
    await refreshTemplates();
    if (kind === 'export' && activePresetId === record.id) { setActivePresetId(''); setPresetName(''); }
    if (kind === 'metadata' && settings.metadataTemplateId === record.id) patchSettings({ metadataTemplateId: null });
    if (kind === 'watermark' && settings.watermarkPresetId === record.id) patchSettings({ watermarkPresetId: null });
    if (kind === 'watermark' && editingWatermarkId === record.id) { setEditingWatermarkId(null); setWatermarkName(''); }
    setMultiSelection((current) => current.filter((id) => id !== record.id));
    onStatus(`“${record.name}” deleted.`);
  }

  function downloadTemplate(record: PhotoTemplateRecord) {
    downloadBlob(new Blob([serializeTemplate(record)], { type: 'application/json' }), suggestTemplateFilename(record));
    onStatus(`“${record.name}” saved as a file you can import in another browser.`);
  }

  async function importTemplate(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !templateStore) return;
    try {
      if (file.size > 4 * 1024 * 1024) throw new Error('Template files must be 4 MB or smaller.');
      const parsed = parseTemplateFile(await file.text());
      const saved = await templateStore.save({ kind: parsed.kind, name: parsed.name, data: parsed.data } as Parameters<PhotoTemplateStore['save']>[0]);
      await refreshTemplates();
      const kindLabel = saved.kind === 'export' ? 'export preset' : saved.kind === 'metadata' ? 'metadata template' : 'watermark preset';
      onStatus(`Imported the ${kindLabel} “${saved.name}”.`);
    } catch (error) {
      onStatus(`Template import failed: ${error instanceof Error ? error.message : 'unreadable file'}`);
    }
  }

  // --- Metadata templates ---

  function applyTemplateToForm(id: string) {
    const template = metadataTemplates.find((record) => record.id === id);
    if (!template) return;
    setMetadata((current) => applyMetadataTemplate(current, template.data, true));
    if (settings.metadataPolicy === 'strip') patchSettings({ metadataPolicy: metadataTemplateHasLocation(template.data) ? 'custom' : 'rights' });
    onStatus(`Metadata template “${template.name}” copied into the fields below.`);
  }

  async function saveMetadataTemplate() {
    if (!templateStore) return;
    try {
      const data = normalizeMetadataTemplate({ metadata, includeLocation: includeLocationInTemplate });
      const saved = await templateStore.save({ kind: 'metadata', name: metadataTemplateName, data });
      await refreshTemplates();
      setMetadataTemplateName('');
      onStatus(`Metadata template “${saved.name}” saved${data.includeLocation ? ' with location fields' : ' without location fields'}.`);
    } catch (error) {
      onStatus(error instanceof Error ? error.message : 'The metadata template could not be saved.');
    }
  }

  // --- Watermark presets ---

  async function chooseWatermarkImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      const image = await readWatermarkImage(file);
      setWatermarkDraft((current) => ({ ...current, kind: 'image', imageDataUrl: image.dataUrl, imageWidth: image.width, imageHeight: image.height }));
      if (!watermarkName) setWatermarkName(file.name.replace(/\.[^.]+$/, ''));
      onStatus(`${file.name} ready as a watermark image.`);
    } catch (error) {
      onStatus(`Could not use ${file.name}: ${error instanceof Error ? error.message : 'unreadable image'}`);
    }
  }

  async function saveWatermarkPreset() {
    if (!templateStore) return;
    try {
      const saved = await templateStore.save({ id: editingWatermarkId ?? undefined, kind: 'watermark', name: watermarkName, data: watermarkDraft });
      await refreshTemplates();
      setEditingWatermarkId(saved.id);
      onStatus(`Watermark preset “${saved.name}” saved. Pick it under Watermark to stamp exports.`);
    } catch (error) {
      onStatus(error instanceof Error ? error.message : 'The watermark preset could not be saved.');
    }
  }

  // --- Single export ---

  function exportSettingsSummary(): Record<string, unknown> {
    return { ...settings, metadataTemplate: selectedMetadataTemplate?.name ?? null, watermark: watermarkPresets.find((record) => record.id === settings.watermarkPresetId)?.name ?? null };
  }

  async function renderSingle() {
    if (!source) throw new Error('Open a photo first.');
    return runPhotoExport({
      file: source.file,
      sourceName: source.name,
      sourceWidth: source.width,
      sourceHeight: source.height,
      recipe,
      settings,
      metadata,
      templates,
      filename: requestedName,
      index: 1,
      total: 1,
      presetName: exportPresets.find((record) => record.id === activePresetId)?.name,
      revision: ++revisionRef.current,
    });
  }

  function singleMessage(result: Awaited<ReturnType<typeof renderSingle>>, destination: string) {
    const safety = result.scaledForSafety ? ` Device limits required a safe ${result.width} × ${result.height} render.` : '';
    const metadataMessage = settings.metadataPolicy === 'strip'
      ? ' Metadata stripped.'
      : result.metadataEmbedded
        ? ' Reviewed XMP embedded in the exported image.'
        : ` Pixel export succeeded, but XMP embedding failed${result.metadataError ? `: ${result.metadataError}` : ''}. Use the XMP sidecar if metadata must travel separately.`;
    const profileMessage = result.colorProfileEmbedded && recipe.colorManagement?.outputProfile
      ? ` Converted to and embedded ${recipe.colorManagement.outputProfile.description}.`
      : ' Exported as standard browser sRGB.';
    return `Photo exported locally as ${result.width} × ${result.height}${destination}.${safety}${profileMessage}${metadataMessage}`;
  }

  async function exportSinglePhoto() {
    if (!source || exportBusy) return;
    if (singleSizeUnsafe && sizePlan) {
      onStatus(`Requested ${sizePlan.requested.width} × ${sizePlan.requested.height} output exceeds the verified local canvas limit. Choose the offered safe size before exporting.`);
      return;
    }
    setExportBusy(true);
    onStatus('Rendering full export locally…');
    try {
      const result = await renderSingle();
      downloadBlob(result.blob, result.filename);
      onStatus(singleMessage(result, ''));
    } catch (error) {
      onStatus(`Export failed: ${error instanceof Error ? error.message : 'unknown encoding error'}`);
    } finally {
      setExportBusy(false);
    }
  }

  async function saveSingleToFile() {
    if (!source || exportBusy || !fsa.showSaveFilePicker || singleSizeUnsafe) return;
    const suggestedName = safeRequestedPhotoFilename(requestedName, source.name, settings.outputMime);
    let handle: Awaited<ReturnType<NonNullable<typeof fsa.showSaveFilePicker>>>;
    try {
      // Opened first, directly from the click: the picker requires fresh user activation.
      handle = await fsa.showSaveFilePicker({ suggestedName, id: 'photo-studio-export', types: [{ description: `${formatFacts.label} image`, accept: SAVE_TYPES[settings.outputMime] }] });
    } catch (error) {
      if (!isPickerCancel(error)) onStatus(`Could not open the save dialog: ${error instanceof Error ? error.message : 'unknown error'}`);
      return;
    }
    setExportBusy(true);
    onStatus('Rendering full export locally…');
    try {
      const result = await renderSingle();
      const writable = await handle.createWritable();
      try {
        await writable.write(result.blob);
        await writable.close();
      } catch (error) {
        await writable.abort().catch(() => undefined);
        throw error;
      }
      onStatus(singleMessage(result, ` to ${handle.name}`));
    } catch (error) {
      onStatus(`Export failed: ${error instanceof Error ? error.message : 'unknown encoding error'}`);
    } finally {
      setExportBusy(false);
    }
  }

  function downloadXmp() {
    if (!source || settings.metadataPolicy === 'strip') return;
    try {
      const withTemplate = selectedMetadataTemplate ? applyMetadataTemplate(metadata, selectedMetadataTemplate.data) : metadata;
      const reviewed = photoMetadataForPolicy(withTemplate, settings.metadataPolicy);
      const xmp = serializePhotoXmp(reviewed);
      downloadBlob(new Blob([xmp], { type: 'application/rdf+xml' }), sidecarFilename(requestedName, source.name, settings.outputMime));
      onStatus('XMP sidecar created from the reviewed export metadata.');
    } catch (error) {
      onStatus(`XMP sidecar creation failed: ${error instanceof Error ? error.message : 'unknown error'}`);
    }
  }

  // --- Output destinations ---

  /** Asks for a folder when requested (must run first in a click handler), else uses downloads. */
  async function chooseSink(toFolder: boolean): Promise<PhotoOutputSink | null> {
    if (!toFolder || !fsa.showDirectoryPicker) return createDownloadSink();
    try {
      return createFolderSink(await fsa.showDirectoryPicker({ mode: 'readwrite', id: 'photo-studio-export-folder' }));
    } catch (error) {
      if (!isPickerCancel(error)) onStatus(`Could not open that folder: ${error instanceof Error ? error.message : 'unknown error'}`);
      return null;
    }
  }

  function downloadManifest(kind: 'json' | 'csv') {
    if (!manifest) return;
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    if (kind === 'json') {
      downloadBlob(new Blob([JSON.stringify(buildExportManifest(manifest.entries, { destination: manifest.destination, settings: manifest.settings }), null, 2)], { type: 'application/json' }), `photo-export-manifest-${stamp}.json`);
    } else {
      downloadBlob(new Blob([manifestToCsv(manifest.entries)], { type: 'text/csv' }), `photo-export-manifest-${stamp}.csv`);
    }
  }

  // --- Batch export ---

  function chooseBatch(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []).filter(isPhotoImportFile);
    event.target.value = '';
    setBatchItems((current) => [...current.filter((item) => item.status === 'queued'), ...createQueueItems(files.map((file) => ({ label: file.name, payload: { file } })), 'batch')]);
    setManifest(null);
    onStatus(files.length ? `${files.length} batch photo${files.length === 1 ? '' : 's'} queued locally.` : 'No browser-decodable batch photos selected.');
  }

  const queuedBatch = batchItems.filter((item) => item.status === 'queued');

  async function exportBatch(toFolder: boolean) {
    if (!queuedBatch.length || batchBusy) return;
    const sink = await chooseSink(toFolder);
    if (!sink) return;
    setBatchBusy(true);
    cancelledRef.current.clear();
    onStatus(`Exporting ${queuedBatch.length} photo${queuedBatch.length === 1 ? '' : 's'} sequentially…`);
    const total = queuedBatch.length;
    try {
      const { items, summary } = await runPhotoQueue(batchItems, async (item, position) => {
        try {
          const raster = await preparePhotoRaster(item.payload.file, recipe.raw);
          const bitmap = await createImageBitmap(raster.blob, { imageOrientation: 'from-image' });
          const width = bitmap.width;
          const height = bitmap.height;
          bitmap.close();
          // Sync: either every current edit, or only the chosen groups laid over a neutral recipe.
          const itemRecipe = batchGroups === 'all' ? recipe : applyRecipeGroups(DEFAULT_RECIPE, recipe, batchGroups);
          const result = await runPhotoExport({
            file: item.payload.file,
            sourceName: item.payload.file.name,
            sourceWidth: width,
            sourceHeight: height,
            recipe: itemRecipe,
            settings,
            metadata,
            templates,
            index: position,
            total,
            presetName: exportPresets.find((record) => record.id === activePresetId)?.name,
            revision: ++revisionRef.current,
          });
          return { blob: result.blob, filename: result.filename, width: result.width, height: result.height, details: result.details };
        } finally {
          releasePhotoRaster(item.payload.file);
        }
      }, { sink, onChange: setBatchItems, isCancelled: (id) => cancelledRef.current.has(id) });
      setManifest({
        entries: items.map((item) => ({ source: item.label, output: item.outputName ?? null, status: item.status, width: item.width, height: item.height, bytes: item.bytes, error: item.error })),
        destination: sink.label,
        settings: { ...exportSettingsSummary(), edits: batchGroups === 'all' ? 'all' : batchGroups },
      });
      onStatus(`Batch export finished · ${summary.done} completed · ${summary.failed} failed${summary.cancelled ? ` · ${summary.cancelled} cancelled` : ''}. Saved to ${sink.label}.`);
    } catch (error) {
      onStatus(`Batch export stopped unexpectedly: ${error instanceof Error ? error.message : 'unknown batch error'}`);
    } finally {
      setBatchBusy(false);
    }
  }

  // --- Multi-output ---

  async function exportMultiple(toFolder: boolean) {
    if (!source || multiBusy || !multiSelection.length) return;
    const sink = await chooseSink(toFolder);
    if (!sink) return;
    const items = createQueueItems(multiSelection.map((presetId) => ({ label: exportPresets.find((record) => record.id === presetId)?.name ?? 'Preset', payload: { presetId } })), 'multi');
    setMultiItems(items);
    setMultiBusy(true);
    cancelledRef.current.clear();
    try {
      const { items: finished, summary } = await runPhotoQueue(items, async (item, position) => {
        const preset = exportPresets.find((record) => record.id === item.payload.presetId);
        if (!preset) throw new Error('This preset was deleted.');
        const result = await runPhotoExport({
          file: source.file,
          sourceName: source.name,
          sourceWidth: source.width,
          sourceHeight: source.height,
          recipe,
          settings: preset.data,
          metadata,
          templates,
          index: position,
          total: items.length,
          presetName: preset.name,
          revision: ++revisionRef.current,
        });
        return { blob: result.blob, filename: result.filename, width: result.width, height: result.height, details: result.details };
      }, { sink, onChange: setMultiItems, isCancelled: (id) => cancelledRef.current.has(id) });
      setManifest({
        entries: finished.map((item) => ({ source: `${source.name} → ${item.label}`, output: item.outputName ?? null, status: item.status, width: item.width, height: item.height, bytes: item.bytes, error: item.error })),
        destination: sink.label,
        settings: { presets: finished.map((item) => item.label) },
      });
      onStatus(`${summary.done} version${summary.done === 1 ? '' : 's'} exported to ${sink.label}${summary.failed ? ` · ${summary.failed} failed` : ''}${summary.cancelled ? ` · ${summary.cancelled} cancelled` : ''}.`);
    } catch (error) {
      onStatus(`Multi-version export stopped unexpectedly: ${error instanceof Error ? error.message : 'unknown error'}`);
    } finally {
      setMultiBusy(false);
    }
  }

  // --- Print planner ---

  const plannedWidth = sizePlan?.requested.width ?? 0;
  const plannedHeight = sizePlan?.requested.height ?? 0;
  const customWidthIn = toInches(readNumber(customPrintWidth, 0), printUnit);
  const customHeightIn = toInches(readNumber(customPrintHeight, 0), printUnit);
  const printArea = printPaperId === 'custom'
    ? (customWidthIn > 0 && customHeightIn > 0 ? { widthIn: customWidthIn, heightIn: customHeightIn } : null)
    : (() => { const paper = paperById(printPaperId); return { widthIn: paper.width / 72, heightIn: paper.height / 72 }; })();
  const printFit = plannedWidth && plannedHeight && printArea ? fitPrint(plannedWidth, plannedHeight, printArea.widthIn, printArea.heightIn) : null;
  const printQualityInfo = printFit ? printQuality(printFit.ppi) : null;
  const sizeAtTarget = plannedWidth && plannedHeight ? printSizeAt(plannedWidth, plannedHeight, Math.max(1, targetPpi)) : null;

  function sizeExportForPrint() {
    if (!printFit) return;
    const pixels = pixelsForPrint(printFit.widthIn, printFit.heightIn, Math.max(1, targetPpi));
    patchSettings({ resizeMode: 'long-edge', resizeValue: Math.max(pixels.width, pixels.height) });
    setMetadata((current) => ({ ...current, ppi: Math.max(1, targetPpi) }));
    onStatus(`Export sized to ${pixels.width} × ${pixels.height} for a ${formatInches(printFit.widthIn, printUnit)} × ${formatInches(printFit.heightIn, printUnit)} print at ${targetPpi} ppi.`);
  }

  if (!open || !source) return null;

  const busyAny = exportBusy || batchBusy || multiBusy;
  const patternPreview = renderFilenamePattern(settings.filenamePattern, settings.outputMime, {
    sourceName: queuedBatch[0]?.label ?? source.name,
    index: 1,
    total: Math.max(1, queuedBatch.length),
    presetName: exportPresets.find((record) => record.id === activePresetId)?.name,
    width: plannedWidth || undefined,
    height: plannedHeight || undefined,
  });

  return (
    <div className="photo-dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !busyAny) onClose(); }}>
      <section ref={dialogRef} className="photo-dialog" role="dialog" aria-modal="true" aria-labelledby="photo-export-title">
        <header className="photo-dialog-header">
          <div>
            <h2 id="photo-export-title">Export photo</h2>
            <p>Render a new copy from the current recipe. Reviewed metadata is embedded when the selected image container supports it, with XMP sidecar export available independently.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close export dialog">Close</button>
        </header>

        <div className="photo-export-presets" data-testid="photo-export-presets">
          <label>Export preset
            <select aria-label="Export preset" value={activePresetId} onChange={(event) => applyPreset(event.target.value)}>
              <option value="">Current settings (unsaved)</option>
              {exportPresets.map((record) => <option key={record.id} value={record.id}>{record.name}</option>)}
            </select>
          </label>
          <label>Preset name
            <input aria-label="Export preset name" value={presetName} maxLength={80} placeholder="Web · 2048 px" onChange={(event) => setPresetName(event.target.value)} />
          </label>
          <div className="photo-inline-actions">
            <button type="button" disabled={!templateStore || !presetName.trim()} onClick={() => void savePreset(false)}>Save as new preset</button>
            {activePresetId ? <button type="button" disabled={!presetName.trim()} onClick={() => void savePreset(true)}>Update preset</button> : null}
            {activePresetId ? <button type="button" onClick={() => { const record = exportPresets.find((item) => item.id === activePresetId); if (record) downloadTemplate(record); }}>Download preset file</button> : null}
            {activePresetId ? <button type="button" onClick={() => { const record = exportPresets.find((item) => item.id === activePresetId); if (record) void removeTemplate('export', record); }}>Delete preset</button> : null}
            <button type="button" disabled={!templateStore} onClick={() => templateInputRef.current?.click()}>Import template file</button>
            <input ref={templateInputRef} data-testid="photo-template-input" type="file" accept="application/json,.json" hidden onChange={(event) => void importTemplate(event)} />
          </div>
          {templateStore && !templateStore.durable ? <p className="photo-export-note">This browser is not keeping local data, so presets and templates last only until you close the tab.</p> : null}
        </div>

        <div className="photo-export-grid">
          <p className="photo-wide photo-export-note" data-testid="photo-export-profile">
            {recipe.colorManagement?.outputProfile
              ? `ICC output: convert to and embed ${recipe.colorManagement.outputProfile.description} (${recipe.colorManagement.outputProfile.colorSpace}).`
              : 'ICC output: standard browser sRGB. Choose a different output profile in the Edit panel.'}
          </p>
          <label className="photo-wide">File name
            <input aria-label="File name" value={requestedName} onChange={(event) => setRequestedName(event.target.value)} />
          </label>
          <label>File format
            <select aria-label="File format" value={settings.outputMime} onChange={(event) => changeMime(event.target.value as PhotoOutputMime)}>
              {(Object.keys(PHOTO_FORMAT_FACTS) as PhotoOutputMime[]).map((mime) => (
                <option key={mime} value={mime} disabled={!encoderSupport[mime]}>
                  {PHOTO_FORMAT_FACTS[mime].label} · {mime === 'image/avif' && settings.lossless ? 'lossless' : PHOTO_FORMAT_FACTS[mime].compression}{!encoderSupport[mime] ? (mime === 'image/avif' && recipe.colorManagement?.outputProfile ? ' — not available with an ICC output profile' : ' — unsupported in this browser') : ''}
                </option>
              ))}
            </select>
          </label>
          <label>Quality
            <input type="number" aria-label="Quality" min={1} max={100} step={1} value={Math.round(settings.quality * 100)} disabled={!formatFacts.usesQuality || (settings.outputMime === 'image/avif' && settings.lossless)} onChange={(event) => patchSettings({ quality: Math.min(1, Math.max(0.01, readNumber(event.target.value, 92) / 100)) })} />
          </label>
          {settings.outputMime === 'image/avif' ? (
            <label className="photo-check-row photo-wide"><input type="checkbox" checked={settings.lossless} onChange={(event) => patchSettings({ lossless: event.target.checked })} />Lossless AVIF (exact pixels, larger file)</label>
          ) : null}
          <p className="photo-wide photo-export-note" data-testid="photo-format-facts">{formatFacts.note}</p>
          <label>Delivery size
            <select aria-label="Delivery size" value={PHOTO_RESIZE_PRESETS.find((preset) => preset.mode === settings.resizeMode && preset.value === settings.resizeValue)?.id ?? 'custom'} onChange={(event) => {
              const preset = PHOTO_RESIZE_PRESETS.find((item) => item.id === event.target.value);
              if (preset) patchSettings({ resizeMode: preset.mode, resizeValue: preset.value });
            }}>
              {PHOTO_RESIZE_PRESETS.map((preset) => <option key={preset.id} value={preset.id}>{preset.label}</option>)}
              <option value="custom" disabled>Custom size (set below)</option>
            </select>
          </label>
          <label>Resize
            <select aria-label="Resize" value={settings.resizeMode} onChange={(event) => patchSettings({ resizeMode: event.target.value as PhotoResizeMode })}>
              <option value="original">Edited dimensions</option>
              <option value="percent">Percentage</option>
              <option value="width">Exact width</option>
              <option value="height">Exact height</option>
              <option value="long-edge">Long edge</option>
              <option value="short-edge">Short edge</option>
            </select>
          </label>
          {settings.resizeMode !== 'original' ? (
            <label>{resizeValueLabel(settings.resizeMode)}
              <input aria-label="Resize value" type="number" min={1} max={settings.resizeMode === 'percent' ? 400 : 50000} value={settings.resizeValue} onChange={(event) => patchSettings({ resizeValue: Math.max(1, readNumber(event.target.value, 100)) })} />
            </label>
          ) : <div />}
          {settings.resizeMode !== 'original' ? (
            <label className="photo-check-row photo-wide"><input type="checkbox" checked={!settings.allowEnlarge} onChange={(event) => patchSettings({ allowEnlarge: !event.target.checked })} />Don’t enlarge photos that are already smaller than this size</label>
          ) : null}
          <label>Resampling
            <select aria-label="Resampling" value={settings.resampling} disabled={settings.resizeMode === 'original'} onChange={(event) => patchSettings({ resampling: event.target.value as PhotoResamplingKernel })}>
              {PHOTO_RESAMPLING_KERNELS.map((kernel) => <option key={kernel.id} value={kernel.id}>{kernel.label}</option>)}
            </select>
          </label>
          <p className="photo-export-note">{settings.resizeMode === 'original' ? 'Resampling applies when you resize.' : PHOTO_RESAMPLING_KERNELS.find((kernel) => kernel.id === settings.resampling)?.description}</p>
          <label>Output sharpening
            <select aria-label="Output sharpening" value={settings.outputSharpening} onChange={(event) => patchSettings({ outputSharpening: event.target.value as PhotoOutputSharpening })}>
              <option value="none">None</option>
              <option value="light">Light</option>
              <option value="standard">Standard</option>
              <option value="strong">Strong</option>
            </select>
          </label>
          {settings.outputMime === 'image/jpeg' ? (
            <label>Transparent-area background
              <input type="color" aria-label="Transparent-area background" value={settings.jpegBackground} onChange={(event) => patchSettings({ jpegBackground: event.target.value })} />
            </label>
          ) : null}
          <label>Watermark
            <select aria-label="Watermark" value={settings.watermarkPresetId ?? ''} onChange={(event) => patchSettings({ watermarkPresetId: event.target.value || null })}>
              <option value="">None</option>
              {watermarkPresets.map((record) => <option key={record.id} value={record.id}>{record.name}</option>)}
            </select>
          </label>
          <label>Metadata policy
            <select aria-label="Metadata policy" value={settings.metadataPolicy} onChange={(event) => patchSettings({ metadataPolicy: event.target.value as PhotoMetadataPolicy })}>
              <option value="strip">Strip metadata</option>
              <option value="rights">Descriptive + rights only</option>
              <option value="custom">Custom reviewed metadata</option>
            </select>
          </label>
        </div>

        {sizePlan ? (
          <div className={`photo-export-size-plan${singleSizeUnsafe ? ' is-warning' : ' is-safe'}`} role={singleSizeUnsafe ? 'alert' : 'status'} aria-live="polite">
            <strong>Planned output · {sizePlan.requested.width} × {sizePlan.requested.height}</strong>
            {singleSizeUnsafe ? (
              <>
                <span>This request exceeds Photo Studio's verified local canvas limit for this browser profile. Choose the safe plan before downloading to avoid an unusable or silently reduced render.</span>
                <button type="button" onClick={useVerifiedSafeSize}>Use verified safe size · {sizePlan.safe.width} × {sizePlan.safe.height}</button>
              </>
            ) : (
              <span>Within the verified local canvas limit.</span>
            )}
          </div>
        ) : null}

        {settings.metadataPolicy !== 'strip' ? (
          <>
            <div className="photo-export-grid">
              <label>Metadata template
                <select aria-label="Metadata template" value={settings.metadataTemplateId ?? ''} onChange={(event) => patchSettings({ metadataTemplateId: event.target.value || null })}>
                  <option value="">None (use the fields below)</option>
                  {metadataTemplates.map((record) => <option key={record.id} value={record.id}>{record.name}{metadataTemplateHasLocation(record.data) ? ' · includes location' : ''}</option>)}
                </select>
              </label>
              <div className="photo-inline-actions">
                {selectedMetadataTemplate ? <button type="button" onClick={() => applyTemplateToForm(selectedMetadataTemplate.id)}>Copy template into fields</button> : null}
                {selectedMetadataTemplate ? <button type="button" onClick={() => downloadTemplate(selectedMetadataTemplate)}>Download template file</button> : null}
                {selectedMetadataTemplate ? <button type="button" onClick={() => void removeTemplate('metadata', selectedMetadataTemplate)}>Delete template</button> : null}
              </div>
              <p className="photo-wide photo-export-note">{selectedMetadataTemplate ? 'At export, the template fills any field you leave empty below. Fields you type win.' : 'Save the fields below as a template to reuse your credit, copyright, and keywords.'}</p>
            </div>
            <div className="photo-metadata-grid">
              <label>Title<input aria-label="Title" value={metadata.title ?? ''} onChange={(event) => setMetadata((current) => ({ ...current, title: event.target.value }))} /></label>
              <label>Creator<input aria-label="Creator" value={metadata.creator ?? ''} onChange={(event) => setMetadata((current) => ({ ...current, creator: event.target.value }))} /></label>
              <label>Headline<input value={metadata.headline ?? ''} onChange={(event) => setMetadata((current) => ({ ...current, headline: event.target.value }))} /></label>
              <label>Credit<input value={metadata.credit ?? ''} onChange={(event) => setMetadata((current) => ({ ...current, credit: event.target.value }))} /></label>
              <label className="photo-wide">Description<textarea value={metadata.description ?? ''} onChange={(event) => setMetadata((current) => ({ ...current, description: event.target.value }))} /></label>
              <label>Copyright notice<input value={metadata.copyright ?? ''} onChange={(event) => setMetadata((current) => ({ ...current, copyright: event.target.value }))} /></label>
              <label>Usage terms<input value={metadata.usageTerms ?? ''} onChange={(event) => setMetadata((current) => ({ ...current, usageTerms: event.target.value }))} /></label>
              <label>Source<input value={metadata.source ?? ''} onChange={(event) => setMetadata((current) => ({ ...current, source: event.target.value }))} /></label>
              <label>Job identifier<input value={metadata.jobIdentifier ?? ''} onChange={(event) => setMetadata((current) => ({ ...current, jobIdentifier: event.target.value }))} /></label>
              <label>Rating<input type="number" min={0} max={5} step={1} value={metadata.rating ?? ''} onChange={(event) => setMetadata((current) => ({ ...current, rating: event.target.value === '' ? undefined : readNumber(event.target.value, 0) }))} /></label>
              <label>Label<input value={metadata.label ?? ''} onChange={(event) => setMetadata((current) => ({ ...current, label: event.target.value }))} /></label>
              <label className="photo-wide">Keywords<input aria-label="Keywords" value={(metadata.keywords ?? []).join(', ')} onChange={(event) => setMetadata((current) => ({ ...current, keywords: event.target.value.split(',').map((value) => value.trim()).filter(Boolean) }))} /></label>
              <label className="photo-wide">Hierarchical keywords<input value={(metadata.hierarchicalKeywords ?? []).join(', ')} onChange={(event) => setMetadata((current) => ({ ...current, hierarchicalKeywords: event.target.value.split(',').map((value) => value.trim()).filter(Boolean) }))} /></label>
              <label>Accessibility alt text<input value={metadata.altText ?? ''} onChange={(event) => setMetadata((current) => ({ ...current, altText: event.target.value }))} /></label>
              <label>Extended accessibility description<input value={metadata.extendedDescription ?? ''} onChange={(event) => setMetadata((current) => ({ ...current, extendedDescription: event.target.value }))} /></label>
              <label>PPI<input type="number" min={1} max={2400} step={1} value={metadata.ppi ?? 300} onChange={(event) => setMetadata((current) => ({ ...current, ppi: readNumber(event.target.value, 300) }))} /></label>
              {settings.metadataPolicy === 'custom' ? (
                <>
                  <label>City<input value={metadata.city ?? ''} onChange={(event) => setMetadata((current) => ({ ...current, city: event.target.value }))} /></label>
                  <label>State / province<input value={metadata.state ?? ''} onChange={(event) => setMetadata((current) => ({ ...current, state: event.target.value }))} /></label>
                  <label>Country<input value={metadata.country ?? ''} onChange={(event) => setMetadata((current) => ({ ...current, country: event.target.value }))} /></label>
                  <label>Sublocation<input value={metadata.sublocation ?? ''} onChange={(event) => setMetadata((current) => ({ ...current, sublocation: event.target.value }))} /></label>
                  <label>GPS latitude<input type="number" min={-90} max={90} step="any" value={metadata.latitude ?? ''} onChange={(event) => setMetadata((current) => ({ ...current, latitude: event.target.value === '' ? undefined : readNumber(event.target.value, 0) }))} /></label>
                  <label>GPS longitude<input type="number" min={-180} max={180} step="any" value={metadata.longitude ?? ''} onChange={(event) => setMetadata((current) => ({ ...current, longitude: event.target.value === '' ? undefined : readNumber(event.target.value, 0) }))} /></label>
                  <label>GPS altitude<input type="number" step="any" value={metadata.altitude ?? ''} onChange={(event) => setMetadata((current) => ({ ...current, altitude: event.target.value === '' ? undefined : readNumber(event.target.value, 0) }))} /></label>
                  <label>Creation date<input type="datetime-local" value={metadata.creationDate ?? ''} onChange={(event) => setMetadata((current) => ({ ...current, creationDate: event.target.value }))} /></label>
                </>
              ) : null}
            </div>
            <div className="photo-export-grid">
              <label>New template name
                <input aria-label="Metadata template name" value={metadataTemplateName} maxLength={80} placeholder="My rights info" onChange={(event) => setMetadataTemplateName(event.target.value)} />
              </label>
              <label className="photo-check-row"><input type="checkbox" checked={includeLocationInTemplate} onChange={(event) => setIncludeLocationInTemplate(event.target.checked)} />Include location fields (city, GPS) in the template</label>
              <div className="photo-inline-actions">
                <button type="button" disabled={!templateStore || !metadataTemplateName.trim()} onClick={() => void saveMetadataTemplate()}>Save fields as template</button>
              </div>
            </div>
          </>
        ) : (
          <p className="photo-export-note">The rendered image contains new pixels only. Source camera and location metadata is not copied automatically.</p>
        )}

        <p className="photo-export-note">JPEG, PNG, WebP, and TIFF exports attempt to embed the reviewed XMP packet in the output file. If embedding fails, the pixel export still downloads and this dialog reports the fallback; a separate XMP sidecar remains available.</p>
        <div className="photo-dialog-actions">
          <button type="button" onClick={downloadXmp} disabled={settings.metadataPolicy === 'strip'}>Download XMP sidecar</button>
          {canSaveFile ? <button type="button" onClick={() => void saveSingleToFile()} disabled={exportBusy || singleSizeUnsafe}>Save to file…</button> : null}
          <button type="button" onClick={() => void exportSinglePhoto()} disabled={exportBusy || singleSizeUnsafe}>{exportBusy ? 'Rendering…' : singleSizeUnsafe ? 'Choose safe size to export' : 'Download photo'}</button>
        </div>

        <details className="photo-batch-section" data-testid="photo-print-planner">
          <summary>Print size planner</summary>
          <p className="photo-export-note">See how large the planned {plannedWidth} × {plannedHeight} export prints, or size the export for a paper size. The photo is turned sideways when that fills the page better.</p>
          <div className="photo-export-grid">
            <label>Paper
              <select aria-label="Print paper" value={printPaperId} onChange={(event) => setPrintPaperId(event.target.value)}>
                {PHOTO_PAPER_SIZES.map((paper) => <option key={paper.id} value={paper.id}>{paper.label}</option>)}
                <option value="custom">Custom size</option>
              </select>
            </label>
            <label>Units
              <select aria-label="Print units" value={printUnit} onChange={(event) => setPrintUnit(event.target.value as PrintUnit)}>
                <option value="in">Inches</option>
                <option value="cm">Centimetres</option>
              </select>
            </label>
            {printPaperId === 'custom' ? (
              <>
                <label>Print width ({printUnit})<input aria-label="Custom print width" type="number" min={0.1} step="any" value={customPrintWidth} onChange={(event) => setCustomPrintWidth(event.target.value)} /></label>
                <label>Print height ({printUnit})<input aria-label="Custom print height" type="number" min={0.1} step="any" value={customPrintHeight} onChange={(event) => setCustomPrintHeight(event.target.value)} /></label>
              </>
            ) : null}
            <label>Target ppi<input aria-label="Target ppi" type="number" min={50} max={1200} step={1} value={targetPpi} onChange={(event) => setTargetPpi(Math.round(readNumber(event.target.value, 300)))} /></label>
          </div>
          {printFit && printQualityInfo ? (
            <p className={`photo-print-result is-${printQualityInfo.level}`} role="status" data-testid="photo-print-result">
              <strong>{formatInches(printFit.widthIn, printUnit)} × {formatInches(printFit.heightIn, printUnit)} at {Math.round(printFit.ppi)} ppi{printFit.rotated ? ' (turned sideways)' : ''}</strong>
              <span>{printQualityInfo.advice}</span>
            </p>
          ) : <p className="photo-export-note">Enter a print width and height.</p>}
          {sizeAtTarget ? <p className="photo-export-note">At {targetPpi} ppi this export prints up to {formatInches(sizeAtTarget.widthIn, printUnit)} × {formatInches(sizeAtTarget.heightIn, printUnit)}.</p> : null}
          <div className="photo-inline-actions">
            <button type="button" disabled={!printFit} onClick={sizeExportForPrint}>Size export for this print at {targetPpi} ppi</button>
          </div>
          <p className="photo-export-note">Photo Studio prepares print-ready files; it does not control your printer driver or its color settings.</p>
        </details>

        <details className="photo-batch-section">
          <summary>Batch export current recipe</summary>
          <p className="photo-export-note">Files are rendered one at a time with the same format, resize, sharpening, and metadata policy. Each file is independently constrained to verified-safe local canvas limits, a failure is isolated to that file, and full-resolution output blobs are released after each download.</p>
          <label className="photo-open-label photo-batch-picker">
            Choose batch photos
            <input type="file" multiple accept={PHOTO_FILE_ACCEPT} onChange={chooseBatch} disabled={batchBusy} />
          </label>
          <fieldset className="photo-group-picker">
            <legend>Edits to apply</legend>
            <label className="photo-check-row"><input type="radio" name="photo-batch-edits" checked={batchGroups === 'all'} disabled={batchBusy} onChange={() => setBatchGroups('all')} />All current edits</label>
            <label className="photo-check-row"><input type="radio" name="photo-batch-edits" checked={batchGroups !== 'all'} disabled={batchBusy} onChange={() => setBatchGroups([...DEFAULT_COPY_GROUPS])} />Only selected groups (sync look, skip crop and spot fixes)</label>
            {batchGroups !== 'all' ? (
              <div className="photo-group-grid">
                {PHOTO_RECIPE_GROUPS.map((group) => (
                  <label key={group.id} className="photo-check-row">
                    <input type="checkbox" checked={batchGroups.includes(group.id)} disabled={batchBusy} onChange={(event) => setBatchGroups((current) => current === 'all' ? current : event.target.checked ? [...current, group.id] : current.filter((id) => id !== group.id))} />
                    {group.label}
                  </label>
                ))}
              </div>
            ) : null}
          </fieldset>
          <label className="photo-wide">Batch naming rule
            <input aria-label="Batch naming rule" value={settings.filenamePattern} maxLength={120} disabled={batchBusy} onChange={(event) => patchSettings({ filenamePattern: event.target.value })} />
          </label>
          <p className="photo-export-note">Tokens: {FILENAME_TOKENS.map((token) => `${token.token} ${token.meaning}`).join(' · ')}. Example: <code data-testid="photo-filename-preview">{patternPreview}</code>. Names that repeat get “(2)”, “(3)”… instead of overwriting.</p>
          <div className="photo-inline-actions">
            <span>{queuedBatch.length} queued</span>
            <button type="button" disabled={!queuedBatch.length || batchBusy} onClick={() => void exportBatch(false)}>{batchBusy ? 'Exporting batch…' : `Export ${queuedBatch.length || ''} photo${queuedBatch.length === 1 ? '' : 's'}`}</button>
            {canPickFolder ? <button type="button" disabled={!queuedBatch.length || batchBusy} onClick={() => void exportBatch(true)}>Export to a folder…</button> : null}
            {batchBusy ? <button type="button" onClick={() => { for (const item of batchItems) cancelledRef.current.add(item.id); onStatus('Stopping after the current photo…'); }}>Stop batch</button> : null}
            {!batchBusy && batchItems.some((item) => item.status === 'failed' || item.status === 'cancelled') ? <button type="button" onClick={() => setBatchItems((current) => retryQueueItems(current))}>Retry failed</button> : null}
            {!batchBusy && batchItems.some((item) => item.status === 'done') ? <button type="button" onClick={() => setBatchItems((current) => current.filter((item) => item.status !== 'done'))}>Clear finished</button> : null}
          </div>
          <PhotoQueueList
            label="Batch export status"
            items={batchItems}
            running={batchBusy}
            onMove={(id, direction) => setBatchItems((current) => moveQueueItem(current, id, direction))}
            onRemove={(id) => setBatchItems((current) => current.filter((item) => item.id !== id))}
            onCancel={(id) => { cancelledRef.current.add(id); }}
            onRetry={(id) => setBatchItems((current) => retryQueueItems(current, [id]))}
          />
        </details>

        <details className="photo-batch-section" data-testid="photo-multi-output">
          <summary>Export several versions at once</summary>
          <p className="photo-export-note">Render this photo once per saved export preset — for example a full-size TIFF for print, a web JPEG, and a watermarked proof — one after another.</p>
          {exportPresets.length ? (
            <div className="photo-group-grid">
              {exportPresets.map((record) => (
                <label key={record.id} className="photo-check-row">
                  <input type="checkbox" checked={multiSelection.includes(record.id)} disabled={multiBusy} onChange={(event) => setMultiSelection((current) => event.target.checked ? [...current, record.id] : current.filter((id) => id !== record.id))} />
                  {record.name} · {PHOTO_FORMAT_FACTS[record.data.outputMime].label}
                </label>
              ))}
            </div>
          ) : <p className="photo-export-note">Save at least one export preset above to use this.</p>}
          <div className="photo-inline-actions">
            <button type="button" disabled={!multiSelection.length || multiBusy} onClick={() => void exportMultiple(false)}>{multiBusy ? 'Exporting versions…' : `Export ${multiSelection.length || ''} version${multiSelection.length === 1 ? '' : 's'}`}</button>
            {canPickFolder ? <button type="button" disabled={!multiSelection.length || multiBusy} onClick={() => void exportMultiple(true)}>Export versions to a folder…</button> : null}
          </div>
          <PhotoQueueList
            label="Version export status"
            items={multiItems}
            running={multiBusy}
            onMove={(id, direction) => setMultiItems((current) => moveQueueItem(current, id, direction))}
            onRemove={(id) => setMultiItems((current) => current.filter((item) => item.id !== id))}
            onCancel={(id) => { cancelledRef.current.add(id); }}
            onRetry={(id) => setMultiItems((current) => retryQueueItems(current, [id]))}
          />
        </details>

        {manifest ? (
          <div className="photo-inline-actions" data-testid="photo-export-manifest">
            <span>Export summary for {manifest.entries.length} file{manifest.entries.length === 1 ? '' : 's'}:</span>
            <button type="button" onClick={() => downloadManifest('json')}>Download summary (JSON)</button>
            <button type="button" onClick={() => downloadManifest('csv')}>Download summary (CSV)</button>
          </div>
        ) : null}

        <details className="photo-batch-section" data-testid="photo-watermark-presets">
          <summary>Watermark presets</summary>
          <p className="photo-export-note">A watermark preset is stamped on exports only. It scales with each output size, so it looks the same on a thumbnail and a full-size file, and it never changes your saved edits.</p>
          <div className="photo-export-grid">
            <label>Saved presets
              <select aria-label="Edit watermark preset" value={editingWatermarkId ?? ''} onChange={(event) => {
                const record = watermarkPresets.find((item) => item.id === event.target.value);
                setEditingWatermarkId(record?.id ?? null);
                setWatermarkName(record?.name ?? '');
                setWatermarkDraft(record?.data ?? DEFAULT_WATERMARK_PRESET);
              }}>
                <option value="">New watermark</option>
                {watermarkPresets.map((record) => <option key={record.id} value={record.id}>{record.name}</option>)}
              </select>
            </label>
            <label>Watermark name<input aria-label="Watermark preset name" value={watermarkName} maxLength={80} placeholder="Studio mark" onChange={(event) => setWatermarkName(event.target.value)} /></label>
            <label>Type
              <select aria-label="Watermark type" value={watermarkDraft.kind} onChange={(event) => setWatermarkDraft((current) => ({ ...current, kind: event.target.value as 'text' | 'image' }))}>
                <option value="text">Text</option>
                <option value="image" disabled={!watermarkDraft.imageDataUrl}>Image / logo</option>
              </select>
            </label>
            {watermarkDraft.kind === 'text' ? (
              <>
                <label>Text<input aria-label="Watermark text" value={watermarkDraft.text} maxLength={200} onChange={(event) => setWatermarkDraft((current) => ({ ...current, text: event.target.value }))} /></label>
                <label>Color<input type="color" aria-label="Watermark color" value={watermarkDraft.textColor} onChange={(event) => setWatermarkDraft((current) => ({ ...current, textColor: event.target.value }))} /></label>
              </>
            ) : null}
            <div className="photo-inline-actions">
              <button type="button" onClick={() => watermarkImageRef.current?.click()}>{watermarkDraft.imageDataUrl ? 'Replace logo image' : 'Use an image / logo'}</button>
              <input ref={watermarkImageRef} data-testid="photo-watermark-preset-image" type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(event) => void chooseWatermarkImage(event)} />
            </div>
            <label>Position
              <select aria-label="Watermark position" value={watermarkDraft.anchor} onChange={(event) => setWatermarkDraft((current) => ({ ...current, anchor: event.target.value as PhotoWatermarkAnchor }))}>
                <option value="bottom-right">Bottom right</option>
                <option value="bottom-left">Bottom left</option>
                <option value="top-right">Top right</option>
                <option value="top-left">Top left</option>
                <option value="center">Centre</option>
              </select>
            </label>
            <label>Size (% of the shorter side)<input aria-label="Watermark size percent" type="number" min={1} max={50} step={0.5} value={Math.round(watermarkDraft.size * 1000) / 10} onChange={(event) => setWatermarkDraft((current) => ({ ...current, size: Math.min(0.5, Math.max(0.01, readNumber(event.target.value, 5) / 100)) }))} /></label>
            <label>Edge gap (%)<input aria-label="Watermark edge gap percent" type="number" min={0} max={25} step={0.5} value={Math.round(watermarkDraft.margin * 1000) / 10} onChange={(event) => setWatermarkDraft((current) => ({ ...current, margin: Math.min(0.25, Math.max(0, readNumber(event.target.value, 3) / 100)) }))} /></label>
            <label>Opacity (%)<input aria-label="Watermark opacity percent" type="number" min={0} max={100} step={1} value={Math.round(watermarkDraft.opacity * 100)} onChange={(event) => setWatermarkDraft((current) => ({ ...current, opacity: Math.min(1, Math.max(0, readNumber(event.target.value, 70) / 100)) }))} /></label>
          </div>
          <div className="photo-inline-actions">
            <button type="button" disabled={!templateStore || !watermarkName.trim()} onClick={() => void saveWatermarkPreset()}>{editingWatermarkId ? 'Update watermark preset' : 'Save watermark preset'}</button>
            {editingWatermarkId ? <button type="button" onClick={() => { const record = watermarkPresets.find((item) => item.id === editingWatermarkId); if (record) downloadTemplate(record); }}>Download watermark file</button> : null}
            {editingWatermarkId ? <button type="button" onClick={() => { const record = watermarkPresets.find((item) => item.id === editingWatermarkId); if (record) void removeTemplate('watermark', record); }}>Delete watermark preset</button> : null}
          </div>
        </details>

        <details className="photo-batch-section">
          <summary>Contact sheet</summary>
          <PhotoContactSheetPanel
            sources={queuedBatch.length || batchItems.length ? batchItems.map((item) => ({ name: item.label, file: item.payload.file })) : [{ name: source.name, file: source.file }]}
            recipe={recipe}
            createSink={() => createDownloadSink()}
            onStatus={onStatus}
          />
        </details>
      </section>
    </div>
  );
}

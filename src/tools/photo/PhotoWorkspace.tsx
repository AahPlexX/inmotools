import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { downloadBlob } from '../../lib/download';
import PhotoCanvas from './PhotoCanvas';
import {
  DEFAULT_RECIPE,
  commitHistory,
  createHistory,
  normalizeRecipe,
  redoHistory,
  undoHistory,
} from './photo-engine';
import {
  safePhotoFilename,
  serializePhotoXmp,
  stripLocationMetadata,
} from './photo-metadata';
import {
  disposePhotoRenderer,
  isRenderResultCurrent,
  probePhotoCapabilities,
  renderPhoto,
  type PhotoRenderResult,
} from './photo-renderer';
import type {
  LocalAdjustment,
  PhotoCapabilities,
  PhotoExportMetadata,
  PhotoHistory,
  PhotoOutputMime,
  PhotoRecipe,
  PhotoSnapshot,
  RetouchOperation,
} from './photo-types';
import './photo.css';

type InspectorPanel = 'edit' | 'geometry' | 'local' | 'retouch' | 'inspect';
type MetadataPolicy = 'strip' | 'rights' | 'custom';
type ResizeMode = 'original' | 'percent' | 'width' | 'height';

interface SourcePhoto {
  file: File;
  name: string;
  originalUrl: string;
  width: number;
  height: number;
}

interface PreviewState {
  url: string;
  result: PhotoRenderResult;
}

interface AdjustmentSpec {
  key: keyof Pick<PhotoRecipe,
    'exposure' | 'contrast' | 'highlights' | 'shadows' | 'whites' | 'blacks' | 'midtone'
    | 'temperature' | 'tint' | 'saturation' | 'vibrance' | 'dehaze'
    | 'vignette' | 'vignetteMidpoint' | 'vignetteFeather' | 'grain' | 'grainSize' | 'grainColor'>;
  label: string;
  min: number;
  max: number;
  step: number;
  neutral?: number;
}

const LIGHT_CONTROLS: AdjustmentSpec[] = [
  { key: 'exposure', label: 'Exposure', min: -5, max: 5, step: 0.1 },
  { key: 'contrast', label: 'Contrast', min: -1, max: 1, step: 0.02 },
  { key: 'highlights', label: 'Highlights', min: -1, max: 1, step: 0.02 },
  { key: 'shadows', label: 'Shadows', min: -1, max: 1, step: 0.02 },
  { key: 'whites', label: 'White point', min: -1, max: 1, step: 0.02 },
  { key: 'blacks', label: 'Black point', min: -1, max: 1, step: 0.02 },
  { key: 'midtone', label: 'Midtone', min: -1, max: 1, step: 0.02 },
];

const COLOR_CONTROLS: AdjustmentSpec[] = [
  { key: 'temperature', label: 'Temperature', min: -1, max: 1, step: 0.02 },
  { key: 'tint', label: 'Tint', min: -1, max: 1, step: 0.02 },
  { key: 'saturation', label: 'Saturation', min: -1, max: 1, step: 0.02 },
  { key: 'vibrance', label: 'Vibrance', min: -1, max: 1, step: 0.02 },
  { key: 'dehaze', label: 'Dehaze', min: -1, max: 1, step: 0.02 },
];

const FINISH_CONTROLS: AdjustmentSpec[] = [
  { key: 'vignette', label: 'Vignette', min: -1, max: 1, step: 0.02 },
  { key: 'vignetteMidpoint', label: 'Vignette midpoint', min: 0, max: 1, step: 0.02, neutral: 0.5 },
  { key: 'vignetteFeather', label: 'Vignette feather', min: 0.01, max: 1, step: 0.02, neutral: 0.5 },
  { key: 'grain', label: 'Grain amount', min: 0, max: 1, step: 0.02 },
  { key: 'grainSize', label: 'Grain size', min: 0.5, max: 3, step: 0.1, neutral: 1 },
  { key: 'grainColor', label: 'Grain color', min: 0, max: 1, step: 0.02 },
];

const HSL_LABELS = ['Red', 'Orange', 'Yellow', 'Green', 'Aqua', 'Blue', 'Purple', 'Magenta'];
const GRADE_LABELS = [
  ['shadowGrade', 'Shadows'],
  ['midtoneGrade', 'Midtones'],
  ['highlightGrade', 'Highlights'],
] as const;

const PRESETS: Array<{ name: string; patch: Partial<PhotoRecipe> }> = [
  { name: 'Clean color', patch: { contrast: 0.08, vibrance: 0.16, highlights: -0.12, shadows: 0.12 } },
  { name: 'Soft portrait', patch: { contrast: -0.05, highlights: -0.18, shadows: 0.16, vibrance: 0.08, vignette: 0.12 } },
  { name: 'Landscape depth', patch: { contrast: 0.14, dehaze: 0.18, vibrance: 0.18, highlights: -0.2, shadows: 0.08 } },
  { name: 'Monochrome', patch: { blackAndWhite: true, contrast: 0.12, highlights: -0.08, shadows: 0.08 } },
];

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function readNumber(value: string, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function inputCommit(event: ReactKeyboardEvent<HTMLInputElement>) {
  if (event.key === 'Enter') event.currentTarget.blur();
}

function AdjustmentControl({
  spec,
  value,
  onChange,
}: {
  spec: AdjustmentSpec;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="photo-control">
      <span>{spec.label}</span>
      <input
        type="range"
        min={spec.min}
        max={spec.max}
        step={spec.step}
        value={value}
        aria-label={`${spec.label} slider`}
        onChange={(event) => onChange(readNumber(event.target.value, value))}
      />
      <input
        type="number"
        min={spec.min}
        max={spec.max}
        step={spec.step}
        value={value}
        aria-label={`${spec.label} value`}
        onChange={(event) => onChange(readNumber(event.target.value, value))}
        onKeyDown={inputCommit}
      />
    </label>
  );
}

function SimpleControl({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
}) {
  return <AdjustmentControl spec={{ key: 'exposure', label, min, max, step }} value={value} onChange={onChange} />;
}

function photoNaturalDimensions(source: SourcePhoto, recipe: PhotoRecipe) {
  const width = Math.max(1, Math.round(source.width * recipe.crop.width));
  const height = Math.max(1, Math.round(source.height * recipe.crop.height));
  const turns = ((Math.round(recipe.rotateQuarterTurns) % 4) + 4) % 4;
  return turns % 2 ? { width: height, height: width } : { width, height };
}

function recipeWithPatch(recipe: PhotoRecipe, patch: Partial<PhotoRecipe>): PhotoRecipe {
  return normalizeRecipe({ ...recipe, ...patch });
}

function cloneLocalAdjustment(adjustment: LocalAdjustment): LocalAdjustment {
  return {
    ...adjustment,
    mask: adjustment.mask.type === 'brush'
      ? { ...adjustment.mask, points: adjustment.mask.points.map((point) => ({ ...point })) }
      : { ...adjustment.mask },
    effect: { ...adjustment.effect },
  };
}

export default function PhotoWorkspace() {
  const [source, setSource] = useState<SourcePhoto | null>(null);
  const [history, setHistory] = useState<PhotoHistory>(() => createHistory(DEFAULT_RECIPE));
  const [panel, setPanel] = useState<InspectorPanel>('edit');
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [compare, setCompare] = useState(false);
  const [zoom, setZoom] = useState(0.75);
  const [status, setStatus] = useState('Open a photo to begin editing locally.');
  const [capabilities, setCapabilities] = useState<PhotoCapabilities | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportBusy, setExportBusy] = useState(false);
  const [outputMime, setOutputMime] = useState<PhotoOutputMime>('image/jpeg');
  const [quality, setQuality] = useState(0.92);
  const [resizeMode, setResizeMode] = useState<ResizeMode>('original');
  const [resizeValue, setResizeValue] = useState(100);
  const [jpegBackground, setJpegBackground] = useState('#ffffff');
  const [metadataPolicy, setMetadataPolicy] = useState<MetadataPolicy>('strip');
  const [metadata, setMetadata] = useState<PhotoExportMetadata>({ ppi: 300 });
  const [snapshots, setSnapshots] = useState<PhotoSnapshot[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const recipeInputRef = useRef<HTMLInputElement | null>(null);
  const renderRevisionRef = useRef(0);
  const previewUrlRef = useRef<string | null>(null);
  const sourceUrlRef = useRef<string | null>(null);

  const recipe = history.present;

  const releasePreviewUrl = useCallback(() => {
    if (!previewUrlRef.current) return;
    URL.revokeObjectURL(previewUrlRef.current);
    previewUrlRef.current = null;
  }, []);

  const releaseSourceUrl = useCallback(() => {
    if (!sourceUrlRef.current) return;
    URL.revokeObjectURL(sourceUrlRef.current);
    sourceUrlRef.current = null;
  }, []);

  useEffect(() => {
    let active = true;
    probePhotoCapabilities().then((value) => {
      if (active) setCapabilities(value);
    }).catch(() => {
      if (active) setCapabilities(null);
    });
    return () => { active = false; };
  }, []);

  useEffect(() => () => {
    renderRevisionRef.current += 1;
    releasePreviewUrl();
    releaseSourceUrl();
    disposePhotoRenderer();
  }, [releasePreviewUrl, releaseSourceUrl]);

  useEffect(() => {
    if (!source) {
      setPreview(null);
      releasePreviewUrl();
      return;
    }
    const revision = ++renderRevisionRef.current;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      setPreviewBusy(true);
      renderPhoto({
        file: source.file,
        recipe,
        revision,
        mode: 'preview',
        outputMime: 'image/png',
      }).then((result) => {
        if (cancelled || !isRenderResultCurrent(renderRevisionRef.current, result)) return;
        releasePreviewUrl();
        const url = URL.createObjectURL(result.blob);
        previewUrlRef.current = url;
        setPreview({ url, result });
        setPreviewBusy(false);
        if (result.scaledForSafety) {
          setStatus(`Preview rendered at ${result.width} × ${result.height} for responsive editing; full export remains available within device limits.`);
        } else {
          setStatus(`Preview updated · ${result.width} × ${result.height}`);
        }
      }).catch((error) => {
        if (cancelled || revision !== renderRevisionRef.current) return;
        setPreviewBusy(false);
        setStatus(`Preview failed: ${error instanceof Error ? error.message : 'unknown rendering error'}`);
      });
    }, 70);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [source, recipe, releasePreviewUrl]);

  const commitRecipe = useCallback((next: PhotoRecipe) => {
    setHistory((current) => commitHistory(current, normalizeRecipe(next)));
  }, []);

  const patchRecipe = useCallback((patch: Partial<PhotoRecipe>) => {
    setHistory((current) => commitHistory(current, recipeWithPatch(current.present, patch)));
  }, []);

  const undo = useCallback(() => {
    setHistory((current) => undoHistory(current));
  }, []);

  const redo = useCallback(() => {
    setHistory((current) => redoHistory(current));
  }, []);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const modifier = event.metaKey || event.ctrlKey;
      if (!modifier || event.key.toLowerCase() !== 'z') return;
      event.preventDefault();
      if (event.shiftKey) redo();
      else undo();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [redo, undo]);

  async function openPhoto(files: FileList | File[]) {
    const file = Array.from(files)[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setStatus('That file is not a browser-decodable image. Choose a JPEG, PNG, WebP, or another still image your browser supports.');
      return;
    }
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
      const width = bitmap.width;
      const height = bitmap.height;
      bitmap.close();
      releaseSourceUrl();
      releasePreviewUrl();
      const originalUrl = URL.createObjectURL(file);
      sourceUrlRef.current = originalUrl;
      setSource({ file, name: file.name, originalUrl, width, height });
      setHistory(createHistory(DEFAULT_RECIPE));
      setSnapshots([]);
      setCompare(false);
      setZoom(0.75);
      setMetadata({ ppi: 300 });
      setStatus(`${file.name} opened locally · ${width} × ${height} · ${formatBytes(file.size)}`);
    } catch (error) {
      setStatus(`Could not decode ${file.name}: ${error instanceof Error ? error.message : 'unsupported image data'}`);
    }
  }

  function resetAll() {
    if (!source) return;
    setHistory((current) => commitHistory(current, DEFAULT_RECIPE));
    setStatus('All editing adjustments reset.');
  }

  function updateHsl(index: number, field: 'hue' | 'saturation' | 'luminance', value: number) {
    const next = recipe.hsl.map((entry, entryIndex) => entryIndex === index ? { ...entry, [field]: value } : { ...entry });
    patchRecipe({ hsl: next });
  }

  function updateGrade(
    key: 'shadowGrade' | 'midtoneGrade' | 'highlightGrade',
    field: 'hue' | 'saturation' | 'luminance',
    value: number,
  ) {
    patchRecipe({ [key]: { ...recipe[key], [field]: value } } as Partial<PhotoRecipe>);
  }

  function updateBwMix(index: number, value: number) {
    const next = [...recipe.blackAndWhiteMix];
    next[index] = value;
    patchRecipe({ blackAndWhiteMix: next });
  }

  function cropPercent(field: 'x' | 'y' | 'width' | 'height', value: number) {
    patchRecipe({ crop: { ...recipe.crop, [field]: value / 100 } });
  }

  function applyCropRatio(ratio: number | null) {
    if (!source || ratio === null) {
      patchRecipe({ crop: { x: 0, y: 0, width: 1, height: 1 } });
      return;
    }
    const sourceRatio = source.width / source.height;
    if (sourceRatio > ratio) {
      const width = ratio / sourceRatio;
      patchRecipe({ crop: { x: (1 - width) / 2, y: 0, width, height: 1 } });
    } else {
      const height = sourceRatio / ratio;
      patchRecipe({ crop: { x: 0, y: (1 - height) / 2, width: 1, height } });
    }
  }

  function addLocalAdjustment(type: LocalAdjustment['mask']['type']) {
    const id = crypto.randomUUID?.() ?? `local-${Date.now()}-${recipe.localAdjustments.length}`;
    const index = recipe.localAdjustments.length + 1;
    const base = { feather: 0.45, opacity: 1, invert: false };
    const mask: LocalAdjustment['mask'] = type === 'radial'
      ? { type: 'radial', cx: 0.5, cy: 0.5, rx: 0.28, ry: 0.28, ...base }
      : type === 'linear'
        ? { type: 'linear', x1: 0.2, y1: 0.25, x2: 0.8, y2: 0.75, ...base }
        : type === 'luminance'
          ? { type: 'luminance', min: 0.2, max: 0.8, ...base }
          : type === 'hue'
            ? { type: 'hue', center: 30, range: 35, ...base }
            : { type: 'brush', points: [{ x: 0.5, y: 0.5, pressure: 1 }], radius: 0.12, ...base };
    const label = `${type === 'radial' ? 'Radial' : type === 'linear' ? 'Linear' : type === 'luminance' ? 'Luminance range' : type === 'hue' ? 'Hue range' : 'Brush'} adjustment ${index}`;
    const adjustment: LocalAdjustment = {
      id,
      label,
      enabled: true,
      mask,
      effect: { exposure: 0.5, saturation: 0, sharpness: 0, blur: 0 },
    };
    patchRecipe({ localAdjustments: [...recipe.localAdjustments.map(cloneLocalAdjustment), adjustment] });
  }

  function updateLocal(id: string, update: (item: LocalAdjustment) => LocalAdjustment) {
    patchRecipe({
      localAdjustments: recipe.localAdjustments.map((item) => item.id === id ? update(cloneLocalAdjustment(item)) : cloneLocalAdjustment(item)),
    });
  }

  function removeLocal(id: string) {
    patchRecipe({ localAdjustments: recipe.localAdjustments.filter((item) => item.id !== id).map(cloneLocalAdjustment) });
  }

  function addRetouch(type: RetouchOperation['type']) {
    const id = crypto.randomUUID?.() ?? `retouch-${Date.now()}-${recipe.retouch.length}`;
    const operation: RetouchOperation = type === 'red-eye'
      ? { id, type, x: 0.5, y: 0.5, radius: 0.04, strength: 0.8 }
      : type === 'clone'
        ? { id, type, sourceX: 0.38, sourceY: 0.5, targetX: 0.62, targetY: 0.5, radius: 0.06, feather: 0.55, opacity: 1 }
        : { id, type, sourceX: 0.38, sourceY: 0.5, targetX: 0.62, targetY: 0.5, radius: 0.06, feather: 0.75, opacity: 0.8 };
    patchRecipe({ retouch: [...recipe.retouch.map((item) => ({ ...item })), operation] });
  }

  function removeRetouch(id: string) {
    patchRecipe({ retouch: recipe.retouch.filter((item) => item.id !== id).map((item) => ({ ...item })) });
  }

  function applyPreset(patch: Partial<PhotoRecipe>) {
    commitRecipe(recipeWithPatch(recipe, patch));
  }

  function saveSnapshot() {
    if (!source) return;
    const next: PhotoSnapshot = {
      id: crypto.randomUUID?.() ?? `snapshot-${Date.now()}`,
      name: `Snapshot ${snapshots.length + 1}`,
      createdAt: new Date().toISOString(),
      recipe: normalizeRecipe(recipe),
    };
    setSnapshots((current) => [...current, next]);
    setStatus(`${next.name} saved.`);
  }

  function restoreSnapshot(snapshot: PhotoSnapshot) {
    commitRecipe(snapshot.recipe);
    setStatus(`${snapshot.name} restored.`);
  }

  function downloadRecipe() {
    if (!source) return;
    const blob = new Blob([JSON.stringify({ kind: 'inmotools-photo-recipe', version: 1, recipe }, null, 2)], { type: 'application/json' });
    const stem = source.name.replace(/\.[^.]+$/, '') || 'photo';
    downloadBlob(blob, `${stem}-photo-recipe.json`);
  }

  async function importRecipe(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text()) as { recipe?: PhotoRecipe };
      if (!parsed.recipe || parsed.recipe.version !== 1) throw new Error('Unsupported recipe version.');
      commitRecipe(normalizeRecipe({ ...DEFAULT_RECIPE, ...parsed.recipe }));
      setStatus(`${file.name} recipe applied.`);
    } catch (error) {
      setStatus(`Recipe import failed: ${error instanceof Error ? error.message : 'invalid JSON'}`);
    }
  }

  function metadataForPolicy(): PhotoExportMetadata {
    if (metadataPolicy === 'strip') return {};
    if (metadataPolicy === 'rights') {
      return stripLocationMetadata({
        title: metadata.title,
        headline: metadata.headline,
        description: metadata.description,
        creator: metadata.creator,
        credit: metadata.credit,
        copyright: metadata.copyright,
        usageTerms: metadata.usageTerms,
        source: metadata.source,
        jobIdentifier: metadata.jobIdentifier,
        rating: metadata.rating,
        label: metadata.label,
        keywords: metadata.keywords,
        hierarchicalKeywords: metadata.hierarchicalKeywords,
        altText: metadata.altText,
        extendedDescription: metadata.extendedDescription,
        ppi: metadata.ppi,
      });
    }
    return metadata;
  }

  function sidecarName() {
    if (!source) return 'photo-edited.xmp';
    const imageName = safePhotoFilename(source.name, outputMime);
    return imageName.replace(/\.[^.]+$/, '.xmp');
  }

  function downloadXmp() {
    const xmp = serializePhotoXmp(metadataForPolicy());
    downloadBlob(new Blob([xmp], { type: 'application/rdf+xml' }), sidecarName());
    setStatus('XMP sidecar created from the reviewed export metadata.');
  }

  function exportDimensions() {
    if (!source) return {};
    const natural = photoNaturalDimensions(source, recipe);
    if (resizeMode === 'original') return {};
    if (resizeMode === 'percent') {
      const scale = Math.max(1, resizeValue) / 100;
      return { requestedWidth: Math.round(natural.width * scale), requestedHeight: Math.round(natural.height * scale) };
    }
    if (resizeMode === 'width') {
      const width = Math.max(1, Math.round(resizeValue));
      return { requestedWidth: width, requestedHeight: Math.max(1, Math.round(width * natural.height / natural.width)) };
    }
    const height = Math.max(1, Math.round(resizeValue));
    return { requestedWidth: Math.max(1, Math.round(height * natural.width / natural.height)), requestedHeight: height };
  }

  async function exportPhoto() {
    if (!source || exportBusy) return;
    const revision = ++renderRevisionRef.current;
    setExportBusy(true);
    setStatus('Rendering full export locally…');
    try {
      const result = await renderPhoto({
        file: source.file,
        recipe,
        revision,
        mode: 'export',
        outputMime,
        quality,
        jpegBackground,
        ...exportDimensions(),
      });
      downloadBlob(result.blob, safePhotoFilename(source.name, outputMime));
      const safety = result.scaledForSafety ? ` Device limits required a safe ${result.width} × ${result.height} render.` : '';
      setStatus(`Photo exported locally as ${result.width} × ${result.height}.${safety}`);
    } catch (error) {
      setStatus(`Export failed: ${error instanceof Error ? error.message : 'unknown encoding error'}`);
    } finally {
      setExportBusy(false);
    }
  }

  const encoderSupport = useMemo(() => ({
    'image/jpeg': capabilities?.jpeg ?? true,
    'image/png': capabilities?.png ?? true,
    'image/webp': capabilities?.webp ?? true,
  }), [capabilities]);

  function renderEditPanel() {
    return (
      <>
        <div className="photo-inspector-header">
          <h2>Photo Studio</h2>
          <p>Shape light and color with reversible controls. Nothing touches the original file.</p>
        </div>
        <details className="photo-section" open>
          <summary>Light & tone</summary>
          <div className="photo-control-list">
            {LIGHT_CONTROLS.map((spec) => (
              <AdjustmentControl key={spec.key} spec={spec} value={recipe[spec.key] as number} onChange={(value) => patchRecipe({ [spec.key]: value } as Partial<PhotoRecipe>)} />
            ))}
          </div>
        </details>
        <details className="photo-section" open>
          <summary>White balance & color</summary>
          <div className="photo-control-list">
            {COLOR_CONTROLS.map((spec) => (
              <AdjustmentControl key={spec.key} spec={spec} value={recipe[spec.key] as number} onChange={(value) => patchRecipe({ [spec.key]: value } as Partial<PhotoRecipe>)} />
            ))}
          </div>
        </details>
        <details className="photo-section">
          <summary>Color ranges · 24 controls</summary>
          <div className="photo-hsl-grid">
            {recipe.hsl.map((entry, index) => (
              <div className="photo-hsl-row" key={HSL_LABELS[index]}>
                <strong>{HSL_LABELS[index]}</strong>
                <SimpleControl label={`${HSL_LABELS[index]} hue`} value={entry.hue} min={-180} max={180} step={1} onChange={(value) => updateHsl(index, 'hue', value)} />
                <SimpleControl label={`${HSL_LABELS[index]} saturation`} value={entry.saturation} min={-1} max={1} step={0.02} onChange={(value) => updateHsl(index, 'saturation', value)} />
                <SimpleControl label={`${HSL_LABELS[index]} luminance`} value={entry.luminance} min={-1} max={1} step={0.02} onChange={(value) => updateHsl(index, 'luminance', value)} />
              </div>
            ))}
          </div>
        </details>
        <details className="photo-section">
          <summary>Three-way color grading</summary>
          <div className="photo-grade-grid">
            {GRADE_LABELS.map(([key, label]) => (
              <div className="photo-hsl-row" key={key}>
                <strong>{label}</strong>
                <SimpleControl label={`${label} hue`} value={recipe[key].hue} min={0} max={359} step={1} onChange={(value) => updateGrade(key, 'hue', value)} />
                <SimpleControl label={`${label} saturation`} value={recipe[key].saturation} min={0} max={1} step={0.02} onChange={(value) => updateGrade(key, 'saturation', value)} />
                <SimpleControl label={`${label} luminance`} value={recipe[key].luminance} min={-1} max={1} step={0.02} onChange={(value) => updateGrade(key, 'luminance', value)} />
              </div>
            ))}
          </div>
        </details>
        <details className="photo-section">
          <summary>Black & white mixer</summary>
          <label className="photo-check">
            <input type="checkbox" checked={recipe.blackAndWhite} onChange={(event) => patchRecipe({ blackAndWhite: event.target.checked })} />
            Convert to black & white
          </label>
          {recipe.blackAndWhite ? (
            <div className="photo-control-list">
              {recipe.blackAndWhiteMix.map((value, index) => (
                <SimpleControl key={HSL_LABELS[index]} label={`${HSL_LABELS[index]} mix`} value={value} min={0} max={2} step={0.02} onChange={(next) => updateBwMix(index, next)} />
              ))}
            </div>
          ) : null}
        </details>
        <details className="photo-section">
          <summary>Finishing</summary>
          <div className="photo-control-list">
            {FINISH_CONTROLS.map((spec) => (
              <AdjustmentControl key={spec.key} spec={spec} value={recipe[spec.key] as number} onChange={(value) => patchRecipe({ [spec.key]: value } as Partial<PhotoRecipe>)} />
            ))}
          </div>
        </details>
      </>
    );
  }

  function renderGeometryPanel() {
    return (
      <>
        <div className="photo-inspector-header">
          <h2>Crop & geometry</h2>
          <p>Frame precisely with normalized crop coordinates so the same edit scales cleanly to export resolution.</p>
        </div>
        <div className="photo-inline-actions">
          <button type="button" onClick={() => applyCropRatio(null)}>Original</button>
          <button type="button" onClick={() => applyCropRatio(1)}>1:1</button>
          <button type="button" onClick={() => applyCropRatio(4 / 3)}>4:3</button>
          <button type="button" onClick={() => applyCropRatio(3 / 2)}>3:2</button>
          <button type="button" onClick={() => applyCropRatio(16 / 9)}>16:9</button>
        </div>
        <div className="photo-control-list">
          <SimpleControl label="Crop left percent" value={Math.round(recipe.crop.x * 1000) / 10} min={0} max={99.9} step={0.1} onChange={(value) => cropPercent('x', value)} />
          <SimpleControl label="Crop top percent" value={Math.round(recipe.crop.y * 1000) / 10} min={0} max={99.9} step={0.1} onChange={(value) => cropPercent('y', value)} />
          <SimpleControl label="Crop width percent" value={Math.round(recipe.crop.width * 1000) / 10} min={0.1} max={100} step={0.1} onChange={(value) => cropPercent('width', value)} />
          <SimpleControl label="Crop height percent" value={Math.round(recipe.crop.height * 1000) / 10} min={0.1} max={100} step={0.1} onChange={(value) => cropPercent('height', value)} />
          <SimpleControl label="Straighten degrees" value={recipe.straighten} min={-45} max={45} step={0.1} onChange={(value) => patchRecipe({ straighten: value })} />
        </div>
        <div className="photo-inline-actions">
          <button type="button" onClick={() => patchRecipe({ rotateQuarterTurns: recipe.rotateQuarterTurns - 1 })}>Rotate left</button>
          <button type="button" aria-label="Rotate right" onClick={() => patchRecipe({ rotateQuarterTurns: recipe.rotateQuarterTurns + 1 })}>Rotate right</button>
          <button type="button" onClick={() => patchRecipe({ flipX: !recipe.flipX })}>{recipe.flipX ? 'Unflip horizontal' : 'Flip horizontal'}</button>
          <button type="button" onClick={() => patchRecipe({ flipY: !recipe.flipY })}>{recipe.flipY ? 'Unflip vertical' : 'Flip vertical'}</button>
        </div>
      </>
    );
  }

  function renderLocalPanel() {
    return (
      <>
        <div className="photo-inspector-header">
          <h2>Local adjustments</h2>
          <p>Target a region, brightness range, or color range without changing the rest of the photograph.</p>
        </div>
        <div className="photo-inline-actions">
          <button type="button" onClick={() => addLocalAdjustment('radial')}>Add radial mask</button>
          <button type="button" onClick={() => addLocalAdjustment('linear')}>Add linear mask</button>
          <button type="button" onClick={() => addLocalAdjustment('brush')}>Add brush mask</button>
          <button type="button" onClick={() => addLocalAdjustment('luminance')}>Add luminance range</button>
          <button type="button" onClick={() => addLocalAdjustment('hue')}>Add hue range</button>
        </div>
        {recipe.localAdjustments.length ? recipe.localAdjustments.map((adjustment) => (
          <article className="photo-local-card" key={adjustment.id}>
            <header><strong>{adjustment.label}</strong></header>
            <label className="photo-check">
              <input type="checkbox" checked={adjustment.enabled} onChange={(event) => updateLocal(adjustment.id, (item) => ({ ...item, enabled: event.target.checked }))} />
              Enabled
            </label>
            <SimpleControl label={`${adjustment.label} exposure`} value={adjustment.effect.exposure} min={-4} max={4} step={0.1} onChange={(value) => updateLocal(adjustment.id, (item) => ({ ...item, effect: { ...item.effect, exposure: value } }))} />
            <SimpleControl label={`${adjustment.label} saturation`} value={adjustment.effect.saturation} min={-1} max={1} step={0.02} onChange={(value) => updateLocal(adjustment.id, (item) => ({ ...item, effect: { ...item.effect, saturation: value } }))} />
            <SimpleControl label={`${adjustment.label} opacity`} value={adjustment.mask.opacity} min={0} max={1} step={0.02} onChange={(value) => updateLocal(adjustment.id, (item) => ({ ...item, mask: { ...item.mask, opacity: value } }))} />
            <SimpleControl label={`${adjustment.label} feather`} value={adjustment.mask.feather} min={0} max={1} step={0.02} onChange={(value) => updateLocal(adjustment.id, (item) => ({ ...item, mask: { ...item.mask, feather: value } }))} />
            <div className="photo-inline-actions">
              <button type="button" onClick={() => updateLocal(adjustment.id, (item) => ({ ...item, mask: { ...item.mask, invert: !item.mask.invert } }))}>{adjustment.mask.invert ? 'Use normal mask' : 'Invert mask'}</button>
              <button type="button" onClick={() => removeLocal(adjustment.id)}>Remove</button>
            </div>
          </article>
        )) : <p className="photo-export-note">Add a mask to make targeted edits. Each mask remains editable and removable.</p>}
      </>
    );
  }

  function renderRetouchPanel() {
    return (
      <>
        <div className="photo-inspector-header">
          <h2>Retouch</h2>
          <p>Use explicit, reversible source-and-target operations rather than permanently painting over source pixels.</p>
        </div>
        <div className="photo-inline-actions">
          <button type="button" onClick={() => addRetouch('red-eye')}>Add red-eye correction</button>
          <button type="button" onClick={() => addRetouch('clone')}>Add clone spot</button>
          <button type="button" onClick={() => addRetouch('heal')}>Add healing spot</button>
        </div>
        {recipe.retouch.map((operation, index) => (
          <article className="photo-local-card" key={operation.id}>
            <header><strong>{operation.type === 'red-eye' ? 'Red-eye' : operation.type === 'clone' ? 'Clone' : 'Healing'} operation {index + 1}</strong></header>
            <p className="photo-export-note">
              {operation.type === 'red-eye'
                ? `Center ${Math.round(operation.x * 100)}%, ${Math.round(operation.y * 100)}% · radius ${Math.round(operation.radius * 100)}%`
                : `Source ${Math.round(operation.sourceX * 100)}%, ${Math.round(operation.sourceY * 100)}% → target ${Math.round(operation.targetX * 100)}%, ${Math.round(operation.targetY * 100)}%`}
            </p>
            <button type="button" onClick={() => removeRetouch(operation.id)}>Remove operation</button>
          </article>
        ))}
      </>
    );
  }

  function renderInspectPanel() {
    return (
      <>
        <div className="photo-inspector-header">
          <h2>Inspect & workflow</h2>
          <p>Save alternate looks, apply editable starting points, and move adjustment recipes between photographs.</p>
        </div>
        {source ? (
          <div className="photo-local-card">
            <strong>{source.name}</strong>
            <span>{source.width} × {source.height}</span>
            <span>{formatBytes(source.file.size)} · {source.file.type || 'unknown image type'}</span>
          </div>
        ) : null}
        <details className="photo-section" open>
          <summary>Editable starting presets</summary>
          <div className="photo-inline-actions">
            {PRESETS.map((preset) => <button type="button" key={preset.name} onClick={() => applyPreset(preset.patch)} disabled={!source}>{preset.name}</button>)}
          </div>
        </details>
        <details className="photo-section" open>
          <summary>Snapshots</summary>
          <div className="photo-inline-actions"><button type="button" onClick={saveSnapshot} disabled={!source}>Save snapshot</button></div>
          {snapshots.map((snapshot) => (
            <button className="photo-snapshot-card" type="button" key={snapshot.id} onClick={() => restoreSnapshot(snapshot)}>
              <strong>{snapshot.name}</strong>
              <span>{new Date(snapshot.createdAt).toLocaleTimeString()}</span>
            </button>
          ))}
        </details>
        <details className="photo-section" open>
          <summary>Recipe transfer</summary>
          <div className="photo-inline-actions">
            <button type="button" onClick={downloadRecipe} disabled={!source}>Download edit recipe</button>
            <button type="button" onClick={() => recipeInputRef.current?.click()}>Import edit recipe</button>
            <input ref={recipeInputRef} type="file" accept="application/json,.json" hidden onChange={importRecipe} />
          </div>
        </details>
      </>
    );
  }

  function renderInspector() {
    if (panel === 'geometry') return renderGeometryPanel();
    if (panel === 'local') return renderLocalPanel();
    if (panel === 'retouch') return renderRetouchPanel();
    if (panel === 'inspect') return renderInspectPanel();
    return renderEditPanel();
  }

  const naturalDimensions = source ? photoNaturalDimensions(source, recipe) : null;

  return (
    <div className="photo-studio">
      <header className="photo-command-bar" aria-label="Photo Studio commands">
        <label className="photo-open-label">
          Open photo
          <input
            ref={fileInputRef}
            data-testid="photo-file-input"
            type="file"
            accept="image/jpeg,image/png,image/webp,image/*"
            onChange={(event) => event.target.files && void openPhoto(event.target.files)}
          />
        </label>
        <button type="button" onClick={undo} disabled={!history.past.length} aria-label="Undo">Undo</button>
        <button type="button" onClick={redo} disabled={!history.future.length} aria-label="Redo">Redo</button>
        <button
          type="button"
          data-testid="photo-compare"
          aria-label="Before/after"
          aria-pressed={compare}
          onClick={() => setCompare((value) => !value)}
          disabled={!source}
        >Before/after</button>
        <button type="button" onClick={resetAll} disabled={!source}>Reset edits</button>
        <span className="photo-spacer" />
        <span className="photo-feature-count">50+ reversible image controls</span>
        <button type="button" onClick={() => setExportOpen(true)} disabled={!source} aria-label="Export">Export</button>
      </header>

      <div className="photo-workbench">
        <nav className="photo-tool-tabs" aria-label="Photo editing sections">
          {([
            ['edit', 'Edit'],
            ['geometry', 'Crop & geometry'],
            ['local', 'Local adjustments'],
            ['retouch', 'Retouch'],
            ['inspect', 'Inspect & workflow'],
          ] as Array<[InspectorPanel, string]>).map(([id, label]) => (
            <button type="button" key={id} aria-pressed={panel === id} onClick={() => setPanel(id)}>{label}</button>
          ))}
        </nav>

        <PhotoCanvas
          previewUrl={preview?.url ?? null}
          originalUrl={source?.originalUrl ?? null}
          compare={compare}
          zoom={zoom}
          sourceName={source?.name}
          histogram={preview?.result.histogram ?? null}
          busy={previewBusy}
          onZoomChange={setZoom}
        />

        <aside className="photo-inspector" aria-label="Photo controls">
          {renderInspector()}
        </aside>
      </div>

      <footer className="photo-status-strip" aria-live="polite">
        {source ? <strong>{source.name}</strong> : <strong>No photo open</strong>}
        {source ? <span data-testid="photo-source-dimensions">{source.width} × {source.height}</span> : null}
        {naturalDimensions ? <span>Edited frame {naturalDimensions.width} × {naturalDimensions.height}</span> : null}
        <span>Zoom {Math.round(zoom * 100)}%</span>
        <span className="photo-status-message">{status}</span>
      </footer>

      {exportOpen && source ? (
        <div className="photo-dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setExportOpen(false); }}>
          <section className="photo-dialog" role="dialog" aria-modal="true" aria-labelledby="photo-export-title">
            <header className="photo-dialog-header">
              <div>
                <h2 id="photo-export-title">Export photo</h2>
                <p>Render a new copy from the current recipe and choose exactly which descriptive metadata travels with it.</p>
              </div>
              <button type="button" onClick={() => setExportOpen(false)} aria-label="Close export dialog">Close</button>
            </header>

            <div className="photo-export-grid">
              <label>File format
                <select aria-label="File format" value={outputMime} onChange={(event) => setOutputMime(event.target.value as PhotoOutputMime)}>
                  <option value="image/jpeg" disabled={!encoderSupport['image/jpeg']}>JPEG{!encoderSupport['image/jpeg'] ? ' — unsupported' : ''}</option>
                  <option value="image/png" disabled={!encoderSupport['image/png']}>PNG{!encoderSupport['image/png'] ? ' — unsupported' : ''}</option>
                  <option value="image/webp" disabled={!encoderSupport['image/webp']}>WebP{!encoderSupport['image/webp'] ? ' — unsupported' : ''}</option>
                </select>
              </label>
              <label>Quality
                <input type="number" min={1} max={100} step={1} value={Math.round(quality * 100)} disabled={outputMime === 'image/png'} onChange={(event) => setQuality(Math.min(1, Math.max(0.01, readNumber(event.target.value, 92) / 100)))} />
              </label>
              <label>Resize
                <select value={resizeMode} onChange={(event) => setResizeMode(event.target.value as ResizeMode)}>
                  <option value="original">Edited dimensions</option>
                  <option value="percent">Percentage</option>
                  <option value="width">Exact width</option>
                  <option value="height">Exact height</option>
                </select>
              </label>
              {resizeMode !== 'original' ? (
                <label>{resizeMode === 'percent' ? 'Percent' : resizeMode === 'width' ? 'Width in pixels' : 'Height in pixels'}
                  <input type="number" min={1} max={resizeMode === 'percent' ? 400 : 50000} value={resizeValue} onChange={(event) => setResizeValue(Math.max(1, readNumber(event.target.value, 100)))} />
                </label>
              ) : <div />}
              {outputMime === 'image/jpeg' ? (
                <label>Transparent-area background
                  <input type="color" value={jpegBackground} onChange={(event) => setJpegBackground(event.target.value)} />
                </label>
              ) : null}
              <label>Metadata policy
                <select aria-label="Metadata policy" value={metadataPolicy} onChange={(event) => setMetadataPolicy(event.target.value as MetadataPolicy)}>
                  <option value="strip">Strip metadata</option>
                  <option value="rights">Descriptive + rights only</option>
                  <option value="custom">Custom reviewed metadata</option>
                </select>
              </label>
            </div>

            {metadataPolicy !== 'strip' ? (
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
                {metadataPolicy === 'custom' ? (
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
            ) : (
              <p className="photo-export-note">The rendered image contains new pixels only. Source camera and location metadata is not copied automatically.</p>
            )}

            <p className="photo-export-note">XMP sidecar export preserves the reviewed metadata independently of browser image-encoder limitations. Pixel export remains available even if metadata serialization fails.</p>
            <div className="photo-dialog-actions">
              <button type="button" onClick={downloadXmp}>Download XMP sidecar</button>
              <button type="button" onClick={() => void exportPhoto()} disabled={exportBusy}>{exportBusy ? 'Rendering…' : 'Download photo'}</button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}

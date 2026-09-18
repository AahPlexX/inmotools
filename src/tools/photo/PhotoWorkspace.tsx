import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent as ReactDragEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import { downloadBlob } from '../../lib/download';
import PhotoCanvas, { type PhotoCanvasGesture, type PhotoCanvasInteraction } from './PhotoCanvas';
import type { PhotoCompositionOverlay } from './PhotoCropOverlay';
import PhotoExportDialog from './PhotoExportDialog';
import PhotoToneCurveControl from './PhotoToneCurveControl';
import PhotoRawControls from './PhotoRawControls';
import { suggestAutoTone, suggestAutoWhiteBalance } from './photo-analysis';
import {
  DEFAULT_RECIPE,
  commitHistory,
  createHistory,
  normalizeRecipe,
  redoHistory,
  undoHistory,
} from './photo-engine';
import { photoNaturalDimensions } from './photo-export-dimensions';
import { applyLocalGesture, placeRetouchPoint } from './photo-interaction';
import {
  MAX_CUBE_FILE_BYTES,
  parseCubeLut,
  serializeCubeLut,
  suggestPhotoLutFilename,
} from './photo-lut';
import {
  MAX_ICC_PROFILE_BYTES,
  parsePhotoIccProfile,
} from './color/photo-color-management';
import {
  PHOTO_FILE_ACCEPT,
  isPhotoImportFile,
  normalizePhotoImport,
  preparePhotoRaster,
  photoImportErrorMessage,
  readPhotoClipboard,
  type PhotoImportCandidate,
  type PhotoImportSource,
} from './photo-import';
import {
  createBrowserPhotoProjectStore,
  inspectPhotoStorage,
  photoProjectErrorMessage,
  requestPhotoStoragePersistence,
  type PhotoProjectStore,
} from './photo-project-store';
import {
  parsePhotoPreset,
  serializePhotoPreset,
  suggestPhotoPresetFilename,
} from './photo-preset-transfer';
import {
  appendPhotoSelection,
  clonePhotoSelection,
  normalizePhotoSelection,
  photoSelectionMask,
} from './photo-selection';
import {
  clonePhotoMask,
  combinePhotoMasks,
  normalizePhotoMaskOverlay,
} from './photo-mask';
import type {
  LoadedPhotoProject,
  PhotoProjectRecord,
  PhotoStorageStatus,
  PhotoUserPresetRecord,
} from './photo-project-types';
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
  PhotoColorManagement,
  PhotoHistogram,
  PhotoHistory,
  PhotoRecipe,
  PhotoRawSource,
  PhotoSelectionCombineMode,
  PhotoSelectionSource,
  PhotoSnapshot,
  RetouchOperation,
  TonePoint,
} from './photo-types';
import './photo.css';

type InspectorPanel = 'edit' | 'geometry' | 'local' | 'retouch' | 'inspect';
type ToneCurveChannel = 'master' | 'red' | 'green' | 'blue';
type MixerOutputChannel = 'red' | 'green' | 'blue';

interface SourcePhoto {
  file: File;
  name: string;
  originalUrl: string;
  width: number;
  height: number;
  codecNotice?: string;
  rawSource?: PhotoRawSource;
}

interface PreviewState {
  url: string;
  proofBaseUrl?: string;
  result: PhotoRenderResult;
}

interface AdjustmentSpec {
  key: keyof Pick<PhotoRecipe,
    'exposure' | 'contrast' | 'highlights' | 'shadows' | 'whites' | 'blacks' | 'midtone'
    | 'temperature' | 'tint' | 'saturation' | 'vibrance' | 'dehaze'
    | 'texture' | 'clarity' | 'sharpenAmount' | 'sharpenRadius' | 'sharpenThreshold'
    | 'denoiseLuminance' | 'denoiseChroma' | 'chromaticAberration'
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

const DETAIL_CONTROLS: AdjustmentSpec[] = [
  { key: 'texture', label: 'Texture', min: -1, max: 1, step: 0.02 },
  { key: 'clarity', label: 'Clarity', min: -1, max: 1, step: 0.02 },
  { key: 'sharpenAmount', label: 'Sharpen amount', min: 0, max: 2, step: 0.02 },
  { key: 'sharpenRadius', label: 'Sharpen radius', min: 0.1, max: 5, step: 0.1, neutral: 1 },
  { key: 'sharpenThreshold', label: 'Sharpen threshold', min: 0, max: 1, step: 0.01 },
  { key: 'denoiseLuminance', label: 'Luminance denoise', min: 0, max: 1, step: 0.02 },
  { key: 'denoiseChroma', label: 'Color denoise', min: 0, max: 1, step: 0.02 },
  { key: 'chromaticAberration', label: 'Chromatic edge correction', min: -1, max: 1, step: 0.02 },
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

const PROJECT_AUTOSAVE_DEBOUNCE_MS = 800;

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function readNumber(value: string, fallback: number): number {
  if (value.trim() === '') return fallback;
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
  onReset,
}: {
  spec: AdjustmentSpec;
  value: number;
  onChange: (value: number) => void;
  onReset?: () => void;
}) {
  const neutral = spec.neutral ?? 0;
  return (
    <label className="photo-control">
      <span className="photo-inline-actions">
        <span>{spec.label}</span>
        {onReset ? (
          <button
            type="button"
            aria-label={`Reset ${spec.label}`}
            disabled={Math.abs(value - neutral) < 1e-9}
            onClick={(event) => {
              event.preventDefault();
              onReset();
            }}
          >Reset</button>
        ) : null}
      </span>
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
  neutral = 0,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  neutral?: number;
  onChange: (value: number) => void;
}) {
  return (
    <AdjustmentControl
      spec={{ key: 'exposure', label, min, max, step, neutral }}
      value={value}
      onChange={onChange}
      onReset={() => onChange(neutral)}
    />
  );
}

function recipeWithPatch(recipe: PhotoRecipe, patch: Partial<PhotoRecipe>): PhotoRecipe {
  return normalizeRecipe({ ...recipe, ...patch });
}

function cloneLocalAdjustment(adjustment: LocalAdjustment): LocalAdjustment {
  return {
    ...adjustment,
    mask: clonePhotoMask(adjustment.mask),
    effect: { ...adjustment.effect },
    overlay: normalizePhotoMaskOverlay(adjustment.overlay),
  };
}

export default function PhotoWorkspace() {
  const [source, setSource] = useState<SourcePhoto | null>(null);
  const [history, setHistory] = useState<PhotoHistory>(() => createHistory(DEFAULT_RECIPE));
  const [panel, setPanel] = useState<InspectorPanel>('edit');
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const [embeddedPreview, setEmbeddedPreview] = useState<{ url: string; name: string } | null>(null);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [autoAnalysisBusy, setAutoAnalysisBusy] = useState<'tone' | 'white-balance' | null>(null);
  const [compare, setCompare] = useState(false);
  const [zoom, setZoom] = useState(0.75);
  const [status, setStatus] = useState('Open a photo to begin editing locally.');
  const [capabilities, setCapabilities] = useState<PhotoCapabilities | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [snapshots, setSnapshots] = useState<PhotoSnapshot[]>([]);
  const [snapshotName, setSnapshotName] = useState('');
  const [editClipboard, setEditClipboard] = useState<PhotoRecipe | null>(null);
  const [photoDragActive, setPhotoDragActive] = useState(false);
  const [customRatioWidth, setCustomRatioWidth] = useState('5');
  const [customRatioHeight, setCustomRatioHeight] = useState('4');
  const [toneCurveChannel, setToneCurveChannel] = useState<ToneCurveChannel>('master');
  const [mixerOutputChannel, setMixerOutputChannel] = useState<MixerOutputChannel>('red');
  const [canvasInteraction, setCanvasInteraction] = useState<PhotoCanvasInteraction | null>(null);
  const [selectionCombineMode, setSelectionCombineMode] = useState<PhotoSelectionCombineMode>('replace');
  const [selectionColorTolerance, setSelectionColorTolerance] = useState(0.12);
  const [selectionLuminanceMin, setSelectionLuminanceMin] = useState(0.2);
  const [selectionLuminanceMax, setSelectionLuminanceMax] = useState(0.8);
  const [geometryInteraction, setGeometryInteraction] = useState<'crop' | 'straighten' | null>(null);
  const [compositionOverlay, setCompositionOverlay] = useState<PhotoCompositionOverlay>('thirds');
  const [gridDivisions, setGridDivisions] = useState(4);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [projectName, setProjectName] = useState('');
  const [projectCreatedAt, setProjectCreatedAt] = useState(0);
  const [localProjects, setLocalProjects] = useState<PhotoProjectRecord[]>([]);
  const [userPresets, setUserPresets] = useState<PhotoUserPresetRecord[]>([]);
  const [userPresetName, setUserPresetName] = useState('');
  const [editingUserPresetId, setEditingUserPresetId] = useState<string | null>(null);
  const [userPresetBusy, setUserPresetBusy] = useState(false);
  const [projectBeingDeletedId, setProjectBeingDeletedId] = useState<string | null>(null);
  const [recoveryProject, setRecoveryProject] = useState<PhotoProjectRecord | null>(null);
  const [projectSaveState, setProjectSaveState] = useState<'checking' | 'unavailable' | 'unsaved' | 'saving' | 'saved' | 'error'>('checking');
  const [lastProjectSavedAt, setLastProjectSavedAt] = useState<number | null>(null);
  const [autosaveEnabled, setAutosaveEnabled] = useState(true);
  const [projectStoreReady, setProjectStoreReady] = useState(false);
  const [storageStatus, setStorageStatus] = useState<PhotoStorageStatus | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const recipeInputRef = useRef<HTMLInputElement | null>(null);
  const lutInputRef = useRef<HTMLInputElement | null>(null);
  const assignedProfileInputRef = useRef<HTMLInputElement | null>(null);
  const outputProfileInputRef = useRef<HTMLInputElement | null>(null);
  const proofProfileInputRef = useRef<HTMLInputElement | null>(null);
  const userPresetInputRef = useRef<HTMLInputElement | null>(null);
  const renderRevisionRef = useRef(0);
  const previewUrlRef = useRef<string | null>(null);
  const proofBaseUrlRef = useRef<string | null>(null);
  const sourceUrlRef = useRef<string | null>(null);
  const embeddedPreviewUrlRef = useRef<string | null>(null);
  const sourceRef = useRef<SourcePhoto | null>(null);
  const importRevisionRef = useRef(0);
  const projectStoreRef = useRef<PhotoProjectStore | null>(null);
  const projectSaveRevisionRef = useRef(0);
  const projectSaveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const projectBeingDeletedRef = useRef<string | null>(null);
  const userPresetMutationRef = useRef(false);
  const autoAnalysisRevisionRef = useRef(0);
  const analysisHistogramCacheRef = useRef<{ file: File; histogram: PhotoHistogram } | null>(null);

  const recipe = history.present;
  const recipeRef = useRef(recipe);
  recipeRef.current = recipe;
  const parsedCustomRatioWidth = Number(customRatioWidth);
  const parsedCustomRatioHeight = Number(customRatioHeight);
  const customRatioIsValid = Number.isFinite(parsedCustomRatioWidth)
    && Number.isFinite(parsedCustomRatioHeight)
    && parsedCustomRatioWidth > 0
    && parsedCustomRatioHeight > 0;
  const directClipboardAvailable = typeof navigator !== 'undefined'
    && typeof navigator.clipboard?.read === 'function';

  useEffect(() => {
    setGeometryInteraction(null);
  }, [source?.originalUrl]);

  useEffect(() => {
    autoAnalysisRevisionRef.current += 1;
    analysisHistogramCacheRef.current = null;
    setAutoAnalysisBusy(null);
  }, [source?.file]);

  const refreshLocalProjects = useCallback(async (store = projectStoreRef.current) => {
    if (!store) return;
    setLocalProjects(await store.list());
  }, []);

  const refreshUserPresets = useCallback(async (store = projectStoreRef.current) => {
    if (!store) return;
    setUserPresets(await store.listPresets());
  }, []);

  const refreshStorageStatus = useCallback(() => {
    void inspectPhotoStorage().then((value) => {
      setStorageStatus({
        ...value,
        opfsAvailable: projectStoreRef.current?.opfsAvailable ?? false,
      });
    }).catch(() => undefined);
  }, []);

  const releasePreviewUrl = useCallback(() => {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    if (proofBaseUrlRef.current) URL.revokeObjectURL(proofBaseUrlRef.current);
    previewUrlRef.current = null;
    proofBaseUrlRef.current = null;
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

  const releaseEmbeddedPreview = useCallback((updateState = true) => {
    if (embeddedPreviewUrlRef.current) URL.revokeObjectURL(embeddedPreviewUrlRef.current);
    embeddedPreviewUrlRef.current = null;
    if (updateState) setEmbeddedPreview(null);
  }, []);

  const beginImport = useCallback(() => {
    releaseEmbeddedPreview();
    return ++importRevisionRef.current;
  }, [releaseEmbeddedPreview]);

  const receiveEmbeddedPreview = useCallback((blob: Blob, name: string, revision: number) => {
    if (revision !== importRevisionRef.current) return;
    releaseEmbeddedPreview();
    const url = URL.createObjectURL(blob);
    embeddedPreviewUrlRef.current = url;
    setEmbeddedPreview({ url, name });
  }, [releaseEmbeddedPreview]);

  useEffect(() => {
    let active = true;
    void createBrowserPhotoProjectStore().then(async (store) => {
      if (!active) return;
      projectStoreRef.current = store;
      const [projects, presets] = await Promise.all([store.list(), store.listPresets()]);
      if (!active) return;
      setLocalProjects(projects);
      setUserPresets(presets);
      setStorageStatus({ ...(await inspectPhotoStorage()), opfsAvailable: store.opfsAvailable });
      if (!active) return;
      setProjectStoreReady(true);
      if (projects[0] && !sourceRef.current) setRecoveryProject(projects[0]);
      void store.cleanup().then(refreshStorageStatus).catch(() => undefined);
    }).catch((error) => {
      if (!active) return;
      projectStoreRef.current = null;
      setProjectStoreReady(false);
      setProjectSaveState('unavailable');
      setStatus(photoProjectErrorMessage(error));
      refreshStorageStatus();
    });
    return () => { active = false; };
  }, [refreshStorageStatus]);

  useEffect(() => () => {
    importRevisionRef.current += 1;
    renderRevisionRef.current += 1;
    autoAnalysisRevisionRef.current += 1;
    releasePreviewUrl();
    releaseSourceUrl();
    releaseEmbeddedPreview(false);
    disposePhotoRenderer();
  }, [releasePreviewUrl, releaseSourceUrl, releaseEmbeddedPreview]);

  useEffect(() => {
    if (!source) {
      setPreview(null);
      setPreviewBusy(false);
      releasePreviewUrl();
      return;
    }
    const revision = ++renderRevisionRef.current;
    const importRevisionAtStart = importRevisionRef.current;
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
        const proofBaseUrl = result.proofBaseBlob ? URL.createObjectURL(result.proofBaseBlob) : undefined;
        previewUrlRef.current = url;
        proofBaseUrlRef.current = proofBaseUrl ?? null;
        setPreview({ url, proofBaseUrl, result });
        setPreviewBusy(false);
        if (importRevisionAtStart === importRevisionRef.current) {
          if (result.scaledForSafety) {
            setStatus(`Preview rendered at ${result.width} × ${result.height} for responsive editing; full export remains available within device limits.`);
          } else {
            const gamut = result.gamutWarningPixels > 0 ? ` · ${result.gamutWarningPixels.toLocaleString()} out-of-gamut pixels marked` : '';
            setStatus(`Preview updated · ${result.width} × ${result.height}${gamut}`);
          }
        }
      }).catch((error) => {
        if (cancelled || revision !== renderRevisionRef.current) return;
        setPreviewBusy(false);
        if (importRevisionAtStart === importRevisionRef.current) {
          setStatus(`Preview failed: ${error instanceof Error ? error.message : 'unknown rendering error'}`);
        }
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

  async function applyAutomaticSuggestion(kind: 'tone' | 'white-balance') {
    if (!source || autoAnalysisBusy) return;
    const sourceAtStart = source;
    const recipeAtStart = recipeRef.current;
    const requestRevision = ++autoAnalysisRevisionRef.current;
    setAutoAnalysisBusy(kind);
    setStatus(kind === 'tone' ? 'Analyzing the neutral source for automatic tone…' : 'Analyzing the neutral source for automatic white balance…');

    try {
      let histogram = analysisHistogramCacheRef.current?.file === sourceAtStart.file
        ? analysisHistogramCacheRef.current.histogram
        : null;
      if (!histogram) {
        const result = await renderPhoto({
          file: sourceAtStart.file,
          recipe: DEFAULT_RECIPE,
          revision: requestRevision,
          mode: 'preview',
          outputMime: 'image/png',
        });
        if (requestRevision !== autoAnalysisRevisionRef.current || sourceRef.current?.file !== sourceAtStart.file) return;
        histogram = result.histogram;
        analysisHistogramCacheRef.current = { file: sourceAtStart.file, histogram };
      }

      if (requestRevision !== autoAnalysisRevisionRef.current || sourceRef.current?.file !== sourceAtStart.file) return;
      if (recipeRef.current !== recipeAtStart) {
        setStatus('Automatic suggestion was not applied because the edit recipe changed during analysis.');
        return;
      }

      if (kind === 'tone') {
        const suggestion = suggestAutoTone(histogram);
        patchRecipe(suggestion);
        setStatus(`Auto tone applied · exposure ${suggestion.exposure.toFixed(2)} EV · contrast ${suggestion.contrast.toFixed(2)}. All values remain editable.`);
      } else {
        const suggestion = suggestAutoWhiteBalance(histogram);
        patchRecipe(suggestion);
        setStatus(`Auto white balance applied · temperature ${suggestion.temperature.toFixed(2)} · tint ${suggestion.tint.toFixed(2)}. Both values remain editable.`);
      }
    } catch (error) {
      if (requestRevision === autoAnalysisRevisionRef.current) {
        setStatus(`Automatic ${kind === 'tone' ? 'tone' : 'white balance'} analysis failed: ${error instanceof Error ? error.message : 'unknown analysis error'}`);
      }
    } finally {
      if (requestRevision === autoAnalysisRevisionRef.current) setAutoAnalysisBusy(null);
    }
  }

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
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || target?.isContentEditable) return;
      event.preventDefault();
      if (event.shiftKey) redo();
      else undo();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [redo, undo]);

  const openStoredProject = useCallback(async (loaded: LoadedPhotoProject, importRevision: number) => {
    let nextSourceUrl: string | null = null;
    try {
      const raster = await preparePhotoRaster(loaded.sourceFile, undefined, (blob) => receiveEmbeddedPreview(blob, loaded.project.source.name, importRevision));
      const bitmap = await createImageBitmap(raster.blob, { imageOrientation: 'from-image' });
      const width = bitmap.width;
      const height = bitmap.height;
      bitmap.close();
      if (importRevision !== importRevisionRef.current) return false;
      nextSourceUrl = URL.createObjectURL(raster.blob);
      releaseSourceUrl();
      releasePreviewUrl();
      setPreview(null);
      sourceUrlRef.current = nextSourceUrl;
      const recoveredSource = { file: loaded.sourceFile, name: loaded.project.source.name, originalUrl: nextSourceUrl, width, height, codecNotice: raster.notice, rawSource: raster.rawSource };
      sourceRef.current = recoveredSource;
      setSource(recoveredSource);
      nextSourceUrl = null;
      setHistory(loaded.project.history);
      setSnapshots(loaded.project.snapshots);
      setSnapshotName('');
      setProjectId(loaded.project.id);
      setProjectName(loaded.project.name);
      setProjectCreatedAt(loaded.project.createdAt);
      setLastProjectSavedAt(loaded.project.updatedAt);
      setAutosaveEnabled(true);
      setProjectSaveState('saved');
      setRecoveryProject(null);
      setCompare(false);
      setCanvasInteraction(null);
      setStatus(`${loaded.project.name} recovered locally.`);
      return true;
    } catch (error) {
      if (nextSourceUrl) URL.revokeObjectURL(nextSourceUrl);
      if (importRevision === importRevisionRef.current) {
        setStatus(`Could not recover that project: ${error instanceof Error ? error.message : 'unsupported image data'}`);
      }
      return false;
    } finally {
      if (importRevision === importRevisionRef.current) releaseEmbeddedPreview();
    }
  }, [releasePreviewUrl, releaseSourceUrl, receiveEmbeddedPreview, releaseEmbeddedPreview]);

  async function loadLocalProject(id: string, nextPanel: InspectorPanel = 'inspect') {
    const store = projectStoreRef.current;
    if (!store) return;
    const importRevision = beginImport();
    try {
      const loaded = await store.load(id);
      if (importRevision !== importRevisionRef.current) return;
      const opened = await openStoredProject(loaded, importRevision);
      if (opened && importRevision === importRevisionRef.current) setPanel(nextPanel);
    } catch (error) {
      if (importRevision === importRevisionRef.current) setStatus(photoProjectErrorMessage(error));
    }
  }

  async function deleteLocalProject(project: PhotoProjectRecord) {
    const store = projectStoreRef.current;
    if (!store || projectBeingDeletedRef.current) return;
    projectBeingDeletedRef.current = project.id;
    setProjectBeingDeletedId(project.id);
    const deletionRevision = beginImport();
    const deletingCurrentProject = projectId === project.id;
    if (deletingCurrentProject) {
      setAutosaveEnabled(false);
      projectSaveRevisionRef.current += 1;
    }
    try {
      const deletion = projectSaveQueueRef.current
        .catch(() => undefined)
        .then(() => store.delete(project.id));
      projectSaveQueueRef.current = deletion.catch(() => undefined);
      await deletion;
      if (deletionRevision === importRevisionRef.current) {
        if (recoveryProject?.id === project.id) setRecoveryProject(null);
        if (deletingCurrentProject) {
          const createdAt = Date.now();
          setProjectId(crypto.randomUUID?.() ?? `photo-project-${createdAt}`);
          setProjectCreatedAt(createdAt);
          setLastProjectSavedAt(null);
          setProjectSaveState('unsaved');
        }
      }
      await refreshLocalProjects(store);
      refreshStorageStatus();
      if (deletionRevision === importRevisionRef.current) {
        setStatus(`${project.name} deleted from local browser storage.`);
      }
    } catch (error) {
      if (deletionRevision === importRevisionRef.current) {
        if (deletingCurrentProject) {
          setAutosaveEnabled(true);
          setProjectSaveState('error');
        }
        setStatus(photoProjectErrorMessage(error));
      }
    } finally {
      projectBeingDeletedRef.current = null;
      setProjectBeingDeletedId(null);
    }
  }

  async function createVirtualCopy(project: PhotoProjectRecord) {
    const store = projectStoreRef.current;
    if (!store) return;
    const createdAt = Date.now();
    try {
      const copy = await store.createVirtualCopy(project.id, {
        id: crypto.randomUUID?.() ?? `photo-project-copy-${createdAt}`,
        name: `${project.name} copy`,
        createdAt,
      });
      await refreshLocalProjects(store);
      setStatus(`${copy.name} created without duplicating the source image.`);
    } catch (error) {
      setStatus(photoProjectErrorMessage(error));
    }
  }

  async function requestDurableStorage() {
    const result = await requestPhotoStoragePersistence();
    refreshStorageStatus();
    setStatus(result === true
      ? 'Durable browser storage granted for local projects.'
      : result === false
        ? 'Durable storage was not granted; projects remain best-effort browser storage.'
        : 'This browser does not expose a durable-storage request. Local projects remain best-effort.');
  }

  const openPhoto = useCallback(async (candidate: PhotoImportCandidate, importRevision: number) => {
    const { file } = candidate;
    if (importRevision !== importRevisionRef.current) return;
    let nextSourceUrl: string | null = null;
    try {
      const raster = await preparePhotoRaster(file, undefined, (blob) => receiveEmbeddedPreview(blob, file.name, importRevision));
      const bitmap = await createImageBitmap(raster.blob, { imageOrientation: 'from-image' });
      const width = bitmap.width;
      const height = bitmap.height;
      bitmap.close();
      if (importRevision !== importRevisionRef.current) return;
      nextSourceUrl = URL.createObjectURL(raster.blob);
      if (importRevision !== importRevisionRef.current) {
        URL.revokeObjectURL(nextSourceUrl);
        return;
      }
      releaseSourceUrl();
      releasePreviewUrl();
      setPreview(null);
      sourceUrlRef.current = nextSourceUrl;
      const importedSource = { file, name: file.name, originalUrl: nextSourceUrl, width, height, codecNotice: raster.notice, rawSource: raster.rawSource };
      sourceRef.current = importedSource;
      setSource(importedSource);
      nextSourceUrl = null;
      const createdAt = Date.now();
      setProjectId(crypto.randomUUID?.() ?? `photo-project-${createdAt}`);
      setProjectName(file.name.replace(/\.[^.]+$/, '') || file.name);
      setProjectCreatedAt(createdAt);
      setLastProjectSavedAt(null);
      setAutosaveEnabled(true);
      setProjectSaveState(projectStoreRef.current ? 'unsaved' : 'checking');
      setRecoveryProject(null);
      setHistory(createHistory(DEFAULT_RECIPE));
      setSnapshots([]);
      setSnapshotName('');
      setCompare(false);
      setZoom(0.75);
      setCanvasInteraction(null);
      setStatus(`${file.name} opened locally · ${width} × ${height} · ${formatBytes(file.size)}`);
    } catch (error) {
      if (nextSourceUrl) URL.revokeObjectURL(nextSourceUrl);
      if (importRevision === importRevisionRef.current) {
        setStatus(`Could not decode ${file.name}: ${error instanceof Error ? error.message : 'unsupported image data'}`);
      }
    } finally {
      if (importRevision === importRevisionRef.current) releaseEmbeddedPreview();
    }
  }, [releasePreviewUrl, releaseSourceUrl, receiveEmbeddedPreview, releaseEmbeddedPreview]);

  const persistCurrentProject = useCallback((reason: 'auto' | 'manual' = 'auto') => {
    const store = projectStoreRef.current;
    if (!store || !source || !projectId || (reason === 'auto' && !autosaveEnabled)) return Promise.resolve();
    if (projectBeingDeletedRef.current === projectId) return Promise.resolve();
    if (reason === 'manual') setAutosaveEnabled(true);
    const revision = ++projectSaveRevisionRef.current;
    const input = {
      id: projectId,
      name: projectName || source.name.replace(/\.[^.]+$/, '') || source.name,
      createdAt: projectCreatedAt || Date.now(),
      source: {
        name: source.file.name,
        type: source.file.type,
        size: source.file.size,
        lastModified: source.file.lastModified,
        width: source.width,
        height: source.height,
      },
      sourceBlob: source.file,
      history,
      snapshots,
    };
    setProjectSaveState('saving');
    const save = projectSaveQueueRef.current
      .catch(() => undefined)
      .then(() => store.save(input))
      .then(async (saved) => {
        if (revision !== projectSaveRevisionRef.current) return;
        setLastProjectSavedAt(saved.updatedAt);
        setProjectSaveState('saved');
        if (reason === 'manual') setStatus(`${saved.name} saved locally.`);
        await refreshLocalProjects(store);
        refreshStorageStatus();
      })
      .catch((error) => {
        if (revision !== projectSaveRevisionRef.current) return;
        setProjectSaveState('error');
        setStatus(photoProjectErrorMessage(error));
      });
    projectSaveQueueRef.current = save;
    return save;
  }, [autosaveEnabled, history, projectCreatedAt, projectId, projectName, refreshLocalProjects, refreshStorageStatus, snapshots, source]);

  useEffect(() => {
    if (!projectStoreReady) return;
    if (!source || !projectId || !projectStoreRef.current) {
      setProjectSaveState('saved');
      return;
    }
    if (!autosaveEnabled || recoveryProject) return;
    projectSaveRevisionRef.current += 1;
    setProjectSaveState('unsaved');
    const timer = window.setTimeout(() => { void persistCurrentProject(); }, PROJECT_AUTOSAVE_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [autosaveEnabled, persistCurrentProject, projectId, projectStoreReady, recoveryProject, source]);

  const importPhotoFiles = useCallback(async (
    files: Iterable<File> | ArrayLike<File>,
    source: PhotoImportSource,
  ) => {
    const importRevision = beginImport();
    try {
      await openPhoto(normalizePhotoImport(files, source), importRevision);
    } catch (error) {
      if (importRevision === importRevisionRef.current) {
        setStatus(photoImportErrorMessage(error));
      }
    }
  }, [openPhoto, beginImport]);

  async function pastePhotoFromClipboard() {
    const importRevision = beginImport();
    try {
      const candidate = await readPhotoClipboard(navigator.clipboard);
      if (importRevision !== importRevisionRef.current) return;
      await openPhoto(candidate, importRevision);
    } catch (error) {
      if (importRevision === importRevisionRef.current) {
        setStatus(photoImportErrorMessage(error));
      }
    }
  }

  useEffect(() => {
    const handleWindowPaste = (event: ClipboardEvent) => {
      const files = Array.from(event.clipboardData?.files ?? []).filter(isPhotoImportFile);
      if (!files.length) return;
      event.preventDefault();
      void importPhotoFiles(files, 'clipboard');
    };
    window.addEventListener('paste', handleWindowPaste, true);
    return () => window.removeEventListener('paste', handleWindowPaste, true);
  }, [importPhotoFiles]);

  function handlePhotoDrag(event: ReactDragEvent<HTMLDivElement>) {
    if (!Array.from(event.dataTransfer.types).includes('Files')) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
    setPhotoDragActive(true);
  }

  function handlePhotoDragLeave(event: ReactDragEvent<HTMLDivElement>) {
    if (event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget)) return;
    setPhotoDragActive(false);
  }

  function handlePhotoDrop(event: ReactDragEvent<HTMLDivElement>) {
    event.preventDefault();
    setPhotoDragActive(false);
    void importPhotoFiles(event.dataTransfer.files, 'drop');
  }

  function resetAll() {
    if (!source) return;
    setHistory((current) => commitHistory(current, DEFAULT_RECIPE));
    setCanvasInteraction(null);
    setStatus('All editing adjustments reset.');
  }

  function updateToneCurveChannel(points: TonePoint[]) {
    if (toneCurveChannel === 'master') {
      patchRecipe({ toneCurve: points });
      return;
    }
    patchRecipe({
      rgbToneCurves: {
        ...recipe.rgbToneCurves,
        [toneCurveChannel]: points,
      },
    });
  }

  function updateLevels(field: keyof PhotoRecipe['levels'], value: number) {
    patchRecipe({ levels: { ...recipe.levels, [field]: value } });
  }

  function updateChannelMixer(field: keyof PhotoRecipe['channelMixer']['red'], value: number) {
    patchRecipe({
      channelMixer: {
        ...recipe.channelMixer,
        [mixerOutputChannel]: {
          ...recipe.channelMixer[mixerOutputChannel],
          [field]: value,
        },
      },
    });
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

  function applyCustomCropRatio() {
    if (!customRatioIsValid) return;
    applyCropRatio(parsedCustomRatioWidth / parsedCustomRatioHeight);
    setStatus(`Applied custom crop ratio ${customRatioWidth}:${customRatioHeight}.`);
  }

  function localInteraction(adjustment: LocalAdjustment): PhotoCanvasInteraction | null {
    if (adjustment.mask.type === 'radial' || adjustment.mask.type === 'linear' || adjustment.mask.type === 'brush') {
      return {
        kind: 'local',
        id: adjustment.id,
        mode: adjustment.mask.type,
        label: adjustment.mask.type === 'brush' ? `Paint ${adjustment.label}` : `Place ${adjustment.label}`,
      };
    }
    return null;
  }

  function addLocalAdjustment(type: Exclude<LocalAdjustment['mask']['type'], 'selection' | 'composite'>) {
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
            : { type: 'brush', points: [], radius: 0.12, ...base };
    const label = `${type === 'radial' ? 'Radial' : type === 'linear' ? 'Linear' : type === 'luminance' ? 'Luminance range' : type === 'hue' ? 'Hue range' : 'Brush'} adjustment ${index}`;
    const adjustment: LocalAdjustment = {
      id,
      label,
      enabled: true,
      mask,
      effect: { exposure: 0.5, saturation: 0, sharpness: 0, blur: 0 },
      overlay: normalizePhotoMaskOverlay(undefined),
    };
    patchRecipe({ localAdjustments: [...recipe.localAdjustments.map(cloneLocalAdjustment), adjustment] });
    setPanel('local');
    setCanvasInteraction(localInteraction(adjustment));
  }

  function updateLocal(id: string, update: (item: LocalAdjustment) => LocalAdjustment) {
    patchRecipe({
      localAdjustments: recipe.localAdjustments.map((item) => item.id === id ? update(cloneLocalAdjustment(item)) : cloneLocalAdjustment(item)),
    });
  }

  function removeLocal(id: string) {
    patchRecipe({ localAdjustments: recipe.localAdjustments.filter((item) => item.id !== id).map(cloneLocalAdjustment) });
    if (canvasInteraction?.id === id) setCanvasInteraction(null);
  }

  function retouchInteraction(operation: RetouchOperation, placement: 'source' | 'target' = 'target'): PhotoCanvasInteraction {
    if (operation.type === 'red-eye') {
      return { kind: 'retouch', id: operation.id, mode: 'red-eye', label: 'Place red-eye correction' };
    }
    return {
      kind: 'retouch',
      id: operation.id,
      mode: placement === 'source' ? 'retouch-source' : 'retouch-target',
      label: `${placement === 'source' ? 'Set source for' : 'Set target for'} ${operation.type} spot`,
    };
  }

  function addRetouch(type: RetouchOperation['type']) {
    const id = crypto.randomUUID?.() ?? `retouch-${Date.now()}-${recipe.retouch.length}`;
    const operation: RetouchOperation = type === 'red-eye'
      ? { id, type, x: 0.5, y: 0.5, radius: 0.04, strength: 0.8 }
      : type === 'clone'
        ? { id, type, sourceX: 0.38, sourceY: 0.5, targetX: 0.62, targetY: 0.5, radius: 0.06, feather: 0.55, opacity: 1 }
        : { id, type, sourceX: 0.38, sourceY: 0.5, targetX: 0.62, targetY: 0.5, radius: 0.06, feather: 0.75, opacity: 0.8 };
    patchRecipe({ retouch: [...recipe.retouch.map((item) => ({ ...item })), operation] });
    setPanel('retouch');
    setCanvasInteraction(retouchInteraction(operation, operation.type === 'red-eye' ? 'target' : 'source'));
  }

  function updateRetouch(id: string, update: (item: RetouchOperation) => RetouchOperation) {
    patchRecipe({ retouch: recipe.retouch.map((item) => item.id === id ? update({ ...item }) : ({ ...item })) });
  }

  function removeRetouch(id: string) {
    patchRecipe({ retouch: recipe.retouch.filter((item) => item.id !== id).map((item) => ({ ...item })) });
    if (canvasInteraction?.id === id) setCanvasInteraction(null);
  }

  function duplicateLocal(id: string) {
    const index = recipe.localAdjustments.findIndex((item) => item.id === id);
    if (index < 0) return;
    const sourceAdjustment = cloneLocalAdjustment(recipe.localAdjustments[index]);
    const duplicate: LocalAdjustment = {
      ...sourceAdjustment,
      id: crypto.randomUUID?.() ?? `local-copy-${Date.now()}`,
      label: `${sourceAdjustment.label} copy`.slice(0, 80),
    };
    const localAdjustments = recipe.localAdjustments.map(cloneLocalAdjustment);
    localAdjustments.splice(index + 1, 0, duplicate);
    patchRecipe({ localAdjustments });
    setStatus(`${duplicate.label} created as an independent mask.`);
  }

  function combineSelectionIntoLocal(id: string, mode: 'add' | 'subtract' | 'intersect') {
    const selection = clonePhotoSelection(recipe.selection);
    if (!selection) return;
    const localAdjustments = recipe.localAdjustments.map((item) => {
      const copy = cloneLocalAdjustment(item);
      if (copy.id !== id) return copy;
      return {
        ...copy,
        mask: combinePhotoMasks(copy.mask, photoSelectionMask(selection), mode),
        overlay: { ...normalizePhotoMaskOverlay(copy.overlay), visible: true },
      };
    });
    commitRecipe(normalizeRecipe({ ...recipe, selection: null, localAdjustments }));
    setCanvasInteraction(null);
    setStatus(`Selection ${mode === 'add' ? 'added to' : mode === 'subtract' ? 'subtracted from' : 'intersected with'} the local mask as one undo step.`);
  }

  function setSelectionSource(source: PhotoSelectionSource) {
    patchRecipe({ selection: appendPhotoSelection(recipe.selection, source, selectionCombineMode) });
  }

  function startSelection(mode: Extract<PhotoCanvasInteraction['mode'], `selection-${string}`>, label: string) {
    setCanvasInteraction({ kind: 'selection', id: 'active-selection', mode, label });
    setPanel('local');
    setStatus(`${label} on the photo.`);
  }

  function updateSelection(patch: Partial<NonNullable<PhotoRecipe['selection']>>) {
    const selection = clonePhotoSelection(recipe.selection);
    if (!selection) return;
    patchRecipe({ selection: normalizePhotoSelection({ ...selection, ...patch }) });
  }

  function convertSelectionToMask() {
    const selection = clonePhotoSelection(recipe.selection);
    if (!selection) return;
    const adjustment: LocalAdjustment = {
      id: crypto.randomUUID?.() ?? `selection-mask-${Date.now()}`,
      label: `Selection mask ${recipe.localAdjustments.length + 1}`,
      enabled: true,
      mask: photoSelectionMask(selection),
      effect: { exposure: 0.5, saturation: 0, sharpness: 0, blur: 0 },
      overlay: normalizePhotoMaskOverlay(undefined),
    };
    commitRecipe(normalizeRecipe({
      ...recipe,
      selection: null,
      localAdjustments: [...recipe.localAdjustments.map(cloneLocalAdjustment), adjustment],
    }));
    setCanvasInteraction(null);
    setStatus('Selection converted to an editable local mask as one undo step.');
  }

  function handleCanvasGesture(gesture: PhotoCanvasGesture) {
    if (!canvasInteraction) return;
    const interaction = canvasInteraction;
    setHistory((current) => {
      let next: PhotoRecipe;
      if (interaction.kind === 'local') {
        next = applyLocalGesture(current.present, interaction.id, gesture.start, gesture.end, gesture.path);
      } else if (interaction.kind === 'retouch') {
        next = placeRetouchPoint(
          current.present,
          interaction.id,
          gesture.end,
          interaction.mode === 'retouch-source' ? 'source' : 'target',
        );
      } else {
        let source: PhotoSelectionSource | null = null;
        if (interaction.mode === 'selection-rectangle') {
          source = {
            type: 'rectangle',
            x: Math.min(gesture.start.x, gesture.end.x),
            y: Math.min(gesture.start.y, gesture.end.y),
            width: Math.abs(gesture.end.x - gesture.start.x),
            height: Math.abs(gesture.end.y - gesture.start.y),
          };
        } else if (interaction.mode === 'selection-ellipse') {
          source = {
            type: 'ellipse',
            cx: (gesture.start.x + gesture.end.x) / 2,
            cy: (gesture.start.y + gesture.end.y) / 2,
            rx: Math.abs(gesture.end.x - gesture.start.x) / 2,
            ry: Math.abs(gesture.end.y - gesture.start.y) / 2,
          };
        } else if (interaction.mode === 'selection-lasso' && gesture.path.length >= 3) {
          source = { type: 'polygon', points: gesture.path.map(({ x, y }) => ({ x, y })) };
        } else if (interaction.mode === 'selection-color' && gesture.sampledColor) {
          source = { type: 'color', ...gesture.sampledColor, tolerance: selectionColorTolerance };
        }
        next = source
          ? normalizeRecipe({
            ...current.present,
            selection: appendPhotoSelection(current.present.selection, source, selectionCombineMode),
          })
          : current.present;
        if (!source) return current;
      }
      return commitHistory(current, next);
    });

    if (interaction.kind === 'selection') {
      setCanvasInteraction(null);
      setStatus(`${interaction.label} completed as one undo step.`);
      return;
    }

    if (interaction.kind === 'local') {
      if (interaction.mode !== 'brush') setCanvasInteraction(null);
      setStatus(interaction.mode === 'brush' ? 'Brush stroke added as one undo step.' : 'Local mask placed on the photo.');
      return;
    }

    if (interaction.mode === 'retouch-source') {
      const operation = recipe.retouch.find((item) => item.id === interaction.id);
      if (operation && operation.type !== 'red-eye') {
        setCanvasInteraction(retouchInteraction(operation, 'target'));
        setStatus('Source sampled. Now place the target on the photo.');
      }
      return;
    }
    setCanvasInteraction(null);
    setStatus(interaction.mode === 'red-eye' ? 'Red-eye correction placed.' : 'Retouch target placed.');
  }

  function applyPreset(patch: Partial<PhotoRecipe>) {
    commitRecipe(recipeWithPatch(recipe, patch));
  }

  async function saveUserPreset() {
    const store = projectStoreRef.current;
    const name = userPresetName.trim();
    if (!store || !source || !name || userPresetMutationRef.current) return;
    userPresetMutationRef.current = true;
    setUserPresetBusy(true);
    const wasEditing = editingUserPresetId !== null;
    const id = editingUserPresetId
      ?? crypto.randomUUID?.()
      ?? `photo-preset-${Date.now()}`;
    try {
      const saved = await store.savePreset({ id, name, recipe });
      await refreshUserPresets(store);
      setEditingUserPresetId(null);
      setUserPresetName('');
      setStatus(`${saved.name} ${wasEditing ? 'updated' : 'saved'} as a local user preset.`);
    } catch (error) {
      setStatus(photoProjectErrorMessage(error));
    } finally {
      userPresetMutationRef.current = false;
      setUserPresetBusy(false);
    }
  }

  function editUserPreset(preset: PhotoUserPresetRecord) {
    if (userPresetMutationRef.current) return;
    setEditingUserPresetId(preset.id);
    setUserPresetName(preset.name);
    commitRecipe(preset.recipe);
    setCanvasInteraction(null);
    setStatus(`${preset.name} loaded for editing. Adjust the photo, then update the preset.`);
  }

  function applyUserPreset(preset: PhotoUserPresetRecord) {
    if (!source) return;
    commitRecipe(preset.recipe);
    setCanvasInteraction(null);
    setStatus(`${preset.name} applied as one undo step.`);
  }

  function exportUserPreset(preset: PhotoUserPresetRecord) {
    const blob = new Blob([serializePhotoPreset(preset.name, preset.recipe)], { type: 'application/json' });
    downloadBlob(blob, suggestPhotoPresetFilename(preset.name));
    setStatus(`${preset.name} exported.`);
  }

  async function deleteUserPreset(preset: PhotoUserPresetRecord) {
    const store = projectStoreRef.current;
    if (!store || userPresetMutationRef.current) return;
    userPresetMutationRef.current = true;
    setUserPresetBusy(true);
    try {
      await store.deletePreset(preset.id);
      await refreshUserPresets(store);
      if (editingUserPresetId === preset.id) {
        setEditingUserPresetId(null);
        setUserPresetName('');
      }
      setStatus(`${preset.name} deleted from local user presets.`);
    } catch (error) {
      setStatus(photoProjectErrorMessage(error));
    } finally {
      userPresetMutationRef.current = false;
      setUserPresetBusy(false);
    }
  }

  async function importUserPreset(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    const store = projectStoreRef.current;
    if (!file || !store || userPresetMutationRef.current) return;
    userPresetMutationRef.current = true;
    setUserPresetBusy(true);
    try {
      const imported = parsePhotoPreset(await file.text());
      const saved = await store.savePreset({
        id: crypto.randomUUID?.() ?? `photo-preset-${Date.now()}`,
        name: imported.name,
        recipe: imported.recipe,
      });
      await refreshUserPresets(store);
      setStatus(`${saved.name} imported as a local user preset.`);
    } catch (error) {
      setStatus(`Preset import failed: ${error instanceof Error ? error.message : 'invalid JSON'}`);
    } finally {
      userPresetMutationRef.current = false;
      setUserPresetBusy(false);
    }
  }

  function saveSnapshot() {
    if (!source) return;
    const requestedName = snapshotName.trim();
    const next: PhotoSnapshot = {
      id: crypto.randomUUID?.() ?? `snapshot-${Date.now()}`,
      name: requestedName || `Snapshot ${snapshots.length + 1}`,
      createdAt: new Date().toISOString(),
      recipe: normalizeRecipe(recipe),
    };
    setSnapshots((current) => [...current, next]);
    setSnapshotName('');
    setStatus(`${next.name} saved.`);
  }

  function restoreSnapshot(snapshot: PhotoSnapshot) {
    commitRecipe(snapshot.recipe);
    setCanvasInteraction(null);
    setStatus(`${snapshot.name} restored.`);
  }

  function copyEdits() {
    if (!source) return;
    // Copy is a newer user-visible action than any preview already in flight.
    // Advancing the operation revision keeps an older preview completion from
    // immediately replacing the confirmation message under a busy renderer.
    beginImport();
    setEditClipboard(normalizeRecipe(recipe));
    setCanvasInteraction(null);
    setStatus('Edits copied. Open another photo or paste them here.');
  }

  function pasteEdits() {
    if (!source || !editClipboard) return;
    commitRecipe(editClipboard);
    setCanvasInteraction(null);
    setStatus('Copied edits applied as one undo step.');
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
      setCanvasInteraction(null);
      setStatus(`${file.name} recipe applied.`);
    } catch (error) {
      setStatus(`Recipe import failed: ${error instanceof Error ? error.message : 'invalid JSON'}`);
    }
  }

  async function importLut(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      if (!file.name.toLowerCase().endsWith('.cube')) throw new Error('Choose a .cube 3D LUT file.');
      if (file.size > MAX_CUBE_FILE_BYTES) throw new Error('Cube files must be 16 MiB or smaller.');
      const lut = parseCubeLut(await file.text(), file.name);
      patchRecipe({ lut });
      setStatus(`${file.name} imported · ${lut.size}³ 3D LUT · strength 100%.`);
    } catch (error) {
      setStatus(`LUT import failed: ${error instanceof Error ? error.message : 'invalid Cube file'}`);
    }
  }

  function exportActiveLut() {
    if (!recipe.lut) return;
    const blob = new Blob([serializeCubeLut(recipe.lut)], { type: 'text/plain;charset=utf-8' });
    downloadBlob(blob, suggestPhotoLutFilename(recipe.lut));
    setStatus(`${recipe.lut.title} exported with ${Math.round(recipe.lut.strength * 100)}% strength baked into the Cube grid.`);
  }

  function patchColorManagement(patch: Partial<PhotoColorManagement>) {
    const current = recipe.colorManagement ?? DEFAULT_RECIPE.colorManagement!;
    patchRecipe({ colorManagement: { ...current, ...patch } });
  }

  async function importIccProfile(
    event: ChangeEvent<HTMLInputElement>,
    role: 'assigned' | 'output' | 'proof',
  ) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      if (!/\.(icc|icm)$/i.test(file.name)) throw new Error('Choose an .icc or .icm profile.');
      if (file.size > MAX_ICC_PROFILE_BYTES) throw new Error('ICC profiles must be 2 MiB or smaller.');
      const profile = await parsePhotoIccProfile(file);
      if (role !== 'proof' && profile.colorSpace !== 'RGB') {
        throw new Error(`${role === 'assigned' ? 'Assigned source' : 'Output'} profiles must use RGB because Photo Studio exports RGB pixels.`);
      }
      if (role === 'assigned') patchColorManagement({ assignedProfile: profile });
      else if (role === 'output') patchColorManagement({ outputProfile: profile });
      else patchColorManagement({ proofProfile: profile, softProof: true });
      const action = role === 'assigned' ? 'assigned to source samples' : role === 'output' ? 'selected for output conversion' : 'selected for soft proof';
      setStatus(`${profile.description} (${profile.colorSpace}) ${action}.`);
    } catch (error) {
      setStatus(`ICC profile import failed: ${error instanceof Error ? error.message : 'invalid profile'}`);
    }
  }

  function renderEditPanel() {
    return (
      <>
        <div className="photo-inspector-header">
          <h2>Photo Studio</h2>
          <p>Shape light and color with reversible controls. Nothing touches the original file.</p>
        </div>
        {source?.rawSource ? <PhotoRawControls value={recipe.raw} source={source.rawSource} onChange={(raw) => patchRecipe({ raw })} /> : null}
        <details className="photo-section" open>
          <summary>Light & tone</summary>
          <div className="photo-inline-actions">
            <button
              type="button"
              aria-label="Suggest automatic tone"
              disabled={!source || autoAnalysisBusy !== null}
              onClick={() => void applyAutomaticSuggestion('tone')}
            >{autoAnalysisBusy === 'tone' ? 'Analyzing tone…' : 'Auto tone'}</button>
          </div>
          <p className="photo-export-note">Analyzes the neutral source and writes ordinary visible controls as one undoable edit.</p>
          <div className="photo-control-list">
            {LIGHT_CONTROLS.map((spec) => (
              <AdjustmentControl
                key={spec.key}
                spec={spec}
                value={recipe[spec.key] as number}
                onChange={(value) => patchRecipe({ [spec.key]: value } as Partial<PhotoRecipe>)}
                onReset={() => patchRecipe({ [spec.key]: spec.neutral ?? 0 } as Partial<PhotoRecipe>)}
              />
            ))}
          </div>
        </details>
        <details className="photo-section">
          <summary>Tone curve</summary>
          <label className="photo-control photo-select-control">
            <span>Curve channel</span>
            <select
              aria-label="Curve channel"
              value={toneCurveChannel}
              onChange={(event) => setToneCurveChannel(event.target.value as ToneCurveChannel)}
            >
              <option value="master">Master RGB</option>
              <option value="red">Red</option>
              <option value="green">Green</option>
              <option value="blue">Blue</option>
            </select>
          </label>
          <PhotoToneCurveControl
            points={toneCurveChannel === 'master' ? recipe.toneCurve : recipe.rgbToneCurves[toneCurveChannel]}
            title={toneCurveChannel === 'master' ? 'Tone curve' : `${toneCurveChannel[0].toUpperCase()}${toneCurveChannel.slice(1)} curve`}
            description={toneCurveChannel === 'master' ? 'Input → output RGB tone' : `Input → output ${toneCurveChannel} channel`}
            ariaPrefix={toneCurveChannel === 'master' ? 'Tone' : `${toneCurveChannel[0].toUpperCase()}${toneCurveChannel.slice(1)} curve`}
            onChange={updateToneCurveChannel}
          />
        </details>
        <details className="photo-section">
          <summary>Levels</summary>
          <p className="photo-export-note">Set input black/white points, midtone gamma, and output endpoints. Values remain reversible in the edit recipe.</p>
          <div className="photo-control-list">
            <SimpleControl label="Levels black input" value={recipe.levels.inputBlack} min={0} max={0.99} step={0.01} onChange={(value) => updateLevels('inputBlack', value)} />
            <SimpleControl label="Levels gamma" value={recipe.levels.gamma} min={0.1} max={10} step={0.05} neutral={1} onChange={(value) => updateLevels('gamma', value)} />
            <SimpleControl label="Levels white input" value={recipe.levels.inputWhite} min={0.01} max={1} step={0.01} neutral={1} onChange={(value) => updateLevels('inputWhite', value)} />
            <SimpleControl label="Levels black output" value={recipe.levels.outputBlack} min={0} max={1} step={0.01} onChange={(value) => updateLevels('outputBlack', value)} />
            <SimpleControl label="Levels white output" value={recipe.levels.outputWhite} min={0} max={1} step={0.01} neutral={1} onChange={(value) => updateLevels('outputWhite', value)} />
          </div>
        </details>
        <details className="photo-section">
          <summary>Channel mixer</summary>
          <label className="photo-control photo-select-control">
            <span>Output channel</span>
            <select
              aria-label="Mixer output channel"
              value={mixerOutputChannel}
              onChange={(event) => setMixerOutputChannel(event.target.value as MixerOutputChannel)}
            >
              <option value="red">Red output</option>
              <option value="green">Green output</option>
              <option value="blue">Blue output</option>
            </select>
          </label>
          <div className="photo-control-list">
            {(['red', 'green', 'blue'] as const).map((sourceChannel) => (
              <SimpleControl
                key={sourceChannel}
                label={`${mixerOutputChannel[0].toUpperCase()}${mixerOutputChannel.slice(1)} output ${sourceChannel} source`}
                value={recipe.channelMixer[mixerOutputChannel][sourceChannel]}
                min={-2}
                max={2}
                step={0.01}
                neutral={mixerOutputChannel === sourceChannel ? 1 : 0}
                onChange={(value) => updateChannelMixer(sourceChannel, value)}
              />
            ))}
            <SimpleControl
              label={`${mixerOutputChannel[0].toUpperCase()}${mixerOutputChannel.slice(1)} output constant`}
              value={recipe.channelMixer[mixerOutputChannel].constant}
              min={-2}
              max={2}
              step={0.01}
              onChange={(value) => updateChannelMixer('constant', value)}
            />
          </div>
          <p className="photo-export-note">Source total {Math.round((recipe.channelMixer[mixerOutputChannel].red + recipe.channelMixer[mixerOutputChannel].green + recipe.channelMixer[mixerOutputChannel].blue) * 100)}% · negative source values invert that channel before mixing.</p>
        </details>
        <details className="photo-section" data-testid="photo-lut-panel">
          <summary>3D LUT</summary>
          <p className="photo-export-note">Import a common 3D <code>.cube</code> look. The transform is applied locally by the same engine used for preview and full-resolution export.</p>
          <div className="photo-inline-actions">
            <button type="button" onClick={() => lutInputRef.current?.click()}>{recipe.lut ? 'Replace LUT' : 'Import LUT'}</button>
            <input
              ref={lutInputRef}
              data-testid="photo-lut-input"
              type="file"
              accept=".cube,text/plain"
              hidden
              onChange={(event) => void importLut(event)}
            />
            {recipe.lut ? <>
              <button type="button" onClick={exportActiveLut}>Export active LUT</button>
              <button type="button" onClick={() => {
                patchRecipe({ lut: null });
                setStatus('3D LUT removed.');
              }}>Remove LUT</button>
            </> : null}
          </div>
          {recipe.lut ? <div data-testid="photo-active-lut">
            <p><strong>{recipe.lut.title}</strong> · {recipe.lut.size}³ grid · {recipe.lut.fileName}</p>
            <p className="photo-export-note">Input domain {recipe.lut.domainMin.join(', ')} → {recipe.lut.domainMax.join(', ')}.</p>
            <div className="photo-control-list">
              <SimpleControl
                label="LUT strength"
                value={recipe.lut.strength}
                min={0}
                max={1}
                step={0.01}
                neutral={1}
                onChange={(strength) => patchRecipe({ lut: { ...recipe.lut!, strength } })}
              />
            </div>
            <p className="photo-export-note">Export active LUT bakes this strength into a portable Cube grid. Other Photo Studio adjustments are intentionally not included.</p>
          </div> : <p className="photo-export-note">No LUT is active. Cube files with a 2³–65³ 3D grid are supported; 1D and combined files are rejected explicitly.</p>}
        </details>
        <details className="photo-section" data-testid="photo-color-management-panel">
          <summary>ICC color management</summary>
          <p className="photo-export-note">Assign interprets unconverted source RGB numbers before editing. Output conversion preserves the working appearance for export and embeds the selected RGB profile. These are intentionally separate operations.</p>
          <div className="photo-inline-actions">
            <button type="button" onClick={() => assignedProfileInputRef.current?.click()}>{recipe.colorManagement?.assignedProfile ? 'Replace assigned profile' : 'Assign source profile'}</button>
            <input ref={assignedProfileInputRef} data-testid="photo-assigned-profile-input" type="file" accept=".icc,.icm,application/vnd.iccprofile" hidden onChange={(event) => void importIccProfile(event, 'assigned')} />
            {recipe.colorManagement?.assignedProfile ? <button type="button" onClick={() => patchColorManagement({ assignedProfile: null })}>Remove assignment</button> : null}
          </div>
          <p className="photo-export-note" data-testid="photo-assigned-profile">{recipe.colorManagement?.assignedProfile ? `${recipe.colorManagement.assignedProfile.description} · ${recipe.colorManagement.assignedProfile.colorSpace} · assigned before edits` : 'No source profile assigned; browser-decoded sRGB working values are used.'}</p>
          <div className="photo-inline-actions">
            <button type="button" onClick={() => outputProfileInputRef.current?.click()}>{recipe.colorManagement?.outputProfile ? 'Replace output profile' : 'Choose output profile'}</button>
            <input ref={outputProfileInputRef} data-testid="photo-output-profile-input" type="file" accept=".icc,.icm,application/vnd.iccprofile" hidden onChange={(event) => void importIccProfile(event, 'output')} />
            {recipe.colorManagement?.outputProfile ? <button type="button" onClick={() => patchColorManagement({ outputProfile: null })}>Use standard sRGB export</button> : null}
          </div>
          <p className="photo-export-note" data-testid="photo-output-profile">{recipe.colorManagement?.outputProfile ? `${recipe.colorManagement.outputProfile.description} · converted and embedded during export` : 'Output remains standard browser sRGB.'}</p>
          <div className="photo-inline-actions">
            <button type="button" onClick={() => proofProfileInputRef.current?.click()}>{recipe.colorManagement?.proofProfile ? 'Replace proof profile' : 'Choose proof profile'}</button>
            <input ref={proofProfileInputRef} data-testid="photo-proof-profile-input" type="file" accept=".icc,.icm,application/vnd.iccprofile" hidden onChange={(event) => void importIccProfile(event, 'proof')} />
            {recipe.colorManagement?.proofProfile ? <button type="button" onClick={() => patchColorManagement({ proofProfile: null, softProof: false, gamutWarning: false })}>Remove proof profile</button> : null}
          </div>
          <p className="photo-export-note">{recipe.colorManagement?.proofProfile ? `${recipe.colorManagement.proofProfile.description} · ${recipe.colorManagement.proofProfile.colorSpace}` : 'No proof profile selected.'}</p>
          <div className="photo-metadata-grid">
            <label>Rendering intent
              <select aria-label="ICC rendering intent" value={recipe.colorManagement?.renderingIntent ?? 'relative-colorimetric'} onChange={(event) => patchColorManagement({ renderingIntent: event.target.value as PhotoColorManagement['renderingIntent'] })}>
                <option value="perceptual">Perceptual</option>
                <option value="relative-colorimetric">Relative colorimetric</option>
                <option value="saturation">Saturation</option>
                <option value="absolute-colorimetric">Absolute colorimetric</option>
              </select>
            </label>
            <label>Proof intent
              <select aria-label="ICC proof intent" value={recipe.colorManagement?.proofIntent ?? 'relative-colorimetric'} disabled={!recipe.colorManagement?.proofProfile} onChange={(event) => patchColorManagement({ proofIntent: event.target.value as PhotoColorManagement['proofIntent'] })}>
                <option value="perceptual">Perceptual</option>
                <option value="relative-colorimetric">Relative colorimetric</option>
                <option value="saturation">Saturation</option>
                <option value="absolute-colorimetric">Absolute colorimetric</option>
              </select>
            </label>
          </div>
          <label className="photo-check-row"><input type="checkbox" checked={recipe.colorManagement?.blackPointCompensation ?? true} onChange={(event) => patchColorManagement({ blackPointCompensation: event.target.checked })} />Black-point compensation</label>
          <label className="photo-check-row"><input type="checkbox" aria-label="Soft proof" checked={recipe.colorManagement?.softProof ?? false} disabled={!recipe.colorManagement?.proofProfile} onChange={(event) => patchColorManagement({ softProof: event.target.checked, gamutWarning: event.target.checked ? recipe.colorManagement?.gamutWarning ?? false : false })} />Soft proof preview</label>
          <label className="photo-check-row"><input type="checkbox" aria-label="Output gamut warning" checked={recipe.colorManagement?.gamutWarning ?? false} disabled={!recipe.colorManagement?.softProof} onChange={(event) => patchColorManagement({ gamutWarning: event.target.checked })} />Mark out-of-gamut proof pixels in magenta</label>
          <p className="photo-export-note">Soft proof and gamut warning affect preview only. They simulate the selected profile through LittleCMS; they do not calibrate or characterize this display.</p>
        </details>
        <details className="photo-section" open>
          <summary>White balance & color</summary>
          <div className="photo-inline-actions">
            <button
              type="button"
              aria-label="Suggest automatic white balance"
              disabled={!source || autoAnalysisBusy !== null}
              onClick={() => void applyAutomaticSuggestion('white-balance')}
            >{autoAnalysisBusy === 'white-balance' ? 'Analyzing white balance…' : 'Auto white balance'}</button>
          </div>
          <p className="photo-export-note">Uses deterministic gray-world analysis of the neutral source; temperature and tint remain editable.</p>
          <div className="photo-control-list">
            {COLOR_CONTROLS.map((spec) => (
              <AdjustmentControl
                key={spec.key}
                spec={spec}
                value={recipe[spec.key] as number}
                onChange={(value) => patchRecipe({ [spec.key]: value } as Partial<PhotoRecipe>)}
                onReset={() => patchRecipe({ [spec.key]: spec.neutral ?? 0 } as Partial<PhotoRecipe>)}
              />
            ))}
          </div>
        </details>
        <details className="photo-section">
          <summary>Detail & noise</summary>
          <div className="photo-control-list">
            {DETAIL_CONTROLS.map((spec) => (
              <AdjustmentControl
                key={spec.key}
                spec={spec}
                value={recipe[spec.key] as number}
                onChange={(value) => patchRecipe({ [spec.key]: value } as Partial<PhotoRecipe>)}
                onReset={() => patchRecipe({ [spec.key]: spec.neutral ?? 0 } as Partial<PhotoRecipe>)}
              />
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
                <SimpleControl key={HSL_LABELS[index]} label={`${HSL_LABELS[index]} mix`} value={value} min={0} max={2} step={0.02} neutral={1} onChange={(next) => updateBwMix(index, next)} />
              ))}
            </div>
          ) : null}
        </details>
        <details className="photo-section">
          <summary>Finishing</summary>
          <div className="photo-control-list">
            {FINISH_CONTROLS.map((spec) => (
              <AdjustmentControl
                key={spec.key}
                spec={spec}
                value={recipe[spec.key] as number}
                onChange={(value) => patchRecipe({ [spec.key]: value } as Partial<PhotoRecipe>)}
                onReset={() => patchRecipe({ [spec.key]: spec.neutral ?? 0 } as Partial<PhotoRecipe>)}
              />
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
          <p>Frame precisely and correct optical or keystone distortion with the same reversible recipe used at export resolution.</p>
        </div>
        <div className="photo-inline-actions" role="group" aria-label="Direct geometry tools">
          <button
            type="button"
            aria-pressed={geometryInteraction === 'crop'}
            disabled={!source}
            onClick={() => {
              setCanvasInteraction(null);
              setGeometryInteraction((current) => current === 'crop' ? null : 'crop');
            }}
          >Edit crop on photo</button>
          <button
            type="button"
            aria-pressed={geometryInteraction === 'straighten'}
            disabled={!source}
            onClick={() => {
              setCanvasInteraction(null);
              setGeometryInteraction((current) => current === 'straighten' ? null : 'straighten');
            }}
          >Straighten on photo</button>
        </div>
        <label className="photo-control photo-composition-control">
          <span>Composition overlay</span>
          <select
            aria-label="Composition overlay"
            value={compositionOverlay}
            onChange={(event) => setCompositionOverlay(event.target.value as PhotoCompositionOverlay)}
          >
            <option value="none">None</option>
            <option value="thirds">Rule of thirds</option>
            <option value="grid">Grid</option>
            <option value="diagonal">Diagonal</option>
            <option value="golden">Golden ratio</option>
          </select>
        </label>
        {compositionOverlay === 'grid' ? (
          <label className="photo-control photo-composition-control">
            <span>Grid divisions</span>
            <select aria-label="Grid divisions" value={gridDivisions} onChange={(event) => setGridDivisions(Number(event.target.value))}>
              {[2, 3, 4, 5, 6, 8, 10].map((value) => <option key={value} value={value}>{value}</option>)}
            </select>
          </label>
        ) : null}
        <div className="photo-inline-actions">
          <button type="button" onClick={() => applyCropRatio(null)}>Original</button>
          <button type="button" onClick={() => applyCropRatio(1)}>1:1</button>
          <button type="button" onClick={() => applyCropRatio(4 / 3)}>4:3</button>
          <button type="button" onClick={() => applyCropRatio(3 / 2)}>3:2</button>
          <button type="button" onClick={() => applyCropRatio(16 / 9)}>16:9</button>
        </div>
        <div className="photo-control-list">
          <label className="photo-control">
            <span>Custom ratio width</span>
            <input
              type="number"
              min="0.01"
              step="0.01"
              value={customRatioWidth}
              aria-label="Custom ratio width"
              aria-invalid={customRatioWidth !== '' && !(Number.isFinite(parsedCustomRatioWidth) && parsedCustomRatioWidth > 0)}
              onChange={(event) => setCustomRatioWidth(event.target.value)}
            />
          </label>
          <label className="photo-control">
            <span>Custom ratio height</span>
            <input
              type="number"
              min="0.01"
              step="0.01"
              value={customRatioHeight}
              aria-label="Custom ratio height"
              aria-invalid={customRatioHeight !== '' && !(Number.isFinite(parsedCustomRatioHeight) && parsedCustomRatioHeight > 0)}
              onChange={(event) => setCustomRatioHeight(event.target.value)}
            />
          </label>
          <div className="photo-inline-actions">
            <button type="button" disabled={!source || !customRatioIsValid} onClick={applyCustomCropRatio}>Apply custom ratio</button>
          </div>
        </div>
        <div className="photo-control-list">
          <SimpleControl label="Crop left percent" value={Math.round(recipe.crop.x * 10000) / 100} min={0} max={99.99} step={0.01} onChange={(value) => cropPercent('x', value)} />
          <SimpleControl label="Crop top percent" value={Math.round(recipe.crop.y * 10000) / 100} min={0} max={99.99} step={0.01} onChange={(value) => cropPercent('y', value)} />
          <SimpleControl label="Crop width percent" value={Math.round(recipe.crop.width * 10000) / 100} min={0.01} max={100} step={0.01} neutral={100} onChange={(value) => cropPercent('width', value)} />
          <SimpleControl label="Crop height percent" value={Math.round(recipe.crop.height * 10000) / 100} min={0.01} max={100} step={0.01} neutral={100} onChange={(value) => cropPercent('height', value)} />
          <SimpleControl label="Straighten degrees" value={recipe.straighten} min={-45} max={45} step={0.1} onChange={(value) => patchRecipe({ straighten: value })} />
          <SimpleControl label="Lens distortion" value={recipe.lensDistortion} min={-1} max={1} step={0.02} onChange={(value) => patchRecipe({ lensDistortion: value })} />
          <SimpleControl label="Horizontal perspective" value={recipe.perspectiveHorizontal} min={-1} max={1} step={0.02} onChange={(value) => patchRecipe({ perspectiveHorizontal: value })} />
          <SimpleControl label="Vertical perspective" value={recipe.perspectiveVertical} min={-1} max={1} step={0.02} onChange={(value) => patchRecipe({ perspectiveVertical: value })} />
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
        <details className="photo-section" open data-testid="photo-selection-controls">
          <summary>Selection</summary>
          <p className="photo-export-note">Build one reversible selection, combine regions, then convert it to an ordinary local mask.</p>
          <label>
            Combine next region
            <select aria-label="Selection combine mode" value={selectionCombineMode} onChange={(event) => setSelectionCombineMode(event.target.value as PhotoSelectionCombineMode)}>
              <option value="replace">Replace</option>
              <option value="add">Add</option>
              <option value="subtract">Subtract</option>
              <option value="intersect">Intersect</option>
            </select>
          </label>
          <div className="photo-inline-actions">
            <button type="button" disabled={!source} aria-pressed={canvasInteraction?.mode === 'selection-rectangle'} onClick={() => startSelection('selection-rectangle', 'Drag a rectangular selection')}>Draw rectangle</button>
            <button type="button" disabled={!source} aria-pressed={canvasInteraction?.mode === 'selection-ellipse'} onClick={() => startSelection('selection-ellipse', 'Drag an elliptical selection')}>Draw ellipse</button>
            <button type="button" disabled={!source} aria-pressed={canvasInteraction?.mode === 'selection-lasso'} onClick={() => startSelection('selection-lasso', 'Trace a lasso selection')}>Trace lasso</button>
            <button type="button" disabled={!source} aria-pressed={canvasInteraction?.mode === 'selection-color'} onClick={() => startSelection('selection-color', 'Sample a selection color')}>Sample color</button>
          </div>
          <div className="photo-inline-actions">
            <button type="button" disabled={!source} onClick={() => setSelectionSource({ type: 'rectangle', x: 0.2, y: 0.2, width: 0.6, height: 0.6 })}>Add centered rectangle</button>
            <button type="button" disabled={!source} onClick={() => setSelectionSource({ type: 'ellipse', cx: 0.5, cy: 0.5, rx: 0.3, ry: 0.3 })}>Add centered ellipse</button>
            <button type="button" disabled={!source} onClick={() => setSelectionSource({ type: 'polygon', points: [{ x: 0.5, y: 0.18 }, { x: 0.82, y: 0.5 }, { x: 0.5, y: 0.82 }, { x: 0.18, y: 0.5 }] })}>Add centered polygon</button>
          </div>
          <SimpleControl label="Color selection tolerance" value={selectionColorTolerance} min={0} max={1} step={0.01} neutral={0.12} onChange={setSelectionColorTolerance} />
          <SimpleControl label="Luminance selection minimum" value={selectionLuminanceMin} min={0} max={1} step={0.01} neutral={0.2} onChange={setSelectionLuminanceMin} />
          <SimpleControl label="Luminance selection maximum" value={selectionLuminanceMax} min={0} max={1} step={0.01} neutral={0.8} onChange={setSelectionLuminanceMax} />
          <button type="button" disabled={!source} onClick={() => setSelectionSource({ type: 'luminance', min: selectionLuminanceMin, max: selectionLuminanceMax })}>Apply luminance selection</button>
          {recipe.selection ? (
            <div data-testid="photo-active-selection">
              <p className="photo-export-note">{recipe.selection.operations.length} combined region{recipe.selection.operations.length === 1 ? '' : 's'}</p>
              <SimpleControl label="Selection feather" value={recipe.selection.feather} min={0} max={0.25} step={0.005} onChange={(feather) => updateSelection({ feather })} />
              <SimpleControl label="Selection grow or shrink" value={recipe.selection.expansion} min={-0.25} max={0.25} step={0.005} onChange={(expansion) => updateSelection({ expansion })} />
              <div className="photo-inline-actions">
                <button type="button" onClick={() => updateSelection({ inverted: !recipe.selection?.inverted })}>{recipe.selection.inverted ? 'Use normal selection' : 'Invert selection'}</button>
                <button type="button" onClick={convertSelectionToMask}>Convert selection to mask</button>
                <button type="button" onClick={() => { patchRecipe({ selection: null }); setCanvasInteraction(null); }}>Clear selection</button>
              </div>
            </div>
          ) : <p className="photo-export-note">No active selection.</p>}
        </details>
        <div className="photo-inline-actions">
          <button type="button" onClick={() => addLocalAdjustment('radial')}>Add radial mask</button>
          <button type="button" onClick={() => addLocalAdjustment('linear')}>Add linear mask</button>
          <button type="button" onClick={() => addLocalAdjustment('brush')}>Add brush mask</button>
          <button type="button" onClick={() => addLocalAdjustment('luminance')}>Add luminance range</button>
          <button type="button" onClick={() => addLocalAdjustment('hue')}>Add hue range</button>
        </div>
        {recipe.localAdjustments.length ? recipe.localAdjustments.map((adjustment) => (
          <article className="photo-local-card" key={adjustment.id} data-testid="photo-local-adjustment">
            <header>
              <strong>{adjustment.label}</strong>
              <label>
                Mask name
                <input
                  type="text"
                  aria-label={`Rename ${adjustment.label}`}
                  defaultValue={adjustment.label}
                  maxLength={80}
                  onKeyDown={inputCommit}
                  onBlur={(event) => {
                    const label = event.currentTarget.value.trim().slice(0, 80) || adjustment.label;
                    event.currentTarget.value = label;
                    if (label !== adjustment.label) updateLocal(adjustment.id, (item) => ({ ...item, label }));
                  }}
                />
              </label>
            </header>
            <label className="photo-check">
              <input type="checkbox" checked={adjustment.enabled} onChange={(event) => updateLocal(adjustment.id, (item) => ({ ...item, enabled: event.target.checked }))} />
              Enabled
            </label>
            <label className="photo-check">
              <input
                type="checkbox"
                checked={normalizePhotoMaskOverlay(adjustment.overlay).visible}
                onChange={(event) => updateLocal(adjustment.id, (item) => ({ ...item, overlay: { ...normalizePhotoMaskOverlay(item.overlay), visible: event.target.checked } }))}
              />
              Show mask overlay
            </label>
            <label>
              Mask overlay color
              <input
                type="color"
                aria-label={`${adjustment.label} overlay color`}
                value={normalizePhotoMaskOverlay(adjustment.overlay).color}
                onChange={(event) => updateLocal(adjustment.id, (item) => ({ ...item, overlay: { ...normalizePhotoMaskOverlay(item.overlay), color: event.target.value } }))}
              />
            </label>
            <SimpleControl label={`${adjustment.label} overlay opacity`} value={normalizePhotoMaskOverlay(adjustment.overlay).opacity} min={0} max={1} step={0.05} neutral={0.35} onChange={(value) => updateLocal(adjustment.id, (item) => ({ ...item, overlay: { ...normalizePhotoMaskOverlay(item.overlay), opacity: value } }))} />
            {localInteraction(adjustment) ? (
              <button
                type="button"
                aria-pressed={canvasInteraction?.kind === 'local' && canvasInteraction.id === adjustment.id}
                onClick={() => setCanvasInteraction(localInteraction(adjustment))}
              >{adjustment.mask.type === 'brush' ? 'Paint on photo' : 'Place on photo'}</button>
            ) : null}
            <SimpleControl label={`${adjustment.label} exposure`} value={adjustment.effect.exposure} min={-4} max={4} step={0.1} onChange={(value) => updateLocal(adjustment.id, (item) => ({ ...item, effect: { ...item.effect, exposure: value } }))} />
            <SimpleControl label={`${adjustment.label} saturation`} value={adjustment.effect.saturation} min={-1} max={1} step={0.02} onChange={(value) => updateLocal(adjustment.id, (item) => ({ ...item, effect: { ...item.effect, saturation: value } }))} />
            <SimpleControl label={`${adjustment.label} sharpness`} value={adjustment.effect.sharpness} min={-1} max={2} step={0.02} onChange={(value) => updateLocal(adjustment.id, (item) => ({ ...item, effect: { ...item.effect, sharpness: value } }))} />
            <SimpleControl label={`${adjustment.label} blur`} value={adjustment.effect.blur} min={0} max={1} step={0.02} onChange={(value) => updateLocal(adjustment.id, (item) => ({ ...item, effect: { ...item.effect, blur: value } }))} />
            <SimpleControl label={`${adjustment.label} opacity`} value={adjustment.mask.opacity} min={0} max={1} step={0.02} neutral={1} onChange={(value) => updateLocal(adjustment.id, (item) => ({ ...item, mask: { ...item.mask, opacity: value } }))} />
            <SimpleControl label={`${adjustment.label} feather`} value={adjustment.mask.feather} min={0} max={adjustment.mask.type === 'selection' ? 0.25 : 1} step={adjustment.mask.type === 'selection' ? 0.005 : 0.02} neutral={adjustment.mask.type === 'selection' ? adjustment.mask.selection.feather : adjustment.mask.type === 'composite' ? 0 : 0.45} onChange={(value) => updateLocal(adjustment.id, (item) => ({ ...item, mask: { ...item.mask, feather: value } }))} />
            {adjustment.mask.type === 'brush' ? (
              <SimpleControl label={`${adjustment.label} brush radius`} value={adjustment.mask.radius} min={0.005} max={0.5} step={0.005} neutral={0.12} onChange={(value) => updateLocal(adjustment.id, (item) => item.mask.type === 'brush' ? ({ ...item, mask: { ...item.mask, radius: value } }) : item)} />
            ) : null}
            {adjustment.mask.type === 'luminance' ? (
              <>
                <SimpleControl label={`${adjustment.label} minimum`} value={adjustment.mask.min} min={0} max={1} step={0.01} neutral={0.2} onChange={(value) => updateLocal(adjustment.id, (item) => item.mask.type === 'luminance' ? ({ ...item, mask: { ...item.mask, min: value } }) : item)} />
                <SimpleControl label={`${adjustment.label} maximum`} value={adjustment.mask.max} min={0} max={1} step={0.01} neutral={0.8} onChange={(value) => updateLocal(adjustment.id, (item) => item.mask.type === 'luminance' ? ({ ...item, mask: { ...item.mask, max: value } }) : item)} />
              </>
            ) : null}
            {adjustment.mask.type === 'hue' ? (
              <>
                <SimpleControl label={`${adjustment.label} hue center`} value={adjustment.mask.center} min={0} max={359} step={1} neutral={30} onChange={(value) => updateLocal(adjustment.id, (item) => item.mask.type === 'hue' ? ({ ...item, mask: { ...item.mask, center: value } }) : item)} />
                <SimpleControl label={`${adjustment.label} hue range`} value={adjustment.mask.range} min={0} max={180} step={1} neutral={35} onChange={(value) => updateLocal(adjustment.id, (item) => item.mask.type === 'hue' ? ({ ...item, mask: { ...item.mask, range: value } }) : item)} />
              </>
            ) : null}
            <div className="photo-inline-actions">
              <button type="button" onClick={() => updateLocal(adjustment.id, (item) => ({ ...item, mask: { ...item.mask, invert: !item.mask.invert } }))}>{adjustment.mask.invert ? 'Use normal mask' : 'Invert mask'}</button>
              {adjustment.mask.type === 'brush' && adjustment.mask.points.length ? <button type="button" onClick={() => updateLocal(adjustment.id, (item) => item.mask.type === 'brush' ? ({ ...item, mask: { ...item.mask, points: [] } }) : item)}>Clear brush</button> : null}
              <button type="button" onClick={() => duplicateLocal(adjustment.id)}>Duplicate mask</button>
              <button type="button" onClick={() => removeLocal(adjustment.id)}>Remove</button>
            </div>
            {recipe.selection ? (
              <div className="photo-inline-actions" role="group" aria-label={`Combine active selection with ${adjustment.label}`}>
                <button type="button" onClick={() => combineSelectionIntoLocal(adjustment.id, 'add')}>Add selection to mask</button>
                <button type="button" onClick={() => combineSelectionIntoLocal(adjustment.id, 'subtract')}>Subtract selection from mask</button>
                <button type="button" onClick={() => combineSelectionIntoLocal(adjustment.id, 'intersect')}>Intersect mask with selection</button>
              </div>
            ) : null}
          </article>
        )) : <p className="photo-export-note">Add a mask to make targeted edits. Spatial masks can be placed directly on the photo; each mask remains editable and removable.</p>}
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
          <article className="photo-local-card" key={operation.id} data-testid="photo-retouch-operation">
            <header><strong>{operation.type === 'red-eye' ? 'Red-eye' : operation.type === 'clone' ? 'Clone' : 'Healing'} operation {index + 1}</strong></header>
            <p className="photo-export-note">
              {operation.type === 'red-eye'
                ? `Center ${Math.round(operation.x * 100)}%, ${Math.round(operation.y * 100)}% · radius ${Math.round(operation.radius * 100)}%`
                : `Source ${Math.round(operation.sourceX * 100)}%, ${Math.round(operation.sourceY * 100)}% → target ${Math.round(operation.targetX * 100)}%, ${Math.round(operation.targetY * 100)}%`}
            </p>
            {operation.type === 'red-eye' ? (
              <>
                <button type="button" aria-pressed={canvasInteraction?.id === operation.id} onClick={() => setCanvasInteraction(retouchInteraction(operation))}>Place on photo</button>
                <SimpleControl label={`Red-eye ${index + 1} radius`} value={operation.radius} min={0.005} max={0.25} step={0.005} neutral={0.04} onChange={(value) => updateRetouch(operation.id, (item) => item.type === 'red-eye' ? ({ ...item, radius: value }) : item)} />
                <SimpleControl label={`Red-eye ${index + 1} strength`} value={operation.strength} min={0} max={1} step={0.02} neutral={0.8} onChange={(value) => updateRetouch(operation.id, (item) => item.type === 'red-eye' ? ({ ...item, strength: value }) : item)} />
              </>
            ) : (
              <>
                <div className="photo-inline-actions">
                  <button type="button" aria-pressed={canvasInteraction?.id === operation.id && canvasInteraction.mode === 'retouch-source'} onClick={() => setCanvasInteraction(retouchInteraction(operation, 'source'))}>Set source on photo</button>
                  <button type="button" aria-pressed={canvasInteraction?.id === operation.id && canvasInteraction.mode === 'retouch-target'} onClick={() => setCanvasInteraction(retouchInteraction(operation, 'target'))}>Set target on photo</button>
                </div>
                <SimpleControl label={`${operation.type} ${index + 1} radius`} value={operation.radius} min={0.005} max={0.25} step={0.005} neutral={0.06} onChange={(value) => updateRetouch(operation.id, (item) => item.type !== 'red-eye' ? ({ ...item, radius: value }) : item)} />
                <SimpleControl label={`${operation.type} ${index + 1} feather`} value={operation.feather} min={0} max={1} step={0.02} neutral={operation.type === 'clone' ? 0.55 : 0.75} onChange={(value) => updateRetouch(operation.id, (item) => item.type !== 'red-eye' ? ({ ...item, feather: value }) : item)} />
                <SimpleControl label={`${operation.type} ${index + 1} opacity`} value={operation.opacity} min={0} max={1} step={0.02} neutral={operation.type === 'clone' ? 1 : 0.8} onChange={(value) => updateRetouch(operation.id, (item) => item.type !== 'red-eye' ? ({ ...item, opacity: value }) : item)} />
              </>
            )}
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
            {source.rawSource ? <div data-testid="photo-raw-source">
              <p>{[source.rawSource.make, source.rawSource.model].filter(Boolean).join(' ') || 'Camera not reported'}</p>
              <p>{source.rawSource.layout} · Stored {source.rawSource.rawWidth} × {source.rawSource.rawHeight} · Active {source.rawSource.activeWidth} × {source.rawSource.activeHeight}</p>
              <p>Camera white balance: {source.rawSource.cameraWhiteBalance ? 'reported' : 'not reported; decoder fallback'}</p>
              <p>Read-only source facts; not automatically copied into export metadata.</p>
            </div> : null}
          </div>
        ) : null}
        <details className="photo-section" open data-testid="photo-project-panel">
          <summary>Local projects ({localProjects.length})</summary>
          <p className="photo-export-note">
            Project recipes and history snapshots stay in IndexedDB. The immutable source uses OPFS when this browser permits it, with an IndexedDB fallback.
          </p>
          <div className="photo-metadata-grid">
            <label>
              Project name
              <input
                type="text"
                value={projectName}
                maxLength={80}
                disabled={!source}
                onChange={(event) => setProjectName(event.target.value)}
              />
            </label>
          </div>
          <div className="photo-inline-actions">
            <button
              type="button"
              onClick={() => void persistCurrentProject('manual')}
              disabled={!source || projectBeingDeletedId === projectId || projectSaveState === 'checking' || projectSaveState === 'unavailable' || projectSaveState === 'saving'}
            >Save project now</button>
            {storageStatus?.persisted === false ? (
              <button type="button" onClick={() => void requestDurableStorage()}>Request durable storage</button>
            ) : null}
          </div>
          <p className="photo-project-storage" data-testid="photo-storage-status">
            {storageStatus
              ? `${storageStatus.opfsAvailable ? 'OPFS source storage available' : 'Using IndexedDB source fallback'} · ${storageStatus.persisted === true ? 'durable storage granted' : storageStatus.persisted === false ? 'best-effort storage' : 'durability status unavailable'}${storageStatus.usageBytes !== null && storageStatus.quotaBytes !== null ? ` · approximately ${formatBytes(storageStatus.usageBytes)} of ${formatBytes(storageStatus.quotaBytes)} used by this site` : ''}`
              : 'Checking browser storage capabilities…'}
          </p>
          <div className="photo-project-list">
            {localProjects.map((project) => (
              <article className="photo-local-card" key={project.id} data-testid="photo-project-card">
                <strong>{project.name}</strong>
                <span>{project.source.name} · edited {new Date(project.updatedAt).toLocaleString()}</span>
                <div className="photo-inline-actions">
                  <button type="button" aria-label={`Load project ${project.name}`} onClick={() => void loadLocalProject(project.id)} disabled={projectBeingDeletedId === project.id}>Load project</button>
                  <button type="button" aria-label={`Create virtual copy of ${project.name}`} onClick={() => void createVirtualCopy(project)} disabled={projectBeingDeletedId === project.id}>Create virtual copy</button>
                  <button type="button" aria-label={`Delete local project ${project.name}`} onClick={() => void deleteLocalProject(project)} disabled={projectBeingDeletedId !== null}>Delete local project</button>
                </div>
              </article>
            ))}
            {!localProjects.length ? <p className="photo-export-note">No local Photo projects saved yet.</p> : null}
          </div>
        </details>
        <details className="photo-section" open>
          <summary>Editable starting presets</summary>
          <div className="photo-inline-actions">
            {PRESETS.map((preset) => <button type="button" key={preset.name} onClick={() => applyPreset(preset.patch)} disabled={!source}>{preset.name}</button>)}
          </div>
        </details>
        <details className="photo-section" open data-testid="photo-user-preset-panel" aria-busy={userPresetBusy}>
          <summary>User presets ({userPresets.length})</summary>
          <p className="photo-export-note">
            Save the complete current recipe as an editable local preset, or move presets between browsers with versioned JSON files.
          </p>
          <div className="photo-metadata-grid">
            <label>
              User preset name
              <input
                type="text"
                value={userPresetName}
                maxLength={80}
                placeholder="My preset"
                disabled={userPresetBusy}
                onChange={(event) => setUserPresetName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') void saveUserPreset();
                }}
              />
            </label>
          </div>
          <div className="photo-inline-actions">
            <button
              type="button"
              onClick={() => void saveUserPreset()}
              disabled={!source || !projectStoreReady || userPresetBusy || !userPresetName.trim()}
            >{editingUserPresetId ? 'Update preset' : 'Save current as preset'}</button>
            {editingUserPresetId ? (
              <button
                type="button"
                disabled={userPresetBusy}
                onClick={() => {
                  setEditingUserPresetId(null);
                  setUserPresetName('');
                }}
              >Cancel preset edit</button>
            ) : null}
            <button type="button" onClick={() => userPresetInputRef.current?.click()} disabled={!projectStoreReady || userPresetBusy}>Import preset</button>
            <input
              ref={userPresetInputRef}
              data-testid="photo-user-preset-input"
              type="file"
              accept="application/json,.json"
              hidden
              onChange={(event) => void importUserPreset(event)}
            />
          </div>
          <div className="photo-project-list">
            {userPresets.map((preset) => (
              <article className="photo-local-card" key={preset.id} data-testid="photo-user-preset-card">
                <strong>{preset.name}</strong>
                <span>Updated {new Date(preset.updatedAt).toLocaleString()}</span>
                <div className="photo-inline-actions">
                  <button type="button" aria-label={`Apply preset ${preset.name}`} onClick={() => applyUserPreset(preset)} disabled={!source}>Apply preset</button>
                  <button type="button" aria-label={`Edit preset ${preset.name}`} onClick={() => editUserPreset(preset)} disabled={userPresetBusy || !source}>Edit preset</button>
                  <button type="button" aria-label={`Export preset ${preset.name}`} onClick={() => exportUserPreset(preset)}>Export preset</button>
                  <button type="button" aria-label={`Delete preset ${preset.name}`} onClick={() => void deleteUserPreset(preset)} disabled={userPresetBusy}>Delete preset</button>
                </div>
              </article>
            ))}
            {!userPresets.length ? <p className="photo-export-note">No local user presets saved yet.</p> : null}
          </div>
        </details>
        <details className="photo-section" open>
          <summary>Snapshots</summary>
          <div className="photo-metadata-grid">
            <label>
              Snapshot name
              <input
                type="text"
                value={snapshotName}
                maxLength={80}
                placeholder={`Snapshot ${snapshots.length + 1}`}
                onChange={(event) => setSnapshotName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && source) saveSnapshot();
                }}
              />
            </label>
          </div>
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

  const naturalDimensions = source ? photoNaturalDimensions(source.width, source.height, recipe) : null;
  const projectSaveLabel = projectSaveState === 'checking'
    ? 'Checking local project storage…'
    : projectSaveState === 'unavailable'
      ? 'Local project storage unavailable'
      : projectSaveState === 'saving'
        ? 'Saving project locally…'
        : projectSaveState === 'unsaved'
          ? autosaveEnabled ? 'Unsaved changes' : 'Local copy deleted · autosave paused'
          : projectSaveState === 'error'
            ? 'Local save failed'
            : lastProjectSavedAt
              ? `Saved locally ${new Date(lastProjectSavedAt).toLocaleTimeString()}`
              : 'Local projects ready';

  return (
    <div
      className={`photo-studio${photoDragActive ? ' is-photo-dragging' : ''}`}
      data-testid="photo-drop-target"
      onDragEnter={handlePhotoDrag}
      onDragOver={handlePhotoDrag}
      onDragLeave={handlePhotoDragLeave}
      onDrop={handlePhotoDrop}
    >
      <header className="photo-command-bar" aria-label="Photo Studio commands">
        <label className="photo-open-label">
          Open photo
          <input
            ref={fileInputRef}
            data-testid="photo-file-input"
            type="file"
            accept={PHOTO_FILE_ACCEPT}
            onChange={(event) => {
              if (event.target.files) void importPhotoFiles(event.target.files, 'file-input');
              event.target.value = '';
            }}
          />
        </label>
        <label className="photo-open-label">
          Use camera
          <input
            data-testid="photo-camera-input"
            type="file"
            accept="image/*"
            capture="environment"
            onChange={(event) => {
              if (event.target.files) void importPhotoFiles(event.target.files, 'file-input');
              event.target.value = '';
            }}
          />
        </label>
        <button
          type="button"
          onClick={() => void pastePhotoFromClipboard()}
          disabled={!directClipboardAvailable}
          aria-describedby="photo-import-hint"
        >Paste image</button>
        <button type="button" onClick={undo} disabled={!history.past.length} aria-label="Undo">Undo</button>
        <button type="button" onClick={redo} disabled={!history.future.length} aria-label="Redo">Redo</button>
        <button type="button" onClick={copyEdits} disabled={!source}>Copy edits</button>
        <button type="button" onClick={pasteEdits} disabled={!source || !editClipboard}>Paste edits</button>
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
        <span className="photo-feature-count">60+ reversible image controls</span>
        <button type="button" onClick={() => setExportOpen(true)} disabled={!source} aria-label="Export">Export</button>
      </header>
      <p className="photo-import-hint" id="photo-import-hint">
        {directClipboardAvailable
          ? 'Drop a photo anywhere in the studio, press Ctrl+V, or use Paste image.'
          : 'Drop a photo anywhere in the studio or press Ctrl+V. Direct clipboard reading is unavailable in this browser.'}
      </p>

      {source?.codecNotice ? <p className="photo-import-hint" data-testid="photo-codec-notice">{source.codecNotice}</p> : null}

      {embeddedPreview ? <aside className="photo-import-hint" data-testid="photo-embedded-preview" role="status">
        <img src={embeddedPreview.url} alt={`Embedded camera preview of ${embeddedPreview.name}`} style={{ display: 'block', maxWidth: '100%', maxHeight: 140 }} />
        <span>Embedded camera preview · developing {embeddedPreview.name} · not editable. Camera rendering may differ from the developed photo.</span>
      </aside> : null}

      {recoveryProject ? (
        <section className="photo-recovery-banner" aria-labelledby="photo-recovery-title" data-testid="photo-recovery-prompt">
          <div>
            <strong id="photo-recovery-title">Recover {recoveryProject.name}?</strong>
            <span>
              Last saved {new Date(recoveryProject.updatedAt).toLocaleString()} · {recoveryProject.source.name}
            </span>
          </div>
          <div className="photo-inline-actions">
            <button type="button" onClick={() => void loadLocalProject(recoveryProject.id, 'edit')}>Recover project</button>
            <button type="button" onClick={() => setRecoveryProject(null)}>Not now</button>
            <button type="button" onClick={() => void deleteLocalProject(recoveryProject)}>Delete local recovery</button>
          </div>
        </section>
      ) : null}

      <div className="photo-workbench">
        <nav className="photo-tool-tabs" aria-label="Photo editing sections">
          {([
            ['edit', 'Edit'],
            ['geometry', 'Crop & geometry'],
            ['local', 'Local adjustments'],
            ['retouch', 'Retouch'],
            ['inspect', 'Inspect & workflow'],
          ] as Array<[InspectorPanel, string]>).map(([id, label]) => (
            <button
              type="button"
              key={id}
              aria-pressed={panel === id}
              onClick={() => {
                setPanel(id);
                if (id !== 'local' && id !== 'retouch') setCanvasInteraction(null);
                if (id !== 'geometry') setGeometryInteraction(null);
              }}
            >{label}</button>
          ))}
        </nav>

        <PhotoCanvas
          previewUrl={preview?.url ?? null}
          proofBaseUrl={preview?.proofBaseUrl ?? null}
          originalUrl={source?.originalUrl ?? null}
          compare={compare}
          zoom={zoom}
          sourceName={source?.name}
          histogram={preview?.result.histogram ?? null}
          colorManaged={Boolean(recipe.colorManagement?.assignedProfile
            || (recipe.colorManagement?.softProof && recipe.colorManagement.proofProfile))}
          busy={previewBusy}
          localAdjustments={recipe.localAdjustments}
          retouch={recipe.retouch}
          selection={recipe.selection}
          interaction={canvasInteraction}
          crop={recipe.crop}
          geometryMode={geometryInteraction}
          compositionOverlay={compositionOverlay}
          gridDivisions={gridDivisions}
          onGesture={handleCanvasGesture}
          onCropCommit={(crop) => {
            patchRecipe({ crop });
            setStatus(`Crop updated · ${Math.round(crop.width * 1000) / 10}% × ${Math.round(crop.height * 1000) / 10}%`);
          }}
          onStraightenCommit={(degrees) => {
            patchRecipe({ straighten: degrees });
            setGeometryInteraction(null);
            setStatus(`Straighten set to ${degrees.toFixed(1)}°.`);
          }}
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
        <span data-testid="photo-project-save-state">{projectSaveLabel}</span>
        <span className="photo-status-message" role="status">{status}</span>
      </footer>

      <PhotoExportDialog
        open={exportOpen}
        source={source}
        recipe={recipe}
        capabilities={capabilities}
        onClose={() => setExportOpen(false)}
        onStatus={setStatus}
      />
    </div>
  );
}

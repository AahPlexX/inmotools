import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { PHOTO_FILE_ACCEPT, isPhotoImportFile } from './photo-import';
import { createPhotoMergeClient, PhotoMergeFailure } from './merge/photo-merge-client';
import { formatExposureTime, parseExposureTime, validateExposureTimes } from './merge/photo-merge-exposure';
import { fieldOfViewFrom35mm } from './merge/photo-merge-ops';
import { planPhotoMerge } from './merge/photo-merge-plan';
import { DEFAULT_PHOTO_MERGE_OPTIONS } from './merge/photo-merge-run';
import {
  decodeMergeRaster,
  inspectMergeSource,
  mergeResultName,
  mergeResultToFile,
  type PhotoMergeSourceInfo,
} from './merge/photo-merge-source';
import {
  PHOTO_MERGE_LIMITS,
  type PhotoFrameRegistration,
  type PhotoMergeAlignment,
  type PhotoMergeOperation,
  type PhotoMergeOptions,
} from './merge/photo-merge-types';

interface OperationSpec {
  id: PhotoMergeOperation;
  label: string;
  help: string;
  suffix: string;
}

const OPERATIONS: OperationSpec[] = [
  { id: 'exposure-fusion', label: 'Exposure fusion', suffix: 'fusion', help: 'Blends a bracket of darker and brighter shots into one natural-looking photo. No shutter speeds needed.' },
  { id: 'hdr', label: 'HDR merge', suffix: 'hdr', help: 'Rebuilds the full brightness range of a bracket from each shot’s shutter speed, then tone maps it for a normal screen.' },
  { id: 'panorama', label: 'Panorama', suffix: 'panorama', help: 'Stitches overlapping shots taken while turning the camera. Add them in the order you took them; about a third of each frame should overlap its neighbour.' },
  { id: 'focus-stack', label: 'Focus stack', suffix: 'focus-stack', help: 'Keeps the sharpest part of each shot when you focused at different distances, for front-to-back sharpness.' },
  { id: 'average-stack', label: 'Average stack', suffix: 'average', help: 'Averages several shots of the same scene to cut noise or smooth moving water and clouds.' },
  { id: 'median-stack', label: 'Median stack', suffix: 'median', help: 'Removes people, cars, or birds that move between otherwise identical shots. Works best with five or more.' },
];

const ALIGNMENTS: Array<{ id: PhotoMergeAlignment; label: string }> = [
  { id: 'homography', label: 'Align automatically (handheld)' },
  { id: 'euclidean', label: 'Shift and rotate only' },
  { id: 'translation', label: 'Shift only' },
  { id: 'none', label: 'Already aligned (tripod)' },
];

function formatMiB(bytes: number): string {
  return `${Math.ceil(bytes / (1024 * 1024)).toLocaleString()} MiB`;
}

function confidenceLabel(registration: PhotoFrameRegistration, operation: PhotoMergeOperation): string {
  if (registration.coarse === 'identity' && registration.correlation === 1 && registration.featureMatches === 0) return 'reference';
  const percent = Math.round(registration.correlation * 100);
  const measure = operation === 'panorama' ? `${registration.inliers} matching points (${percent}% consistent)` : `${percent}% match`;
  return registration.lowConfidence ? `${measure} · low confidence` : measure;
}

export interface PhotoMergePanelProps {
  /** Opens the merged photo as the active document and announces `message` once it is shown. */
  onOpenResult: (file: File, message: string) => Promise<boolean>;
  onStatus: (message: string) => void;
  /** Whether a photo is open and its latest edits are already saved as a local project. */
  currentPhoto: 'none' | 'saved' | 'unsaved';
}

export default function PhotoMergePanel({ onOpenResult, onStatus, currentPhoto }: PhotoMergePanelProps) {
  const [operation, setOperation] = useState<PhotoMergeOperation>('exposure-fusion');
  const [sources, setSources] = useState<PhotoMergeSourceInfo[]>([]);
  const [exposureText, setExposureText] = useState<Record<string, string>>({});
  const [referenceId, setReferenceId] = useState<string | null>(null);
  const [options, setOptions] = useState<PhotoMergeOptions>(DEFAULT_PHOTO_MERGE_OPTIONS);
  const [busy, setBusy] = useState<'reading' | 'checking' | 'merging' | null>(null);
  const [progress, setProgress] = useState('');
  const [registrations, setRegistrations] = useState<PhotoFrameRegistration[] | null>(null);
  const [notes, setNotes] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const clientRef = useRef<ReturnType<typeof createPhotoMergeClient> | null>(null);
  const runRef = useRef(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => () => {
    runRef.current += 1;
    clientRef.current?.dispose();
    clientRef.current = null;
  }, []);

  const spec = OPERATIONS.find((item) => item.id === operation)!;
  const referenceIndex = Math.max(0, sources.findIndex((item) => item.id === referenceId));
  const plan = useMemo(() => (sources.length ? planPhotoMerge(operation, sources) : null), [operation, sources]);
  const exposureTimes = sources.map((item) => parseExposureTime(exposureText[item.id] ?? ''));
  const exposureProblem = operation === 'hdr' && sources.length ? validateExposureTimes(exposureTimes, sources.length) : null;
  const blocked = !plan || !plan.ok || Boolean(exposureProblem);

  function resetResults() {
    setRegistrations(null);
    setNotes([]);
    setError(null);
  }

  function patchOptions(patch: Partial<PhotoMergeOptions>) {
    setOptions((current) => ({ ...current, ...patch }));
  }

  async function addFiles(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []).filter(isPhotoImportFile);
    event.target.value = '';
    if (!files.length) return;
    const run = ++runRef.current;
    setBusy('reading');
    resetResults();
    const added: PhotoMergeSourceInfo[] = [];
    const failed: string[] = [];
    for (let index = 0; index < files.length; index += 1) {
      setProgress(`Reading ${files[index].name} (${index + 1} of ${files.length})…`);
      try {
        added.push(await inspectMergeSource(files[index]));
      } catch {
        failed.push(files[index].name);
      }
      if (run !== runRef.current) return;
    }
    // Adding is serialised by `busy`, so the rendered list is the current one.
    const next = [...sources, ...added];
    setSources(next);
    if (!next.some((item) => item.id === referenceId) && next.length) setReferenceId(next[Math.floor(next.length / 2)].id);
    setExposureText((current) => {
      const next = { ...current };
      for (const item of added) if (item.exposureTime) next[item.id] = formatExposureTime(item.exposureTime).replace(/ s$/, '');
      return next;
    });
    const focal = added.find((item) => item.focalLength35)?.focalLength35;
    const suggestedView = focal ? fieldOfViewFrom35mm(focal) : null;
    if (suggestedView && sources.length === 0) {
      setOptions((current) => ({ ...current, panorama: { ...current.panorama, fieldOfView: Math.round(suggestedView) } }));
    }
    setBusy(null);
    setProgress('');
    const message = `${added.length} photo${added.length === 1 ? '' : 's'} added to the merge.${failed.length ? ` Could not read ${failed.join(', ')}.` : ''}`;
    onStatus(message);
  }

  function removeSource(id: string) {
    resetResults();
    const next = sources.filter((item) => item.id !== id);
    setSources(next);
    if (referenceId === id) setReferenceId(next[Math.floor(next.length / 2)]?.id ?? null);
  }

  function moveSource(id: string, direction: -1 | 1) {
    resetResults();
    setSources((current) => {
      const index = current.findIndex((item) => item.id === id);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  function client() {
    clientRef.current ??= createPhotoMergeClient();
    return clientRef.current;
  }

  async function decodeAll(run: number) {
    const rasters = [];
    for (let index = 0; index < sources.length; index += 1) {
      setProgress(`Decoding ${sources[index].name} (${index + 1} of ${sources.length})…`);
      rasters.push(await decodeMergeRaster(sources[index]));
      if (run !== runRef.current) return null;
    }
    return rasters;
  }

  function reportFailure(caught: unknown) {
    const message = caught instanceof PhotoMergeFailure || caught instanceof Error ? caught.message : 'The merge could not be completed.';
    setError(message);
    onStatus(message);
  }

  async function checkAlignment() {
    if (blocked || busy || operation === 'panorama' || options.alignment === 'none') return;
    const run = ++runRef.current;
    setBusy('checking');
    resetResults();
    try {
      const rasters = await decodeAll(run);
      if (!rasters) return;
      setProgress('Measuring alignment…');
      const result = await client().register(options.alignment as Exclude<PhotoMergeAlignment, 'none'>, referenceIndex, rasters);
      if (run !== runRef.current) return;
      setRegistrations(result);
      const weak = result.filter((item) => item.lowConfidence).length;
      onStatus(weak ? `Alignment checked · ${weak} photo${weak === 1 ? '' : 's'} may not line up well.` : 'Alignment checked · every photo lines up with the reference.');
    } catch (caught) {
      if (run === runRef.current) reportFailure(caught);
    } finally {
      if (run === runRef.current) { setBusy(null); setProgress(''); }
    }
  }

  async function runMerge() {
    if (blocked || busy) return;
    const run = ++runRef.current;
    setBusy('merging');
    resetResults();
    try {
      const rasters = await decodeAll(run);
      if (!rasters) return;
      setProgress(`${spec.label} in progress… large photos can take up to a minute.`);
      const outcome = await client().merge(operation, referenceIndex, rasters, {
        ...options,
        hdr: { ...options.hdr, exposureTimes },
      });
      if (run !== runRef.current) return;
      setProgress('Opening the merged photo…');
      const file = await mergeResultToFile(outcome.result, mergeResultName(sources[0].name, spec.suffix));
      if (run !== runRef.current) return;
      setRegistrations(outcome.registrations);
      setNotes(outcome.notes);
      await onOpenResult(file, `${spec.label} finished · ${outcome.result.width} × ${outcome.result.height} opened as a new photo.${outcome.notes.length ? ` ${outcome.notes.join(' ')}` : ''}`);
    } catch (caught) {
      if (run === runRef.current) reportFailure(caught);
    } finally {
      if (run === runRef.current) { setBusy(null); setProgress(''); }
    }
  }

  function cancel() {
    runRef.current += 1;
    clientRef.current?.cancel();
    setBusy(null);
    setProgress('');
    onStatus('Merge cancelled. Your photos are unchanged.');
  }

  const usesAlignment = operation !== 'panorama';

  return (
    <>
      <div className="photo-inspector-header">
        <h2>Merge photos</h2>
        <p>Combine several shots of one scene into a single photo. Everything runs on this device; the result opens as a new photo you can keep editing.</p>
      </div>
      <details className="photo-section" open>
        <summary>What to make</summary>
        <label className="photo-control photo-select-control">
          <span>Merge type</span>
          <select aria-label="Merge type" value={operation} disabled={busy !== null} onChange={(event) => { setOperation(event.target.value as PhotoMergeOperation); resetResults(); }}>
            {OPERATIONS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
        </label>
        <p className="photo-export-note" data-testid="photo-merge-help">{spec.help}</p>
      </details>

      <details className="photo-section" open data-testid="photo-merge-sources">
        <summary>Photos ({sources.length} of {PHOTO_MERGE_LIMITS.maxSources})</summary>
        <div className="photo-inline-actions">
          <button type="button" disabled={busy !== null} onClick={() => inputRef.current?.click()}>Add photos</button>
          <input ref={inputRef} data-testid="photo-merge-input" type="file" accept={PHOTO_FILE_ACCEPT} multiple hidden onChange={(event) => void addFiles(event)} />
          {sources.length ? <button type="button" disabled={busy !== null} onClick={() => { setSources([]); setReferenceId(null); resetResults(); }}>Clear all</button> : null}
        </div>
        {sources.length ? (
          <ol className="photo-merge-list">
            {sources.map((item, index) => {
              const registration = registrations?.find((entry) => entry.sourceIndex === index);
              return (
                <li key={item.id} className="photo-local-card" data-testid="photo-merge-source">
                  <strong>{index + 1}. {item.name}</strong>
                  <span>{item.width} × {item.height}{item.exposureTime ? ` · ${formatExposureTime(item.exposureTime)}` : ''}</span>
                  {operation === 'hdr' ? (
                    <label>
                      Shutter speed (seconds or fraction)
                      <input
                        type="text"
                        inputMode="decimal"
                        aria-label={`${item.name} shutter speed`}
                        placeholder="1/125"
                        value={exposureText[item.id] ?? ''}
                        aria-invalid={Number.isNaN(parseExposureTime(exposureText[item.id] ?? ''))}
                        disabled={busy !== null}
                        onChange={(event) => setExposureText((current) => ({ ...current, [item.id]: event.target.value }))}
                      />
                    </label>
                  ) : null}
                  {usesAlignment ? (
                    <label className="photo-check">
                      <input type="radio" name="photo-merge-reference" checked={index === referenceIndex} disabled={busy !== null} onChange={() => { setReferenceId(item.id); resetResults(); }} />
                      Align others to this photo
                    </label>
                  ) : null}
                  {registration ? <span data-testid="photo-merge-confidence">Alignment: {confidenceLabel(registration, operation)}</span> : null}
                  <div className="photo-inline-actions">
                    <button type="button" aria-label={`Move ${item.name} earlier`} disabled={busy !== null || index === 0} onClick={() => moveSource(item.id, -1)}>Move up</button>
                    <button type="button" aria-label={`Move ${item.name} later`} disabled={busy !== null || index === sources.length - 1} onClick={() => moveSource(item.id, 1)}>Move down</button>
                    <button type="button" aria-label={`Remove ${item.name} from the merge`} disabled={busy !== null} onClick={() => removeSource(item.id)}>Remove</button>
                  </div>
                </li>
              );
            })}
          </ol>
        ) : <p className="photo-export-note">Add at least {PHOTO_MERGE_LIMITS.minSources} photos of the same scene. JPEG, PNG, WebP, TIFF, and camera RAW files all work.</p>}
      </details>

      <details className="photo-section" open>
        <summary>Settings</summary>
        {usesAlignment ? (
          <label className="photo-control photo-select-control">
            <span>Alignment</span>
            <select aria-label="Alignment" value={options.alignment} disabled={busy !== null} onChange={(event) => { patchOptions({ alignment: event.target.value as PhotoMergeAlignment }); resetResults(); }}>
              {ALIGNMENTS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
            </select>
          </label>
        ) : null}
        {operation === 'exposure-fusion' ? (
          <div className="photo-control-list">
            {(['contrast', 'saturation', 'exposure'] as const).map((key) => (
              <label className="photo-control" key={key}>
                <span>{key === 'exposure' ? 'Well-exposed weight' : `${key[0].toUpperCase()}${key.slice(1)} weight`}</span>
                <input type="range" min={0} max={2} step={0.1} aria-label={`Fusion ${key} weight`} value={options.fusion[key]} disabled={busy !== null} onChange={(event) => patchOptions({ fusion: { ...options.fusion, [key]: Number(event.target.value) } })} />
                <output>{options.fusion[key].toFixed(1)}</output>
              </label>
            ))}
          </div>
        ) : null}
        {operation === 'hdr' ? (
          <div className="photo-control-list">
            <label className="photo-control photo-select-control">
              <span>Tone mapping</span>
              <select aria-label="Tone mapping" value={options.hdr.operator} disabled={busy !== null} onChange={(event) => patchOptions({ hdr: { ...options.hdr, operator: event.target.value as PhotoMergeOptions['hdr']['operator'] } })}>
                <option value="reinhard">Natural (Reinhard)</option>
                <option value="drago">Bright shadows (Drago)</option>
                <option value="mantiuk">Local contrast (Mantiuk)</option>
              </select>
            </label>
            <label className="photo-control"><span>Gamma</span><input type="range" min={1} max={3} step={0.1} aria-label="HDR gamma" value={options.hdr.gamma} disabled={busy !== null} onChange={(event) => patchOptions({ hdr: { ...options.hdr, gamma: Number(event.target.value) } })} /><output>{options.hdr.gamma.toFixed(1)}</output></label>
            {options.hdr.operator === 'reinhard' ? (
              <>
                <label className="photo-control"><span>Brightness</span><input type="range" min={-8} max={8} step={0.5} aria-label="HDR brightness" value={options.hdr.intensity} disabled={busy !== null} onChange={(event) => patchOptions({ hdr: { ...options.hdr, intensity: Number(event.target.value) } })} /><output>{options.hdr.intensity.toFixed(1)}</output></label>
                <label className="photo-control"><span>Local adaptation</span><input type="range" min={0} max={1} step={0.05} aria-label="HDR local adaptation" value={options.hdr.lightAdaptation} disabled={busy !== null} onChange={(event) => patchOptions({ hdr: { ...options.hdr, lightAdaptation: Number(event.target.value) } })} /><output>{options.hdr.lightAdaptation.toFixed(2)}</output></label>
                <label className="photo-control"><span>Color adaptation</span><input type="range" min={0} max={1} step={0.05} aria-label="HDR color adaptation" value={options.hdr.colorAdaptation} disabled={busy !== null} onChange={(event) => patchOptions({ hdr: { ...options.hdr, colorAdaptation: Number(event.target.value) } })} /><output>{options.hdr.colorAdaptation.toFixed(2)}</output></label>
              </>
            ) : null}
            {options.hdr.operator === 'drago' ? (
              <label className="photo-control"><span>Bias</span><input type="range" min={0.5} max={1} step={0.01} aria-label="HDR bias" value={options.hdr.bias} disabled={busy !== null} onChange={(event) => patchOptions({ hdr: { ...options.hdr, bias: Number(event.target.value) } })} /><output>{options.hdr.bias.toFixed(2)}</output></label>
            ) : null}
            {options.hdr.operator === 'mantiuk' ? (
              <label className="photo-control"><span>Contrast scale</span><input type="range" min={0.1} max={1} step={0.05} aria-label="HDR contrast scale" value={options.hdr.scale} disabled={busy !== null} onChange={(event) => patchOptions({ hdr: { ...options.hdr, scale: Number(event.target.value) } })} /><output>{options.hdr.scale.toFixed(2)}</output></label>
            ) : null}
            {options.hdr.operator !== 'reinhard' ? (
              <label className="photo-control"><span>Saturation</span><input type="range" min={0} max={2} step={0.05} aria-label="HDR saturation" value={options.hdr.saturation} disabled={busy !== null} onChange={(event) => patchOptions({ hdr: { ...options.hdr, saturation: Number(event.target.value) } })} /><output>{options.hdr.saturation.toFixed(2)}</output></label>
            ) : null}
          </div>
        ) : null}
        {operation === 'focus-stack' ? (
          <div className="photo-control-list">
            <label className="photo-control"><span>Detail radius</span><input type="range" min={1} max={16} step={1} aria-label="Focus detail radius" value={options.focus.radius} disabled={busy !== null} onChange={(event) => patchOptions({ focus: { ...options.focus, radius: Number(event.target.value) } })} /><output>{options.focus.radius} px</output></label>
            <label className="photo-control"><span>Selectivity</span><input type="range" min={1} max={8} step={1} aria-label="Focus selectivity" value={options.focus.selectivity} disabled={busy !== null} onChange={(event) => patchOptions({ focus: { ...options.focus, selectivity: Number(event.target.value) } })} /><output>{options.focus.selectivity}</output></label>
            <p className="photo-export-note">Higher selectivity picks the single sharpest shot more strictly; lower blends transitions more softly.</p>
          </div>
        ) : null}
        {operation === 'panorama' ? (
          <div className="photo-control-list">
            <label className="photo-control photo-select-control">
              <span>Projection</span>
              <select aria-label="Panorama projection" value={options.panorama.projection} disabled={busy !== null} onChange={(event) => patchOptions({ panorama: { ...options.panorama, projection: event.target.value as PhotoMergeOptions['panorama']['projection'] } })}>
                <option value="cylindrical">Cylindrical (wide sweeps)</option>
                <option value="planar">Flat (keeps straight lines straight)</option>
              </select>
            </label>
            <label className="photo-control">
              <span>Lens field of view (degrees, per shot)</span>
              <input type="number" min={5} max={170} step={1} aria-label="Lens field of view" value={options.panorama.fieldOfView} disabled={busy !== null} onChange={(event) => patchOptions({ panorama: { ...options.panorama, fieldOfView: Math.min(170, Math.max(5, Number(event.target.value) || 60)) } })} />
            </label>
            <p className="photo-export-note">Filled in from the camera’s focal length when the photo reports it. Flat projection suits sweeps under about 90°.</p>
            <label className="photo-check"><input type="checkbox" checked={options.panorama.gainCompensation} disabled={busy !== null} onChange={(event) => patchOptions({ panorama: { ...options.panorama, gainCompensation: event.target.checked } })} />Even out brightness between shots</label>
          </div>
        ) : null}
        <label className="photo-check"><input type="checkbox" checked={options.cropToCoverage} disabled={busy !== null} onChange={(event) => patchOptions({ cropToCoverage: event.target.checked })} />Crop to the area every photo covers</label>
      </details>

      {plan ? (
        <div className={`photo-export-size-plan${plan.ok && !exposureProblem ? ' is-safe' : ' is-warning'}`} role={plan.ok && !exposureProblem ? 'status' : 'alert'} data-testid="photo-merge-plan">
          {plan.ok ? (
            <>
              <strong>{plan.sourceCount} photos · {operation === 'panorama' ? 'mixed sizes allowed' : `${plan.width} × ${plan.height}`}</strong>
              <span>About {formatMiB(plan.estimatedBytes)} of working memory (limit {formatMiB(PHOTO_MERGE_LIMITS.maxWorkingBytes)}). Alignment runs on a copy at most {PHOTO_MERGE_LIMITS.registrationMaxEdge} px wide.</span>
              {exposureProblem ? <span>{exposureProblem}</span> : null}
            </>
          ) : <span>{plan.diagnostic.message}</span>}
        </div>
      ) : null}

      <div className="photo-inline-actions">
        {usesAlignment && options.alignment !== 'none' ? (
          <button type="button" disabled={blocked || busy !== null} onClick={() => void checkAlignment()}>{busy === 'checking' ? 'Checking…' : 'Check alignment'}</button>
        ) : null}
        <button type="button" disabled={blocked || busy !== null} onClick={() => void runMerge()}>{busy === 'merging' ? 'Merging…' : `Create ${spec.label.toLowerCase()}`}</button>
        {busy === 'checking' || busy === 'merging' ? <button type="button" onClick={cancel}>Cancel</button> : null}
      </div>
      {progress ? <p className="photo-export-note" role="status" aria-live="polite">{progress}</p> : null}
      {error ? <p className="photo-export-note photo-merge-error" role="alert" data-testid="photo-merge-error">{error}</p> : null}
      {notes.length ? <ul className="photo-export-note" data-testid="photo-merge-notes">{notes.map((note) => <li key={note}>{note}</li>)}</ul> : null}
      {currentPhoto === 'saved' ? <p className="photo-export-note">The photo you have open now is saved under Local projects on the Inspect &amp; workflow tab, so you can return to it after merging.</p> : null}
      {currentPhoto === 'unsaved' ? <p className="photo-export-note">The merged result replaces the photo you have open. Its latest edits are not saved locally yet; export it or save the project first if you want to keep them.</p> : null}
    </>
  );
}

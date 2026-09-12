import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { downloadBlob } from '../../lib/download';
import { processPhotoBatch, type PhotoBatchItemStatus } from './photo-batch';
import {
  createPhotoExport,
  photoMetadataForPolicy,
  type PhotoMetadataPolicy,
  type PhotoOutputSharpening,
} from './photo-export';
import {
  planPhotoExportSize,
  requestedPhotoDimensions,
  type PhotoResizeMode,
} from './photo-export-dimensions';
import {
  safePhotoFilename,
  safeRequestedPhotoFilename,
  serializePhotoXmp,
} from './photo-metadata';
import type {
  PhotoCapabilities,
  PhotoExportMetadata,
  PhotoOutputMime,
  PhotoRecipe,
} from './photo-types';
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

function readNumber(value: string, fallback: number): number {
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

export default function PhotoExportDialog({
  open,
  source,
  recipe,
  capabilities,
  onClose,
  onStatus,
}: PhotoExportDialogProps) {
  const [outputMime, setOutputMime] = useState<PhotoOutputMime>('image/jpeg');
  const [quality, setQuality] = useState(0.92);
  const [resizeMode, setResizeMode] = useState<PhotoResizeMode>('original');
  const [resizeValue, setResizeValue] = useState(100);
  const [jpegBackground, setJpegBackground] = useState('#ffffff');
  const [metadataPolicy, setMetadataPolicy] = useState<PhotoMetadataPolicy>('strip');
  const [metadata, setMetadata] = useState<PhotoExportMetadata>({ ppi: 300 });
  const [requestedName, setRequestedName] = useState('photo-edited.jpg');
  const [outputSharpening, setOutputSharpening] = useState<PhotoOutputSharpening>('none');
  const [exportBusy, setExportBusy] = useState(false);
  const [batchFiles, setBatchFiles] = useState<File[]>([]);
  const [batchBusy, setBatchBusy] = useState(false);
  const [batchStatuses, setBatchStatuses] = useState<PhotoBatchItemStatus[]>([]);
  const revisionRef = useRef(0);

  useEffect(() => {
    if (!source) return;
    setRequestedName(safePhotoFilename(source.name, outputMime));
    setMetadata({ ppi: 300 });
    setBatchFiles([]);
    setBatchStatuses([]);
  }, [source?.file]);

  const encoderSupport = useMemo(() => ({
    'image/jpeg': capabilities?.jpeg ?? true,
    'image/png': capabilities?.png ?? true,
    'image/webp': capabilities?.webp ?? true,
  }), [capabilities]);

  const sizePlan = useMemo(() => {
    if (!source) return null;
    return planPhotoExportSize(
      source.width,
      source.height,
      recipe,
      resizeMode,
      resizeValue,
      capabilities?.maxCanvasEdge ?? 4096,
      capabilities?.maxCanvasArea ?? 4096 * 4096,
    );
  }, [capabilities?.maxCanvasArea, capabilities?.maxCanvasEdge, recipe, resizeMode, resizeValue, source]);

  const singleSizeUnsafe = sizePlan?.requiresSafetyScaling ?? false;

  function changeMime(nextMime: PhotoOutputMime) {
    setRequestedName((current) => safeRequestedPhotoFilename(current, source?.name ?? 'photo', nextMime));
    setOutputMime(nextMime);
  }

  function singleDimensions() {
    if (!source) return {};
    return requestedPhotoDimensions(source.width, source.height, recipe, resizeMode, resizeValue);
  }

  function useVerifiedSafeSize() {
    if (!sizePlan) return;
    const safeLongEdge = Math.max(sizePlan.safe.width, sizePlan.safe.height);
    setResizeMode('long-edge');
    setResizeValue(safeLongEdge);
    onStatus(`Export size changed to the verified-safe ${sizePlan.safe.width} × ${sizePlan.safe.height} plan.`);
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
      const result = await createPhotoExport({
        file: source.file,
        sourceName: source.name,
        requestedName,
        recipe,
        outputMime,
        quality,
        metadataPolicy,
        metadata,
        outputSharpening,
        revision: ++revisionRef.current,
        jpegBackground,
        ...singleDimensions(),
      });
      downloadBlob(result.blob, result.filename);
      const safety = result.scaledForSafety ? ` Device limits required a safe ${result.width} × ${result.height} render.` : '';
      const metadataMessage = metadataPolicy === 'strip'
        ? ' Metadata stripped.'
        : result.metadataEmbedded
          ? ' Reviewed XMP embedded in the exported image.'
          : ` Pixel export succeeded, but XMP embedding failed${result.metadataError ? `: ${result.metadataError}` : ''}. Use the XMP sidecar if metadata must travel separately.`;
      onStatus(`Photo exported locally as ${result.width} × ${result.height}.${safety}${metadataMessage}`);
    } catch (error) {
      onStatus(`Export failed: ${error instanceof Error ? error.message : 'unknown encoding error'}`);
    } finally {
      setExportBusy(false);
    }
  }

  function downloadXmp() {
    if (!source || metadataPolicy === 'strip') return;
    const reviewed = photoMetadataForPolicy(metadata, metadataPolicy);
    const xmp = serializePhotoXmp(reviewed);
    downloadBlob(
      new Blob([xmp], { type: 'application/rdf+xml' }),
      sidecarFilename(requestedName, source.name, outputMime),
    );
    onStatus('XMP sidecar created from the reviewed export metadata.');
  }

  function chooseBatch(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []).filter((file) => file.type.startsWith('image/'));
    event.target.value = '';
    setBatchFiles(files);
    setBatchStatuses([]);
    onStatus(files.length ? `${files.length} batch photo${files.length === 1 ? '' : 's'} queued locally.` : 'No browser-decodable batch photos selected.');
  }

  async function exportBatch() {
    if (!batchFiles.length || batchBusy) return;
    setBatchBusy(true);
    setBatchStatuses([]);
    onStatus(`Exporting ${batchFiles.length} photo${batchFiles.length === 1 ? '' : 's'} sequentially…`);
    try {
      const items = batchFiles.map((file, index) => ({
        id: `${file.name}-${file.lastModified}-${index}`,
        name: file.name,
        file,
      }));
      const summary = await processPhotoBatch(
        items,
        async (item) => {
          const bitmap = await createImageBitmap(item.file, { imageOrientation: 'from-image' });
          const width = bitmap.width;
          const height = bitmap.height;
          bitmap.close();
          const dimensions = requestedPhotoDimensions(width, height, recipe, resizeMode, resizeValue);
          const exported = await createPhotoExport({
            file: item.file,
            sourceName: item.name,
            requestedName: item.name,
            recipe,
            outputMime,
            quality,
            metadataPolicy,
            metadata,
            outputSharpening,
            revision: ++revisionRef.current,
            jpegBackground,
            ...dimensions,
          });
          return { blob: exported.blob, width: exported.width, height: exported.height };
        },
        (item, result) => {
          downloadBlob(result.blob, safeRequestedPhotoFilename(item.name, item.name, outputMime));
        },
        (itemStatus) => {
          setBatchStatuses((current) => [...current, itemStatus]);
        },
      );
      onStatus(`Batch export finished · ${summary.completed} completed · ${summary.failed} failed.`);
    } catch (error) {
      onStatus(`Batch export stopped unexpectedly: ${error instanceof Error ? error.message : 'unknown batch error'}`);
    } finally {
      setBatchBusy(false);
    }
  }

  if (!open || !source) return null;

  return (
    <div className="photo-dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="photo-dialog" role="dialog" aria-modal="true" aria-labelledby="photo-export-title">
        <header className="photo-dialog-header">
          <div>
            <h2 id="photo-export-title">Export photo</h2>
            <p>Render a new copy from the current recipe. Reviewed metadata is embedded when the selected image container supports it, with XMP sidecar export available independently.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close export dialog">Close</button>
        </header>

        <div className="photo-export-grid">
          <label className="photo-wide">File name
            <input aria-label="File name" value={requestedName} onChange={(event) => setRequestedName(event.target.value)} />
          </label>
          <label>File format
            <select aria-label="File format" value={outputMime} onChange={(event) => changeMime(event.target.value as PhotoOutputMime)}>
              <option value="image/jpeg" disabled={!encoderSupport['image/jpeg']}>JPEG{!encoderSupport['image/jpeg'] ? ' — unsupported' : ''}</option>
              <option value="image/png" disabled={!encoderSupport['image/png']}>PNG{!encoderSupport['image/png'] ? ' — unsupported' : ''}</option>
              <option value="image/webp" disabled={!encoderSupport['image/webp']}>WebP{!encoderSupport['image/webp'] ? ' — unsupported' : ''}</option>
            </select>
          </label>
          <label>Quality
            <input type="number" min={1} max={100} step={1} value={Math.round(quality * 100)} disabled={outputMime === 'image/png'} onChange={(event) => setQuality(Math.min(1, Math.max(0.01, readNumber(event.target.value, 92) / 100)))} />
          </label>
          <label>Resize
            <select aria-label="Resize" value={resizeMode} onChange={(event) => setResizeMode(event.target.value as PhotoResizeMode)}>
              <option value="original">Edited dimensions</option>
              <option value="percent">Percentage</option>
              <option value="width">Exact width</option>
              <option value="height">Exact height</option>
              <option value="long-edge">Long edge</option>
              <option value="short-edge">Short edge</option>
            </select>
          </label>
          {resizeMode !== 'original' ? (
            <label>{resizeValueLabel(resizeMode)}
              <input aria-label="Resize value" type="number" min={1} max={resizeMode === 'percent' ? 400 : 50000} value={resizeValue} onChange={(event) => setResizeValue(Math.max(1, readNumber(event.target.value, 100)))} />
            </label>
          ) : <div />}
          <label>Output sharpening
            <select aria-label="Output sharpening" value={outputSharpening} onChange={(event) => setOutputSharpening(event.target.value as PhotoOutputSharpening)}>
              <option value="none">None</option>
              <option value="light">Light</option>
              <option value="standard">Standard</option>
              <option value="strong">Strong</option>
            </select>
          </label>
          {outputMime === 'image/jpeg' ? (
            <label>Transparent-area background
              <input type="color" value={jpegBackground} onChange={(event) => setJpegBackground(event.target.value)} />
            </label>
          ) : null}
          <label>Metadata policy
            <select aria-label="Metadata policy" value={metadataPolicy} onChange={(event) => setMetadataPolicy(event.target.value as PhotoMetadataPolicy)}>
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

        <p className="photo-export-note">JPEG, PNG, and WebP exports attempt to embed the reviewed XMP packet in the output container. If embedding fails, the pixel export still downloads and this dialog reports the fallback; a separate XMP sidecar remains available.</p>
        <div className="photo-dialog-actions">
          <button type="button" onClick={downloadXmp} disabled={metadataPolicy === 'strip'}>Download XMP sidecar</button>
          <button type="button" onClick={() => void exportSinglePhoto()} disabled={exportBusy || singleSizeUnsafe}>{exportBusy ? 'Rendering…' : singleSizeUnsafe ? 'Choose safe size to export' : 'Download photo'}</button>
        </div>

        <details className="photo-batch-section">
          <summary>Batch export current recipe</summary>
          <p className="photo-export-note">Files are rendered one at a time with the same format, resize, sharpening, and metadata policy. Each file is independently constrained to verified-safe local canvas limits, a failure is isolated to that file, and full-resolution output blobs are released after each download.</p>
          <label className="photo-open-label photo-batch-picker">
            Choose batch photos
            <input type="file" multiple accept="image/jpeg,image/png,image/webp,image/*" onChange={chooseBatch} />
          </label>
          <div className="photo-inline-actions">
            <span>{batchFiles.length} queued</span>
            <button type="button" disabled={!batchFiles.length || batchBusy} onClick={() => void exportBatch()}>{batchBusy ? 'Exporting batch…' : `Export ${batchFiles.length || ''} photo${batchFiles.length === 1 ? '' : 's'}`}</button>
          </div>
          {batchStatuses.length ? (
            <ol className="photo-batch-status" aria-label="Batch export status">
              {batchStatuses.map((item) => (
                <li key={item.id} data-status={item.status}>
                  <strong>{item.name}</strong>
                  <span>{item.status === 'completed' ? `${item.width} × ${item.height}` : item.error}</span>
                </li>
              ))}
            </ol>
          ) : null}
        </details>
      </section>
    </div>
  );
}

import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import ExifReader from 'exifreader';
import JSZip from 'jszip';
import { downloadBlob } from '../../lib/download';
import {
  buildSanitizedFilenameFromBlob,
  canStripInPlace,
  classifyMetadata,
  isAnimatedImage,
  listSensitiveMetadata,
  stripEmbeddedMetadata,
  type ClassifiedMetadata,
  type SensitiveMetadata,
} from './exif-engine';
import { consumeFileInput } from '../../lib/file-input';

type OutputFormat = 'preserve' | 'image/png' | 'image/jpeg' | 'image/webp';
type SanitizeMode = 'strip' | 'rebuild';

interface ExifItem {
  id: string;
  file: File;
  originalUrl: string;
  width?: number;
  height?: number;
  animated?: boolean;
  fields: ClassifiedMetadata[];
  sensitive: SensitiveMetadata[];
  inspectionStatus: string;
  outputBlob?: Blob;
  outputUrl?: string;
  outputName?: string;
  outputSensitive?: SensitiveMetadata[];
  outputWidth?: number;
  outputHeight?: number;
  outputStatus?: string;
  outputMethod?: string;
}

const SUPPORTED_OUTPUTS = new Set(['image/png', 'image/jpeg', 'image/webp']);
const RISK_LABEL: Record<ClassifiedMetadata['risk'], string> = {
  location: 'Location',
  device: 'Device',
  identity: 'Identity',
  time: 'Time',
  setting: 'Camera setting',
};

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function requestedMime(file: File, format: OutputFormat) {
  if (format !== 'preserve') return format;
  return SUPPORTED_OUTPUTS.has(file.type) ? file.type : 'image/png';
}

function inspectionCopy(fields: ClassifiedMetadata[], animated: boolean) {
  const privacy = fields.filter((field) => field.risk !== 'setting');
  const animation = animated ? ' Animated source.' : '';
  if (!privacy.length) return `Checked. No location, device, identity, or time fields found.${animation}`;
  const counts = ['location', 'device', 'identity', 'time']
    .map((risk) => {
      const count = privacy.filter((field) => field.risk === risk).length;
      return count ? `${count} ${risk}` : '';
    })
    .filter(Boolean)
    .join(', ');
  return `Found ${privacy.length} privacy field${privacy.length === 1 ? '' : 's'} (${counts}).${animation}`;
}

async function inspectDimensions(file: Blob) {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const dimensions = { width: bitmap.width, height: bitmap.height };
  bitmap.close();
  return dimensions;
}

async function encodeSanitized(
  file: File,
  format: OutputFormat,
  quality: number,
  jpegBackground: string,
) {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  try {
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas rendering is unavailable in this browser.');
    const mime = requestedMime(file, format);
    if (mime === 'image/jpeg') {
      context.fillStyle = jpegBackground;
      context.fillRect(0, 0, canvas.width, canvas.height);
    }
    context.drawImage(bitmap, 0, 0);
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (value) => value ? resolve(value) : reject(new Error('Image encoding failed.')),
        mime,
        mime === 'image/png' ? undefined : quality,
      );
    });
    return { blob, width: canvas.width, height: canvas.height, method: 'Rebuilt pixels' };
  } finally {
    bitmap.close();
  }
}

function Tip({ id, text }: { id: string; text: string }) {
  return <span className="exif-tip">
    <button type="button" className="exif-tip-button" aria-label={text} aria-describedby={id}>?</button>
    <span id={id} role="tooltip" className="exif-tip-bubble">{text}</span>
  </span>;
}

export default function ExifWorkspace() {
  const [items, setItems] = useState<ExifItem[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [format, setFormat] = useState<OutputFormat>('preserve');
  const [mode, setMode] = useState<SanitizeMode>('strip');
  const [quality, setQuality] = useState(0.94);
  const [jpegBackground, setJpegBackground] = useState('#ffffff');
  const [keepColorProfile, setKeepColorProfile] = useState(true);
  const [allowAnimationFlattening, setAllowAnimationFlattening] = useState(false);
  const [query, setQuery] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [status, setStatus] = useState('Choose an image to inspect its metadata.');
  const [busy, setBusy] = useState(false);
  const selectionVersion = useRef(0);
  const operationRevision = useRef(0);
  const urls = useRef(new Set<string>());

  function registerUrl(blob: Blob) {
    const url = URL.createObjectURL(blob);
    urls.current.add(url);
    return url;
  }

  function revokeUrl(url?: string) {
    if (!url) return;
    URL.revokeObjectURL(url);
    urls.current.delete(url);
  }

  function revokeAllUrls() {
    urls.current.forEach((url) => URL.revokeObjectURL(url));
    urls.current.clear();
  }

  useEffect(() => () => {
    selectionVersion.current += 1;
    operationRevision.current += 1;
    revokeAllUrls();
  }, []);

  const active = useMemo(
    () => items.find((item) => item.id === activeId) ?? items[0] ?? null,
    [activeId, items],
  );
  const animatedCount = useMemo(() => items.filter((item) => item.animated).length, [items]);
  const completedOutputs = useMemo(() => items.filter((item) => item.outputBlob && item.outputName), [items]);
  const rebuildRequired = mode === 'rebuild' || format !== 'preserve';
  const lossyQualityApplies = rebuildRequired && format !== 'image/png';
  const visibleFields = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (active?.fields ?? []).filter((field) => !needle || `${field.key} ${field.value} ${field.risk}`.toLowerCase().includes(needle));
  }, [active, query]);

  function invalidateOutputs(nextStatus = 'Output settings changed. Sanitize again to refresh the copies.') {
    operationRevision.current += 1;
    items.forEach((item) => revokeUrl(item.outputUrl));
    setItems((current) => current.map((item) => ({
      ...item,
      outputBlob: undefined,
      outputUrl: undefined,
      outputName: undefined,
      outputSensitive: undefined,
      outputWidth: undefined,
      outputHeight: undefined,
      outputStatus: undefined,
      outputMethod: undefined,
    })));
    if (items.length) setStatus(nextStatus);
  }

  async function inspect(files: File[]) {
    const version = ++selectionVersion.current;
    operationRevision.current += 1;
    revokeAllUrls();
    setItems([]);
    setActiveId(null);
    setAllowAnimationFlattening(false);
    setQuery('');
    if (!files.length) {
      setBusy(false);
      setStatus('Choose an image to inspect its metadata.');
      return;
    }

    setBusy(true);
    setStatus(`Inspecting ${files.length} image${files.length === 1 ? '' : 's'} on this device…`);
    const pending = files.map((file, index): ExifItem => ({
      id: `${version}-${index}-${file.name}-${file.size}-${file.lastModified}`,
      file,
      originalUrl: registerUrl(file),
      fields: [],
      sensitive: [],
      inspectionStatus: 'Inspecting…',
    }));
    setItems(pending);
    setActiveId(pending[0]?.id ?? null);

    const inspected = await Promise.all(pending.map(async (item): Promise<ExifItem> => {
      try {
        const [tags, dimensions, bytes] = await Promise.all([
          ExifReader.load(item.file),
          inspectDimensions(item.file).catch(() => ({ width: undefined, height: undefined })),
          item.file.arrayBuffer(),
        ]);
        const fields = classifyMetadata(tags as unknown as Record<string, unknown>);
        const sensitive = listSensitiveMetadata(tags as unknown as Record<string, unknown>);
        const animated = isAnimatedImage(new Uint8Array(bytes), item.file.type);
        return {
          ...item,
          ...dimensions,
          animated,
          fields,
          sensitive,
          inspectionStatus: inspectionCopy(fields, animated),
        };
      } catch (error) {
        return {
          ...item,
          inspectionStatus: `Could not inspect this file: ${error instanceof Error ? error.message : 'unknown error'}`,
        };
      }
    }));

    if (selectionVersion.current !== version) return;
    setItems(inspected);
    const failures = inspected.filter((item) => item.inspectionStatus.startsWith('Could not inspect')).length;
    const findingCount = inspected.reduce((sum, item) => sum + item.sensitive.length, 0);
    const animations = inspected.filter((item) => item.animated).length;
    const animationSuffix = animations
      ? ` ${animations} animated image${animations === 1 ? '' : 's'}. Stripping keeps the animation. Rebuilding pixels keeps only the first frame.`
      : '';
    setStatus(
      failures
        ? `${files.length - failures} of ${files.length} images checked. ${failures} could not be read.${animationSuffix}`
        : findingCount
          ? `Found ${findingCount} privacy field${findingCount === 1 ? '' : 's'} across ${files.length} image${files.length === 1 ? '' : 's'}.${animationSuffix}`
          : `Checked ${files.length} image${files.length === 1 ? '' : 's'}. No location, device, identity, or time fields found.${animationSuffix}`,
    );
    setBusy(false);
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragOver(false);
    const files = Array.from(event.dataTransfer.files ?? []).filter((file) => file.type.startsWith('image/') || /\.(jpe?g|png|webp|heic|heif)$/i.test(file.name));
    if (!files.length) {
      setStatus('Drop a JPEG, PNG, WebP, or HEIC image.');
      return;
    }
    void inspect(files);
  }

  async function sanitize(targetIds?: string[]) {
    const targets = targetIds ? items.filter((item) => targetIds.includes(item.id)) : items;
    if (!targets.length) return;
    if (rebuildRequired && targets.some((item) => item.animated) && !allowAnimationFlattening) {
      setStatus('Rebuilding pixels keeps only the first frame. Allow that before sanitizing an animation.');
      return;
    }

    const version = selectionVersion.current;
    const revision = operationRevision.current;
    const operationFormat = format;
    const operationQuality = quality;
    const operationJpegBackground = jpegBackground;
    const operationMode = mode;
    const operationKeepColor = keepColorProfile;
    const isCurrent = () => selectionVersion.current === version && operationRevision.current === revision;
    setBusy(true);
    setStatus(`Sanitizing 0 of ${targets.length} on this device…`);

    let completed = 0;
    let failed = 0;
    for (const item of targets) {
      if (!isCurrent()) return;
      setStatus(`Sanitizing ${completed + failed + 1} of ${targets.length} on this device…`);
      try {
        const sourceMime = SUPPORTED_OUTPUTS.has(item.file.type) ? item.file.type : 'image/png';
        const outputMime = requestedMime(item.file, operationFormat);
        const useStrip = operationMode === 'strip' && operationFormat === 'preserve' && canStripInPlace(item.file.type);
        let encoded: { blob: Blob; width?: number; height?: number; method: string };
        if (useStrip) {
          const stripped = stripEmbeddedMetadata(new Uint8Array(await item.file.arrayBuffer()), item.file.type, operationKeepColor);
          if (!isCurrent()) return;
          encoded = {
            blob: new Blob([stripped.buffer.slice(stripped.byteOffset, stripped.byteOffset + stripped.byteLength)], { type: item.file.type }),
            width: item.width,
            height: item.height,
            method: 'Stripped embedded metadata',
          };
        } else {
          if (operationMode === 'strip' && operationFormat === 'preserve' && !canStripInPlace(item.file.type)) {
            throw new Error('HEIC and other camera formats can be inspected here, but this browser cannot strip them without rebuilding pixels. Switch to Rebuild pixels.');
          }
          encoded = await encodeSanitized(item.file, operationFormat, operationQuality, operationJpegBackground);
        }
        if (!isCurrent()) return;
        const tags = await ExifReader.load(await encoded.blob.arrayBuffer());
        const outputSensitive = listSensitiveMetadata(tags as unknown as Record<string, unknown>);
        if (!isCurrent()) return;

        revokeUrl(item.outputUrl);
        const outputUrl = registerUrl(encoded.blob);
        const outputName = buildSanitizedFilenameFromBlob(item.file.name, encoded.blob.type ? encoded.blob : new Blob([], { type: outputMime || sourceMime }));
        setItems((current) => current.map((candidate) => candidate.id === item.id
          ? {
              ...candidate,
              outputBlob: encoded.blob,
              outputUrl,
              outputName,
              outputSensitive,
              outputWidth: encoded.width,
              outputHeight: encoded.height,
              outputMethod: encoded.method,
              outputStatus: outputSensitive.length
                ? `Still found ${outputSensitive.length} privacy field${outputSensitive.length === 1 ? '' : 's'} after ${encoded.method.toLowerCase()}`
                : `Checked again. No privacy fields found. ${encoded.method}.`,
            }
          : candidate));
        completed += 1;
        if (items.length === 1 && targets.length === 1) downloadBlob(encoded.blob, outputName);
      } catch (error) {
        failed += 1;
        if (!isCurrent()) return;
        setItems((current) => current.map((candidate) => candidate.id === item.id
          ? { ...candidate, outputStatus: `Sanitizing failed: ${error instanceof Error ? error.message : 'unknown error'}` }
          : candidate));
      }
    }

    if (!isCurrent()) return;
    setBusy(false);
    if (failed) {
      setStatus(`${completed} image${completed === 1 ? '' : 's'} sanitized. ${failed} failed and can be retried.`);
    } else if (items.length === 1 && targets.length === 1) {
      setStatus('Sanitized copy created on this device, checked again, and sent to your downloads.');
    } else if (targetIds) {
      setStatus(`${completed} selected image${completed === 1 ? '' : 's'} sanitized and checked again.`);
    } else {
      setStatus(`${completed} sanitized copies created and checked again. Download them one by one or as one ZIP.`);
    }
  }

  function removeItem(id: string) {
    if (busy) return;
    const removed = items.find((item) => item.id === id);
    if (!removed) return;
    selectionVersion.current += 1;
    operationRevision.current += 1;
    revokeUrl(removed.originalUrl);
    revokeUrl(removed.outputUrl);
    const remaining = items.filter((item) => item.id !== id);
    setItems(remaining);
    if (activeId === id) setActiveId(remaining[0]?.id ?? null);
    setStatus(remaining.length
      ? `${removed.file.name} removed. ${remaining.length} image${remaining.length === 1 ? '' : 's'} remain.`
      : 'All images removed. Choose an image to inspect its metadata.');
  }

  async function downloadBatchZip() {
    const outputs = items.filter((item): item is ExifItem & { outputBlob: Blob; outputName: string } => Boolean(item.outputBlob && item.outputName));
    if (!outputs.length) return;
    const version = selectionVersion.current;
    const revision = operationRevision.current;
    setBusy(true);
    setStatus(`Packing ${outputs.length} sanitized image${outputs.length === 1 ? '' : 's'} into a ZIP…`);
    try {
      const zip = new JSZip();
      outputs.forEach((item, index) => {
        zip.file(`${String(index + 1).padStart(2, '0')}-${item.outputName}`, item.outputBlob);
      });
      const blob = await zip.generateAsync({ type: 'blob' });
      if (selectionVersion.current !== version || operationRevision.current !== revision) return;
      downloadBlob(blob, 'exif-sanitized-batch.zip');
      setStatus(`ZIP with ${outputs.length} sanitized image${outputs.length === 1 ? '' : 's'} sent to your downloads.`);
    } catch (error) {
      if (selectionVersion.current !== version || operationRevision.current !== revision) return;
      setStatus(`ZIP creation failed: ${error instanceof Error ? error.message : 'unknown error'}`);
    } finally {
      if (selectionVersion.current === version && operationRevision.current === revision) setBusy(false);
    }
  }

  function downloadFindings() {
    if (!items.length) return;
    const report = {
      createdAt: new Date().toISOString(),
      note: 'Local inspection report. Values can include location and identity data from the original files.',
      images: items.map((item) => ({
        name: item.file.name,
        type: item.file.type,
        bytes: item.file.size,
        width: item.width,
        height: item.height,
        animated: Boolean(item.animated),
        privacyFields: item.sensitive,
        otherFields: item.fields.filter((field) => field.risk === 'setting').map(({ key, value }) => ({ key, value })),
      })),
    };
    downloadBlob(new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' }), 'exif-inspection-report.json');
    setStatus('Inspection report sent to your downloads. It contains the original metadata values.');
  }

  async function copyValue(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setStatus('Copied the field value.');
    } catch {
      setStatus('Clipboard access was unavailable. Select the expanded value and copy it manually.');
    }
  }

  return <>
    <div className="workspace-header"><div><h2>Inspect and sanitize</h2><p>Review what the file is carrying, then make a clean copy. The original stays put.</p></div></div>
    <div className="workspace-body">
      <div
        className={`field exif-drop${dragOver ? ' dragover' : ''}`}
        onDragOver={(event) => { event.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
      >
        <label htmlFor="exif-file">Choose image</label> <Tip id="exif-tip-file" text="JPEG, PNG, and WebP can be stripped in place. HEIC can be inspected, and rebuilt only if this browser can decode it." />
        <input
          id="exif-file"
          type="file"
          multiple
          accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif"
          onChange={(event) => consumeFileInput(event.target, () => inspect(Array.from(event.target.files ?? [])))}
        />
        <small>Drop images here, or pick one for an immediate download. Pick several for a batch and a ZIP.</small>
      </div>

      <div className={`status-line ${items.some((item) => item.sensitive.length) ? 'error' : items.length ? 'good' : ''}`} role="status">
        {busy ? status : status}
      </div>

      {items.length ? <>
        <div className="workspace-grid three" style={{ marginTop: 18 }}>
          <div className="field">
            <label htmlFor="exif-mode">Sanitize method</label> <Tip id="exif-tip-mode" text="Strip embedded metadata leaves the image data untouched and keeps animation. Rebuild pixels makes a new image and can remove hidden pixel payloads, but it recompresses JPEG and WebP and flattens animation." />
            <select id="exif-mode" value={mode} disabled={busy} onChange={(event) => {
              setMode(event.target.value as SanitizeMode);
              invalidateOutputs();
            }}>
              <option value="strip">Strip embedded metadata</option>
              <option value="rebuild">Rebuild pixels</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="exif-format">Output format</label> <Tip id="exif-tip-format" text="Preserve keeps JPEG, PNG, or WebP as-is when stripping. Choosing another format rebuilds the pixels." />
            <select id="exif-format" value={format} disabled={busy} onChange={(event) => {
              setFormat(event.target.value as OutputFormat);
              invalidateOutputs();
            }}>
              <option value="preserve">Preserve supported source format</option>
              <option value="image/png">PNG</option>
              <option value="image/jpeg">JPEG</option>
              <option value="image/webp">WebP</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="exif-quality">Lossy quality: {Math.round(quality * 100)}%</label> <Tip id="exif-tip-quality" text="Used only when pixels are rebuilt as JPEG or WebP. Stripping a JPEG does not recompress it." />
            <input id="exif-quality" type="range" min="0.1" max="1" step="0.01" value={quality} disabled={busy || !lossyQualityApplies} onChange={(event) => {
              setQuality(Number(event.target.value));
              invalidateOutputs();
            }} />
          </div>
          {rebuildRequired && (format === 'image/jpeg' || (format === 'preserve' && items.some((item) => item.file.type === 'image/jpeg'))) ? <div className="field">
            <label htmlFor="exif-jpeg-background">JPEG transparency background</label> <Tip id="exif-tip-jpeg" text="JPEG has no transparency. Transparent pixels are painted onto this color before encoding." />
            <input id="exif-jpeg-background" type="color" value={jpegBackground} disabled={busy} onChange={(event) => {
              setJpegBackground(event.target.value);
              invalidateOutputs('JPEG background changed. Sanitize again to refresh the copies.');
            }} />
            <small>Transparent source pixels are painted onto this color before JPEG encoding.</small>
          </div> : null}
        </div>

        {mode === 'strip' && format === 'preserve' ? <label className="exif-check">
          <input type="checkbox" checked={keepColorProfile} disabled={busy} onChange={(event) => {
            setKeepColorProfile(event.target.checked);
            invalidateOutputs('Color profile handling changed. Sanitize again to refresh the copies.');
          }} />
          <span>Keep the JPEG color profile <Tip id="exif-tip-icc" text="An ICC profile keeps color consistent and is not a location or identity field. Uncheck this only if you want that segment removed too." /></span>
        </label> : null}

        {animatedCount && rebuildRequired ? <div className="notice" style={{ marginTop: 16 }}>
          <strong>This will flatten the animation.</strong> {animatedCount} animated PNG or WebP image{animatedCount === 1 ? '' : 's'} will keep only the first frame if you rebuild pixels. Stripping embedded metadata keeps the frames.
          <label className="exif-check">
            <input type="checkbox" checked={allowAnimationFlattening} disabled={busy} onChange={(event) => {
              setAllowAnimationFlattening(event.target.checked);
              invalidateOutputs('Animation handling changed. Sanitize again to refresh the copies.');
            }} />
            <span>Allow animated images to be flattened to the first frame.</span>
          </label>
        </div> : null}

        <div className="button-row exif-actions" style={{ marginTop: 16 }}>
          <button className="action-button" type="button" disabled={busy || (rebuildRequired && animatedCount > 0 && !allowAnimationFlattening)} onClick={() => sanitize()}>
            {items.length === 1 ? 'Sanitize and download' : 'Sanitize files'}
          </button>
          {completedOutputs.length > 1 ? <button type="button" disabled={busy} onClick={downloadBatchZip}>Download batch ZIP</button> : null}
          <button type="button" disabled={busy} onClick={downloadFindings}>Download inspection report</button>
        </div>

        <div className="result-table-wrap" tabIndex={0} aria-label="Image inspection batch" style={{ marginTop: 18 }}>
          <table>
            <thead><tr><th scope="col">File</th><th scope="col">Inspection</th><th scope="col">Dimensions</th><th scope="col">Size</th><th scope="col">Output</th><th scope="col">Actions</th></tr></thead>
            <tbody>{items.map((item) => <tr key={item.id}>
              <td style={{ overflowWrap: 'anywhere' }}>{item.file.name}</td>
              <td>{item.inspectionStatus}</td>
              <td>{item.width && item.height ? `${item.width} × ${item.height}` : '—'}</td>
              <td>{formatBytes(item.file.size)}</td>
              <td>{item.outputBlob
                ? <>{item.outputStatus}<br /><small>{formatBytes(item.outputBlob.size)} · {item.outputBlob.type || 'unknown type'}{item.outputMethod ? ` · ${item.outputMethod}` : ''}</small></>
                : item.outputStatus ?? 'Not generated'}</td>
              <td><div className="button-row exif-actions">
                <button type="button" onClick={() => setActiveId(item.id)} aria-label={`Preview ${item.file.name}`}>Preview</button>
                {item.outputBlob && item.outputName ? <button type="button" onClick={() => downloadBlob(item.outputBlob!, item.outputName!)} aria-label={`Download sanitized ${item.file.name}`}>Download</button> : null}
                {item.outputStatus?.startsWith('Sanitizing failed') ? <button type="button" disabled={busy} onClick={() => sanitize([item.id])} aria-label={`Retry ${item.file.name}`}>Retry</button> : null}
                <button type="button" disabled={busy} onClick={() => removeItem(item.id)} aria-label={`Remove ${item.file.name}`}>Remove</button>
              </div></td>
            </tr>)}</tbody>
          </table>
        </div>
      </> : null}

      {active ? <>
        <div className="workspace-grid exif-preview" style={{ marginTop: 20 }}>
          <figure style={{ margin: 0, minWidth: 0 }}>
            <figcaption><strong>Original preview</strong><br /><small>{active.width && active.height ? `${active.width} × ${active.height} · ` : ''}{formatBytes(active.file.size)}{active.animated ? ' · animated' : ''}</small></figcaption>
            <img src={active.originalUrl} alt={`Original preview of ${active.file.name}`} style={{ display: 'block', width: '100%', maxHeight: 360, objectFit: 'contain', marginTop: 10 }} />
          </figure>
          <figure style={{ margin: 0, minWidth: 0 }}>
            <figcaption><strong>Sanitized preview</strong><br /><small>{active.outputBlob ? `${active.outputWidth ?? '—'} × ${active.outputHeight ?? '—'} · ${formatBytes(active.outputBlob.size)} · ${active.outputBlob.type}` : 'Generate a copy to compare it here.'}</small></figcaption>
            {active.outputUrl
              ? <img src={active.outputUrl} alt={`Sanitized preview of ${active.file.name}`} style={{ display: 'block', width: '100%', maxHeight: 360, objectFit: 'contain', marginTop: 10 }} />
              : <div className="notice" style={{ marginTop: 10 }}>No sanitized preview yet.</div>}
          </figure>
        </div>

        <div className="exif-meta-tools">
          <div className="field">
            <label htmlFor="exif-filter">Filter fields</label> <Tip id="exif-tip-filter" text="Filters the field list for the image in the preview. It does not change what gets removed." />
            <input id="exif-filter" type="text" value={query} placeholder="GPS, Make, author…" onChange={(event) => setQuery(event.target.value)} />
          </div>
          <button type="button" disabled={!active.sensitive.length} onClick={() => copyValue(active.sensitive.map((field) => `${field.key}: ${field.value}`).join('\n'))}>Copy privacy fields</button>
        </div>

        {visibleFields.length ? <div className="result-table-wrap" tabIndex={0} aria-label={`Metadata for ${active.file.name}`} style={{ marginTop: 12 }}>
          <table><thead><tr><th scope="col">Field</th><th scope="col">Kind</th><th scope="col">Value</th></tr></thead><tbody>{visibleFields.map((item) => <tr key={item.key}><td>{item.key}</td><td>{RISK_LABEL[item.risk]}</td><td>
            <details>
              <summary>View value</summary>
              <code style={{ display: 'block', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', marginTop: 8 }}>{item.value}</code>
              <button type="button" style={{ marginTop: 8 }} onClick={() => copyValue(item.value)} aria-label={`Copy ${item.key}`}>Copy value</button>
            </details>
          </td></tr>)}</tbody></table>
        </div> : <p className="help-text">No fields match this filter.</p>}
      </> : null}

      <p className="help-text">Strip embedded metadata removes EXIF, XMP, IPTC, comments, and PNG/WebP text from the container and leaves the image data alone. Rebuild pixels draws a new image, which also drops a thumbnail hidden in metadata, but it recompresses JPEG and WebP and keeps only the first frame of an animation. “No privacy fields found” means this inspection did not see location, device, identity, or time fields. It is not a promise about data hidden in the pixels themselves.</p>
    </div>
  </>;
}

import { useEffect, useMemo, useRef, useState } from 'react';
import ExifReader from 'exifreader';
import { downloadBlob } from '../../lib/download';
import { buildSanitizedFilenameFromBlob, listSensitiveMetadata, type SensitiveMetadata } from './exif-engine';
import { consumeFileInput } from '../../lib/file-input';

type OutputFormat = 'preserve' | 'image/png' | 'image/jpeg' | 'image/webp';

interface ExifItem {
  id: string;
  file: File;
  originalUrl: string;
  width?: number;
  height?: number;
  sensitive: SensitiveMetadata[];
  inspectionStatus: string;
  outputBlob?: Blob;
  outputUrl?: string;
  outputName?: string;
  outputSensitive?: SensitiveMetadata[];
  outputWidth?: number;
  outputHeight?: number;
  outputStatus?: string;
}

const SUPPORTED_OUTPUTS = new Set(['image/png', 'image/jpeg', 'image/webp']);

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function requestedMime(file: File, format: OutputFormat) {
  if (format !== 'preserve') return format;
  return SUPPORTED_OUTPUTS.has(file.type) ? file.type : 'image/png';
}

async function inspectDimensions(file: Blob) {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const dimensions = { width: bitmap.width, height: bitmap.height };
  bitmap.close();
  return dimensions;
}

async function encodeSanitized(file: File, format: OutputFormat, quality: number) {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  try {
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas rendering is unavailable in this browser.');
    context.drawImage(bitmap, 0, 0);
    const mime = requestedMime(file, format);
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (value) => value ? resolve(value) : reject(new Error('Image encoding failed.')),
        mime,
        mime === 'image/png' ? undefined : quality,
      );
    });
    return { blob, width: canvas.width, height: canvas.height };
  } finally {
    bitmap.close();
  }
}

export default function ExifWorkspace() {
  const [items, setItems] = useState<ExifItem[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [format, setFormat] = useState<OutputFormat>('preserve');
  const [quality, setQuality] = useState(0.94);
  const [status, setStatus] = useState('Choose an image to inspect its metadata.');
  const [busy, setBusy] = useState(false);
  const selectionVersion = useRef(0);
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

  useEffect(() => () => revokeAllUrls(), []);

  const active = useMemo(
    () => items.find((item) => item.id === activeId) ?? items[0] ?? null,
    [activeId, items],
  );

  function invalidateOutputs(nextStatus = 'Output settings changed. Sanitize again to regenerate the output.') {
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
    })));
    if (items.length) setStatus(nextStatus);
  }

  async function inspect(files: File[]) {
    const version = ++selectionVersion.current;
    revokeAllUrls();
    setItems([]);
    setActiveId(null);
    if (!files.length) {
      setBusy(false);
      setStatus('Choose an image to inspect its metadata.');
      return;
    }

    setBusy(true);
    setStatus(`Inspecting ${files.length} image${files.length === 1 ? '' : 's'} locally…`);
    const pending = files.map((file, index): ExifItem => ({
      id: `${version}-${index}-${file.name}-${file.size}-${file.lastModified}`,
      file,
      originalUrl: registerUrl(file),
      sensitive: [],
      inspectionStatus: 'Inspecting…',
    }));
    setItems(pending);
    setActiveId(pending[0]?.id ?? null);

    const inspected = await Promise.all(pending.map(async (item): Promise<ExifItem> => {
      try {
        const [tags, dimensions] = await Promise.all([
          ExifReader.load(item.file),
          inspectDimensions(item.file),
        ]);
        const sensitive = listSensitiveMetadata(tags as unknown as Record<string, unknown>);
        return {
          ...item,
          ...dimensions,
          sensitive,
          inspectionStatus: sensitive.length
            ? `${sensitive.length} sensitive field${sensitive.length === 1 ? '' : 's'}`
            : 'No sensitive metadata found',
        };
      } catch (error) {
        return {
          ...item,
          inspectionStatus: `Inspection failed: ${error instanceof Error ? error.message : 'unknown error'}`,
        };
      }
    }));

    if (selectionVersion.current !== version) return;
    setItems(inspected);
    const failures = inspected.filter((item) => item.inspectionStatus.startsWith('Inspection failed')).length;
    const findingCount = inspected.reduce((sum, item) => sum + item.sensitive.length, 0);
    setStatus(
      failures
        ? `${files.length - failures} of ${files.length} images inspected; ${failures} failed.`
        : findingCount
          ? `Sensitive metadata found: ${findingCount} field${findingCount === 1 ? '' : 's'} across ${files.length} image${files.length === 1 ? '' : 's'}.`
          : `No sensitive metadata found in ${files.length} image${files.length === 1 ? '' : 's'}.`,
    );
    setBusy(false);
  }

  async function sanitize() {
    if (!items.length) return;
    const version = selectionVersion.current;
    setBusy(true);
    setStatus(`Sanitizing ${items.length} image${items.length === 1 ? '' : 's'} locally…`);

    let completed = 0;
    let failed = 0;
    for (const item of items) {
      if (selectionVersion.current !== version) return;
      try {
        const encoded = await encodeSanitized(item.file, format, quality);
        const tags = await ExifReader.load(await encoded.blob.arrayBuffer());
        const outputSensitive = listSensitiveMetadata(tags as unknown as Record<string, unknown>);
        if (selectionVersion.current !== version) return;

        revokeUrl(item.outputUrl);
        const outputUrl = registerUrl(encoded.blob);
        const outputName = buildSanitizedFilenameFromBlob(item.file.name, encoded.blob);
        setItems((current) => current.map((candidate) => candidate.id === item.id
          ? {
              ...candidate,
              outputBlob: encoded.blob,
              outputUrl,
              outputName,
              outputSensitive,
              outputWidth: encoded.width,
              outputHeight: encoded.height,
              outputStatus: outputSensitive.length
                ? `Reinspection found ${outputSensitive.length} sensitive field${outputSensitive.length === 1 ? '' : 's'}`
                : 'Reinspection found no sensitive metadata',
            }
          : candidate));
        completed += 1;
        if (items.length === 1) downloadBlob(encoded.blob, outputName);
      } catch (error) {
        failed += 1;
        if (selectionVersion.current !== version) return;
        setItems((current) => current.map((candidate) => candidate.id === item.id
          ? { ...candidate, outputStatus: `Sanitizing failed: ${error instanceof Error ? error.message : 'unknown error'}` }
          : candidate));
      }
    }

    if (selectionVersion.current !== version) return;
    setBusy(false);
    if (failed) {
      setStatus(`${completed} image${completed === 1 ? '' : 's'} sanitized; ${failed} failed.`);
    } else if (items.length === 1) {
      setStatus('Sanitized copy created locally, reinspected, and sent to your downloads.');
    } else {
      setStatus(`${completed} sanitized copies created and reinspected. Download each result from the file list.`);
    }
  }

  async function copyValue(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setStatus('Metadata value copied to the clipboard.');
    } catch {
      setStatus('Clipboard access was unavailable. Select the expanded value and copy it manually.');
    }
  }

  return <>
    <div className="workspace-header"><div><h2>Inspect and sanitize</h2><p>Metadata review happens before any output is created.</p></div></div>
    <div className="workspace-body">
      <div className="field">
        <label htmlFor="exif-file">Choose image</label>
        <input
          id="exif-file"
          type="file"
          multiple
          accept="image/jpeg,image/png,image/webp"
          onChange={(event) => consumeFileInput(event.target, () => inspect(Array.from(event.target.files ?? [])))}
        />
        <small>Select one image for immediate sanitize-and-download, or multiple images for a local batch with per-file downloads.</small>
      </div>

      <div className={`status-line ${items.some((item) => item.sensitive.length) ? 'error' : items.length ? 'good' : ''}`} role="status">
        {busy ? 'Processing locally…' : status}
      </div>

      {items.length ? <>
        <div className="workspace-grid three" style={{ marginTop: 18 }}>
          <div className="field">
            <label htmlFor="exif-format">Output format</label>
            <select id="exif-format" value={format} onChange={(event) => {
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
            <label htmlFor="exif-quality">Lossy quality: {Math.round(quality * 100)}%</label>
            <input id="exif-quality" type="range" min="0.1" max="1" step="0.01" value={quality} disabled={format === 'image/png'} onChange={(event) => {
              setQuality(Number(event.target.value));
              invalidateOutputs();
            }} />
          </div>
          <div className="button-row" style={{ alignItems: 'end' }}>
            <button className="action-button" type="button" disabled={busy} onClick={sanitize}>
              {items.length === 1 ? 'Sanitize and download' : 'Sanitize files'}
            </button>
          </div>
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
                ? <>{item.outputStatus}<br /><small>{formatBytes(item.outputBlob.size)} · {item.outputBlob.type || 'unknown MIME'}</small></>
                : item.outputStatus ?? 'Not generated'}</td>
              <td><div className="button-row">
                <button type="button" onClick={() => setActiveId(item.id)}>Preview</button>
                {item.outputBlob && item.outputName ? <button type="button" onClick={() => downloadBlob(item.outputBlob!, item.outputName!)}>Download</button> : null}
              </div></td>
            </tr>)}</tbody>
          </table>
        </div>
      </> : null}

      {active ? <>
        <div className="workspace-grid" style={{ marginTop: 20 }}>
          <figure style={{ margin: 0, minWidth: 0 }}>
            <figcaption><strong>Original preview</strong><br /><small>{active.width && active.height ? `${active.width} × ${active.height} · ` : ''}{formatBytes(active.file.size)}</small></figcaption>
            <img src={active.originalUrl} alt={`Original preview of ${active.file.name}`} style={{ display: 'block', width: '100%', maxHeight: 360, objectFit: 'contain', marginTop: 10 }} />
          </figure>
          <figure style={{ margin: 0, minWidth: 0 }}>
            <figcaption><strong>Sanitized preview</strong><br /><small>{active.outputBlob ? `${active.outputWidth} × ${active.outputHeight} · ${formatBytes(active.outputBlob.size)} · ${active.outputBlob.type}` : 'Generate an output to compare it here.'}</small></figcaption>
            {active.outputUrl
              ? <img src={active.outputUrl} alt={`Sanitized preview of ${active.file.name}`} style={{ display: 'block', width: '100%', maxHeight: 360, objectFit: 'contain', marginTop: 10 }} />
              : <div className="notice" style={{ marginTop: 10 }}>No sanitized preview yet.</div>}
          </figure>
        </div>

        {active.sensitive.length > 0 ? <div className="result-table-wrap" tabIndex={0} aria-label={`Sensitive metadata for ${active.file.name}`} style={{ marginTop: 20 }}>
          <table><thead><tr><th scope="col">Sensitive field</th><th scope="col">Detected value</th></tr></thead><tbody>{active.sensitive.map((item) => <tr key={item.key}><td>{item.key}</td><td>
            <details>
              <summary>View value</summary>
              <code style={{ display: 'block', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', marginTop: 8 }}>{item.value}</code>
              <button type="button" style={{ marginTop: 8 }} onClick={() => copyValue(item.value)}>Copy value</button>
            </details>
          </td></tr>)}</tbody></table>
        </div> : null}
      </> : null}

      <p className="help-text">The output is rebuilt from rendered pixels, which removes embedded EXIF/XMP metadata rather than merely hiding individual fields. Generated files are reinspected before they are offered as completed results.</p>
    </div>
  </>;
}

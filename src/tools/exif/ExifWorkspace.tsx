import { useState } from 'react';
import ExifReader from 'exifreader';
import { downloadBlob } from '../../lib/download';
import { buildSanitizedFilename, listSensitiveMetadata, type SensitiveMetadata } from './exif-engine';

export default function ExifWorkspace() {
  const [file, setFile] = useState<File | null>(null);
  const [sensitive, setSensitive] = useState<SensitiveMetadata[]>([]);
  const [status, setStatus] = useState('Choose an image to inspect its metadata.');
  const [busy, setBusy] = useState(false);

  async function inspect(next: File | null) {
    setFile(next);
    setSensitive([]);
    if (!next) { setStatus('Choose an image to inspect its metadata.'); return; }
    setBusy(true);
    try {
      const tags = await ExifReader.load(next);
      const found = listSensitiveMetadata(tags as unknown as Record<string, unknown>);
      setSensitive(found);
      setStatus(found.length ? `Sensitive metadata found: ${found.length} field${found.length === 1 ? '' : 's'}.` : 'No sensitive metadata found.');
    } catch (error) {
      setStatus(`Metadata inspection could not complete: ${error instanceof Error ? error.message : 'unknown error'}`);
    } finally { setBusy(false); }
  }

  async function sanitize() {
    if (!file) return;
    setBusy(true);
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Canvas rendering is unavailable in this browser.');
      context.drawImage(bitmap, 0, 0);
      bitmap.close();
      const outputType = ['image/png', 'image/jpeg', 'image/webp'].includes(file.type) ? file.type : 'image/png';
      const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error('Image encoding failed.')), outputType, 0.94));
      downloadBlob(blob, buildSanitizedFilename(file.name, outputType));
      setStatus('Sanitized copy created locally and sent to your downloads.');
    } catch (error) {
      setStatus(`Sanitizing failed: ${error instanceof Error ? error.message : 'unknown error'}`);
    } finally { setBusy(false); }
  }

  return <>
    <div className="workspace-header"><div><h2>Inspect and sanitize</h2><p>Metadata review happens before any output is created.</p></div></div>
    <div className="workspace-body">
      <div className="field"><label htmlFor="exif-file">Choose image</label><input id="exif-file" type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => inspect(event.target.files?.[0] ?? null)} /></div>
      <div className={`status-line ${sensitive.length ? 'error' : file ? 'good' : ''}`} role="status">{busy ? 'Processing locally…' : status}</div>
      {sensitive.length > 0 ? <div className="result-table-wrap"><table><thead><tr><th scope="col">Sensitive field</th><th scope="col">Detected value</th></tr></thead><tbody>{sensitive.map((item) => <tr key={item.key}><td>{item.key}</td><td>{item.value}</td></tr>)}</tbody></table></div> : null}
      <div className="button-row"><button className="action-button" type="button" disabled={!file || busy} onClick={sanitize}>Sanitize and download</button></div>
      <p className="help-text">The output is rebuilt from rendered pixels, which removes embedded EXIF/XMP metadata rather than merely hiding individual fields.</p>
    </div>
  </>;
}

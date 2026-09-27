/**
 * Export tab (ledgers 26, 73–80): format and quality, tags and cover art,
 * single-file or batch export, and loudness / spectrum telemetry.
 *
 * Receives the panel context from the workspace. Each file is rendered by the
 * DSP worker (`renderExport`) one at a time to bound memory, encoded here by
 * `mastering-export.ts`, then downloaded directly or packed into one ZIP.
 * Codec availability is probed the first time the tab is shown, never before,
 * because the probe loads encoder code.
 */
import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { downloadBytes, downloadText } from '../../lib/download';
import { consumeFileInput } from '../../lib/file-input';
import type { Spectrum } from './dsp/analysis';
import {
  EMPTY_METADATA,
  FILE_EXTENSION,
  FORMAT_FIELDS,
  buildExportZip,
  encodeCompressed,
  encodeWav,
  loudnessCsv,
  loudnessJson,
  planExportJobs,
  probeExportCapabilities,
  safeFileName,
  type Artwork,
  type CodecCapability,
  type ExportFormat,
  type ExportMetadata,
  type ExportScope,
  type LoudnessReportRow,
  type MetadataField,
  type WavDepth,
  type ZipEntry,
} from './mastering-export';
import { spectrumPng } from './mastering-export-png';
import { formatBytes, messageOf, type MasteringPanelContext } from './mastering-ui';

// --- SECTION: choices ---

const FORMAT_ORDER: ExportFormat[] = ['wav', 'flac', 'mp3', 'm4a', 'ogg'];
const FORMAT_NAMES: Record<ExportFormat, string> = { wav: 'WAV', flac: 'FLAC', mp3: 'MP3', m4a: 'AAC (M4A)', ogg: 'Ogg' };
const FORMAT_HINTS: Record<ExportFormat, string> = {
  wav: 'Uncompressed PCM for editing, mastering handoffs, and archival workflows.',
  flac: 'Lossless compression that is typically smaller than WAV. Playback support depends on the app and device.',
  mp3: 'Lossy with broad playback support. Higher bitrates trade larger files for less compression loss.',
  m4a: 'Lossy AAC in an M4A container. Playback support is broad across current mobile and desktop platforms.',
  ogg: 'Lossy Ogg using Opus when available, otherwise Vorbis. Playback support depends on the app and device.',
};
const BITRATES: Partial<Record<ExportFormat, number[]>> = {
  mp3: [128, 192, 256, 320],
  m4a: [128, 192, 256, 320],
  ogg: [96, 128, 160, 192, 256],
};
const DEFAULT_BITRATE: Partial<Record<ExportFormat, number>> = { mp3: 320, m4a: 256, ogg: 160 };
const COMMON_RATES = [44_100, 48_000, 88_200, 96_000];
const SCOPE_LABELS: Record<ExportScope, string> = {
  project: 'Whole project',
  selection: 'Selection only',
  regions: 'Each region as its own file',
  stems: 'Each track as a stem',
};

const FIELD_LABELS: Array<{ field: keyof ExportMetadata; label: string; wide?: boolean; placeholder?: string }> = [
  { field: 'title', label: 'Title', placeholder: 'Defaults to the file name' },
  { field: 'artist', label: 'Artist' },
  { field: 'album', label: 'Album' },
  { field: 'albumArtist', label: 'Album artist' },
  { field: 'trackNumber', label: 'Track number' },
  { field: 'tracksTotal', label: 'Total tracks' },
  { field: 'discNumber', label: 'Disc number' },
  { field: 'discsTotal', label: 'Total discs' },
  { field: 'genre', label: 'Genre' },
  { field: 'date', label: 'Release date', placeholder: 'YYYY or YYYY-MM-DD' },
  { field: 'comment', label: 'Comment', wide: true },
  { field: 'description', label: 'Description', wide: true },
  { field: 'lyrics', label: 'Lyrics', wide: true },
  { field: 'originator', label: 'Originator (Broadcast Wave)' },
  { field: 'originatorReference', label: 'Originator reference (Broadcast Wave)' },
];

const NUMERIC_FIELDS = new Set<keyof ExportMetadata>(['trackNumber', 'tracksTotal', 'discNumber', 'discsTotal']);
const MAX_ARTWORK_BYTES = 10 * 1024 * 1024;
const MIME: Record<ExportFormat, string> = { wav: 'audio/wav', flac: 'audio/flac', mp3: 'audio/mpeg', m4a: 'audio/mp4', ogg: 'audio/ogg' };

interface ExportReport {
  rows: LoudnessReportRow[];
  spectra: Array<{ name: string; spectrum: Spectrum; sampleRate: number }>;
  folder: string;
}

const fmt = (value: number, digits = 1) => (Number.isFinite(value) ? value.toFixed(digits) : '−∞');

/** First source's file name without its extension, as a friendly default. */
function defaultBaseName(ctx: MasteringPanelContext) {
  const first = ctx.document.sources[0]?.name ?? 'master';
  return safeFileName(first.replace(/\.[^.]+$/, ''), 'master');
}

export default function MasteringExportTab({ ctx, active }: { ctx: MasteringPanelContext; active: boolean }) {
  const projectRate = ctx.document.sampleRate ?? 48_000;
  const channelCount = ctx.render?.mix.channels.length ?? 2;
  const [scope, setScope] = useState<ExportScope>('project');
  const [format, setFormat] = useState<ExportFormat>('wav');
  const [depth, setDepth] = useState<WavDepth>(24);
  const [dither, setDither] = useState(true);
  const [rate, setRate] = useState(projectRate);
  const [bitrate, setBitrate] = useState<Record<string, number>>({ ...DEFAULT_BITRATE });
  const [applyMaster, setApplyMaster] = useState(true);
  const [baseName, setBaseName] = useState(() => defaultBaseName(ctx));
  const [metadata, setMetadata] = useState<ExportMetadata>(EMPTY_METADATA);
  const [artwork, setArtwork] = useState<(Artwork & { url: string }) | null>(null);
  const [capabilities, setCapabilities] = useState<CodecCapability[] | null>(null);
  const [probeError, setProbeError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [report, setReport] = useState<ExportReport | null>(null);
  const baseNameTouched = useRef(false);
  const mounted = useRef(true);

  useEffect(() => () => { mounted.current = false; }, []);

  // The project rate is only known after the first import; follow it until the user picks another.
  const rateTouched = useRef(false);
  useEffect(() => { if (!rateTouched.current) setRate(projectRate); }, [projectRate]);
  const firstSourceName = ctx.document.sources[0]?.name;
  useEffect(() => {
    if (!baseNameTouched.current) setBaseName(safeFileName((firstSourceName ?? 'master').replace(/\.[^.]+$/, ''), 'master'));
  }, [firstSourceName]);

  // Revoke the artwork preview URL when it is replaced or the tab goes away.
  useEffect(() => () => { if (artwork) URL.revokeObjectURL(artwork.url); }, [artwork]);

  // Probe only once the tab has been shown, and again when rate or channel count changes.
  const [shown, setShown] = useState(false);
  useEffect(() => { if (active) setShown(true); }, [active]);
  useEffect(() => {
    if (!shown) return;
    let cancelled = false;
    setCapabilities(null);
    setProbeError(null);
    probeExportCapabilities(channelCount, rate).then((result) => {
      if (!cancelled && mounted.current) setCapabilities(result);
    }).catch((error: unknown) => {
      if (!cancelled && mounted.current) setProbeError(messageOf(error));
    });
    return () => { cancelled = true; };
  }, [shown, channelCount, rate]);

  const capability = (candidate: ExportFormat) => capabilities?.find((item) => item.format === candidate);
  const selected = capability(format);
  const formatReady = format === 'wav' || Boolean(selected?.available);
  const stored = FORMAT_FIELDS[format];
  const rates = useMemo(() => [...new Set([projectRate, ...COMMON_RATES])].sort((a, b) => a - b), [projectRate]);
  const stems = scope === 'stems';
  const regionCount = ctx.document.regions.length;
  const trackCount = ctx.document.tracks.filter((track) => track.clips.length > 0).length;
  const ready = ctx.canEdit && !ctx.rendering && Boolean(ctx.render?.mix.channels[0]?.length) && formatReady && !busy;

  const setField = (field: keyof ExportMetadata, value: string) => setMetadata((current) => ({ ...current, [field]: value }));

  const onArtwork = (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    consumeFileInput(input, async () => {
      if (!file) return;
      if (!/^image\/(jpeg|png)$/.test(file.type)) { ctx.setStatus('Cover art must be a JPEG or PNG image.'); return; }
      if (file.size > MAX_ARTWORK_BYTES) { ctx.setStatus(`Cover art must be under ${formatBytes(MAX_ARTWORK_BYTES)}; this image is ${formatBytes(file.size)}.`); return; }
      const data = new Uint8Array(await file.arrayBuffer());
      if (!mounted.current) return;
      setArtwork({ data, mimeType: file.type, name: file.name, url: URL.createObjectURL(file) });
      ctx.setStatus(`Cover art set to ${file.name}.`);
    });
  };

  // --- SECTION: export ---

  const runExport = async () => {
    const client = ctx.client;
    if (!client) return;
    let jobs;
    try {
      jobs = planExportJobs(ctx.latestDocument(), scope, baseName, ctx.duration);
    } catch (error) { ctx.setStatus(messageOf(error)); return; }
    const extension = FILE_EXTENSION[format];
    const rows: LoudnessReportRow[] = [];
    const spectra: ExportReport['spectra'] = [];
    const files: ZipEntry[] = [];
    const skipped = new Set<string>();
    const started = performance.now();
    try {
      for (const [index, job] of jobs.entries()) {
        setBusy(jobs.length > 1 ? `Rendering ${index + 1} of ${jobs.length}: ${job.name}…` : `Rendering ${job.name}…`);
        const document = ctx.latestDocument();
        const result = await client.renderExport(document, {
          startSeconds: job.startSeconds,
          endSeconds: job.endSeconds,
          trackId: job.trackId,
          master: applyMaster && !job.trackId ? document.master : null,
          targetRate: rate,
          analyzeSpectrum: true,
        });
        if (!mounted.current) return;
        if (!result.channels[0]?.length) throw new Error(`${job.name} has no audio to export.`);
        setBusy(jobs.length > 1 ? `Encoding ${index + 1} of ${jobs.length}: ${job.name}…` : `Encoding ${job.name}…`);
        const tags = { ...metadata, title: metadata.title.trim() || job.name };
        let bytes: Uint8Array;
        if (format === 'wav') {
          const wav = encodeWav(result.channels, result.sampleRate, { depth, dither: dither && depth !== 32, metadata: tags, loudness: result.loudness, seed: index + 1 });
          wav.skipped.forEach((item) => skipped.add(item));
          bytes = wav.bytes;
        } else {
          bytes = (await encodeCompressed(result.channels, result.sampleRate, { format, bitrateKbps: bitrate[format] ?? DEFAULT_BITRATE[format] ?? 192, metadata: tags, artwork })).bytes;
        }
        if (!mounted.current) return;
        const fileName = `${job.name}.${extension}`;
        rows.push({ file: fileName, seconds: result.channels[0].length / result.sampleRate, sampleRate: result.sampleRate, loudness: result.loudness });
        if (result.spectrum) spectra.push({ name: job.name, spectrum: result.spectrum, sampleRate: result.sampleRate });
        if (jobs.length === 1) downloadBytes(bytes, fileName, MIME[format]);
        else files.push({ path: fileName, data: bytes, compress: format === 'wav' });
      }
      const folder = safeFileName(`${baseName} ${stems ? 'stems' : scope === 'regions' ? 'regions' : 'export'}`);
      if (jobs.length > 1) {
        setBusy('Packing the ZIP…');
        files.push({ path: 'reports/loudness.csv', data: loudnessCsv(rows), compress: true });
        files.push({ path: 'reports/loudness.json', data: loudnessJson(rows), compress: true });
        for (const item of spectra) files.push({ path: `reports/${item.name} spectrum.png`, data: await spectrumPng(item.spectrum, item.sampleRate, item.name), compress: false });
        const zip = await buildExportZip(folder, files);
        if (!mounted.current) return;
        downloadBytes(zip, `${folder}.zip`, 'application/zip');
      }
      setReport({ rows, spectra, folder });
      const seconds = ((performance.now() - started) / 1000).toFixed(1);
      const first = rows[0];
      const summary = jobs.length === 1
        ? `Exported ${first.file}: ${fmt(first.loudness.integrated)} LUFS integrated, ${fmt(first.loudness.maxTruePeakDb)} dBTP true peak (${seconds} s).`
        : `Exported ${rows.length} files with loudness and spectrum reports in ${folder}.zip (${seconds} s).`;
      ctx.setStatus(skipped.size ? `${summary} Not written: ${[...skipped].join('; ')}.` : summary);
    } catch (error) {
      if (mounted.current) ctx.setStatus(`Could not export: ${messageOf(error)}`);
    } finally {
      if (mounted.current) setBusy(null);
    }
  };

  const downloadSpectrum = async (item: ExportReport['spectra'][number]) => {
    try {
      downloadBytes(await spectrumPng(item.spectrum, item.sampleRate, item.name), `${item.name} spectrum.png`, 'image/png');
    } catch (error) { ctx.setStatus(messageOf(error)); }
  };

  // --- SECTION: view ---

  const note = (field: MetadataField) => (stored.has(field) ? null : `Not stored in ${FORMAT_NAMES[format]}`);

  return <>
    <section className="mastering-panel" aria-labelledby="export-heading">
      <div className="mastering-panel-heading"><div>
        <h3 id="export-heading">Export</h3>
        <p>Choose what to export and how. Everything is rendered and encoded on this device, one file at a time.</p>
      </div></div>

      <fieldset className="mastering-fieldset mastering-radio-row"><legend>What to export</legend>
        {(Object.keys(SCOPE_LABELS) as ExportScope[]).map((item) => {
          const count = item === 'regions' ? ` (${regionCount})` : item === 'stems' ? ` (${trackCount})` : '';
          return <label key={item} className="mastering-check"><input type="radio" name="mastering-export-scope" checked={scope === item} onChange={() => setScope(item)} disabled={Boolean(busy)} /> {SCOPE_LABELS[item]}{count}</label>;
        })}
      </fieldset>
      {scope === 'regions' && !regionCount && <p className="help-text">You have no regions yet. Select a range on the timeline and add a region in the Edit tab.</p>}
      {stems
        ? <p className="help-text">Stems skip the master chain and ignore mute and solo, so each track comes out exactly as it sits in the mix. Every stem starts at zero and runs the full project length, so they line up when imported together.</p>
        : <label className="mastering-check"><input type="checkbox" checked={applyMaster} onChange={(event) => setApplyMaster(event.target.checked)} disabled={Boolean(busy)} /> Apply the master chain</label>}

      <fieldset className="mastering-fieldset"><legend>Format</legend>
        <div className="mastering-radio-row">
          {FORMAT_ORDER.map((item) => {
            const found = capability(item);
            const unavailable = item !== 'wav' && found !== undefined && !found.available;
            return <label key={item} className="mastering-check"><input type="radio" name="mastering-export-format" checked={format === item} onChange={() => setFormat(item)} disabled={Boolean(busy) || unavailable} /> {FORMAT_NAMES[item]}</label>;
          })}
        </div>
        <p className="help-text" data-testid="export-format-note">
          {FORMAT_HINTS[format]}{' '}
          {format !== 'wav' && !capabilities && !probeError ? 'Checking what this browser can encode…' : null}
          {selected && format !== 'wav' ? (selected.available ? `Writes ${selected.label}.` : selected.reason) : null}
          {probeError && format !== 'wav' ? `Could not check encoders: ${probeError}` : null}
        </p>
        {capabilities && capabilities.filter((item) => !item.available).map((item) => <p key={item.format} className="help-text">{FORMAT_NAMES[item.format]} is unavailable: {item.reason}</p>)}
      </fieldset>

      <div className="workspace-grid">
        <label className="field">
          <span className="field-label">Sample rate</span>
          <select value={rate} onChange={(event) => { rateTouched.current = true; setRate(Number(event.target.value)); }} disabled={Boolean(busy)}>
            {rates.map((item) => <option key={item} value={item}>{item.toLocaleString()} Hz{item === projectRate ? ' (project)' : ''}</option>)}
          </select>
        </label>
        {format === 'wav' && <label className="field">
          <span className="field-label">Bit depth</span>
          <select value={depth} onChange={(event) => setDepth(Number(event.target.value) as WavDepth)} disabled={Boolean(busy)}>
            <option value={16}>16-bit (CD)</option>
            <option value={24}>24-bit (studio)</option>
            <option value={32}>32-bit float (no clipping)</option>
          </select>
        </label>}
        {BITRATES[format] && <label className="field">
          <span className="field-label">Bitrate</span>
          <select value={bitrate[format] ?? DEFAULT_BITRATE[format]} onChange={(event) => setBitrate((current) => ({ ...current, [format]: Number(event.target.value) }))} disabled={Boolean(busy)}>
            {BITRATES[format]!.map((item) => <option key={item} value={item}>{item} kbps</option>)}
          </select>
        </label>}
        <label className="field">
          <span className="field-label">File name</span>
          <input type="text" value={baseName} maxLength={80} onChange={(event) => { baseNameTouched.current = true; setBaseName(event.target.value); }} disabled={Boolean(busy)} />
        </label>
      </div>
      {format === 'wav' && depth !== 32 && <label className="mastering-check"><input type="checkbox" checked={dither} onChange={(event) => setDither(event.target.checked)} disabled={Boolean(busy)} /> Add TPDF dither (recommended when reducing to {depth}-bit)</label>}
      {rate !== projectRate && <p className="help-text">The project runs at {projectRate.toLocaleString()} Hz. Export converts after the master chain, and the true-peak reading is measured on the converted file.</p>}

      <details className="mastering-tool">
        <summary><span className="mastering-tool-title">Tags and cover art</span> <span className="mastering-tool-summary">Stored the way {FORMAT_NAMES[format]} players expect</span></summary>
        <div className="mastering-tool-body">
          <p className="help-text">{format === 'wav'
            ? 'WAV keeps basic tags (RIFF INFO, Latin-1 text only) and Broadcast Wave details. Anything it cannot hold is listed after export instead of being written garbled.'
            : 'Fields marked "Not stored" are left out of this format rather than written somewhere players ignore.'}</p>
          <div className="workspace-grid mastering-tag-grid">
            {FIELD_LABELS.map(({ field, label, wide, placeholder }) => {
              const missing = note(field);
              const id = `mastering-export-${field}`;
              return <div key={field} className={wide ? 'field mastering-tag-wide' : 'field'}>
                <label htmlFor={id}>{label}</label>
                {wide
                  ? <textarea id={id} rows={field === 'lyrics' ? 4 : 2} value={metadata[field]} onChange={(event) => setField(field, event.target.value)} disabled={Boolean(busy) || Boolean(missing)} aria-describedby={missing ? `${id}-note` : undefined} />
                  : <input id={id} type="text" value={metadata[field]} placeholder={placeholder} inputMode={NUMERIC_FIELDS.has(field) ? 'numeric' : undefined} onChange={(event) => setField(field, event.target.value)} disabled={Boolean(busy) || Boolean(missing)} aria-describedby={missing ? `${id}-note` : undefined} />}
                {missing && <small id={`${id}-note`}>{missing}</small>}
              </div>;
            })}
          </div>
          <div className="field">
            <span className="field-label">Front cover</span>
            {artwork
              ? <div className="mastering-artwork">
                <img src={artwork.url} alt={`Cover art: ${artwork.name}`} width={96} height={96} />
                <span className="mastering-wrap">{artwork.name} · {formatBytes(artwork.data.length)}</span>
                <button type="button" onClick={() => { setArtwork(null); ctx.setStatus('Cover art removed.'); }} disabled={Boolean(busy)}>Remove cover</button>
              </div>
              : <label className="mastering-file-button mastering-file-secondary mastering-fit">Choose cover image<input type="file" accept="image/jpeg,image/png" onChange={onArtwork} disabled={Boolean(busy)} /></label>}
            {note('artwork') && <small>{note('artwork')}</small>}
          </div>
        </div>
      </details>

      <div className="button-row">
        <button type="button" className="mastering-primary" onClick={() => void runExport()} disabled={!ready}>
          {scope === 'regions' || stems ? 'Export ZIP' : `Export ${FORMAT_NAMES[format]}`}
        </button>
        {busy && <span className="mastering-busy" role="status">{busy}</span>}
        {!busy && ctx.rendering && <span className="mastering-busy">Waiting for the timeline to finish rendering…</span>}
      </div>
    </section>

    {report && <section className="mastering-panel" aria-labelledby="export-report-heading">
      <div className="mastering-panel-heading"><div>
        <h3 id="export-report-heading">Last export</h3>
        <p>Measured on the rendered PCM submitted to the encoder. Lossy codecs can change decoded peaks and loudness slightly, so this is pre-codec mastering telemetry rather than a post-codec compliance measurement.</p>
      </div></div>
      <div className="mastering-table-scroll">
        <table className="mastering-report">
          <caption className="visually-hidden">Loudness of each exported file</caption>
          <thead><tr><th scope="col">File</th><th scope="col">Integrated</th><th scope="col">Range</th><th scope="col">True peak</th><th scope="col">Spectrum</th></tr></thead>
          <tbody>{report.rows.map((row, index) => <tr key={row.file}>
            <th scope="row" className="mastering-wrap">{row.file}</th>
            <td>{fmt(row.loudness.integrated)} LUFS</td>
            <td>{fmt(row.loudness.loudnessRange)} LU</td>
            <td>{fmt(row.loudness.maxTruePeakDb)} dBTP</td>
            <td>{report.spectra[index] ? <button type="button" onClick={() => void downloadSpectrum(report.spectra[index])}>PNG</button> : '—'}</td>
          </tr>)}</tbody>
        </table>
      </div>
      <div className="button-row">
        <button type="button" onClick={() => downloadText(loudnessCsv(report.rows), `${report.folder} loudness.csv`, 'text/csv;charset=utf-8')}>Download loudness CSV</button>
        <button type="button" onClick={() => downloadText(loudnessJson(report.rows), `${report.folder} loudness.json`, 'application/json')}>Download loudness JSON</button>
      </div>
    </section>}
  </>;
}

import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from './Icon';
import { downloadBlob } from '../../../lib/download';
import { FIELD_GROUPS, FIELD_GROUP_LABELS, type ExportMetadata, type FieldGroup, type LocationProfile } from '../core/types';
import { buildCsv, buildGeoJson, buildIcs, buildJson, buildKml, fileSlug, resolveMetadata, type ResolvedMetadata } from '../export/formats';
import { buildPdf, buildZip, bundleReadme, canvasToPng, cardModel, drawCard, injectPngText, pngTextEntries, svgSize, svgToPng } from '../export/binary';
import { parseTagInput } from '../net/store';
import { formatTime } from './format';
import { saveWithPicker, supportsSavePicker } from './hooks';

type Format = 'json' | 'geojson' | 'kml' | 'csv' | 'pdf' | 'ics' | 'png' | 'svg' | 'card';

const FORMATS: Array<{ id: Format; label: string; tip: string; multi: boolean }> = [
  { id: 'json', label: 'JSON with full provenance', tip: 'Every value with source, record ID, reference year, retrieval time, license and confidence class', multi: true },
  { id: 'geojson', label: 'GeoJSON', tip: 'Points for QGIS, geojson.io, Leaflet or any GIS tool (RFC 7946), with every value and its provenance', multi: true },
  { id: 'kml', label: 'KML', tip: 'Placemarks for Google Earth and most GPS and mapping apps', multi: true },
  { id: 'csv', label: 'CSV (flat)', tip: 'One row per location; choose which field groups become columns', multi: true },
  { id: 'pdf', label: 'PDF location brief', tip: 'A printable brief with your title, author, tags and every source listed', multi: false },
  { id: 'ics', label: 'iCalendar holidays (.ics)', tip: 'Public holidays as all-day events for any calendar app', multi: false },
  { id: 'png', label: 'PNG map snapshot', tip: 'The current map view as an image, with metadata embedded in PNG text chunks', multi: true },
  { id: 'svg', label: 'SVG map', tip: 'The current map view as scalable vector graphics with Dublin Core metadata', multi: true },
  { id: 'card', label: 'Social card (1200×630 PNG)', tip: 'An OpenGraph-sized image with the location name, flag and key stats', multi: false },
];

export interface ExportDialogProps {
  profiles: LocationProfile[];
  metadata: ExportMetadata;
  onMetadata: (metadata: ExportMetadata) => void;
  mapSvg: (meta: ResolvedMetadata) => string;
  onClose: () => void;
  onStatus: (message: string) => void;
}

export function ExportDialog({ profiles, metadata, onMetadata, mapSvg, onClose, onStatus }: ExportDialogProps) {
  const [meta, setMeta] = useState<ExportMetadata>(metadata);
  const [tagText, setTagText] = useState(metadata.tags.join(', '));
  const [groups, setGroups] = useState<FieldGroup[]>([...FIELD_GROUPS]);
  const [withProvenance, setWithProvenance] = useState(false);
  const [calendarName, setCalendarName] = useState('');
  const [scale, setScale] = useState(2);
  const [bundle, setBundle] = useState<Format[]>(['json', 'geojson', 'kml', 'csv', 'pdf', 'ics', 'png', 'svg', 'card']);
  const [busy, setBusy] = useState<string | null>(null);
  const [askWhere, setAskWhere] = useState(false);
  const dialog = useRef<HTMLDivElement>(null);
  const primary = profiles[0];
  const multiple = profiles.length > 1;
  const resolved = useMemo(() => resolveMetadata({ ...meta, tags: parseTagInput(tagText) }, profiles), [meta, tagText, profiles]);
  const base = fileSlug(resolved.title);

  useEffect(() => {
    const id = window.setTimeout(() => onMetadata({ ...meta, tags: parseTagInput(tagText) }), 400);
    return () => window.clearTimeout(id);
  }, [meta, tagText, onMetadata]);

  useEffect(() => {
    const el = dialog.current;
    el?.querySelector<HTMLInputElement>('input')?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); onClose(); }
      if (event.key === 'Tab' && el) {
        const focusable = [...el.querySelectorAll<HTMLElement>('button, input, select, textarea, [tabindex="0"]')].filter((node) => !node.hasAttribute('disabled'));
        if (!focusable.length) return;
        const first = focusable[0]; const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const available = (format: Format) => (format === 'ics' ? !!primary?.holidays : true);
  const timeFmt = (iso: string | null) => formatTime(iso, primary?.timezone ?? 'UTC');

  const make = async (format: Format): Promise<{ name: string; blob: Blob }> => {
    switch (format) {
      case 'json': return { name: `${base}.json`, blob: new Blob([buildJson(profiles, resolved)], { type: 'application/json' }) };
      case 'geojson': return { name: `${base}.geojson`, blob: new Blob([buildGeoJson(profiles, resolved)], { type: 'application/geo+json' }) };
      case 'kml': return { name: `${base}.kml`, blob: new Blob([buildKml(profiles, resolved)], { type: 'application/vnd.google-earth.kml+xml' }) };
      case 'csv': return { name: `${base}.csv`, blob: new Blob([buildCsv(profiles, resolved, { groups, provenance: withProvenance })], { type: 'text/csv;charset=utf-8' }) };
      case 'pdf': return { name: `${base}.pdf`, blob: await buildPdf(primary, resolved, timeFmt) };
      case 'ics': return { name: `${base}-holidays.ics`, blob: new Blob([buildIcs(primary, resolved, calendarName)], { type: 'text/calendar;charset=utf-8' }) };
      case 'svg': return { name: `${base}-map.svg`, blob: new Blob([mapSvg(resolved)], { type: 'image/svg+xml' }) };
      case 'png': {
        const svg = mapSvg(resolved);
        const { width, height } = svgSize(svg);
        const png = await svgToPng(svg, width, height, scale);
        return { name: `${base}-map.png`, blob: new Blob([injectPngText(png, pngTextEntries(resolved, { Source: 'Map: Natural Earth (public domain)' })) as BlobPart], { type: 'image/png' }) };
      }
      case 'card': {
        const canvas = document.createElement('canvas');
        drawCard(canvas, cardModel(primary, resolved, primary.timezone ? formatTime(new Date().toISOString(), primary.timezone) : '—'));
        const png = await canvasToPng(canvas);
        return { name: `${base}-card.png`, blob: new Blob([injectPngText(png, pngTextEntries(resolved)) as BlobPart], { type: 'image/png' }) };
      }
    }
  };

  // The anchor download is the default path; the File System Access picker is opt-in.
  const save = (blob: Blob, name: string) => (askWhere ? saveWithPicker(blob, name, downloadBlob) : Promise.resolve(downloadBlob(blob, name)));
  const run = async (label: string, task: () => Promise<void>) => {
    setBusy(label);
    try { await task(); onStatus(`${label} ready.`); }
    catch (error) { onStatus(`${label} failed: ${(error as Error).message}`); }
    finally { setBusy(null); }
  };
  const download = (format: Format) => run(FORMATS.find((f) => f.id === format)?.label ?? format, async () => {
    const file = await make(format);
    await save(file.blob, file.name);
  });
  const downloadZip = () => run('ZIP bundle', async () => {
    const chosen = bundle.filter(available);
    const files = [];
    for (const format of chosen) files.push(await make(format));
    const blob = await buildZip(files.map((file) => ({ name: file.name, data: file.blob })), bundleReadme(profiles, resolved, files.map((file) => file.name)));
    await save(blob, `${base}.zip`);
  });

  const set = (patch: Partial<ExportMetadata>) => setMeta((current) => ({ ...current, ...patch }));

  return (
    <div className="gi-dialog-backdrop" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div ref={dialog} className="gi-dialog wide" role="dialog" aria-modal="true" aria-labelledby="gi-export-title" data-testid="gi-export">
        <header className="gi-dialog-head">
          <h2 id="gi-export-title">Export {multiple ? `${profiles.length} locations` : primary.label}</h2>
          <button type="button" className="gi-icon" aria-label="Close export" onClick={onClose}><Icon name="close" size={20} /></button>
        </header>
        <div className="gi-export-grid">
          <fieldset className="gi-meta">
            <legend data-tip="Saved with this location on this device and written into every exported file">Metadata & tags</legend>
            <label className="gi-field"><span>Project title</span><input value={meta.title} onChange={(event) => set({ title: event.target.value })} placeholder={resolved.title} /></label>
            <label className="gi-field"><span>Author / organization</span><input value={meta.author} onChange={(event) => set({ author: event.target.value })} autoComplete="organization" /></label>
            <label className="gi-field"><span>Description</span><textarea rows={2} value={meta.description} onChange={(event) => set({ description: event.target.value })} /></label>
            <label className="gi-field"><span>Tags (comma-separated)</span><input value={tagText} onChange={(event) => setTagText(event.target.value)} placeholder="site-survey, 2026" /></label>
            <div className="gi-inline">
              <label className="gi-field compact"><span>Date override</span><input type="date" value={meta.dateOverride} onChange={(event) => set({ dateOverride: event.target.value })} data-tip="Leave empty to use today's date" /></label>
              <label className="gi-field compact"><span>License for your export</span>
                <select value={meta.license} onChange={(event) => set({ license: event.target.value as ExportMetadata['license'] })} data-tip="Applies to your compilation; third-party data keeps its own license (listed in every file)">
                  <option value="CC0-1.0">CC0 1.0</option><option value="CC-BY-4.0">CC BY 4.0</option><option value="custom">Custom…</option>
                </select>
              </label>
            </div>
            {meta.license === 'custom' ? <label className="gi-field"><span>Custom license text</span><input value={meta.customLicense} onChange={(event) => set({ customLicense: event.target.value })} /></label> : null}
            <label className="gi-field"><span>Notes</span><textarea rows={2} value={meta.notes} onChange={(event) => set({ notes: event.target.value })} /></label>
            <p className="gi-muted">Third-party data keeps its own license (e.g. ODbL for OpenStreetMap-derived fields); every export lists the sources it contains.</p>
          </fieldset>

          <div className="gi-formats">
            {FORMATS.map((format) => {
              const disabled = !available(format.id) || !!busy;
              return (
                <div key={format.id} className="gi-format">
                  <label className="gi-check"><input type="checkbox" checked={bundle.includes(format.id)} disabled={!available(format.id)} onChange={(event) => setBundle((list) => (event.target.checked ? [...list, format.id] : list.filter((id) => id !== format.id)))} aria-label={`Include ${format.label} in ZIP`} /></label>
                  <div className="gi-format-main">
                    <p data-tip={format.tip} tabIndex={0}><strong>{format.label}</strong>{multiple && !format.multi ? <span className="gi-muted"> (first location)</span> : null}{!available(format.id) ? <span className="gi-muted"> — no holiday calendar</span> : null}</p>
                    {format.id === 'csv' ? (
                      <details><summary>Columns</summary>
                        <div className="gi-chips">{FIELD_GROUPS.map((group) => <label key={group} className="gi-check"><input type="checkbox" checked={groups.includes(group)} onChange={(event) => setGroups((list) => (event.target.checked ? [...list, group] : list.filter((g) => g !== group)))} /> {FIELD_GROUP_LABELS[group]}</label>)}</div>
                        <label className="gi-check"><input type="checkbox" checked={withProvenance} onChange={(event) => setWithProvenance(event.target.checked)} /> Add provenance columns per field</label>
                      </details>
                    ) : null}
                    {format.id === 'ics' && available('ics') ? <label className="gi-field compact"><span>Calendar name</span><input value={calendarName} onChange={(event) => setCalendarName(event.target.value)} placeholder={`Public holidays ${primary.holidays?.countryCode} ${primary.holidays?.year}`} /></label> : null}
                    {format.id === 'png' ? <label className="gi-field compact"><span>Resolution</span><select value={scale} onChange={(event) => setScale(Number(event.target.value))}><option value={1}>1× (1600 px)</option><option value={2}>2× (3200 px)</option></select></label> : null}
                  </div>
                  <button type="button" className="gi-btn" disabled={disabled} onClick={() => download(format.id)} data-testid={`gi-export-${format.id}`}>{busy === format.label ? 'Working…' : 'Download'}</button>
                </div>
              );
            })}
            <div className="gi-actions">
              <button type="button" className="gi-btn primary" disabled={!!busy || !bundle.some(available)} onClick={downloadZip} data-testid="gi-export-zip" data-tip="All ticked formats in one ZIP with a README that lists attribution">{busy === 'ZIP bundle' ? 'Building ZIP…' : 'Download ZIP bundle'}</button>
              {supportsSavePicker() ? <label className="gi-check" data-tip="Use the browser's save dialog (File System Access API) instead of a normal download"><input type="checkbox" checked={askWhere} onChange={(event) => setAskWhere(event.target.checked)} /> Ask where to save</label> : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

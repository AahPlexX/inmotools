import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { assessDataset } from './aethercast-engine';
import { detectAnomalies } from './aethercast-anomaly';
import { buildActivityWindows } from './aethercast-activity';
import {
  getCsvHeaders,
  guessCsvColumnMap,
  parseAetherCastExport,
  parseCsvWithMapping,
  parseOpenMeteoJson,
  type CsvColumnMap,
  type CsvGasUnit,
  type CsvUnitMap,
} from './aethercast-import';
import { exportCanvasPng, exportCsv, exportJson, exportPdfBrief } from './aethercast-export';
import { readSettings, writeSettings } from './aethercast-persistence';
import { AetherCastForecastCanvas } from './AetherCastForecastCanvas';
import { requestSupportPrompt } from '../../lib/support';
import type { AetherCastDataset, AetherCastSettings, FitzpatrickType, VulnerabilityLens } from './aethercast-types';
import './aethercast.css';

const TABLE_ID = 'aethercast-readout-table';
const PAGE_SIZE = 100;

interface PendingCsv {
  readonly raw: string;
  readonly fileName: string;
  readonly headers: string[];
  readonly mapping: CsvColumnMap;
  readonly units: CsvUnitMap;
  readonly timezone: string;
}

const DEFAULT_UNITS: CsvUnitMap = {
  pm25: 'UG_M3', pm10: 'UG_M3', carbonMonoxide: 'UG_M3', nitrogenDioxide: 'UG_M3',
  sulphurDioxide: 'UG_M3', ozone: 'UG_M3', windSpeed: 'M_S',
};

const CSV_FIELDS: Array<{ key: keyof CsvColumnMap; label: string }> = [
  { key: 'timestamp', label: 'Timestamp' }, { key: 'pm25', label: 'PM2.5' }, { key: 'pm10', label: 'PM10' },
  { key: 'carbonMonoxideUgM3', label: 'CO' }, { key: 'nitrogenDioxide', label: 'NO2' },
  { key: 'sulphurDioxide', label: 'SO2' }, { key: 'ozone', label: 'O3' }, { key: 'uvIndex', label: 'UV index' },
  { key: 'uvIndexClearSky', label: 'Clear-sky UV' }, { key: 'windSpeedMs', label: 'Wind speed' },
];

const formatBurn = (minutes: number | null): string => {
  if (minutes === null) return 'not available';
  if (!Number.isFinite(minutes)) return 'not estimated below UVI 0.5';
  return `about ${minutes < 1 ? '<1' : minutes.toFixed(0)} min (heuristic)`;
};

const dataTimeLabel = (dataset: AetherCastDataset): string => {
  const latest = dataset.points[dataset.points.length - 1];
  if (!latest) return 'No timestamp available.';
  const deltaHours = (latest.epochMs - Date.now()) / 3_600_000;
  if (Math.abs(deltaHours) < 1) return 'Latest dataset timestamp is within one hour of now.';
  if (deltaHours > 0) return `Dataset extends ${Math.round(deltaHours)} hours into the future.`;
  return `Latest dataset timestamp is ${Math.round(Math.abs(deltaHours))} hours old.`;
};

export default function AetherCastWorkspace() {
  const [dataset, setDataset] = useState<AetherCastDataset | null>(null);
  const [importErrors, setImportErrors] = useState<string[]>([]);
  const [settings, setSettings] = useState<AetherCastSettings>(() => readSettings());
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [page, setPage] = useState(0);
  const [pendingCsv, setPendingCsv] = useState<PendingCsv | null>(null);
  const canvasWrapRef = useRef<HTMLDivElement | null>(null);

  const assessments = useMemo(() => (dataset ? assessDataset(dataset, settings) : []), [dataset, settings]);
  const anomalies = useMemo(() => (dataset ? detectAnomalies(dataset.points) : []), [dataset]);
  const activityWindows = useMemo(() => buildActivityWindows(assessments, settings.activeStandard), [assessments, settings.activeStandard]);
  const activeAssessment = activeIndex !== null ? assessments[activeIndex] : assessments[assessments.length - 1];
  const pageCount = Math.max(1, Math.ceil(assessments.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const pageStart = safePage * PAGE_SIZE;
  const pageRows = assessments.slice(pageStart, pageStart + PAGE_SIZE);

  useEffect(() => {
    if (activeIndex !== null) setPage(Math.floor(activeIndex / PAGE_SIZE));
  }, [activeIndex]);

  useEffect(() => {
    if (page >= pageCount) setPage(pageCount - 1);
  }, [page, pageCount]);

  const updateSettings = useCallback((patch: Partial<AetherCastSettings>) => {
    setSettings((previous) => {
      const next = { ...previous, ...patch };
      writeSettings(next);
      return next;
    });
  }, []);

  const applyDataset = useCallback((next: AetherCastDataset, errors: string[]) => {
    setDataset(next);
    setImportErrors(errors);
    setPendingCsv(null);
    setActiveIndex(null);
    setPage(0);
  }, []);

  const handleFile = useCallback(async (file: File) => {
    const text = await file.text();
    const lowerName = file.name.toLowerCase();
    if (lowerName.endsWith('.csv') || file.type === 'text/csv') {
      const headerResult = getCsvHeaders(text);
      if (headerResult.headers.length === 0) {
        setImportErrors(headerResult.errors.length ? headerResult.errors : ['No CSV header row was found.']);
        return;
      }
      setPendingCsv({
        raw: text,
        fileName: file.name,
        headers: headerResult.headers,
        mapping: guessCsvColumnMap(headerResult.headers),
        units: DEFAULT_UNITS,
        timezone: dataset?.timezone ?? 'UTC',
      });
      setImportErrors(headerResult.errors);
      return;
    }

    const looksLikeAetherExport = lowerName.endsWith('.json') && text.includes('"importSource"');
    const result = looksLikeAetherExport ? parseAetherCastExport(text) : parseOpenMeteoJson(text);
    setImportErrors(result.errors);
    if (result.dataset) applyDataset(result.dataset, result.errors);
  }, [applyDataset, dataset?.timezone]);

  const onFileInputChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) void handleFile(file);
    event.target.value = '';
  }, [handleFile]);

  const applyCsv = useCallback(() => {
    if (!pendingCsv) return;
    const result = parseCsvWithMapping(pendingCsv.raw, pendingCsv.mapping, {
      timezone: pendingCsv.timezone,
      units: pendingCsv.units,
    });
    setImportErrors(result.errors);
    if (result.dataset) applyDataset(result.dataset, result.errors);
  }, [pendingCsv, applyDataset]);

  const handleExportPdf = useCallback(async () => {
    if (!dataset) return;
    await exportPdfBrief(dataset, assessments, anomalies, settings.activeStandard);
    requestSupportPrompt({ key: 'aethercast-export', message: 'Compiled a local air-quality and UV brief from your imported data. If this helped your planning, support independent tool development with a coffee.' });
  }, [dataset, assessments, anomalies, settings.activeStandard]);

  const handleExportCsv = useCallback(() => {
    if (!dataset) return;
    exportCsv(assessments, settings.activeStandard);
    requestSupportPrompt({ key: 'aethercast-export', message: 'Exported the complete locally calculated hourly dataset. If this helped your planning, support independent tool development with a coffee.' });
  }, [dataset, assessments, settings.activeStandard]);

  const handleExportPng = useCallback(async () => {
    const canvas = canvasWrapRef.current?.querySelector('canvas');
    if (canvas instanceof HTMLCanvasElement) await exportCanvasPng(canvas);
  }, []);

  const selectedValue = activeAssessment
    ? settings.activeStandard === 'US_EPA' ? activeAssessment.compositeAqi : activeAssessment.eaqiValue
    : null;
  const selectedBand = activeAssessment
    ? settings.activeStandard === 'US_EPA' ? activeAssessment.aqiCategory : activeAssessment.eaqiBand
    : null;
  const selectedCoverage = activeAssessment
    ? settings.activeStandard === 'US_EPA' ? activeAssessment.usAqiCoverage : activeAssessment.europeanAqiCoverage
    : 'NONE';

  const csvMapper = pendingCsv ? (
    <section className="aethercast-csv-mapper" aria-labelledby="aethercast-csv-heading">
      <div className="aethercast-section-heading">
        <div><h3 id="aethercast-csv-heading">Map {pendingCsv.fileName}</h3><p>Choose columns, source units, and the IANA timezone before replacing the current dataset.</p></div>
        <button type="button" onClick={() => setPendingCsv(null)}>Cancel</button>
      </div>
      <label className="aethercast-timezone-field">Dataset timezone<input value={pendingCsv.timezone} onChange={(event) => setPendingCsv((current) => current ? { ...current, timezone: event.target.value } : current)} placeholder="America/Chicago" /></label>
      <div className="aethercast-mapping-grid">
        {CSV_FIELDS.map((field) => (
          <label key={field.key}>
            {field.label}
            <select
              value={pendingCsv.mapping[field.key] ?? ''}
              onChange={(event) => setPendingCsv((current) => current ? {
                ...current,
                mapping: { ...current.mapping, [field.key]: event.target.value || undefined } as CsvColumnMap,
              } : current)}
            >
              {field.key === 'timestamp' ? null : <option value="">Not present</option>}
              {pendingCsv.headers.map((header) => <option key={header} value={header}>{header}</option>)}
            </select>
          </label>
        ))}
      </div>
      <div className="aethercast-unit-grid">
        <label>PM2.5 unit<select value={pendingCsv.units.pm25} onChange={(e) => setPendingCsv((c) => c ? { ...c, units: { ...c.units, pm25: e.target.value as CsvUnitMap['pm25'] } } : c)}><option value="UG_M3">µg/m³</option><option value="MG_M3">mg/m³</option></select></label>
        <label>PM10 unit<select value={pendingCsv.units.pm10} onChange={(e) => setPendingCsv((c) => c ? { ...c, units: { ...c.units, pm10: e.target.value as CsvUnitMap['pm10'] } } : c)}><option value="UG_M3">µg/m³</option><option value="MG_M3">mg/m³</option></select></label>
        <label>CO unit<select value={pendingCsv.units.carbonMonoxide} onChange={(e) => setPendingCsv((c) => c ? { ...c, units: { ...c.units, carbonMonoxide: e.target.value as CsvUnitMap['carbonMonoxide'] } } : c)}><option value="UG_M3">µg/m³</option><option value="MG_M3">mg/m³</option><option value="PPM">ppm</option></select></label>
        {(['nitrogenDioxide', 'sulphurDioxide', 'ozone'] as const).map((key) => <label key={key}>{key === 'nitrogenDioxide' ? 'NO2' : key === 'sulphurDioxide' ? 'SO2' : 'O3'} unit<select value={pendingCsv.units[key]} onChange={(e) => setPendingCsv((c) => c ? { ...c, units: { ...c.units, [key]: e.target.value as CsvGasUnit } } : c)}><option value="UG_M3">µg/m³</option><option value="PPB">ppb</option></select></label>)}
        <label>Wind unit<select value={pendingCsv.units.windSpeed} onChange={(e) => setPendingCsv((c) => c ? { ...c, units: { ...c.units, windSpeed: e.target.value as CsvUnitMap['windSpeed'] } } : c)}><option value="M_S">m/s</option><option value="KM_H">km/h</option><option value="MPH">mph</option></select></label>
      </div>
      <button type="button" className="action-button" onClick={applyCsv} disabled={!pendingCsv.mapping.timestamp}>Import mapped CSV</button>
    </section>
  ) : null;

  if (!dataset) {
    return (
      <div className="aethercast-empty">
        <p>Import Open-Meteo Air Quality JSON, a previously exported AetherCast JSON file, or a CSV. CSV files open a mapping step so columns, units, and timezone are explicit before any calculation.</p>
        {importErrors.length > 0 && <ul className="aethercast-errors" role="alert">{importErrors.map((message) => <li key={message}>{message}</li>)}</ul>}
        <input type="file" accept="application/json,.json,.csv,text/csv" onChange={onFileInputChange} aria-label="Import an air quality and UV data file" />
        {csvMapper}
      </div>
    );
  }

  return (
    <div className="aethercast-workspace">
      <div className="aethercast-toolbar">
        <label>Replace dataset<input type="file" accept="application/json,.json,.csv,text/csv" onChange={onFileInputChange} /></label>
        <label>
          Standard
          <select value={settings.activeStandard} onChange={(event) => updateSettings({ activeStandard: event.target.value as AetherCastSettings['activeStandard'] })}>
            <option value="US_EPA">US EPA AQI</option><option value="EUROPEAN_EAQI">European Air Quality Index</option>
          </select>
        </label>
        <label>
          Fitzpatrick skin type
          <select value={settings.skinType} onChange={(event) => updateSettings({ skinType: Number(event.target.value) as FitzpatrickType })}>
            {[1, 2, 3, 4, 5, 6].map((type) => <option key={type} value={type}>Type {type}</option>)}
          </select>
        </label>
        <label>
          Display lens
          <select value={settings.vulnerabilityLens} onChange={(event) => updateSettings({ vulnerabilityLens: event.target.value as VulnerabilityLens })}>
            <option value="NONE">None</option><option value="ASTHMA">Respiratory sensitivity</option><option value="CARDIOVASCULAR">Cardiovascular sensitivity</option><option value="PEDIATRIC">Children</option><option value="PHOTOSENSITIVE">Photosensitivity</option>
          </select>
        </label>
      </div>

      {csvMapper}
      {importErrors.length > 0 && <ul className="aethercast-errors" role="alert">{importErrors.map((message) => <li key={message}>{message}</li>)}</ul>}

      <p className="aethercast-data-age" role="status">{dataTimeLabel(dataset)} Timezone: {dataset.timezone ?? 'unspecified'}. Imported rows: {dataset.points.length.toLocaleString()}{dataset.truncatedRows ? `; ${dataset.truncatedRows.toLocaleString()} rows omitted or invalid.` : '.'}</p>

      {activeAssessment && (
        <section className="aethercast-status" aria-label="Selected snapshot">
          <p><span>{settings.activeStandard === 'US_EPA' ? 'US EPA AQI' : 'European Air Quality Index'}</span><strong>{selectedValue ?? 'unknown'}</strong> {selectedBand ? `(${selectedBand.replaceAll('_', ' ')})` : ''}</p>
          <p><span>Index coverage</span><strong>{selectedCoverage.toLowerCase()}</strong></p>
          <p><span>UV Index</span><strong>{activeAssessment.point.uvIndex ?? 'unknown'}</strong></p>
          <p><span>Skin-type timing heuristic</span><strong>{formatBurn(activeAssessment.burnMinutes)}</strong></p>
          <p className="aethercast-health-note">The timing estimate is not a safe-exposure limit. UV risk depends on more than skin type, and WHO recommends sun-protection measures when UVI reaches 3 or above.</p>
        </section>
      )}

      <p className="aethercast-method-note">
        {settings.activeStandard === 'US_EPA'
          ? 'US values are recalculated from raw concentrations using EPA PM NowCast weighting, pollutant-specific averaging periods, concentration truncation, interpolation, and final AQI rounding. Ozone uses the prescribed 8-hour/1-hour AQI rules here; the operational AirNow ozone NowCast is a separate two-week statistical model and is not represented as if it were calculated locally.'
          : 'European values are recalculated from raw hourly PM2.5, PM10, O3, NO2, and SO2 concentrations using the current EEA hourly bands; source-provided European index values are not reused.'}
      </p>

      <div ref={canvasWrapRef} className="aethercast-canvas-wrap">
        <AetherCastForecastCanvas assessments={assessments} activeIndex={activeIndex} standard={settings.activeStandard} onScrub={setActiveIndex} describedById={TABLE_ID} />
      </div>

      <section className="aethercast-uv-panel" aria-labelledby="aethercast-uv-title">
        <div className="aethercast-section-heading"><div><h3 id="aethercast-uv-title">UV index</h3><p>Separate UV view for the same {pageRows.length} rows shown in the table.</p></div></div>
        <ol className="aethercast-uv-bars">
          {pageRows.map((assessment, offset) => {
            const uv = assessment.point.uvIndex;
            return <li key={`uv-${assessment.point.isoTimestamp}`} title={`${assessment.point.isoTimestamp}: UVI ${uv ?? 'unknown'}`}><button type="button" onClick={() => setActiveIndex(pageStart + offset)} aria-label={`${assessment.point.isoTimestamp}: UV index ${uv ?? 'unknown'}`}><span style={{ height: uv === null ? '0%' : `${Math.min(100, Math.max(3, uv / 12 * 100))}%` }} /></button></li>;
          })}
        </ol>
      </section>

      <div className="aethercast-table-controls" aria-label="Hourly readout pagination">
        <span>Rows {assessments.length ? pageStart + 1 : 0}–{Math.min(pageStart + PAGE_SIZE, assessments.length)} of {assessments.length.toLocaleString()}</span>
        <div><button type="button" onClick={() => setPage(0)} disabled={safePage === 0}>First</button><button type="button" onClick={() => setPage((value) => Math.max(0, value - 1))} disabled={safePage === 0}>Previous</button><span>Page {safePage + 1} of {pageCount}</span><button type="button" onClick={() => setPage((value) => Math.min(pageCount - 1, value + 1))} disabled={safePage >= pageCount - 1}>Next</button><button type="button" onClick={() => setPage(pageCount - 1)} disabled={safePage >= pageCount - 1}>Last</button></div>
      </div>

      <div className="aethercast-table-wrap">
        <table id={TABLE_ID} className="aethercast-table">
          <caption>Hourly readout. This page shows {pageRows.length} of {assessments.length} rows; pagination controls expose the complete imported range.</caption>
          <thead><tr><th>Time</th><th>{settings.activeStandard === 'US_EPA' ? 'US AQI' : 'European index'}</th><th>Band</th><th>Coverage</th><th>PM2.5 µg/m³</th><th>O3 µg/m³</th><th>UV</th></tr></thead>
          <tbody>
            {pageRows.map((assessment, offset) => {
              const globalIndex = pageStart + offset;
              const value = settings.activeStandard === 'US_EPA' ? assessment.compositeAqi : assessment.eaqiValue;
              const band = settings.activeStandard === 'US_EPA' ? assessment.aqiCategory : assessment.eaqiBand;
              const coverage = settings.activeStandard === 'US_EPA' ? assessment.usAqiCoverage : assessment.europeanAqiCoverage;
              const selectRow = () => setActiveIndex(globalIndex);
              return <tr key={`${assessment.point.isoTimestamp}-${globalIndex}`} aria-current={globalIndex === activeIndex ? 'true' : undefined} tabIndex={0} onClick={selectRow} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); selectRow(); } }}><td>{assessment.point.isoTimestamp}</td><td>{value ?? '—'}</td><td>{band?.replaceAll('_', ' ') ?? '—'}</td><td>{coverage.toLowerCase()}</td><td>{assessment.point.pm25 ?? '—'}</td><td>{assessment.point.ozone ?? '—'}</td><td>{assessment.point.uvIndex ?? '—'}</td></tr>;
            })}
          </tbody>
        </table>
      </div>

      <section className="aethercast-list-section" aria-label="Outdoor activity advisory">
        <h3>Outdoor activity windows</h3>
        <p>Unknown inputs remain unknown; gaps in time are never merged into continuous windows.</p>
        <ul>{activityWindows.map((window, index) => <li key={`${window.startTimestamp}-${index}`}>{window.startTimestamp} to {window.endTimestamp}: <strong>{window.recommendation.replaceAll('_', ' ')}</strong> (limiting factor: {window.primaryLimitingFactor.replaceAll('_', ' ')})</li>)}</ul>
      </section>

      <section className="aethercast-list-section" aria-label="Screening anomalies">
        <h3>Screening anomalies ({anomalies.length})</h3>
        {anomalies.length ? <ul>{anomalies.map((event) => <li key={`${event.type}-${event.startTimestamp}`}>{event.type === 'WILDFIRE_SCREEN' ? 'Wildfire screen' : 'Thermal inversion'} — {event.startTimestamp} ({event.confirmed ? 'corroborated' : 'unconfirmed'}): {event.advisoryMessage}</li>)}</ul> : <p>None detected in the imported range.</p>}
      </section>

      <div className="aethercast-exports">
        <button type="button" onClick={handleExportPdf}>Export PDF brief</button><button type="button" onClick={handleExportCsv}>Export CSV</button><button type="button" onClick={handleExportPng}>Export chart PNG</button><button type="button" onClick={() => dataset && exportJson(dataset)}>Export JSON</button>
      </div>
    </div>
  );
}

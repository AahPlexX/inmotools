import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
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
import {
  fetchLiveAetherCastDataset,
  getBrowserLiveLocation,
  LIVE_REFRESH_MS,
  readSavedLiveLocation,
  searchOpenMeteoLocations,
  writeSavedLiveLocation,
  type LiveLocation,
} from './aethercast-live';
import { exportCanvasPng, exportCsv, exportJson, exportPdfBrief } from './aethercast-export';
import { readSettings, writeSettings } from './aethercast-persistence';
import { AetherCastForecastCanvas } from './AetherCastForecastCanvas';
import { requestSupportPrompt } from '../../lib/support';
import type { AetherCastDataset, AetherCastSettings, FitzpatrickType, HourlyAssessment, IndexStandard, VulnerabilityLens } from './aethercast-types';
import './aethercast.css';

const TABLE_ID = 'aethercast-readout-table';
const PAGE_SIZE = 100;
const EPA_POLLUTANTS = ['pm25', 'pm10', 'o3', 'no2', 'so2', 'co'] as const;
const EPA_LABELS: Record<(typeof EPA_POLLUTANTS)[number], string> = {
  pm25: 'PM2.5', pm10: 'PM10', o3: 'O3', no2: 'NO2', so2: 'SO2', co: 'CO',
};

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

const nearestPointIndex = (dataset: AetherCastDataset, target = Date.now()): number => {
  let bestIndex = 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let index = 0; index < dataset.points.length; index += 1) {
    const distance = Math.abs(dataset.points[index].epochMs - target);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = index;
    }
  }
  return bestIndex;
};

const pollutantCoverageLabel = (assessment: HourlyAssessment, standard: IndexStandard): string => {
  if (standard === 'US_EPA') {
    const available = EPA_POLLUTANTS.filter((key) => assessment.pollutants[key].subIndex !== null);
    return `${available.length}/6${available.length ? `: ${available.map((key) => EPA_LABELS[key]).join(', ')}` : ''}`;
  }
  const available = [
    assessment.point.pm25 !== null ? 'PM2.5' : null,
    assessment.point.pm10 !== null ? 'PM10' : null,
    assessment.point.ozone !== null ? 'O3' : null,
    assessment.point.nitrogenDioxide !== null ? 'NO2' : null,
    assessment.point.sulphurDioxide !== null ? 'SO2' : null,
  ].filter((value): value is string => value !== null);
  return `${available.length}/5${available.length ? `: ${available.join(', ')}` : ''}`;
};

const errorMessage = (error: unknown): string => error instanceof Error ? error.message : 'The live data request failed.';
const isAbortError = (error: unknown): boolean => error instanceof DOMException && error.name === 'AbortError';

export default function AetherCastWorkspace() {
  const [dataset, setDataset] = useState<AetherCastDataset | null>(null);
  const [importErrors, setImportErrors] = useState<string[]>([]);
  const [settings, setSettings] = useState<AetherCastSettings>(() => readSettings());
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [page, setPage] = useState(0);
  const [pendingCsv, setPendingCsv] = useState<PendingCsv | null>(null);
  const [liveLocation, setLiveLocation] = useState<LiveLocation | null>(null);
  const [liveLoading, setLiveLoading] = useState(false);
  const [liveError, setLiveError] = useState<string | null>(null);
  const [lastFetchedAt, setLastFetchedAt] = useState<number | null>(null);
  const [locationQuery, setLocationQuery] = useState('');
  const [locationResults, setLocationResults] = useState<LiveLocation[]>([]);
  const [locationSearchLoading, setLocationSearchLoading] = useState(false);
  const [locationSearchError, setLocationSearchError] = useState<string | null>(null);
  const canvasWrapRef = useRef<HTMLDivElement | null>(null);
  const liveFetchRef = useRef<AbortController | null>(null);
  const liveRequestIdRef = useRef(0);
  const locationSearchRef = useRef<AbortController | null>(null);
  const locationSearchIdRef = useRef(0);
  const browserLocationIntentIdRef = useRef(0);
  const browserLocationPendingRef = useRef(false);

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

  const invalidatePendingBrowserLocation = useCallback(() => {
    browserLocationIntentIdRef.current += 1;
    if (browserLocationPendingRef.current) {
      browserLocationPendingRef.current = false;
      setLiveLoading(false);
    }
  }, []);

  const cancelLocationSearch = useCallback(() => {
    locationSearchRef.current?.abort();
    locationSearchIdRef.current += 1;
    setLocationSearchLoading(false);
    setLocationResults([]);
  }, []);

  const applyDataset = useCallback((next: AetherCastDataset, errors: string[]) => {
    const nearest = nearestPointIndex(next);
    setDataset(next);
    setImportErrors(errors);
    setPendingCsv(null);
    setActiveIndex(nearest);
    setPage(Math.floor(nearest / PAGE_SIZE));
  }, []);

  const loadLiveLocation = useCallback(async (location: LiveLocation, persist = true) => {
    const requestId = ++liveRequestIdRef.current;
    liveFetchRef.current?.abort();
    const controller = new AbortController();
    liveFetchRef.current = controller;
    setLiveLoading(true);
    setLiveError(null);
    try {
      const result = await fetchLiveAetherCastDataset(location, controller.signal);
      if (requestId !== liveRequestIdRef.current) return;
      setLiveLocation(location);
      setLastFetchedAt(result.fetchedAt);
      applyDataset(result.dataset, result.warnings);
      if (persist) writeSavedLiveLocation(location);
    } catch (error) {
      if (isAbortError(error) || requestId !== liveRequestIdRef.current) return;
      setLiveError(errorMessage(error));
    } finally {
      if (requestId === liveRequestIdRef.current) setLiveLoading(false);
    }
  }, [applyDataset]);

  useEffect(() => {
    let disposed = false;
    const initializeLiveData = async () => {
      const saved = readSavedLiveLocation();
      if (saved) {
        if (!disposed) await loadLiveLocation(saved, false);
        return;
      }
      const intentId = ++browserLocationIntentIdRef.current;
      try {
        const location = await getBrowserLiveLocation();
        if (!disposed && intentId === browserLocationIntentIdRef.current) await loadLiveLocation(location, true);
      } catch (error) {
        if (!disposed && intentId === browserLocationIntentIdRef.current && !isAbortError(error)) {
          setLiveError('Location access is unavailable. Search by city or postal code to load live conditions.');
        }
      }
    };
    void initializeLiveData();
    return () => {
      disposed = true;
      browserLocationIntentIdRef.current += 1;
      browserLocationPendingRef.current = false;
      liveFetchRef.current?.abort();
      locationSearchRef.current?.abort();
    };
  }, [loadLiveLocation]);

  useEffect(() => {
    if (!liveLocation || dataset?.importSource !== 'open-meteo-live') return undefined;
    const timer = window.setInterval(() => {
      void loadLiveLocation(liveLocation, false);
    }, LIVE_REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [dataset?.importSource, liveLocation, loadLiveLocation]);

  const useBrowserLocation = useCallback(async () => {
    cancelLocationSearch();
    const intentId = ++browserLocationIntentIdRef.current;
    browserLocationPendingRef.current = true;
    setLiveLoading(true);
    setLiveError(null);
    try {
      const location = await getBrowserLiveLocation();
      if (intentId !== browserLocationIntentIdRef.current) return;
      browserLocationPendingRef.current = false;
      await loadLiveLocation(location, true);
    } catch (error) {
      if (intentId !== browserLocationIntentIdRef.current) return;
      if (!isAbortError(error)) setLiveError('Location access is unavailable. Search by city or postal code instead.');
    } finally {
      if (intentId === browserLocationIntentIdRef.current && browserLocationPendingRef.current) {
        browserLocationPendingRef.current = false;
        setLiveLoading(false);
      }
    }
  }, [cancelLocationSearch, loadLiveLocation]);

  const submitLocationSearch = useCallback(async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const query = locationQuery.trim();
    if (query.length < 2) {
      setLocationSearchError('Enter at least two characters to search.');
      setLocationResults([]);
      return;
    }
    invalidatePendingBrowserLocation();
    const requestId = ++locationSearchIdRef.current;
    locationSearchRef.current?.abort();
    const controller = new AbortController();
    locationSearchRef.current = controller;
    setLocationSearchLoading(true);
    setLocationSearchError(null);
    try {
      const results = await searchOpenMeteoLocations(query, controller.signal);
      if (requestId !== locationSearchIdRef.current) return;
      setLocationResults(results);
      if (results.length === 0) setLocationSearchError('No matching locations were found. Try a city, postal code, or broader place name.');
    } catch (error) {
      if (isAbortError(error) || requestId !== locationSearchIdRef.current) return;
      setLocationSearchError(errorMessage(error));
      setLocationResults([]);
    } finally {
      if (requestId === locationSearchIdRef.current) setLocationSearchLoading(false);
    }
  }, [invalidatePendingBrowserLocation, locationQuery]);

  const chooseLocation = useCallback((location: LiveLocation) => {
    invalidatePendingBrowserLocation();
    cancelLocationSearch();
    setLocationSearchError(null);
    void loadLiveLocation(location, true);
  }, [cancelLocationSearch, invalidatePendingBrowserLocation, loadLiveLocation]);

  const handleFile = useCallback(async (file: File) => {
    invalidatePendingBrowserLocation();
    cancelLocationSearch();
    liveFetchRef.current?.abort();
    liveRequestIdRef.current += 1;
    setLiveLocation(null);
    setLastFetchedAt(null);
    setLiveLoading(false);
    setLiveError(null);
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
  }, [applyDataset, cancelLocationSearch, dataset?.timezone, invalidatePendingBrowserLocation]);

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
    requestSupportPrompt({ key: 'aethercast-export', message: 'Compiled an air-quality and UV brief from the loaded data. If this helped your planning, support independent tool development with a coffee.' });
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

  const livePanel = (
    <section className="aethercast-live-panel" aria-labelledby="aethercast-live-heading">
      <div className="aethercast-section-heading">
        <div>
          <h3 id="aethercast-live-heading">Live air quality &amp; UV</h3>
          <p>Use your current location or search a place. AetherCast loads the data directly—no download or upload step.</p>
        </div>
        <button type="button" onClick={() => void useBrowserLocation()} disabled={liveLoading}>Use my location</button>
      </div>
      <form className="aethercast-live-form" onSubmit={submitLocationSearch}>
        <label>
          Search city or postal code
          <input value={locationQuery} onChange={(event) => setLocationQuery(event.target.value)} autoComplete="postal-code" placeholder="City or postal code" />
        </label>
        <button type="submit" disabled={locationSearchLoading}>{locationSearchLoading ? 'Searching…' : 'Search locations'}</button>
      </form>
      {locationSearchError ? <p className="aethercast-inline-error" role="alert">{locationSearchError}</p> : null}
      {locationResults.length > 0 ? (
        <div className="aethercast-location-results" aria-label="Location search results">
          {locationResults.map((location) => (
            <button type="button" key={`${location.label}-${location.latitude}-${location.longitude}`} onClick={() => chooseLocation(location)}>{location.label}</button>
          ))}
        </div>
      ) : null}
      {liveLoading ? <p className="aethercast-live-progress" role="status">Loading live Open-Meteo conditions…</p> : null}
      {liveLocation && dataset?.importSource === 'open-meteo-live' ? (
        <div className="aethercast-live-source" data-testid="aethercast-live-source" role="status">
          <strong>Live Open-Meteo feed for {liveLocation.label}</strong>
          <span>{lastFetchedAt ? `Updated ${new Date(lastFetchedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}. ` : ''}Refreshes every 15 minutes while this tool is open.</span>
          <span>Forecast-model data, not a local regulatory monitor or sensor. Air-quality data: Copernicus Atmosphere Monitoring Service (CAMS) via <a href="https://open-meteo.com/" target="_blank" rel="noreferrer">Open-Meteo</a>.</span>
          <button type="button" onClick={() => void loadLiveLocation(liveLocation, false)} disabled={liveLoading}>Refresh now</button>
        </div>
      ) : null}
      {liveError ? <p className="aethercast-inline-error" role="alert">{liveError}</p> : null}
    </section>
  );

  const csvMapper = pendingCsv ? (
    <section className="aethercast-csv-mapper" aria-labelledby="aethercast-csv-heading">
      <div className="aethercast-section-heading">
        <div><h3 id="aethercast-csv-heading">Map {pendingCsv.fileName}</h3><p>Choose columns, source units, and the IANA timezone before replacing the current dataset.</p></div>
        <button type="button" onClick={() => setPendingCsv(null)}>Cancel</button>
      </div>
      <label className="aethercast-timezone-field">Dataset timezone<input value={pendingCsv.timezone} onChange={(event) => setPendingCsv((current) => current ? { ...current, timezone: event.target.value } : current)} placeholder="America/Chicago" /></label>
      <p className="aethercast-method-note">Timezone-less timestamps are interpreted in this IANA zone. Nonexistent spring-forward times and repeated fall-back times are rejected; add an explicit UTC offset to disambiguate a repeated wall time.</p>
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

  const importFallback = (
    <details className="aethercast-import-fallback">
      <summary>Advanced: import a saved dataset</summary>
      <p>Optional fallback for Open-Meteo JSON, an AetherCast JSON export, or mapped CSV data.</p>
      <input type="file" accept="application/json,.json,.csv,text/csv" onChange={onFileInputChange} aria-label="Import an air quality and UV data file" />
    </details>
  );

  if (!dataset) {
    return (
      <div className="aethercast-empty">
        {livePanel}
        {importErrors.length > 0 && <ul className="aethercast-errors" role="alert">{importErrors.map((message) => <li key={message}>{message}</li>)}</ul>}
        {csvMapper}
        {importFallback}
      </div>
    );
  }

  const reconciliation = dataset.timestampReconciliation;

  return (
    <div className="aethercast-workspace">
      {livePanel}

      <div className="aethercast-toolbar">
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

      {importFallback}
      {csvMapper}
      {importErrors.length > 0 && <ul className="aethercast-errors" role="alert">{importErrors.map((message) => <li key={message}>{message}</li>)}</ul>}

      <p className="aethercast-data-age" role="status">{dataTimeLabel(dataset)} Timezone: {dataset.timezone ?? 'unspecified'}. Loaded rows: {dataset.points.length.toLocaleString()}{dataset.truncatedRows ? `; ${dataset.truncatedRows.toLocaleString()} rows omitted or invalid.` : '.'}</p>

      {reconciliation && (
        <section className="aethercast-list-section" aria-label="Timestamp reconciliation" data-testid="aethercast-timestamp-reconciliation">
          <h3>Timestamp reconciliation</h3>
          <p>{reconciliation.acceptedRows.toLocaleString()} of {reconciliation.consideredRows.toLocaleString()} considered timestamps were accepted; {reconciliation.rejectedRows.toLocaleString()} were rejected. {reconciliation.explicitOffsetRows.toLocaleString()} carried an explicit UTC offset and {reconciliation.wallClockRows.toLocaleString()} were timezone-resolved wall clocks.</p>
          <p>Policy: ambiguous or nonexistent wall times are rejected rather than shifted or guessed. Timezone: {reconciliation.timezone ?? 'none supplied'}.</p>
        </section>
      )}

      {activeAssessment && (
        <section className="aethercast-status" aria-label="Selected snapshot">
          <p><span>{settings.activeStandard === 'US_EPA' ? 'Locally calculated US EPA AQI' : 'Locally calculated European Air Quality Index'}</span><strong>{selectedValue ?? 'unknown'}</strong> {selectedBand ? `(${selectedBand.replaceAll('_', ' ')})` : ''}</p>
          <p><span>Index coverage</span><strong>{selectedCoverage.toLowerCase()}</strong></p>
          <p data-testid="aethercast-pollutant-coverage"><span>Pollutants contributing</span><strong>{pollutantCoverageLabel(activeAssessment, settings.activeStandard)}</strong></p>
          <p><span>Imported provider US AQI</span><strong>{activeAssessment.point.providedUsAqi ?? 'not supplied'}</strong></p>
          <p><span>Imported provider European AQI</span><strong>{activeAssessment.point.providedEuropeanAqi ?? 'not supplied'}</strong></p>
          <p><span>UV Index</span><strong>{activeAssessment.point.uvIndex ?? 'unknown'}</strong></p>
          <p><span>Skin-type timing heuristic</span><strong>{formatBurn(activeAssessment.burnMinutes)}</strong></p>
          <p className="aethercast-health-note">Provider indices are comparison-only and never replace the locally calculated values. The timing estimate is not a safe-exposure limit. UV risk depends on more than skin type, and WHO recommends sun-protection measures when UVI reaches 3 or above.</p>
        </section>
      )}

      <p className="aethercast-method-note">
        {settings.activeStandard === 'US_EPA'
          ? 'US values are recalculated from raw concentrations using EPA PM NowCast weighting, pollutant-specific averaging periods, concentration truncation, interpolation, final AQI rounding, and the EPA SO2 high-concentration special case. Ozone uses the prescribed 8-hour/1-hour AQI rules here; the operational AirNow ozone NowCast is a separate two-week statistical model and is not represented as if it were calculated locally.'
          : 'European values are recalculated from raw hourly PM2.5, PM10, O3, NO2, and SO2 concentrations using the current EEA hourly bands; source-provided European index values are displayed only for comparison and are not reused.'}
      </p>

      {activeAssessment && (
        <section className="aethercast-list-section" aria-label="EPA averaging window availability" data-testid="aethercast-averaging-availability">
          <h3>EPA averaging-window availability</h3>
          <p>Each pollutant states whether its AQI subindex is currently calculable and which averaging rule applies.</p>
          <ul>
            {EPA_POLLUTANTS.map((key) => {
              const score = activeAssessment.pollutants[key];
              return <li key={key}><strong>{EPA_LABELS[key]}:</strong> {score.subIndex === null ? 'not currently calculable' : `subindex ${Math.round(score.subIndex)}`} — {score.epaAveragingLabel ?? 'method unavailable'}.</li>;
            })}
          </ul>
        </section>
      )}

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
          <caption>Hourly readout. This page shows {pageRows.length} of {assessments.length} rows; pagination controls expose the complete loaded range.</caption>
          <thead><tr><th>Time</th><th>{settings.activeStandard === 'US_EPA' ? 'Calculated US AQI' : 'Calculated European index'}</th><th>Band</th><th>Coverage</th><th>Pollutants contributing</th><th>Provider US AQI</th><th>Provider European AQI</th><th>PM2.5 µg/m³</th><th>O3 µg/m³</th><th>UV</th></tr></thead>
          <tbody>
            {pageRows.map((assessment, offset) => {
              const globalIndex = pageStart + offset;
              const value = settings.activeStandard === 'US_EPA' ? assessment.compositeAqi : assessment.eaqiValue;
              const band = settings.activeStandard === 'US_EPA' ? assessment.aqiCategory : assessment.eaqiBand;
              const coverage = settings.activeStandard === 'US_EPA' ? assessment.usAqiCoverage : assessment.europeanAqiCoverage;
              const selectRow = () => setActiveIndex(globalIndex);
              return <tr key={`${assessment.point.isoTimestamp}-${globalIndex}`} aria-current={globalIndex === activeIndex ? 'true' : undefined} tabIndex={0} onClick={selectRow} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); selectRow(); } }}><td>{assessment.point.isoTimestamp}</td><td>{value ?? '—'}</td><td>{band?.replaceAll('_', ' ') ?? '—'}</td><td>{coverage.toLowerCase()}</td><td>{pollutantCoverageLabel(assessment, settings.activeStandard)}</td><td>{assessment.point.providedUsAqi ?? '—'}</td><td>{assessment.point.providedEuropeanAqi ?? '—'}</td><td>{assessment.point.pm25 ?? '—'}</td><td>{assessment.point.ozone ?? '—'}</td><td>{assessment.point.uvIndex ?? '—'}</td></tr>;
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
        {anomalies.length ? <ul>{anomalies.map((event) => <li key={`${event.type}-${event.startTimestamp}`}>{event.type === 'WILDFIRE_SCREEN' ? 'Wildfire screen' : 'Thermal inversion'} — {event.startTimestamp} ({event.confirmed ? 'corroborated' : 'unconfirmed'}): {event.advisoryMessage}</li>)}</ul> : <p>None detected in the loaded range.</p>}
      </section>

      <div className="aethercast-exports">
        <button type="button" onClick={handleExportPdf}>Export PDF brief</button><button type="button" onClick={handleExportCsv}>Export CSV</button><button type="button" onClick={handleExportPng}>Export chart PNG</button><button type="button" onClick={() => dataset && exportJson(dataset)}>Export JSON</button>
      </div>
    </div>
  );
}

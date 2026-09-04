import { useCallback, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { assessDataset } from './aethercast-engine';
import { detectAnomalies } from './aethercast-anomaly';
import { buildActivityWindows } from './aethercast-activity';
import { parseAetherCastExport, parseOpenMeteoJson } from './aethercast-import';
import { exportCanvasPng, exportCsv, exportJson, exportPdfBrief } from './aethercast-export';
import { readSettings, writeSettings } from './aethercast-persistence';
import { AetherCastForecastCanvas } from './AetherCastForecastCanvas';
import { requestSupportPrompt } from '../../lib/support';
import type { AetherCastDataset, AetherCastSettings, FitzpatrickType, VulnerabilityLens } from './aethercast-types';

const TABLE_ID = 'aethercast-readout-table';
const MAX_TABLE_ROWS = 200;

export default function AetherCastWorkspace() {
  const [dataset, setDataset] = useState<AetherCastDataset | null>(null);
  const [importErrors, setImportErrors] = useState<string[]>([]);
  const [settings, setSettings] = useState<AetherCastSettings>(() => readSettings());
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const canvasWrapRef = useRef<HTMLDivElement | null>(null);

  const assessments = useMemo(() => (dataset ? assessDataset(dataset, settings) : []), [dataset, settings]);
  const anomalies = useMemo(() => (dataset ? detectAnomalies(dataset.points) : []), [dataset]);
  const activityWindows = useMemo(() => buildActivityWindows(assessments), [assessments]);
  const activeAssessment = activeIndex !== null ? assessments[activeIndex] : assessments[assessments.length - 1];

  const updateSettings = useCallback((patch: Partial<AetherCastSettings>) => {
    setSettings((previous) => {
      const next = { ...previous, ...patch };
      writeSettings(next);
      return next;
    });
  }, []);

  const handleFile = useCallback(async (file: File) => {
    const text = await file.text();
    const looksLikeAetherExport = file.name.toLowerCase().endsWith('.json') && text.includes('"importSource"');
    const result = looksLikeAetherExport ? parseAetherCastExport(text) : parseOpenMeteoJson(text);
    setImportErrors(result.errors);
    if (result.dataset) {
      setDataset(result.dataset);
      setActiveIndex(null);
    }
  }, []);

  const onFileInputChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (file) void handleFile(file);
      event.target.value = '';
    },
    [handleFile],
  );

  const handleExportPdf = useCallback(async () => {
    if (!dataset) return;
    await exportPdfBrief(dataset, assessments, anomalies);
    requestSupportPrompt({
      key: 'aethercast-export',
      message: 'Compiled a local air quality & UV brief from your imported data. If this helped your outdoor planning, support independent tool development with a coffee.',
    });
  }, [dataset, assessments, anomalies]);

  const handleExportCsv = useCallback(() => {
    if (!dataset) return;
    exportCsv(assessments);
    requestSupportPrompt({
      key: 'aethercast-export',
      message: 'Exported the full local hourly air quality & UV dataset. If this helped your outdoor planning, support independent tool development with a coffee.',
    });
  }, [dataset, assessments]);

  const handleExportPng = useCallback(async () => {
    const canvas = canvasWrapRef.current?.querySelector('canvas');
    if (canvas instanceof HTMLCanvasElement) await exportCanvasPng(canvas);
  }, []);

  const handleExportJson = useCallback(() => {
    if (dataset) exportJson(dataset);
  }, [dataset]);

  const formatBurn = (minutes: number | null): string => {
    if (minutes === null) return 'n/a';
    if (!Number.isFinite(minutes)) return 'No burn risk (night/low UV)';
    return `${minutes < 1 ? '< 1' : minutes.toFixed(0)} min`;
  };

  if (!dataset) {
    return (
      <div className="aethercast-empty">
        <p>
          Import an hourly air-quality export to begin. AetherCast reads a file you already have and never contacts a
          network service itself. Open Open-Meteo&apos;s public Air Quality API documentation in your own browser tab,
          request hourly <code>pm10, pm2_5, carbon_monoxide, nitrogen_dioxide, sulphur_dioxide, ozone, uv_index,
          uv_index_clear_sky, us_aqi, european_aqi</code>, save the JSON response, then load it below.
        </p>
        {importErrors.length > 0 && (
          <ul className="aethercast-errors" role="alert">
            {importErrors.map((message) => (
              <li key={message}>{message}</li>
            ))}
          </ul>
        )}
        <input type="file" accept="application/json,.json,.csv,text/csv" onChange={onFileInputChange} aria-label="Import an air quality and UV data file" />
      </div>
    );
  }

  return (
    <div className="aethercast-workspace">
      <div className="aethercast-toolbar">
        <label>
          Replace dataset
          <input type="file" accept="application/json,.json,.csv,text/csv" onChange={onFileInputChange} />
        </label>
        <label>
          Standard
          <select
            value={settings.activeStandard}
            onChange={(event) => updateSettings({ activeStandard: event.target.value as AetherCastSettings['activeStandard'] })}
          >
            <option value="US_EPA">US EPA AQI</option>
            <option value="EUROPEAN_EAQI">European EAQI</option>
          </select>
        </label>
        <label>
          Fitzpatrick skin type
          <select
            value={settings.skinType}
            onChange={(event) => updateSettings({ skinType: Number(event.target.value) as FitzpatrickType })}
          >
            {[1, 2, 3, 4, 5, 6].map((type) => (
              <option key={type} value={type}>
                Type {type}
              </option>
            ))}
          </select>
        </label>
        <label>
          Vulnerability lens
          <select
            value={settings.vulnerabilityLens}
            onChange={(event) => updateSettings({ vulnerabilityLens: event.target.value as VulnerabilityLens })}
          >
            <option value="NONE">None</option>
            <option value="ASTHMA">Asthma / Respiratory</option>
            <option value="CARDIOVASCULAR">Cardiovascular</option>
            <option value="PEDIATRIC">Pediatric</option>
            <option value="PHOTOSENSITIVE">Photosensitive</option>
          </select>
        </label>
      </div>

      {importErrors.length > 0 && (
        <ul className="aethercast-errors" role="alert">
          {importErrors.map((message) => (
            <li key={message}>{message}</li>
          ))}
        </ul>
      )}

      {activeAssessment && (
        <section className="aethercast-status" aria-label="Current snapshot">
          <p>
            Composite AQI: <strong>{activeAssessment.compositeAqi ?? 'n/a'}</strong> ({activeAssessment.aqiCategory ?? 'n/a'})
          </p>
          <p>
            European AQI: <strong>{activeAssessment.eaqiValue ?? 'n/a'}</strong> ({activeAssessment.eaqiBand ?? 'n/a'})
          </p>
          <p>
            Estimated safe sun exposure: <strong>{formatBurn(activeAssessment.burnMinutes)}</strong> (estimated, not medical guidance)
          </p>
        </section>
      )}

      <div ref={canvasWrapRef} className="aethercast-canvas-wrap">
        <AetherCastForecastCanvas assessments={assessments} activeIndex={activeIndex} onScrub={setActiveIndex} describedById={TABLE_ID} />
      </div>

      <table id={TABLE_ID} className="aethercast-table">
        <caption>Hourly readout, synchronized with the chart above</caption>
        <thead>
          <tr>
            <th>Time</th>
            <th>AQI</th>
            <th>Category</th>
            <th>PM2.5</th>
            <th>O3</th>
            <th>UV</th>
          </tr>
        </thead>
        <tbody>
          {assessments.slice(0, MAX_TABLE_ROWS).map((assessment, index) => (
            <tr key={assessment.point.isoTimestamp} aria-current={index === activeIndex}>
              <td>{assessment.point.isoTimestamp}</td>
              <td>{assessment.compositeAqi ?? '\u2014'}</td>
              <td>{assessment.aqiCategory ?? '\u2014'}</td>
              <td>{assessment.point.pm25 ?? '\u2014'}</td>
              <td>{assessment.point.ozone ?? '\u2014'}</td>
              <td>{assessment.point.uvIndex ?? '\u2014'}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <section aria-label="Outdoor activity advisory">
        <h3>Outdoor activity windows</h3>
        <ul>
          {activityWindows.map((window) => (
            <li key={window.startTimestamp}>
              {window.startTimestamp} to {window.endTimestamp}: {window.recommendation} (limiting factor: {window.primaryLimitingFactor})
            </li>
          ))}
        </ul>
      </section>

      <section aria-label="Screening anomalies">
        <h3>Screening anomalies ({anomalies.length})</h3>
        <ul>
          {anomalies.map((event) => (
            <li key={`${event.type}-${event.startTimestamp}`}>
              {event.type === 'WILDFIRE_SCREEN' ? 'Wildfire screen' : 'Thermal inversion'} - {event.startTimestamp} (
              {event.confirmed ? 'corroborated' : 'unconfirmed'}): {event.advisoryMessage}
            </li>
          ))}
        </ul>
      </section>

      <div className="aethercast-exports">
        <button type="button" onClick={handleExportPdf}>
          Export PDF brief
        </button>
        <button type="button" onClick={handleExportCsv}>
          Export CSV
        </button>
        <button type="button" onClick={handleExportPng}>
          Export chart PNG
        </button>
        <button type="button" onClick={handleExportJson}>
          Export JSON
        </button>
      </div>
    </div>
  );
}

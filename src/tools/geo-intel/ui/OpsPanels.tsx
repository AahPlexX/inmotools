import { useEffect, useRef, useState } from 'react';
import { ZIPPOPOTAM_COUNTRIES } from '../core/postal';
import { SOURCES } from '../core/sources';
import type { SourceId } from '../core/types';
import { BATCH_ROW_LIMIT, batchToCsv, OUTPUT_COLUMNS, parseBatchCsv, runBatch, type BatchInput, type BatchProgress, type OutputRow } from '../engine/batch';
import type { HttpClient, SourceHealth } from '../net/http';
import { clearResponseCache, responseCacheStats, type GeoIntelSettings } from '../net/store';
import { loadManifest, type DataManifest } from '../offline/static-data';
import { downloadText } from '../../../lib/download';

const countryName = (() => {
  let names: Intl.DisplayNames | null = null;
  try { names = new Intl.DisplayNames(['en'], { type: 'region' }); } catch { names = null; }
  return (code: string) => { try { return names?.of(code) ?? code; } catch { return code; } };
})();

export function PostalCountrySelect({ value, onChange, label = 'Default postal country', tip }: { value: string; onChange: (code: string) => void; label?: string; tip?: string }) {
  return (
    <label className="gi-field compact"><span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)} data-tip={tip ?? 'Used when a postal code is typed without a country'}>
        {[...ZIPPOPOTAM_COUNTRIES].sort((a, b) => countryName(a).localeCompare(countryName(b))).map((code) => <option key={code} value={code}>{countryName(code)} ({code})</option>)}
      </select>
    </label>
  );
}

const SAMPLE = 'postcode,country\n90210,US\n10115,DE\nSW1A 1AA,GB\n75007,FR\n100-0001,JP\n';

export function BatchPanel({ client, defaultCountry }: { client: HttpClient; defaultCountry: string }) {
  const [text, setText] = useState('');
  const [country, setCountry] = useState(defaultCountry);
  const [input, setInput] = useState<BatchInput | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<BatchProgress | null>(null);
  const [rows, setRows] = useState<OutputRow[] | null>(null);
  const [status, setStatus] = useState('');
  const [running, setRunning] = useState(false);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => setCountry(defaultCountry), [defaultCountry]);
  useEffect(() => () => controller.current?.abort(), []);

  useEffect(() => {
    if (!text.trim()) { setInput(null); setError(null); return; }
    try { setInput(parseBatchCsv(text)); setError(null); } catch (caught) { setInput(null); setError((caught as Error).message); }
  }, [text]);

  const run = async () => {
    if (!input) return;
    controller.current = new AbortController();
    setRows(null); setStatus(''); setRunning(true);
    try {
      const result = await runBatch(input, { client, defaultCountry: country, signal: controller.current.signal, onProgress: setProgress });
      setRows(result.rows);
      setStatus(`${result.cancelled ? 'Cancelled after' : 'Finished'} ${result.rows.length} row${result.rows.length === 1 ? '' : 's'}${result.truncated ? ` (only the first ${BATCH_ROW_LIMIT} rows are processed per run)` : ''}.`);
    } catch (caught) { setError((caught as Error).message); }
    finally { controller.current = null; setRunning(false); }
  };
  const minutes = input ? Math.ceil(Math.min(input.rows.length, BATCH_ROW_LIMIT) / 60) : 0;

  return (
    <div className="gi-batch" data-testid="gi-batch">
      <p className="gi-muted">Paste or open a CSV with a postal-code column and (optionally) a country column. Rows are looked up one per second through Zippopotam.us (Postcodes.io for UK), cached on this device, and never sent anywhere else.</p>
      <label className="gi-field"><span>CSV data</span>
        <textarea rows={6} value={text} onChange={(event) => setText(event.target.value)} placeholder={SAMPLE} spellCheck={false} data-tip="First row must be headers, e.g. postcode,country" />
      </label>
      <div className="gi-inline">
        <label className="gi-btn file" data-tip="Open a .csv file from this device">Open CSV…
          <input type="file" accept=".csv,text/csv,.txt" className="gi-visually-hidden" onChange={async (event) => { const file = event.target.files?.[0]; if (file) setText(await file.text()); event.target.value = ''; }} />
        </label>
        <button type="button" className="gi-btn" onClick={() => setText(SAMPLE)} data-tip="Fill in a five-row example">Use example</button>
        <PostalCountrySelect value={country} onChange={setCountry} label="Country when a row has none" />
      </div>
      {error ? <p className="gi-error" role="alert">{error}</p> : null}
      {input ? <p>Detected <strong>{input.rows.length}</strong> row{input.rows.length === 1 ? '' : 's'} · postal column <code>{input.postalColumn}</code> · country column <code>{input.countryColumn ?? '(none — using default)'}</code> · about {minutes} min at 1 request/s (repeat codes are looked up once).</p> : null}
      <div className="gi-actions">
        <button type="button" className="gi-btn primary" disabled={!input || running} onClick={run} data-tip="Look up every row, one per second; repeated codes are looked up once">Run batch lookup</button>
        <button type="button" className="gi-btn" disabled={!running} onClick={() => controller.current?.abort()} data-tip="Stop after the current row; finished rows stay downloadable">Cancel</button>
        <button type="button" className="gi-btn" disabled={!rows?.length || !input} onClick={() => input && rows && downloadText(batchToCsv(input, rows), 'geo-intel-batch.csv', 'text/csv;charset=utf-8')} data-tip="Your columns plus gi_* result columns with source, license and retrieval time">Download results CSV</button>
      </div>
      {progress ? (
        <div className="gi-progress">
          <progress max={progress.total} value={progress.done} aria-label="Batch progress" />
          <span role="status">{progress.done} / {progress.total} · {progress.ok} found · {progress.failed} failed{running && progress.current ? ` · ${progress.current}` : ''}</span>
        </div>
      ) : null}
      {status ? <p role="status">{status}</p> : null}
      {rows?.length ? (
        <div className="gi-table-wrap" tabIndex={0} role="region" aria-label="Batch results preview">
          <table className="gi-table">
            <thead><tr><th>{input?.postalColumn}</th>{OUTPUT_COLUMNS.slice(0, 9).map((column) => <th key={column}>{column.replace('gi_', '')}</th>)}</tr></thead>
            <tbody>{rows.slice(0, 50).map((row, i) => <tr key={i} className={row.gi_status === 'ok' ? '' : 'is-bad'}><td>{input ? row[input.postalColumn] : ''}</td>{OUTPUT_COLUMNS.slice(0, 9).map((column) => <td key={column}>{row[column]}</td>)}</tr>)}</tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}

export function SourcesPanel({ client, settings, onSettings, health, onStatus }: { client: HttpClient; settings: GeoIntelSettings; onSettings: (patch: Partial<GeoIntelSettings>) => void; health: SourceHealth[]; onStatus: (message: string) => void }) {
  const [stats, setStats] = useState<{ entries: number; bySource: Record<string, number> } | null>(null);
  const [manifest, setManifest] = useState<DataManifest | null>(null);
  const refresh = () => responseCacheStats().then(setStats).catch(() => setStats(null));
  useEffect(() => { refresh(); loadManifest().then(setManifest).catch(() => undefined); }, []);
  const byId = new Map(health.map((item) => [item.source, item]));
  const network = (Object.keys(SOURCES) as SourceId[]).filter((id) => SOURCES[id].network);
  return (
    <div className="gi-sources" data-testid="gi-sources">
      <section className="gi-card" aria-labelledby="gi-settings-title">
        <h3 id="gi-settings-title">Settings</h3>
        <label className="gi-check block">
          <input type="checkbox" checked={settings.nominatimEnabled} onChange={(event) => onSettings({ nominatimEnabled: event.target.checked })} />
          <span>Use OpenStreetMap Nominatim as a last-resort geocoder</span>
        </label>
        <p className="gi-muted">Off by default. When on, it is only asked after Photon finds nothing, at most once per second, never for batch, autocomplete or map grids, and every answer is cached. See the <a href="https://operations.osmfoundation.org/policies/nominatim/" target="_blank" rel="noreferrer">Nominatim usage policy</a>.</p>
        <div className="gi-inline">
          <PostalCountrySelect value={settings.defaultPostalCountry} onChange={(code) => onSettings({ defaultPostalCountry: code })} />
          <fieldset className="gi-radios">
            <legend>Units</legend>
            {(['both', 'metric', 'imperial'] as const).map((units) => (
              <label key={units}><input type="radio" name="gi-units" checked={settings.units === units} onChange={() => onSettings({ units })} /> {units === 'both' ? 'Both' : units === 'metric' ? 'Metric' : 'Imperial'}</label>
            ))}
          </fieldset>
        </div>
      </section>

      <section className="gi-card" aria-labelledby="gi-health-title">
        <h3 id="gi-health-title" data-tip="Each source has its own throttle and circuit breaker; a paused source recovers automatically after a minute" tabIndex={0}>Keyless sources</h3>
        <div className="gi-table-wrap" tabIndex={0} role="region" aria-label="Source status">
          <table className="gi-table">
            <thead><tr><th>Source</th><th>Status</th><th>Requests</th><th>Cache hits</th><th>Cached</th><th>Policy</th><th>License</th></tr></thead>
            <tbody>
              {network.map((id) => {
                const h = byId.get(id);
                const state = id === 'nominatim' && !settings.nominatimEnabled ? 'disabled' : h?.state ?? 'idle';
                return (
                  <tr key={id}>
                    <th scope="row"><a href={SOURCES[id].homepage} target="_blank" rel="noreferrer">{SOURCES[id].name}</a></th>
                    <td><span className={`gi-state state-${state}`} data-tip={h?.lastError ?? (state === 'open' ? 'Paused after repeated failures' : 'Ready')}>{state === 'open' ? 'paused' : state}</span>
                      {h && h.state !== 'closed' ? <button type="button" className="gi-btn small" onClick={() => client.resetBreaker(id)} data-tip="Try this source again now instead of waiting for the one-minute pause">Retry now</button> : null}</td>
                    <td>{h?.requests ?? 0}</td><td>{h?.cacheHits ?? 0}</td><td>{stats?.bySource[id] ?? 0}</td>
                    <td className="gi-small">{SOURCES[id].policy}</td><td className="gi-small">{SOURCES[id].license}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="gi-actions">
          <span className="gi-muted">{stats ? `${stats.entries} cached responses on this device` : 'Cache unavailable'}</span>
          <button type="button" className="gi-btn" onClick={async () => { await clearResponseCache(); await refresh(); onStatus('Cleared cached responses. Saved locations are kept.'); }} data-tip="Delete cached API answers (history and starred locations stay)">Clear response cache</button>
        </div>
      </section>

      <section className="gi-card" aria-labelledby="gi-bundled-title">
        <h3 id="gi-bundled-title" data-tip="These datasets ship with the app and work offline" tabIndex={0}>Bundled offline data</h3>
        {manifest ? (
          <ul className="gi-manifest">
            {Object.entries(manifest.datasets).map(([key, item]) => (
              <li key={key}><strong>{item.source}</strong>{item.version ? ` ${item.version}` : ''} · {item.license} · {(item.bytes / 1024).toFixed(0)} KB · built {item.retrievedAt}
                {item.accuracy ? <span className="gi-muted"> · simplified: {(item.accuracy.landAgreement * 100).toFixed(2)}% agreement on land vs. full resolution</span> : null}
                <br /><span className="gi-muted">{item.attribution}</span></li>
            ))}
          </ul>
        ) : <p className="gi-muted">Loading…</p>}
      </section>
    </div>
  );
}

import { useMemo, useState } from 'react';
import { downloadText } from '../../lib/download';
import { PagedTable } from '../../components/PagedTable';
import { formatRunInZone, getCronRuns, isValidTimeZone, partitionTimeZones, projectRunToZones, runHourInZone } from './cron-engine';

const DEFAULT_ZONES = ['UTC', 'America/New_York', 'America/Chicago', 'Europe/London', 'Asia/Kolkata'];
const csvCell = (value: unknown) => {
  const text = String(value ?? '');
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};

export default function CronWorkspace() {
  const [expression, setExpression] = useState('0 9 * * 1-5');
  const [sourceZone, setSourceZone] = useState('UTC');
  const [zones, setZones] = useState(DEFAULT_ZONES.join('\n'));
  const [runCount, setRunCount] = useState(30);
  const [status, setStatus] = useState('Showing the next scheduled runs.');

  const requestedZones = useMemo(() => zones.split(/\r?\n|,/).map((value) => value.trim()).filter(Boolean), [zones]);
  const partitioned = useMemo(() => partitionTimeZones(requestedZones), [requestedZones]);
  const sourceZoneValid = useMemo(() => isValidTimeZone(sourceZone), [sourceZone]);
  const displayZones = useMemo(() => {
    const all = sourceZoneValid ? [sourceZone, ...partitioned.valid] : partitioned.valid;
    return [...new Set(all)];
  }, [sourceZone, sourceZoneValid, partitioned.valid]);

  let runs: Date[] = [];
  let error = '';
  if (!sourceZoneValid) {
    error = `"${sourceZone}" is not a timezone this browser recognizes. Use an IANA name such as UTC or Europe/London.`;
  } else {
    try {
      runs = getCronRuns(expression, { count: runCount, startDate: new Date(), timeZone: sourceZone });
    } catch (caught) {
      error = caught instanceof Error ? caught.message : 'Invalid cron expression';
    }
  }

  const hourCounts = useMemo(() => {
    const counts = new Map<number, number>();
    for (const run of runs) {
      const hour = runHourInZone(run, sourceZone);
      if (hour === null) continue;
      counts.set(hour, (counts.get(hour) || 0) + 1);
    }
    return counts;
  }, [runs, sourceZone]);

  const rows = useMemo(() => runs.map((run, index) => ({
    id: `${run.toISOString()}-${index}`,
    run: index + 1,
    instant: run.toISOString(),
    projected: projectRunToZones(run, displayZones),
  })), [runs, displayZones]);

  function exportCsv() {
    const headers = ['Run', 'UTC instant', ...displayZones];
    const lines = [headers.map(csvCell).join(',')];
    for (const row of rows) lines.push([row.run, row.instant, ...displayZones.map((zone) => row.projected[zone])].map(csvCell).join(','));
    downloadText(lines.join('\r\n'), 'cron-team-matrix.csv', 'text/csv;charset=utf-8');
    setStatus(`Exported ${rows.length} projected run${rows.length === 1 ? '' : 's'} across ${displayZones.length} timezone${displayZones.length === 1 ? '' : 's'}.`);
  }

  return <>
    <div className="workspace-header"><div><h2>Global cron matrix</h2><p>Each row is one instant projected into every selected timezone, with seconds and UTC offsets retained.</p></div></div>
    <div className="workspace-body">
      <div className="workspace-grid">
        <div className="field"><label htmlFor="cron">Cron expression</label><input id="cron" type="text" value={expression} onChange={(event) => { setExpression(event.target.value); setStatus('Schedule updated.'); }} spellCheck={false} /><small>Five- and six-field expressions are supported by cron-parser; six fields preserve seconds in the matrix.</small></div>
        <div className="field"><label htmlFor="run-count">Runs to project</label><input id="run-count" type="number" min="1" max="200" value={runCount} onChange={(event) => setRunCount(Math.max(1, Math.min(200, Number(event.target.value) || 1)))} /><small>How far ahead to calculate, up to 200.</small></div>
        <div className="field"><label htmlFor="source-zone">Source timezone</label><input id="source-zone" type="text" value={sourceZone} onChange={(event) => setSourceZone(event.target.value)} list="common-zones" /><datalist id="common-zones">{DEFAULT_ZONES.map((zone) => <option key={zone} value={zone} />)}</datalist><small>The source timezone is always included as a matrix column.</small></div>
      </div>

      <div className="field" style={{ marginTop: 16 }}><label htmlFor="zones">Comparison timezones</label><textarea id="zones" value={zones} onChange={(event) => setZones(event.target.value)} style={{ minHeight: 100 }} /><small>One IANA timezone per line or comma-separated. Duplicate names are automatically collapsed.</small></div>
      {partitioned.invalid.length ? <div className="status-line error" data-testid="invalid-zones">Not recognized and left out: {partitioned.invalid.join(', ')}</div> : null}
      {partitioned.duplicates.length ? <div className="status-line">Duplicate timezone{partitioned.duplicates.length === 1 ? '' : 's'} collapsed: {partitioned.duplicates.join(', ')}</div> : null}
      {partitioned.truncated.length ? <div className="status-line error">Comparison limit reached; left out: {partitioned.truncated.join(', ')}</div> : null}

      {error ? <div className="status-line error" role="status">{error}</div> : <>
        <div className="status-line good" role="status">{status} {runs.length} upcoming runs calculated locally.</div>
        {runs[0] ? <div className="notice"><strong>Next run</strong><div className="help-text">{formatRunInZone(runs[0], sourceZone)} · {runs[0].toISOString()}</div></div> : null}
        <div className="metric-row" aria-label="24-hour run distribution">{Array.from({ length: 24 }, (_, hour) => <div className="metric" key={hour}><span>{String(hour).padStart(2, '0')}:00</span><strong>{hourCounts.get(hour) || 0}</strong></div>)}</div>
        <div className="button-row"><button className="action-button secondary" type="button" disabled={!rows.length} onClick={exportCsv}>Export matrix CSV</button></div>
        <PagedTable
          columns={[{ key: 'run', label: 'Run' }, { key: 'instant', label: 'UTC instant' }, ...displayZones.map((zone) => ({ key: zone, label: zone }))]}
          rows={rows}
          pageSize={50}
          caption="Upcoming cron runs by timezone"
          rowKey={(row) => row.id}
          renderCell={(row, key) => key === 'run' ? row.run : key === 'instant' ? row.instant : row.projected[key]}
          testId="cron-runs"
        />
      </>}
    </div>
  </>;
}

import { useMemo, useState } from 'react';
import { downloadText } from '../../lib/download';
import { PagedTable } from '../../components/PagedTable';
import {
  buildCronCalendar,
  findTimeZoneOffsetTransitions,
  formatOffsetMinutes,
  formatRunInZone,
  getCronRuns,
  getSupportedTimeZones,
  isRunInWorkingHours,
  isValidTimeZone,
  parseReferenceInstant,
  partitionTimeZones,
  projectRunToZones,
  runHourInZone,
  searchTimeZones,
} from './cron-engine';

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
  const [referenceInstant, setReferenceInstant] = useState(() => new Date().toISOString());
  const [zoneSearch, setZoneSearch] = useState('');
  const [workStart, setWorkStart] = useState(9);
  const [workEnd, setWorkEnd] = useState(17);
  const [status, setStatus] = useState('Showing the next scheduled runs from the fixed reference instant.');

  const requestedZones = useMemo(() => zones.split(/\r?\n|,/).map((value) => value.trim()).filter(Boolean), [zones]);
  const partitioned = useMemo(() => partitionTimeZones(requestedZones), [requestedZones]);
  const sourceZoneValid = useMemo(() => isValidTimeZone(sourceZone), [sourceZone]);
  const supportedZones = useMemo(() => getSupportedTimeZones(), []);
  const zoneMatches = useMemo(() => searchTimeZones(zoneSearch, supportedZones), [zoneSearch, supportedZones]);
  const referenceState = useMemo(() => {
    try {
      return { date: parseReferenceInstant(referenceInstant), error: '' };
    } catch (caught) {
      return { date: null, error: caught instanceof Error ? caught.message : 'Invalid reference instant.' };
    }
  }, [referenceInstant]);
  const displayZones = useMemo(() => {
    const all = sourceZoneValid ? [sourceZone, ...partitioned.valid] : partitioned.valid;
    return [...new Set(all)];
  }, [sourceZone, sourceZoneValid, partitioned.valid]);

  const schedule = useMemo(() => {
    if (!sourceZoneValid) return { runs: [] as Date[], error: `"${sourceZone}" is not a timezone this browser recognizes. Use an IANA name such as UTC or Europe/London.` };
    if (!referenceState.date) return { runs: [] as Date[], error: referenceState.error };
    try {
      return { runs: getCronRuns(expression, { count: runCount, startDate: referenceState.date, timeZone: sourceZone }), error: '' };
    } catch (caught) {
      return { runs: [] as Date[], error: caught instanceof Error ? caught.message : 'Invalid cron expression' };
    }
  }, [expression, referenceState, runCount, sourceZone, sourceZoneValid]);
  const runs = schedule.runs;
  const error = schedule.error;

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
    working: Object.fromEntries(displayZones.map((zone) => [zone, isRunInWorkingHours(run, zone, workStart, workEnd)])),
  })), [runs, displayZones, workStart, workEnd]);

  const offsetTransitions = useMemo(() => sourceZoneValid && referenceState.date
    ? findTimeZoneOffsetTransitions(sourceZone, referenceState.date, 2, 370)
    : [], [sourceZone, sourceZoneValid, referenceState]);

  function addComparisonZone(zone: string) {
    if (requestedZones.includes(zone)) {
      setStatus(`${zone} is already in the comparison list.`);
      setZoneSearch('');
      return;
    }
    setZones((current) => current.trim() ? `${current.trim()}\n${zone}` : zone);
    setZoneSearch('');
    setStatus(`Added ${zone} to the comparison matrix.`);
  }

  function exportCsv() {
    const headers = ['Run', 'UTC instant', ...displayZones];
    const lines = [headers.map(csvCell).join(',')];
    for (const row of rows) lines.push([row.run, row.instant, ...displayZones.map((zone) => row.projected[zone])].map(csvCell).join(','));
    downloadText(lines.join('\r\n'), 'cron-team-matrix.csv', 'text/csv;charset=utf-8');
    setStatus(`Exported ${rows.length} projected run${rows.length === 1 ? '' : 's'} across ${displayZones.length} timezone${displayZones.length === 1 ? '' : 's'}. The reference instant was not changed.`);
  }

  function exportCalendar() {
    const calendar = buildCronCalendar(runs, { expression, sourceZone });
    downloadText(calendar, 'cron-team-matrix.ics', 'text/calendar;charset=utf-8');
    setStatus(`Exported ${runs.length} finite calendar occurrence${runs.length === 1 ? '' : 's'}. The file contains no open-ended recurrence rule.`);
  }

  return <>
    <div className="workspace-header"><div><h2>Global cron matrix</h2><p>Each row is one instant projected into every selected timezone, with seconds and UTC offsets retained.</p></div></div>
    <div className="workspace-body">
      <div className="workspace-grid">
        <div className="field"><label htmlFor="cron">Cron expression</label><input id="cron" type="text" value={expression} onChange={(event) => { setExpression(event.target.value); setStatus('Schedule updated without moving the reference instant.'); }} spellCheck={false} /><small>Five- and six-field expressions are supported by cron-parser; six fields preserve seconds in the matrix.</small></div>
        <div className="field"><label htmlFor="run-count">Runs to project</label><input id="run-count" type="number" min="1" max="200" value={runCount} onChange={(event) => setRunCount(Math.max(1, Math.min(200, Number(event.target.value) || 1)))} /><small>How far ahead to calculate, up to 200.</small></div>
        <div className="field"><label htmlFor="source-zone">Source timezone</label><input id="source-zone" type="text" value={sourceZone} onChange={(event) => setSourceZone(event.target.value)} list="common-zones" /><datalist id="common-zones">{DEFAULT_ZONES.map((zone) => <option key={zone} value={zone} />)}</datalist><small>The source timezone is always included as a matrix column.</small></div>
      </div>

      <div className="workspace-grid" style={{ marginTop: 16 }}>
        <div className="field" style={{ minWidth: 0 }}><label htmlFor="reference-instant">Calculate from</label><input id="reference-instant" type="text" value={referenceInstant} onChange={(event) => setReferenceInstant(event.target.value)} aria-invalid={Boolean(referenceState.error)} aria-describedby="reference-help" spellCheck={false} /><small id="reference-help">{referenceState.error || 'ISO 8601 instant with Z or an explicit UTC offset. This remains fixed until you edit it or refresh.'}</small></div>
        <div className="field"><span><strong>Reference clock</strong></span><button className="action-button secondary" type="button" onClick={() => { setReferenceInstant(new Date().toISOString()); setStatus('Reference instant refreshed from the current clock.'); }}>Refresh from now</button><small>Exports and other UI updates do not advance this timestamp.</small></div>
        <div className="field"><label htmlFor="zone-search">Find a timezone</label><input id="zone-search" type="search" value={zoneSearch} onChange={(event) => setZoneSearch(event.target.value)} placeholder="Tokyo, Chicago, Europe…" /><small>Searches timezone identifiers supported by this browser.</small></div>
      </div>

      {zoneMatches.length ? <div className="notice" data-testid="timezone-search-results" style={{ marginTop: 12 }}><strong>Timezone matches</strong><div className="button-row" style={{ marginTop: 8 }}>{zoneMatches.map((zone) => <button className="action-button secondary" type="button" key={zone} onClick={() => addComparisonZone(zone)}>{zone}</button>)}</div></div> : null}

      <div className="field" style={{ marginTop: 16 }}><label htmlFor="zones">Comparison timezones</label><textarea id="zones" value={zones} onChange={(event) => setZones(event.target.value)} style={{ minHeight: 100 }} /><small>One IANA timezone per line or comma-separated. Duplicate names are automatically collapsed.</small></div>
      {partitioned.invalid.length ? <div className="status-line error" data-testid="invalid-zones">Not recognized and left out: {partitioned.invalid.join(', ')}</div> : null}
      {partitioned.duplicates.length ? <div className="status-line">Duplicate timezone{partitioned.duplicates.length === 1 ? '' : 's'} collapsed: {partitioned.duplicates.join(', ')}</div> : null}
      {partitioned.truncated.length ? <div className="status-line error">Comparison limit reached; left out: {partitioned.truncated.join(', ')}</div> : null}

      <fieldset className="notice" style={{ marginTop: 16 }}>
        <legend><strong>Working-hours guide</strong></legend>
        <div className="workspace-grid">
          <div className="field"><label htmlFor="work-start">Start hour</label><input id="work-start" type="number" min="0" max="23" step="1" value={workStart} onChange={(event) => setWorkStart(Math.max(0, Math.min(23, Math.trunc(Number(event.target.value) || 0))))} /></div>
          <div className="field"><label htmlFor="work-end">End hour</label><input id="work-end" type="number" min="1" max="24" step="1" value={workEnd} onChange={(event) => setWorkEnd(Math.max(1, Math.min(24, Math.trunc(Number(event.target.value) || 1))))} /></div>
        </div>
        <p className="help-text">Every timezone cell states whether its local time is inside this window, so the distinction never relies on color alone. Overnight windows are supported.</p>
      </fieldset>

      {error ? <div className="status-line error" role="status">{error}</div> : <>
        <div className="status-line good" role="status">{status} {runs.length} upcoming runs calculated locally.</div>
        {runs[0] ? <div className="notice" data-testid="cron-next-run"><strong>Next run</strong><div className="help-text">{formatRunInZone(runs[0], sourceZone)} · <span data-testid="cron-first-instant">{runs[0].toISOString()}</span></div><div className="help-text">Reference instant: <span data-testid="cron-reference-value">{referenceState.date?.toISOString()}</span></div></div> : null}

        <div className="notice" data-testid="cron-offset-transitions" style={{ marginTop: 12 }}><strong>Upcoming source-zone UTC offset changes</strong>{offsetTransitions.length ? <ul>{offsetTransitions.map((transition) => <li key={transition.instant.toISOString()}>{formatRunInZone(transition.instant, sourceZone)}: {formatOffsetMinutes(transition.fromMinutes)} → {formatOffsetMinutes(transition.toMinutes)}</li>)}</ul> : <p className="help-text">No UTC-offset change was found in the next 370 days from the reference instant. Zones without seasonal changes normally show this result.</p>}</div>

        <div className="metric-row" aria-label="24-hour run distribution">{Array.from({ length: 24 }, (_, hour) => <div className="metric" key={hour}><span>{String(hour).padStart(2, '0')}:00</span><strong>{hourCounts.get(hour) || 0}</strong></div>)}</div>
        <div className="button-row"><button className="action-button secondary" type="button" disabled={!rows.length} onClick={exportCsv}>Export matrix CSV</button><button className="action-button secondary" type="button" disabled={!rows.length} onClick={exportCalendar}>Export finite calendar (.ics)</button></div>
        <PagedTable
          columns={[{ key: 'run', label: 'Run' }, { key: 'instant', label: 'UTC instant' }, ...displayZones.map((zone) => ({ key: zone, label: zone }))]}
          rows={rows}
          pageSize={50}
          caption="Upcoming cron runs by timezone"
          rowKey={(row) => row.id}
          renderCell={(row, key) => {
            if (key === 'run') return row.run;
            if (key === 'instant') return row.instant;
            const inside = row.working[key];
            return <span data-working-hours={inside ? 'inside' : 'outside'}>{row.projected[key]}<small style={{ display: 'block' }}>{inside ? '✓ working hours' : 'outside working hours'}</small></span>;
          }}
          testId="cron-runs"
        />
      </>}
    </div>
  </>;
}

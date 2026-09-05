import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { PagedTable } from '../../components/PagedTable';
import { downloadText } from '../../lib/download';
import { consumeFileInput } from '../../lib/file-input';
import {
  buildPatternFlags,
  extractGroupNames,
  rowsToCsv,
  rowsToMarkdown,
  type LogPatternFlags,
  type LogScanMode,
  type StructuredLogs,
} from './log-engine';
import { isCancellation, runLogStructuring } from './log-runner';

const SAMPLE = '2026-08-29 INFO service started\n2026-08-29 ERROR disk full\nunmatched line';
const DEFAULT_PATTERN = '^(?<date>\\d{4}-\\d{2}-\\d{2})\\s+(?<level>INFO|WARN|ERROR)\\s+(?<message>.+)$';
const DEBOUNCE_MS = 300;
const MAX_INPUT_BYTES = 8 * 1024 * 1024;

const describeCount = (count: number, singular: string, plural: string): string =>
  `${count} ${count === 1 ? singular : plural}`;

const EMPTY: StructuredLogs = { columns: [], rows: [], unmatched: [], kinds: {} };
const UNMATCHED_PREVIEW = 500;

export default function LogWorkspace() {
  const [input, setInput] = useState(SAMPLE);
  const [pattern, setPattern] = useState(DEFAULT_PATTERN);
  const [flags, setFlags] = useState<LogPatternFlags>({});
  const [mode, setMode] = useState<LogScanMode>('line');
  const [result, setResult] = useState<StructuredLogs>(EMPTY);
  const [error, setError] = useState('');
  const [running, setRunning] = useState(false);
  const [sourceName, setSourceName] = useState('');
  const [statusNote, setStatusNote] = useState('');

  // Structuring happens in a worker, so a pattern that backtracks
  // catastrophically hangs that worker instead of the tab. The handle is kept
  // so a superseded or user-cancelled run can be terminated.
  const runRef = useRef<{ cancel(): void } | null>(null);
  // Held so Stop can cancel a run that is still only scheduled. Without it,
  // pressing Stop cleared the running flag and the queued run then started
  // anyway a moment later - on a runaway pattern, the one interaction that has
  // to work.
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flagKey = buildPatternFlags(flags);

  useEffect(() => {
    const timer = setTimeout(() => {
      debounceRef.current = null;
      runRef.current?.cancel();
      setRunning(true);
      setError('');

      let handle: { promise: Promise<StructuredLogs>; cancel(): void };
      try {
        handle = runLogStructuring(input, pattern, flags, mode);
      } catch (reason) {
        // Starting can fail outright - a blocked worker under a restrictive
        // content policy, for instance. Without this the workspace would sit on
        // "applying…" forever with the cause swallowed by the timer callback.
        setRunning(false);
        setResult(EMPTY);
        setError(reason instanceof Error
          ? `Could not start a background worker: ${reason.message}`
          : 'Could not start a background worker.');
        return;
      }

      runRef.current = handle;
      // Every handler checks identity before writing. Relying on a cancelled
      // promise never settling would make correctness depend on handlers not
      // running, rather than on knowing which run owns the state.
      const isCurrent = () => runRef.current === handle;
      handle.promise
        .then((next) => { if (isCurrent()) { setResult(next); setError(''); } })
        .catch((reason: unknown) => {
          if (!isCurrent() || isCancellation(reason)) return;
          setResult(EMPTY);
          setError(reason instanceof Error ? reason.message : 'The pattern could not be applied.');
        })
        .finally(() => { if (isCurrent()) { runRef.current = null; setRunning(false); } });
    }, DEBOUNCE_MS);
    debounceRef.current = timer;

    return () => {
      clearTimeout(timer);
      debounceRef.current = null;
      runRef.current?.cancel();
      runRef.current = null;
    };
    // flagKey stands in for the flags object so an equal-but-new object does
    // not restart the run.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [input, pattern, flagKey, mode]);

  const cancelRun = () => {
    if (debounceRef.current !== null) { clearTimeout(debounceRef.current); debounceRef.current = null; }
    runRef.current?.cancel();
    runRef.current = null;
    setRunning(false);
    // The table is cleared as well, matching the timeout path: leaving the
    // previous run's rows mounted behind an error banner would keep stale rows
    // exportable while the pattern field says something else.
    setResult(EMPTY);
    setError('Stopped. Edit the pattern or the input to run again.');
  };

  const { rows, columns, unmatched, kinds } = result;
  // Read straight from the pattern, so the expected columns are known even when
  // nothing matched - which is exactly when that information is most useful.
  const declaredGroups = useMemo(() => extractGroupNames(pattern), [pattern]);
  const stem = sourceName.replace(/\.[^.]+$/, '') || 'structured-logs';
  // Exporting mid-run or after a failure would hand over a file describing a
  // pattern the user has already moved past.
  const exportable = rows.length > 0 && columns.length > 0 && !running && !error;

  const save = (kind: 'csv' | 'json' | 'md') => {
    // Always the full result, never the visible page.
    if (kind === 'csv') downloadText(rowsToCsv(rows, columns), `${stem}.csv`, 'text/csv;charset=utf-8');
    if (kind === 'json') downloadText(JSON.stringify(rows, null, 2), `${stem}.json`, 'application/json');
    if (kind === 'md') downloadText(rowsToMarkdown(rows, columns), `${stem}.md`, 'text/markdown;charset=utf-8');
  };

  const loadFile = useCallback(async (file: File | undefined) => {
    if (!file) return;
    try {
      const text = await file.text();
      // The log is held simultaneously in state, in the controlled textarea, and
      // in a structured clone per run, so an unbounded read would trade a
      // backtracking hang for a memory one. Truncation is reported rather than
      // silent.
      if (text.length > MAX_INPUT_BYTES) {
        setInput(text.slice(0, MAX_INPUT_BYTES));
        setStatusNote(`${file.name} is larger than 8 MB, so only the first 8 MB was loaded.`);
      } else {
        setInput(text);
        setStatusNote('');
      }
      setSourceName(file.name);
    } catch {
      setError('That file could not be read in this browser.');
    }
  }, []);

  const onFileChange = (event: ChangeEvent<HTMLInputElement>) =>
    consumeFileInput(event.target, () => loadFile(event.target.files?.[0]));

  const toggle = (key: keyof LogPatternFlags) => (event: ChangeEvent<HTMLInputElement>) =>
    setFlags((current) => ({ ...current, [key]: event.target.checked }));

  return (
    <>
      <div className="workspace-header">
        <div>
          <h2>Regex schema extractor</h2>
          <p>Named capture groups become columns; unmatched lines remain visible.</p>
        </div>
      </div>

      <div className="workspace-body">
        <div className="field">
          <label htmlFor="log-pattern">Regex with named capture groups</label>
          <input
            id="log-pattern"
            type="text"
            value={pattern}
            onChange={(event) => setPattern(event.target.value)}
            spellCheck={false}
          />
          <small>
            Example group: (?&lt;level&gt;INFO|ERROR).
            {declaredGroups.length > 0
              ? ` Declares ${declaredGroups.length} group${declaredGroups.length === 1 ? '' : 's'}: ${declaredGroups.join(', ')}.`
              : ' No named groups declared yet, so there are no columns to extract.'}
          </small>
        </div>

        <div className="field" style={{ marginTop: 16 }}>
          <label htmlFor="log-mode">Scan</label>
          <select id="log-mode" value={mode} onChange={(event) => setMode(event.target.value as LogScanMode)}>
            <option value="line">Line by line — one record per line</option>
            <option value="document">Whole document — a record may span lines</option>
          </select>
          <small>
            {mode === 'line'
              ? 'Each line is tested on its own. Use whole-document scanning for records that span lines, such as stack traces.'
              : 'The pattern runs across the entire text and every match becomes one record. Text between matches is listed as unmatched.'}
          </small>
        </div>

        <div className="field" style={{ marginTop: 16 }}>
          <span className="field-legend">Pattern flags</span>
          <div className="log-flag-row">
            <label className="log-flag"><input type="checkbox" checked={Boolean(flags.ignoreCase)} onChange={toggle('ignoreCase')} /> Ignore case (i)</label>
            <label className="log-flag"><input type="checkbox" checked={Boolean(flags.multiline)} onChange={toggle('multiline')} disabled={mode === 'line'} /> Multiline anchors (m)</label>
            <label className="log-flag"><input type="checkbox" checked={Boolean(flags.dotAll)} onChange={toggle('dotAll')} disabled={mode === 'line'} /> Dot matches newline (s)</label>
          </div>
          {mode === 'line' ? (
            <small data-testid="log-flag-note">
              Multiline anchors and dot-matches-newline are unavailable while scanning line by line: a single
              line contains no newline for them to act on. Switch to whole-document scanning to use them.
            </small>
          ) : null}
        </div>

        <div className="field" style={{ marginTop: 16 }}>
          <label htmlFor="log-file">Open a log file (optional)</label>
          <input
            id="log-file"
            type="file"
            accept=".log,.txt,.out,.json,text/plain"
            onChange={onFileChange}
          />
          <small>
            {statusNote
              || (sourceName
                ? `Loaded ${sourceName} in this browser. Nothing was uploaded.`
                : 'Read in this browser only, up to 8 MB. Large logs no longer need to go through the clipboard.')}
          </small>
        </div>

        <div className="field" style={{ marginTop: 16 }}>
          <label htmlFor="log-input">Log text</label>
          <textarea id="log-input" value={input} onChange={(event) => setInput(event.target.value)} />
        </div>

        <div className={`status-line ${error ? 'error' : 'good'}`} role="status" data-testid="log-status">
          {error || (running
            ? 'Applying the pattern in a background worker…'
            : rows.length > 0 && columns.length === 0
              ? `The pattern matched ${describeCount(rows.length, 'time', 'times')} but declares no named groups, so there are no columns to extract. Wrap the part you want in (?<name>…).`
              : `${describeCount(rows.length, 'matched line', 'matched lines')} · ${describeCount(unmatched.length, 'unmatched line', 'unmatched lines')}${result.skippedEmptyMatches ? ` · ${describeCount(result.skippedEmptyMatches, 'empty match', 'empty matches')} skipped` : ''}`)}
        </div>

        <div className="button-row">
          {running ? (
            <button className="action-button secondary" type="button" onClick={cancelRun} data-testid="log-cancel">
              Stop
            </button>
          ) : null}
          <button className="action-button secondary" type="button" disabled={!exportable} onClick={() => save('csv')}>Export CSV</button>
          <button className="action-button secondary" type="button" disabled={!exportable} onClick={() => save('json')}>Export JSON</button>
          <button className="action-button secondary" type="button" disabled={!exportable} onClick={() => save('md')}>Export Markdown</button>
        </div>

        {/* A result with rows but no columns would render a header row holding no
            cells above N empty body rows; the status line diagnoses that case
            instead. */}
        {rows.length > 0 && columns.length > 0 ? (
          <PagedTable
            testId="log-table"
            caption="Structured log rows"
            columns={columns.map((column) => ({
              key: column,
              label: <>{column}<span className="log-column-kind"> {kinds[column]}</span></>,
            }))}
            rows={rows}
            renderCell={(row, key) => row[key]}
          />
        ) : null}

        {unmatched.length ? (
          <details style={{ marginTop: 18 }}>
            <summary>Review unmatched lines ({unmatched.length})</summary>
            <pre className="code-output" tabIndex={0}>{unmatched.slice(0, UNMATCHED_PREVIEW).join('\n')}</pre>
            {unmatched.length > UNMATCHED_PREVIEW ? (
              <small>Showing the first {UNMATCHED_PREVIEW} of {unmatched.length} unmatched lines.</small>
            ) : null}
          </details>
        ) : null}
      </div>
    </>
  );
}

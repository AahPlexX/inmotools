/**
 * Project tab (ledgers 18, 81): autosave status, versioned backup and restore,
 * and a capability report for troubleshooting.
 *
 * The workspace owns the store, the session, and the source files; this tab
 * only presents their state and forwards the user's choices through props.
 */
import { useEffect, useState, type ChangeEvent } from 'react';
import { downloadText } from '../../lib/download';
import { consumeFileInput } from '../../lib/file-input';
import { probeExportCapabilities } from './mastering-export';
import { formatBytes, messageOf, type MasteringPanelContext } from './mastering-ui';

export type AutosaveState =
  | { state: 'starting' }
  | { state: 'idle' }
  | { state: 'saved'; at: number }
  | { state: 'full' }
  | { state: 'unavailable'; message: string };

interface Props {
  ctx: MasteringPanelContext;
  active: boolean;
  autosave: AutosaveState;
  busy: boolean;
  onSaveBackup: () => Promise<void>;
  onRestoreBackup: (file: File) => Promise<void>;
}

interface DiagnosticRow { label: string; value: string; ok: boolean | null }

const yes = (ok: boolean) => (ok ? 'Available' : 'Not available');

/** Reads what this browser offers the tool. Every probe is guarded so one failure never hides the rest. */
async function collectDiagnostics(channels: number, sampleRate: number): Promise<DiagnosticRow[]> {
  const scope = globalThis as typeof globalThis & { AudioEncoder?: unknown; crossOriginIsolated?: boolean };
  const rows: DiagnosticRow[] = [
    { label: 'Realtime processing (AudioWorklet)', value: yes(typeof AudioWorkletNode !== 'undefined'), ok: typeof AudioWorkletNode !== 'undefined' },
    { label: 'Offline rendering (OfflineAudioContext)', value: yes(typeof OfflineAudioContext !== 'undefined'), ok: typeof OfflineAudioContext !== 'undefined' },
    { label: 'Background processing (Web Workers)', value: yes(typeof Worker !== 'undefined'), ok: typeof Worker !== 'undefined' },
    { label: 'Native audio encoders (WebCodecs)', value: yes(typeof scope.AudioEncoder !== 'undefined'), ok: null },
    { label: 'Local project storage (IndexedDB)', value: yes(typeof indexedDB !== 'undefined'), ok: typeof indexedDB !== 'undefined' },
  ];
  try {
    const estimate = await navigator.storage?.estimate?.();
    if (estimate?.quota) rows.push({ label: 'Storage used', value: `${formatBytes(estimate.usage ?? 0)} of ${formatBytes(estimate.quota)}`, ok: null });
    const persisted = await navigator.storage?.persisted?.();
    if (persisted !== undefined) rows.push({ label: 'Storage kept when space runs low', value: persisted ? 'Yes' : 'No (the browser may clear it)', ok: persisted });
  } catch { /* storage estimates are optional */ }
  rows.push({ label: 'Processor cores', value: String(navigator.hardwareConcurrency || 'Unknown'), ok: null });
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  if (memory) rows.push({ label: 'Device memory (approximate)', value: `${memory} GB`, ok: null });
  try {
    for (const capability of await probeExportCapabilities(channels, sampleRate)) {
      if (capability.format === 'wav') continue;
      rows.push({ label: `Export ${capability.label}`, value: capability.available ? 'Available' : capability.reason ?? 'Not available', ok: capability.available });
    }
  } catch (error) {
    rows.push({ label: 'Export encoders', value: `Could not check: ${messageOf(error)}`, ok: false });
  }
  rows.push({ label: 'Browser', value: navigator.userAgent, ok: null });
  return rows;
}

export default function MasteringProjectTab({ ctx, active, autosave, busy, onSaveBackup, onRestoreBackup }: Props) {
  const [diagnostics, setDiagnostics] = useState<DiagnosticRow[] | null>(null);
  const [checking, setChecking] = useState(false);
  const [persistState, setPersistState] = useState<string | null>(null);
  const channels = ctx.render?.mix.channels.length ?? 2;
  const rate = ctx.document.sampleRate ?? 48_000;

  // Diagnostics load encoder code, so they run on first view, not with the page.
  const [shown, setShown] = useState(false);
  useEffect(() => { if (active) setShown(true); }, [active]);
  useEffect(() => {
    if (!shown) return;
    let cancelled = false;
    setChecking(true);
    collectDiagnostics(channels, rate).then((rows) => { if (!cancelled) setDiagnostics(rows); })
      .finally(() => { if (!cancelled) setChecking(false); });
    return () => { cancelled = true; };
  }, [shown, channels, rate]);

  const onFile = (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    consumeFileInput(input, () => (file ? onRestoreBackup(file) : undefined));
  };

  // Some browsers (and insecure origins) expose no StorageManager at all.
  const canPersist = typeof navigator !== 'undefined' && 'storage' in navigator && typeof navigator.storage?.persist === 'function';
  const report = diagnostics ? diagnostics.map((row) => `${row.label}: ${row.value}`).join('\n') : '';
  const copyReport = async () => {
    try {
      await navigator.clipboard.writeText(report);
      ctx.setStatus('Copied the capability report.');
    } catch {
      downloadText(report, 'audio-mastering-capabilities.txt');
      ctx.setStatus('Clipboard access was blocked, so the capability report was downloaded instead.');
    }
  };

  const askToPersist = async () => {
    try {
      const granted = await navigator.storage?.persist?.();
      setPersistState(granted
        ? 'Persistent storage was granted for this site, so saved sessions are less likely to be evicted automatically.'
        : 'Persistent storage was not granted. Save a backup file for work you cannot afford to lose.');
      setDiagnostics(await collectDiagnostics(channels, rate));
    } catch (error) { setPersistState(`Could not ask: ${messageOf(error)}`); }
  };

  const autosaveText = autosave.state === 'saved'
    ? `Saved on this device at ${new Date(autosave.at).toLocaleTimeString()}. This session can be offered on a later visit as long as browser storage remains available.`
    : autosave.state === 'full'
      ? 'Autosave is paused because browser storage is full. Save a backup file to keep your work, then free some space.'
      : autosave.state === 'unavailable'
        ? `Autosave is not available here: ${autosave.message} Save a backup file to keep your work.`
        : autosave.state === 'starting' ? 'Starting autosave…' : 'Your work saves automatically on this device as you edit.';

  return <>
    <section className="mastering-panel" aria-labelledby="project-autosave-heading">
      <div className="mastering-panel-heading"><div>
        <h3 id="project-autosave-heading">Autosave</h3>
        <p role="status" data-testid="autosave-status">{autosaveText}</p>
      </div></div>
      <p className="help-text">Each browser tab keeps its own session, including your original audio files, and the five most recent sessions are kept. Nothing leaves this device.</p>
      {canPersist && <div className="button-row">
        <button type="button" onClick={() => void askToPersist()}>Keep my sessions when space runs low</button>
        {persistState && <span className="help-text">{persistState}</span>}
      </div>}
    </section>

    <section className="mastering-panel" aria-labelledby="project-backup-heading">
      <div className="mastering-panel-heading"><div>
        <h3 id="project-backup-heading">Backup and restore</h3>
        <p>A backup is one ZIP with your edits, arrangement, master chain, markers, and the original audio. Open it here later in a compatible browser to carry on where you left off.</p>
      </div></div>
      <div className="button-row">
        <button type="button" className="mastering-primary" disabled={busy || !ctx.document.tracks.some((track) => track.clips.length)} onClick={() => void onSaveBackup()}>Save project backup</button>
        <label className={`mastering-file-button mastering-file-secondary${busy ? ' is-disabled' : ''}`}>
          Open project backup
          <input type="file" accept=".zip,application/zip" disabled={busy} onChange={onFile} />
        </label>
      </div>
      <p className="help-text">Opening a backup replaces the current project. Save a backup of this one first if you want to keep it.</p>
    </section>

    <section className="mastering-panel" aria-labelledby="project-diagnostics-heading">
      <div className="mastering-panel-heading"><div>
        <h3 id="project-diagnostics-heading">What this browser supports</h3>
        <p>Useful when something is unavailable or slow. Share the report when asking for help; it contains no audio or file names.</p>
      </div></div>
      {checking && !diagnostics && <p className="mastering-busy" role="status">Checking…</p>}
      {diagnostics && <div className="mastering-table-scroll" tabIndex={0} role="region" aria-label="Browser capability report"><table className="mastering-report mastering-diagnostics">
        <caption className="visually-hidden">Browser capabilities</caption>
        <tbody>{diagnostics.map((row) => <tr key={row.label}>
          <th scope="row">{row.label}</th>
          <td className="mastering-wrap" data-state={row.ok === null ? undefined : row.ok ? 'ok' : 'missing'}>{row.value}</td>
        </tr>)}</tbody>
      </table></div>}
      <div className="button-row"><button type="button" disabled={!diagnostics} onClick={() => void copyReport()}>Copy report</button></div>
    </section>
  </>;
}

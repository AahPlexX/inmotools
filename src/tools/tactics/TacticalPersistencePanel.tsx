import { useCallback, useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from 'react';
import { downloadBytes, downloadText } from '../../lib/download';
import { TacticalProjectVault, type TacticalSnapshotRecord } from './persistence-engine';
import {
  applyTrajectoryImport,
  exportTacticalProjectJson,
  exportTacticalProjectZip,
  exportTrajectoryCsv,
  exportTrajectoryJson,
  importTacticalProjectZip,
  parseTrajectoryCsv,
  parseTrajectoryJson,
} from './project-io';
import { updateCoachingSessionPlan } from './session-engine';
import type { TacticalProject } from './tactics-types';

export interface TacticalPersistencePanelProps {
  project: TacticalProject;
  onEdit: (label: string, updater: (current: TacticalProject) => TacticalProject, message: string) => void;
  onReplaceProject: (project: TacticalProject, message: string) => void;
  onStatus: (message: string) => void;
}

const message = (error: unknown) => error instanceof Error ? error.message : 'Unknown local project error.';
const stem = (title: string) => title.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'tactical-project';
const list = (value: FormDataEntryValue | null) => String(value ?? '').split('\n').map((item) => item.trim()).filter(Boolean);

export default function TacticalPersistencePanel({ project, onEdit, onReplaceProject, onStatus }: TacticalPersistencePanelProps) {
  const vault = useMemo(() => new TacticalProjectVault(), []);
  const [snapshots, setSnapshots] = useState<TacticalSnapshotRecord[]>([]);
  const [recovery, setRecovery] = useState<TacticalSnapshotRecord>();
  const [savedProjects, setSavedProjects] = useState<TacticalProject[]>([]);
  const [recoveryChecked, setRecoveryChecked] = useState(false);
  const [autosaveEnabled, setAutosaveEnabled] = useState(false);

  const refresh = useCallback(async () => {
    const [nextSnapshots, nextRecovery, nextProjects] = await Promise.all([
      vault.listNamedSnapshots(project.id),
      vault.getLatestRecovery(project.id),
      vault.listProjects(),
    ]);
    setSnapshots(nextSnapshots);
    setRecovery(nextRecovery);
    setSavedProjects(nextProjects);
    return nextRecovery;
  }, [project.id, vault]);

  useEffect(() => {
    let active = true;
    void refresh()
      .then((initialRecovery) => {
        if (!active) return;
        setRecoveryChecked(true);
        setAutosaveEnabled(!initialRecovery);
      })
      .catch((error) => onStatus(message(error)));
    return () => { active = false; };
  }, [onStatus, refresh]);

  useEffect(() => {
    if (!recoveryChecked || !autosaveEnabled) return;
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          await vault.saveProject(project);
          await vault.saveAutosave(project);
          await refresh();
        } catch (error) {
          onStatus('Local autosave unavailable: ' + message(error));
        }
      })();
    }, 600);
    return () => window.clearTimeout(timer);
  }, [autosaveEnabled, onStatus, project, recoveryChecked, refresh, vault]);
  useEffect(() => () => vault.close(), [vault]);

  async function createSnapshot(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      await vault.createSnapshot(project, String(new FormData(event.currentTarget).get('snapshotLabel') ?? ''));
      event.currentTarget.reset();
      await refresh();
      onStatus('Named snapshot created in this browser.');
    } catch (error) { onStatus(message(error)); }
  }

  async function restore(snapshot: TacticalSnapshotRecord) {
    try {
      const restored = await vault.restoreSnapshot(snapshot.id);
      if (!restored) throw new Error('The selected snapshot is no longer available.');
      setAutosaveEnabled(true);
      onReplaceProject(restored, 'Restored snapshot ' + snapshot.label + '.');
    } catch (error) { onStatus(message(error)); }
  }

  function keepCurrentAndResumeAutosave() {
    setAutosaveEnabled(true);
    onStatus('Current board kept. Local autosave resumed.');
  }

  async function loadSavedProject(projectId: string) {
    try {
      const stored = await vault.getProject(projectId);
      if (!stored) throw new Error('The saved project is no longer available.');
      onReplaceProject(stored, 'Loaded ' + stored.metadata.title + ' from this browser.');
    } catch (error) { onStatus(message(error)); }
  }

  async function removeSavedProject(projectId: string) {
    try {
      await vault.deleteProject(projectId);
      await refresh();
      onStatus('Saved project and its snapshots removed from this browser.');
    } catch (error) { onStatus(message(error)); }
  }

  async function importProject(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (!file) return;
    try {
      const zip = file.name.toLowerCase().endsWith('.zip');
      const imported = zip
        ? (await importTacticalProjectZip(new Uint8Array(await file.arrayBuffer()), file.name)).project
        : await vault.importJson(await file.text(), file.name);
      await vault.saveProject(imported);
      onReplaceProject(imported, zip ? 'Project ZIP imported.' : 'Project JSON imported.');
      await refresh();
    } catch (error) { onStatus(message(error)); }
  }

  async function importTrajectory(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (!file) return;
    try {
      const csv = file.name.toLowerCase().endsWith('.csv');
      const samples = csv
        ? parseTrajectoryCsv(await file.text(), file.name, project.pitch.dimensions)
        : parseTrajectoryJson(await file.text(), file.name, project.pitch.dimensions);
      onEdit(
        csv ? 'Import trajectory CSV' : 'Import trajectory JSON',
        (current) => applyTrajectoryImport(current, samples, csv ? 'trajectory-csv' : 'trajectory-json', file.name),
        csv ? 'Trajectory CSV imported.' : 'Trajectory JSON imported.',
      );
    } catch (error) { onStatus(message(error)); }
  }

  function saveSession(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    onEdit('Update coaching session plan', (current) => updateCoachingSessionPlan(current, {
      ageOrDevelopmentLevel: String(data.get('age') ?? ''),
      playerCount: Number(data.get('players')),
      dimensions: String(data.get('dimensions') ?? ''),
      durationMinutes: Number(data.get('duration')),
      objective: String(data.get('objective') ?? ''),
      setup: String(data.get('setup') ?? ''),
      equipment: list(data.get('equipment')),
      coachingCues: list(data.get('cues')),
      progressions: list(data.get('progressions')),
      regressions: list(data.get('regressions')),
      notes: String(data.get('notes') ?? ''),
    }), 'Session plan updated.');
  }

  const session = project.sessionPlan;
  const sessionKey = JSON.stringify(session);

  return (
    <details className="tactical-setup tactical-authoring">
      <summary>Project vault &amp; interchange</summary>
      <div className="tactical-authoring-grid">
        <section aria-labelledby="tactical-vault-heading">
          <h3 id="tactical-vault-heading">Local project vault</h3>
          <p>Projects, autosaves, and snapshots are stored only in this browser using IndexedDB. Nothing is uploaded.</p>
          {recoveryChecked && recovery && !autosaveEnabled ? (
            <div className="tactical-legality notice" role="status">
              <strong>Recovery available</strong>
              <p>A previous autosave is available. Autosave is paused so the starter board cannot replace that recovery before you choose.</p>
              <div className="tactical-inline-actions">
                <button type="button" onClick={() => void restore(recovery)}>Restore latest autosave</button>
                <button type="button" className="secondary" onClick={keepCurrentAndResumeAutosave}>Keep current board</button>
              </div>
            </div>
          ) : null}
          <div className="tactical-inline-actions">
            <button type="button" onClick={() => void vault.saveProject(project).then(refresh).then(() => onStatus('Project saved to this browser.')).catch((error) => onStatus(message(error)))}>Save to device</button>
            <button type="button" disabled={!recovery} onClick={() => recovery && void restore(recovery)}>Restore latest autosave</button>
          </div>
          <form onSubmit={(event) => void createSnapshot(event)}>
            <label>Snapshot label<input name="snapshotLabel" required maxLength={80} /></label>
            <button type="submit">Create snapshot</button>
          </form>
          <div className="tactical-vault-list" aria-label="Named snapshots">
            {snapshots.length ? snapshots.map((snapshot) => (
              <div key={snapshot.id} className="tactical-vault-row">
                <span>{snapshot.label}</span>
                <button type="button" aria-label={'Restore snapshot ' + snapshot.label} onClick={() => void restore(snapshot)}>Restore</button>
              </div>
            )) : <p>No named snapshots yet.</p>}
          </div>

          <div className="tactical-vault-list" aria-label="Saved projects">
            {savedProjects.length ? savedProjects.map((saved) => (
              <div key={saved.id} className="tactical-vault-row">
                <span>{saved.metadata.title}</span>
                <div className="tactical-inline-actions">
                  <button type="button" aria-label={'Load saved project ' + saved.metadata.title} onClick={() => void loadSavedProject(saved.id)}>Load</button>
                  <button type="button" className="secondary" aria-label={'Remove saved project ' + saved.metadata.title} onClick={() => void removeSavedProject(saved.id)}>Remove saved copy</button>
                </div>
              </div>
            )) : <p>No saved projects yet.</p>}
          </div>
        </section>

        <section aria-labelledby="tactical-project-files-heading">
          <h3 id="tactical-project-files-heading">Project files</h3>
          <p>JSON is human-readable. ZIP keeps the project manifest and local binary assets together.</p>
          <div className="tactical-inline-actions">
            <button type="button" onClick={() => { downloadText(exportTacticalProjectJson(project), stem(project.metadata.title) + '.tactical.json', 'application/json;charset=utf-8'); onStatus('Project JSON exported locally.'); }}>Export project JSON</button>
            <button type="button" onClick={() => void exportTacticalProjectZip(project).then((bytes) => { downloadBytes(bytes, stem(project.metadata.title) + '.tactical.zip', 'application/zip'); onStatus('Project ZIP exported locally.'); }).catch((error) => onStatus(message(error)))}>Export project ZIP</button>
          </div>
          <label>Import project file<input type="file" accept=".json,.zip,application/json,application/zip" onChange={(event) => void importProject(event)} /></label>
          <small>Files are validated before the open project is replaced; corrupt, future-schema, and unsafe ZIP input is rejected.</small>
        </section>

        <section aria-labelledby="tactical-trajectory-heading">
          <h3 id="tactical-trajectory-heading">Trajectory interchange</h3>
          <div className="tactical-inline-actions">
            <button type="button" onClick={() => { downloadText(exportTrajectoryCsv(project), stem(project.metadata.title) + '-trajectory.csv', 'text/csv;charset=utf-8'); onStatus('Trajectory CSV exported locally.'); }}>Export trajectory CSV</button>
            <button type="button" onClick={() => { downloadText(exportTrajectoryJson(project), stem(project.metadata.title) + '-trajectory.json', 'application/json;charset=utf-8'); onStatus('Trajectory JSON exported locally.'); }}>Export trajectory JSON</button>
          </div>
          <label>Import trajectory file<input type="file" accept=".csv,.json,text/csv,application/json" onChange={(event) => void importTrajectory(event)} /></label>
          <small>Coordinates must map to known project entities and the configured pitch; failed validation leaves current work untouched.</small>
        </section>

        <form key={sessionKey} onSubmit={saveSession} aria-labelledby="tactical-session-heading">
          <h3 id="tactical-session-heading">Coaching session plan</h3>
          <label>Development level<input name="age" defaultValue={session.ageOrDevelopmentLevel} /></label>
          <label>Player count<input name="players" type="number" min="0" step="1" defaultValue={session.playerCount} /></label>
          <label>Session dimensions<input name="dimensions" defaultValue={session.dimensions} /></label>
          <label>Session duration (minutes)<input name="duration" type="number" min="0" step="1" defaultValue={session.durationMinutes} /></label>
          <label>Session objective<textarea name="objective" defaultValue={session.objective} /></label>
          <label>Setup<textarea name="setup" defaultValue={session.setup} /></label>
          <label>Equipment, one per line<textarea name="equipment" defaultValue={session.equipment.join('\n')} /></label>
          <label>Coaching cues<textarea name="cues" defaultValue={session.coachingCues.join('\n')} /></label>
          <label>Progressions<textarea name="progressions" defaultValue={session.progressions.join('\n')} /></label>
          <label>Regressions<textarea name="regressions" defaultValue={session.regressions.join('\n')} /></label>
          <label>Notes<textarea name="notes" defaultValue={session.notes} /></label>
          <button type="submit">Save session plan</button>
        </form>
      </div>
    </details>
  );
}

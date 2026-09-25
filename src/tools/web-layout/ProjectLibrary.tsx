import { useState } from 'react';
import { downloadText } from '../../lib/download';
import { INITIAL_PROJECT, parseProject, type LayoutProject } from './layout-engine';

const KEY = 'inmotools:web-layout:library:v1';
type Snapshot = { name: string; project: LayoutProject };
export const STARTERS: Record<string, LayoutProject> = Object.fromEntries([
  ['Learning', 'Learn something new', ['Start here', 'Try it yourself', 'Reflect and share']],
  ['Portfolio', 'Work with purpose', ['Selected work', 'My approach', 'About me']],
  ['Landing page', 'An idea worth exploring', ['Why it matters', 'What you can do', 'Your next step']],
  ['Dashboard', 'Your project at a glance', ['Overview', 'Current priorities', 'Notes and decisions']],
].map(([name, title, titles]) => [name, { ...INITIAL_PROJECT, title: title as string, description: 'Replace this starter content with your own.', blocks: (titles as string[]).map((heading, i) => ({ id: `starter-${i}`, kind: 'card' as const, title: heading, text: 'Add the details that matter to your readers.' })) }]));

function readLibrary(): Snapshot[] {
  const raw = localStorage.getItem(KEY);
  if (!raw) return [];
  const data: unknown = JSON.parse(raw);
  if (!Array.isArray(data) || data.length > 20) throw new Error('The local library is invalid. Existing data has not been overwritten.');
  return data.map(item => {
    if (!item || typeof item.name !== 'string' || !item.name.trim() || item.name.length > 80) throw new Error('Invalid snapshot name.');
    return { name: item.name, project: parseProject(JSON.stringify(item.project)) };
  });
}

export function ProjectLibrary({ project, onRestore }: { project: LayoutProject; onRestore: (project: LayoutProject) => void }) {
  const [name, setName] = useState('');
  const [selected, setSelected] = useState('');
  const [message, setMessage] = useState('');
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [comparison, setComparison] = useState('');
  function refresh() {
    try { setSnapshots(readLibrary()); setLoaded(true); setMessage('Local library opened.'); }
    catch (e) { setMessage(e instanceof Error ? e.message : 'Cannot read local library.'); }
  }
  function save() {
    try {
      const current = readLibrary();
      if (!name.trim()) throw new Error('Enter a name for this snapshot.');
      if (current.some(s => s.name === name.trim())) throw new Error('Choose a new name to keep the existing snapshot.');
      if (current.length >= 20) throw new Error('The local library holds 20 snapshots. Export or remove an existing snapshot first.');
      const next = [...current, { name: name.trim(), project: parseProject(JSON.stringify(project)) }];
      localStorage.setItem(KEY, JSON.stringify(next)); setSnapshots(next); setLoaded(true); setSelected(name.trim()); setName(''); setMessage('Snapshot saved on this browser.');
    } catch (e) { setMessage(e instanceof Error ? e.message : 'Cannot save. Download a project backup.'); }
  }
  const chosen = snapshots.find(s => s.name === selected);
  return <details className="wl-advanced"><summary>Starters, snapshots and reusable pages</summary>
    <p>Loading a starter or snapshot replaces the current page. Undo restores it. Snapshots are saved only when you choose Save.</p>
    <div className="button-row">{Object.entries(STARTERS).map(([label, value]) => <button key={label} type="button" onClick={() => { onRestore(parseProject(JSON.stringify(value))); setMessage(`${label} starter loaded. Undo restores your page.`); }}>{label} starter</button>)}</div>
    <label className="wl-field">Snapshot name<input value={name} maxLength={80} onChange={e => setName(e.target.value)} /></label>
    <div className="button-row"><button type="button" onClick={save}>Save snapshot</button><button type="button" onClick={refresh}>Open local library</button></div>
    {loaded && <><label className="wl-field">Saved snapshot<select value={selected} onChange={e => { setSelected(e.target.value); setComparison(''); }}><option value="">Choose a snapshot</option>{snapshots.map(s => <option key={s.name}>{s.name}</option>)}</select></label>
      <div className="button-row"><button type="button" disabled={!chosen} onClick={() => { if (chosen) onRestore(chosen.project); }}>Restore snapshot</button>
      <button type="button" disabled={!chosen} onClick={() => { if (chosen) downloadText(JSON.stringify(chosen.project, null, 2), 'web-layout.snapshot.json', 'application/json'); }}>Export snapshot</button>
      <button type="button" disabled={!chosen} onClick={() => {
        if (!chosen) return;
        const keys = [...new Set([...Object.keys(chosen.project), ...Object.keys(project)])] as (keyof LayoutProject)[];
        setComparison(keys.filter(key => JSON.stringify(chosen.project[key]) !== JSON.stringify(project[key])).map(key => `${key}\nSaved: ${JSON.stringify(chosen.project[key], null, 2)}\nCurrent: ${JSON.stringify(project[key], null, 2)}`).join('\n\n') || 'No differences.');
      }}>Compare with current</button>
      <button type="button" disabled={!chosen} onClick={() => {
        if (!chosen) return;
        try { const remaining = readLibrary().filter(s => s.name !== chosen.name); localStorage.setItem(KEY, JSON.stringify(remaining)); setSnapshots(remaining); setSelected(''); setComparison(''); setMessage('Snapshot removed from this browser. The current page is unchanged.'); }
        catch { setMessage('Unable to remove snapshot.'); }
      }}>Remove snapshot</button></div></>}
    {comparison && <pre className="code-output" tabIndex={0}>{comparison}</pre>}
    <p role="status">{message}</p>
  </details>;
}

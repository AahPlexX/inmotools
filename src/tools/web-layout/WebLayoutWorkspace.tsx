import { createHistory, projectHistory, type HistoryAction } from './project-history';
import { TokenPanel } from './TokenPanel';
import { useEffect, useMemo, useRef, useState, useId } from 'react';
import { downloadText } from '../../lib/download';
import { buildCss, buildHtml, buildPreview, buildTokens, INITIAL_PROJECT, parseProject, projectWarnings, type BlockKind, type LayoutProject } from './layout-engine';
import './web-layout.css';
import { AppearancePanel } from './AppearancePanel';
import { BlockTreeEditor } from './BlockTreeEditor';
import { CodePanel } from './CodePanel';
import { ProjectLibrary } from './ProjectLibrary';
import { LayoutOptionsPanel } from './LayoutOptionsPanel';

const STORAGE_KEY = 'inmotools:web-layout:project:v1';
const AUTOSAVE_KEY = `${STORAGE_KEY}:autosave`;
const VIEWPORTS = [320, 375, 768, 1024, 1440, 1920];
const KINDS: BlockKind[] = ['card', 'accordion', 'form', 'navigation', 'notice'];

function NumericField({ label, value, min, max, step = 'any', onCommit }: { label: string; value: number; min: number; max: number; step?: number | 'any'; onCommit: (value: number) => void }) {
  const [draft, setDraft] = useState(String(value));
  const [error, setError] = useState('');
  const id = useId();
  useEffect(() => { setDraft(String(value)); setError(''); }, [value]);
  return <label className="wl-field">{label}<input type="number" min={min} max={max} step={step} value={draft} aria-invalid={Boolean(error)} aria-describedby={error ? id : undefined}
    onChange={event => { setDraft(event.target.value); setError(''); }} onBlur={event => {
      if (!draft.trim() || !event.currentTarget.validity.valid) { setError(`Enter ${step === 1 ? 'a whole number' : 'a number'} from ${min} to ${max}.`); return; }
      onCommit(Number(draft));
    }} onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur(); if (event.key === 'Escape') { setDraft(String(value)); setError(''); } }} />
    {error && <span id={id} role="alert">{error} Press Escape to restore {value}.</span>}</label>;
}

function AreaEditor({ project, onCommit }: { project: LayoutProject; onCommit: (value: Partial<LayoutProject>) => void }) {
  const [draft, setDraft] = useState(project.gridAreas.join('\n'));
  const [error, setError] = useState('');
  const committedAreas = project.gridAreas.join('\n');
  useEffect(() => { setDraft(committedAreas); setError(''); }, [committedAreas, project.columns]);
  return <div><label className="wl-field">Named grid areas<textarea aria-label="Named grid areas" value={draft} aria-invalid={Boolean(error)} onChange={event => setDraft(event.target.value)} /></label>
    <p className="help-text">One row per line; separate names with spaces. Use dots for empty cells. Areas map to blocks in first-appearance order. Empty text restores automatic flow. Changing columns clears the area map.</p>
    <button type="button" onClick={() => {
      try {
        const gridAreas = draft.trim() ? draft.trim().split(/\r?\n/) : [];
        const valid = parseProject(JSON.stringify({ ...project, gridAreas }));
        onCommit({ gridAreas: valid.gridAreas }); setError('');
      } catch (issue) { setError(issue instanceof Error ? issue.message : 'Invalid area map.'); }
    }}>Apply areas</button>{error && <p role="alert">{error}</p>}
    <p className="help-text">Named areas activate only when every column has room for readable content. Smaller containers use automatic flow.</p></div>;
}

function Preview({ source, width, orientation, actualSize }: { source: string; width: number; orientation: 'portrait' | 'landscape'; actualSize: boolean }) {
  const host = useRef<HTMLDivElement>(null);
  const [available, setAvailable] = useState(280);
  useEffect(() => {
    const node = host.current;
    if (!node) return;
    const observer = new ResizeObserver(entries => setAvailable(entries[0].contentRect.width));
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  const scale = actualSize ? 1 : Math.min(1, Math.max(1, available) / width);
  const height = Math.round(width * (orientation === 'portrait' ? 1.5 : 0.625));
  return <section className="wl-preview" aria-label={`${width} pixel ${orientation} preview`}>
    <div className="wl-preview-label"><strong>{width} × {height} px · {orientation}</strong><span>{Math.round(scale * 100)}% view scale</span></div>
    <div ref={host} className={`wl-frame-host${actualSize ? ' wl-actual-size' : ''}`} style={{ height: Math.min(1200, height * scale) }}>
      <iframe title={`Layout at ${width} pixels`} sandbox="" referrerPolicy="no-referrer" srcDoc={source}
        style={{ width, height, transform: `scale(${scale})` }} />
    </div>
  </section>;
}

export default function WebLayoutWorkspace() {
  const [historyState, setHistoryState] = useState(()=>createHistory(INITIAL_PROJECT));
  const historyRef = useRef(historyState);
  function dispatchHistory(action:HistoryAction){const next=projectHistory(historyRef.current,action);historyRef.current=next;setHistoryState(next);}
  const history=historyState.entries, position=historyState.position;
  const project = history[position];
  const [tab, setTab] = useState('Build');
  const [status, setStatus] = useState('Ready. Choose a block or adjust the layout.');
  const [saveStatus, setSaveStatus] = useState('Checking local draft…');
  const [ready, setReady] = useState(false);
  const [widths, setWidths] = useState([375, 768, 1440]);
  const [orientation, setOrientation] = useState<'portrait' | 'landscape'>('portrait');
  const [actualSize, setActualSize] = useState(false);
  const [customWidth, setCustomWidth] = useState(1280);
  const [livePreview, setLivePreview] = useState(true);
  const [previewProject, setPreviewProject] = useState(project);
  const previewSource = useMemo(() => buildPreview(livePreview ? project : previewProject), [livePreview, project, previewProject]);
  const [kind, setKind] = useState<BlockKind>('card');
  const [importBusy, setImportBusy] = useState(false);
  const importRevision = useRef(0);
  const [metadataDraft, setMetadataDraft] = useState(project.canonical);
  useEffect(() => setMetadataDraft(project.canonical), [project.canonical]);
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      setAutosave(localStorage.getItem(AUTOSAVE_KEY) === 'true');
      if (stored) { const restored = parseProject(stored); dispatchHistory({type:'restore',project:restored}); setMetadataDraft(restored.canonical); setStatus('Restored your local project.'); }
    } catch { setStatus('The saved draft could not be read. It has not been overwritten. Download your current work before replacing it.'); }
    setReady(true);
    return () => { importRevision.current += 1; };
  }, []);
  const [autosave, setAutosave] = useState(false);
  useEffect(() => {
    if (!ready || !autosave) { if (ready) setSaveStatus('Autosave is off. Download a project backup to keep this work.'); return; }
    setSaveStatus('Saving changes…');
    let pending = true;
    const save = () => {
      if (!pending) return;
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(project)); setSaveStatus('Saved on this browser.'); }
      catch { setSaveStatus('Local storage is unavailable or full. Download a project backup.'); }
      pending = false;
    };
    const timer = window.setTimeout(save, 500);
    const onHidden = () => { if (document.visibilityState === 'hidden') save(); };
    window.addEventListener('pagehide', save);
    document.addEventListener('visibilitychange', onHidden);
    return () => { window.clearTimeout(timer); save(); window.removeEventListener('pagehide', save); document.removeEventListener('visibilitychange', onHidden); };
  }, [project, ready, autosave]);
  function commit(next: LayoutProject, group = '') {
    try {
      const valid = parseProject(JSON.stringify(next));
      if (JSON.stringify(valid) === JSON.stringify(historyRef.current.entries[historyRef.current.position])) return true;
      importRevision.current += 1;
      setImportBusy(false);
      dispatchHistory({type:'commit',project:valid,group,time:performance.now()}); setStatus('Changes applied.'); return true;
    } catch (error) { setStatus(error instanceof Error ? error.message : 'Unable to apply changes.'); return false; }
  }
  const patch = (change: Partial<LayoutProject>, group = '') => commit({ ...historyRef.current.entries[historyRef.current.position], ...change },group);
  async function importProject(file?: File) {
    if (!file) return;
    const revision = ++importRevision.current;
    setImportBusy(true);
    try {
      if (file.size > 1_000_000) throw new Error('Project exceeds the 1 MB limit.');
      const loaded = parseProject(await file.text());
      if (revision !== importRevision.current) return;
      commit(loaded); setMetadataDraft(loaded.canonical); setStatus('Project imported. Undo restores the previous project.');
    } catch (error) { if (revision === importRevision.current) setStatus(`Import failed: ${error instanceof Error ? error.message : 'Invalid file'}`); }
    finally { if (revision === importRevision.current) setImportBusy(false); }
  }
  const generated = useMemo(() => ({ HTML: buildHtml(project), CSS: buildCss(project), Tokens: buildTokens(project), Project: JSON.stringify(project, null, 2) }), [project]);
  function exportFile(format: keyof typeof generated) {
    if (format === 'HTML' && metadataDraft.trim() !== project.canonical) { setStatus('Correct the canonical URL before exporting.'); return; }
    const extension = format === 'HTML' ? 'html' : format === 'CSS' ? 'css' : 'json';
    downloadText(generated[format], `web-layout.${format.toLowerCase()}.${extension}`, format === 'HTML' ? 'text/html;charset=utf-8' : format === 'CSS' ? 'text/css;charset=utf-8' : 'application/json');
    setStatus(`${format} downloaded from the current project.`);
  }
  function numeric(label: string, key: 'columns' | 'gap' | 'padding' | 'radius' | 'maxWidth' | 'breakpoint' | 'fontMin' | 'fontMax', min: number, max: number) {
    return <NumericField label={label} value={project[key]} min={min} max={max} onCommit={value => patch({ [key]: value })} />;
  }
  return <div className="workspace-body wl-studio" data-testid="web-layout-studio" onBlurCapture={()=>dispatchHistory({type:'end-group'})} onKeyDown={event=>{
      if(event.defaultPrevented||event.nativeEvent.isComposing||event.altKey||!(event.ctrlKey||event.metaKey))return;
      const target=event.target as HTMLElement;
      if(target.closest('input,textarea,select,[contenteditable="true"],.monaco-editor'))return;
      const key=event.key.toLowerCase();
      if(key==='z'||key==='y'){event.preventDefault();if(!importBusy)dispatchHistory({type:key==='y'||event.shiftKey?'redo':'undo'});}
    }}>
    <div className="wl-intro"><div><p className="wl-eyebrow">WEB LAYOUT STUDIO</p><h2>Make room for your ideas.</h2><p>Arrange a page, compare its layouts, and take the code with you.</p></div><div className="button-row">
      <button type="button" className="action-button secondary" disabled={position === 0 || importBusy} onClick={() => dispatchHistory({type:'undo'})}>Undo</button>
      <button type="button" className="action-button secondary" disabled={position === history.length - 1 || importBusy} onClick={() => dispatchHistory({type:'redo'})}>Redo</button>
      <button type="button" className="action-button" onClick={() => exportFile('HTML')}>Download HTML</button>
    </div></div>
    <p className="help-text">Project shortcuts: Ctrl or ⌘ + Z to undo; Shift + Ctrl or ⌘ + Z to redo. Text fields keep their own editing shortcuts. Consecutive text changes are grouped until you leave the field or pause.</p>
    <nav className="wl-tabs" aria-label="Workstation panels">{['Build', 'Theme', 'Preview', 'Code', 'Export'].map(name => <button type="button" key={name} aria-pressed={tab === name} onClick={() => setTab(name)}>{name}</button>)}</nav>
    <p className="status-line" role="status">{importBusy ? 'Opening project…' : status}</p>
    <p className="help-text" role="status" aria-label="Project saving">{saveStatus}</p>
    <div className="wl-body">
      <section className="wl-controls" aria-label={`${tab} controls`}>
        <div hidden={tab !== 'Build'}>
          <ProjectLibrary project={project} onRestore={commit} /><h3>Page layout</h3>
          <label className="wl-field">Page heading<input value={project.title} maxLength={200} onChange={event => patch({ title: event.target.value },'title')} /></label>
          <label className="wl-field">Introduction<textarea value={project.description} maxLength={2000} onChange={event => patch({ description: event.target.value },'description')} /></label>
          <div className="wl-fields"><label className="wl-field">Layout<select value={project.layout} onChange={event => patch({ layout: event.target.value as LayoutProject['layout'] })}><option value="grid">CSS Grid</option><option value="flex">Flexbox</option></select></label>
          {project.layout === 'grid' ? <NumericField label="Desktop columns" step={1} value={project.columns} min={1} max={12} onCommit={value => { if (value !== project.columns) patch({ columns: value, gridAreas: [] }); }} /> : <label className="wl-field">Direction<select value={project.direction} onChange={event => patch({ direction: event.target.value as LayoutProject['direction'] })}><option value="row">Row</option><option value="column">Column</option></select></label>}
          {project.layout === 'grid' && <AreaEditor project={project} onCommit={patch} />}
          {numeric('Gap (px)', 'gap', 0, 120)}{numeric('Page padding (px)', 'padding', 12, 120)}{numeric('Content maximum (px)', 'maxWidth', 320, 2400)}{numeric('Stack below (px)', 'breakpoint', 320, 1200)}</div>
          <div className="wl-fields"><label className="wl-field">Alignment<select value={project.alignment} onChange={event => patch({ alignment: event.target.value as LayoutProject['alignment'] })}>{['stretch','flex-start','center','flex-end'].map(value => <option key={value}>{value}</option>)}</select></label><label className="wl-field">Distribution<select value={project.distribution} onChange={event => patch({ distribution: event.target.value as LayoutProject['distribution'] })}>{['flex-start','center','space-between','space-evenly'].map(value => <option key={value}>{value}</option>)}</select></label></div>
          <p className="help-text">The column count is a maximum. Cards wrap sooner when space is tight so text stays readable.</p>
          <LayoutOptionsPanel project={project} panel="layout" onChange={options => patch({ options })} /><h3>Page blocks</h3><p className="help-text">Reading order follows this list, including on phones.</p>
          <div className="wl-fields"><label className="wl-field">Add a pattern<select value={kind} onChange={event => setKind(event.target.value as BlockKind)}>{KINDS.map(value => <option key={value}>{value}</option>)}</select></label><button type="button" disabled={project.blocks.length >= 100 || importBusy} onClick={() => patch({ blocks: [...project.blocks, { id: `block-${crypto.randomUUID()}`, kind, title: `New ${kind}`, text: 'Write your content here.' }] })}>Add block</button></div>
          <BlockTreeEditor blocks={project.blocks} onChange={(blocks,group) => patch({blocks},group)} />
        </div>
        <div hidden={tab !== 'Code'}><CodePanel project={project} onChange={code => patch({ code })} /></div>
        <div hidden={tab !== 'Theme'}><h3>Shared design values</h3><label className="wl-field">Theme<select aria-label="Theme" value={project.theme} onChange={event => patch({ theme: event.target.value as LayoutProject['theme'] })}><option value="light">Light</option><option value="dark">Dark</option><option value="contrast">High contrast</option></select></label><label className="wl-field">Accent color<input type="color" value={project.accent} onChange={event => patch({ accent: event.target.value })} /></label><p className="help-text">Accent is decorative; text retains the theme's readable foreground.</p><div className="wl-fields">{numeric('Corner radius (px)', 'radius', 0, 100)}{numeric('Heading minimum (px)', 'fontMin', 16, 96)}{numeric('Heading maximum (px)', 'fontMax', 16, 144)}</div><label className="wl-check"><input type="checkbox" checked={project.reset} onChange={event => patch({ reset: event.target.checked })} />Include responsive CSS reset</label><p className="help-text">Heading size grows smoothly between 320 and 1440 pixels. Reduced-motion and print rules are included.</p><button type="button" onClick={() => exportFile('Tokens')}>Download design tokens</button><TokenPanel project={project} onChange={tokens=>patch({tokens})}/><AppearancePanel value={project.appearance} theme={project.theme} onChange={appearance=>patch({appearance})}/></div>
        {tab === 'Preview' && <><h3>Compare viewport widths</h3><label className="wl-check"><input type="checkbox" checked={actualSize} onChange={e => setActualSize(e.target.checked)} />Actual-size view (scroll inside each frame)</label>
          <label className="wl-check"><input type="checkbox" checked={livePreview} onChange={e => { setPreviewProject(project); setLivePreview(e.target.checked); }} />Refresh previews while editing</label>
          {!livePreview && <><button type="button" onClick={() => setPreviewProject(project)}>Refresh previews</button><p>Interactive preview state is retained until you refresh. Downloads always use your current project.</p></>}
          <NumericField label="Custom viewport width (px)" value={customWidth} min={240} max={3840} step={1} onCommit={setCustomWidth} /><button type="button" disabled={widths.length >= 8 || widths.includes(customWidth)} onClick={() => setWidths([...widths, customWidth].sort((a,b) => a-b))}>Add viewport</button><p>These are CSS viewport previews in your current browser, not separate device browsers. Each preview scrolls independently.</p><label className="wl-field">Preview orientation<select aria-label="Preview orientation" value={orientation} onChange={event => setOrientation(event.target.value as 'portrait' | 'landscape')}><option value="portrait">Portrait presentation</option><option value="landscape">Landscape presentation</option></select></label><div className="wl-fields">{[...new Set([...VIEWPORTS, ...widths])].sort((a,b) => a-b).map(width => <label key={width} className="wl-check"><input type="checkbox" checked={widths.includes(width)} disabled={(widths.length === 1 && widths.includes(width)) || (widths.length >= 8 && !widths.includes(width))} onChange={() => setWidths(widths.includes(width) ? widths.filter(value => value !== width) : [...widths, width].sort((a,b) => a-b))} />{width} px</label>)}</div><p className="help-text">Orientation changes the preview frame height; the selected CSS viewport width stays exact. Zooming changes display scale, not CSS viewport width.</p></>}
        {tab === 'Export' && <><h3>Document metadata</h3>{projectWarnings(project).length > 0 && <ul aria-label="Publication checks">{projectWarnings(project).map(warning => <li key={warning}>{warning}</li>)}</ul>}{metadataDraft.trim() !== project.canonical && <p role="alert">Correct the canonical URL before HTML export. Other backups remain available.</p>}<label className="wl-field">Author<input value={project.author} maxLength={200} onChange={event => patch({ author: event.target.value },'author')} /></label><label className="wl-field">Language<select value={project.language} onChange={event => patch({ language: event.target.value })}>{[...new Set([project.language,'en','es','fr','de','pt','ja','ar'])].map(lang => <option key={lang}>{lang}</option>)}</select></label><label className="wl-field">Canonical URL<input type="url" value={metadataDraft} onChange={event => setMetadataDraft(event.target.value)} onBlur={() => patch({ canonical: metadataDraft.trim() })} placeholder="https://example.com/page" /></label><label className="wl-field">Search indexing<select value={project.robots} onChange={event => patch({ robots: event.target.value as LayoutProject['robots'] })}><option value="index,follow">Allow indexing</option><option value="noindex,nofollow">Request no indexing</option></select></label><p className="help-text">The page heading and introduction also provide the title, description, and social-card text.</p><div className="button-row">{(['HTML','CSS','Tokens','Project'] as const).map(format => <button type="button" key={format} onClick={() => exportFile(format)}>Download {format}</button>)}</div><details><summary>Generated HTML</summary><pre className="code-output" tabIndex={0}>{generated.HTML}</pre></details><LayoutOptionsPanel project={project} panel="metadata" onChange={options => patch({ options })} /><h3>Keep your work</h3><label className="wl-check"><input type="checkbox" checked={autosave} onChange={event => { const enabled = event.target.checked; setAutosave(enabled); try { localStorage.setItem(AUTOSAVE_KEY, String(enabled)); } catch { setStatus('Saving preference could not be stored.'); } }} />Autosave on this browser</label><label className="wl-field">Open a project backup<input type="file" accept=".json,application/json" onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; void importProject(file); }} /></label><p className="help-text">Imports are validated before replacing the page. Visual-page HTML works offline. Review external resources and script behavior before sharing authored code exports.</p></>}
      </section>
      <div className="wl-preview-list">{widths.map(width => <Preview key={width} source={previewSource} width={width} orientation={orientation} actualSize={actualSize} />)}</div>
    </div>
  </div>;
}

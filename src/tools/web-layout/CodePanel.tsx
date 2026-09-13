import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { downloadBlob, downloadText } from '../../lib/download';
import { buildCss, buildHtml, type LayoutProject } from './layout-engine';
import { EMPTY_CODE, escapeScript, formatCode, type CodeProject } from './code-tools';
const MonacoEditor = lazy(() => import('./MonacoEditor').catch(() => ({ default: ({ value, onChange }: { value: string; language: string; onChange: (value: string) => void }) => <label className="wl-field">Enhanced editor unavailable. Continue with the standard editor.<textarea className="wl-source" value={value} onChange={event => onChange(event.target.value)} /></label> })));

type Language = 'html' | 'css' | 'js';
export function CodePanel({ project, onChange }: { project: LayoutProject; onChange: (code: CodeProject) => void }) {
  const committed = JSON.stringify(project.code ?? EMPTY_CODE);
  const [draft, setDraft] = useState<CodeProject>(project.code ?? EMPTY_CODE);
  const [language, setLanguage] = useState<Language>('html');
  const [editorMode, setEditorMode] = useState(false);
  const [status, setStatus] = useState('Edit a draft, then apply it to the project.');
  const [output, setOutput] = useState('');
  const [busy, setBusy] = useState(false);
  const [chrome, setChrome] = useState(120);
  const [firefox, setFirefox] = useState(120);
  const [safari, setSafari] = useState(17);
  const [scriptConsent, setScriptConsent] = useState(false);
  const [runSource, setRunSource] = useState('');
  const [report, setReport] = useState<string[]>([]);
  const frame = useRef<HTMLIFrameElement>(null);
  const worker = useRef<Worker | null>(null);
  const revision = useRef(0);
  const operationId = useRef(0);
  const channel = useRef('');
  useEffect(() => { setDraft(JSON.parse(committed)); revision.current++; }, [committed]);
  useEffect(() => () => { worker.current?.terminate(); revision.current++; }, []);
  useEffect(() => {
    let count = 0;
    const receive = (event: MessageEvent) => {
      if (event.source !== frame.current?.contentWindow || !channel.current || event.data?.channel !== channel.current || typeof event.data?.text !== 'string' || count++ >= 100) return;
      setReport(previous => [...previous.slice(-99), event.data.text.slice(0,4000)]);
    };
    window.addEventListener('message', receive);
    return () => window.removeEventListener('message', receive);
  }, [runSource]);
  const candidate = useMemo(() => ({ ...project, code: { ...draft, enabled: true } }), [project, draft]);
  function edit(value: string) { revision.current++; setDraft({ ...draft, [language]: value }); setOutput(''); }
  async function format() {
    const current = ++revision.current; const operation = ++operationId.current; setBusy(true);
    try { const formatted = await formatCode(draft[language], language); if (revision.current === current) { setDraft({ ...draft, [language]: formatted }); setStatus('Formatted draft. Apply to record it in project history.'); } }
    catch (e) { if (revision.current === current) setStatus(e instanceof Error ? e.message : 'Formatting failed.'); }
    finally { if (operationId.current === operation) setBusy(false); }
  }
  function compile() {
    if (language === 'html') return;
    worker.current?.terminate(); const active = new Worker(new URL('./compiler.worker.ts', import.meta.url), { type: 'module' }); worker.current = active;
    const current = ++revision.current; const operation = ++operationId.current; setBusy(true); setOutput(''); setStatus('Compiling…');
    const finish = () => { active.terminate(); if (worker.current === active) worker.current = null; if (operationId.current === operation) setBusy(false); };
    active.onmessage = event => { if (revision.current === current) { setOutput(event.data.output ?? ''); setStatus(event.data.error || 'Compiled output is ready. Your source draft is unchanged.'); } finish(); };
    active.onerror = () => { if (revision.current === current) setStatus('Compiler failed to load or run. Source is unchanged.'); finish(); };
    active.postMessage({ language, source: draft[language], chrome, firefox, safari });
  }
  async function run(audit = false) {
    const current = ++revision.current;
    try {
      setReport([]); const nonce = crypto.randomUUID().replaceAll('-', '');
      let auditSource = '';
      if (audit) { const axe = await import('axe-core'); auditSource = axe.default.source; }
      if (revision.current !== current) return;
      channel.current = nonce;
      const send = `(()=>{const send=t=>parent.postMessage({channel:${JSON.stringify(nonce)},text:String(t).slice(0,4000)},'*');addEventListener('error',e=>send(e.message));addEventListener('unhandledrejection',e=>send(e.reason));for(const k of ['log','warn','error'])console[k]=(...args)=>send(k+': '+args.map(String).join(' '));window[${JSON.stringify(nonce)}]=send;})();`;
      const auditCode = audit ? `(()=>{const send=window[${JSON.stringify(nonce)}];${auditSource};axe.run(document).then(r=>{send(r.violations.length+' automated accessibility findings; '+r.incomplete.length+' checks need review.');r.violations.slice(0,60).forEach(v=>send(v.id+': '+v.help+' — '+v.nodes.map(n=>n.target.join(' ')).join(', ')));r.incomplete.slice(0,20).forEach(v=>send('Review: '+v.id+' — '+v.help));}).catch(e=>send(e.message));})();` : '';
      // A template parses markup inertly. Remove navigation/execution elements before an opaque-origin run.
      const inert = document.createElement('template'); inert.innerHTML = draft.html;
      inert.content.querySelectorAll('script,meta,base,iframe,object,embed,link').forEach(node => node.remove());
      const runProject = { ...candidate, code: { enabled: true, html: inert.innerHTML, css: draft.css, js: '' } };
      const policy = `default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:; script-src 'nonce-${nonce}'; form-action 'none'; base-uri 'none';`;
      setRunSource(buildHtml(runProject).replace('<head>', `<head><meta http-equiv="Content-Security-Policy" content="${policy}">`).replace('</body>', `<script nonce="${nonce}">${escapeScript(send)}</script>${scriptConsent ? `<script nonce="${nonce}">${escapeScript(draft.js)}</script>` : ''}${audit ? `<script nonce="${nonce}">${escapeScript(auditCode)}</script>` : ''}</body>`));
      setStatus(audit ? 'Accessibility scan running. Automated results require manual review.' : 'Preview restarted from the current code draft.');
    } catch (e) { setStatus(e instanceof Error ? e.message : 'Unable to run preview.'); }
  }
  async function zip() {
    const current = revision.current;
    try {
      const { default: JSZip } = await import('web-layout-zip');
      if (revision.current !== current) { setStatus('Draft changed; export again to use the latest version.'); return; }
      const zip = new JSZip();
      const html = buildHtml(candidate);
      const files = { 'index.html': html, 'css/style.css': buildCss(candidate), 'js/main.js': draft.js, 'project.json': JSON.stringify(candidate,null,2), 'manifest.json': JSON.stringify({ format: 1, entry: 'index.html', inlineEntry: true, files: ['index.html','css/style.css','js/main.js','project.json','manifest.json','README.txt'] },null,2), 'README.txt': 'Open index.html. CSS and JS are also included separately for editing; index.html contains inline copies. Authored external asset URLs and script behavior require your own review before offline delivery. ZIP packaging uses JSZip 3.10.2 (MIT).\n' };
      for (const name of Object.keys(files).sort()) zip.file(name, files[name as keyof typeof files], { date: new Date('1980-01-01T00:00:00Z'), createFolders: false });
      downloadBlob(await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', platform: 'DOS' }), 'web-layout.zip'); setStatus('Code draft ZIP downloaded.');
    } catch (e) { setStatus(e instanceof Error ? e.message : 'ZIP export failed.'); }
  }
  return <section className="wl-code-panel" aria-label="Code workstation">
    <h3>HTML, CSS and JavaScript</h3><p>HTML replaces the visual page blocks when enabled. CSS extends the shared styles. The visual page heading and export metadata remain connected. Switching back to visual blocks preserves your code.</p>
    <label className="wl-check"><input type="checkbox" checked={draft.enabled} onChange={e => { revision.current++; setDraft({ ...draft, enabled: e.target.checked }); }} />Use code instead of visual blocks</label>
    <div className="button-row">{(['html','css','js'] as const).map(lang => <button key={lang} type="button" aria-pressed={language === lang} onClick={() => { setLanguage(lang); setOutput(''); }}>{lang.toUpperCase()}</button>)}</div>
    <label className="wl-check"><input type="checkbox" checked={editorMode} onChange={e => setEditorMode(e.target.checked)} />Enhanced code editor</label>
    <p className="help-text">The standard editor works with touch and screen readers. Enhanced editing adds syntax highlighting; Tab moves to the next control.</p>
    {editorMode ? <Suspense fallback={<p>Loading editor…</p>}><MonacoEditor value={draft[language]} language={language === 'js' ? 'javascript' : language} onChange={edit} /></Suspense> : <label className="wl-field">{language.toUpperCase()} source<textarea className="wl-source" spellCheck={false} maxLength={150000} value={draft[language]} onChange={e => edit(e.target.value)} /></label>}
    <div className="button-row"><button type="button" onClick={() => { try { onChange(draft); setStatus('Code applied to project. Undo restores the previous project.'); } catch (e) { setStatus(String(e)); } }}>Apply code</button><button type="button" disabled={busy} onClick={() => void format()}>Format draft</button><button type="button" onClick={() => downloadText(draft[language], `web-layout.${language}`)}>Download source</button><button type="button" onClick={() => void zip()}>Download code ZIP</button></div>
    <details><summary>Production compiler</summary><p>CSS is compiled for the selected minimum browser versions. JavaScript is minified separately; this does not transpile JavaScript for older browsers.</p><div className="wl-fields">{([['Chrome',chrome,setChrome],['Firefox',firefox,setFirefox],['Safari',safari,setSafari]] as const).map(([label,value,set]) => <label className="wl-field" key={label}>{label} minimum<input type="number" min={1} max={300} step={1} value={value} onChange={e => { const n=Number(e.target.value); if (Number.isInteger(n)&&n>=1&&n<=300) set(n); }} /></label>)}</div><button type="button" disabled={busy || language === 'html'} onClick={compile}>Compile {language.toUpperCase()}</button><button type="button" disabled={!busy} onClick={() => { revision.current++; operationId.current++; worker.current?.terminate(); worker.current=null; setBusy(false); setStatus('Operation cancelled.'); }}>Cancel operation</button>{output && <><pre tabIndex={0}>{output}</pre><button type="button" onClick={() => downloadText(output, `web-layout.min.${language}`)}>Download compiled output</button></>}</details>
    <details><summary>Run and inspect</summary><label className="wl-check"><input type="checkbox" checked={scriptConsent} onChange={e => { setScriptConsent(e.target.checked); setRunSource(''); }} />Allow this draft’s JavaScript to run</label><p>Scripts run in an isolated preview without access to this tool’s storage. Network resource requests, forms, popups and parent navigation are restricted. Arbitrary scripts can still hang their frame; stop and restart without scripts if needed.</p><div className="button-row"><button type="button" onClick={() => void run()}>Run / restart preview</button><button type="button" onClick={() => { revision.current++; setRunSource(''); setStatus('Preview stopped.'); }}>Stop preview</button><button type="button" onClick={() => void run(true)}>Run accessibility scan</button></div>{runSource && <iframe ref={frame} className="wl-run-frame" title="Code execution preview" sandbox="allow-scripts" referrerPolicy="no-referrer" srcDoc={runSource} />}<ol aria-label="Runtime and accessibility results">{report.map((line,i) => <li key={i}>{line}</li>)}</ol><p>Also check keyboard order, visible focus, reading order, zoom and screen-reader output. Automated scanning does not certify accessibility.</p></details>
    <p role="status">{status}</p>
  </section>;
}

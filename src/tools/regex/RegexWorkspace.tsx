import { useEffect, useMemo, useState } from 'react';
import { downloadText } from '../../lib/download';
import RegexEditor from './RegexEditor';
import { ACADEMY_TRACKS, validateAcademySolution } from './regex-academy';
import { buildRegexExplanation } from './regex-ast';
import { generateRegexSnippet } from './regex-codegen';
import { analyzeCompatibility } from './regex-compat';
import { saveRegexMatrixValue, loadRegexMatrixValue } from './regex-persistence';
import { analyzeRedos } from './regex-redos';
import { decodeRegexMatrixState, encodeRegexMatrixState } from './regex-share';
import type { AcademyLesson, RegexCodeTarget, RegexFlavor, RegexMode, RegexRunResult } from './regex-types';
import { executeRegexWithWatchdog } from './regex-worker-client';

const EXECUTABLE = new Set<RegexFlavor>(['ecmascript', 'pcre2']);
const TARGETS: { value: RegexCodeTarget; label: string }[] = [
  { value:'typescript', label:'TypeScript' }, { value:'javascript', label:'JavaScript' }, { value:'python', label:'Python' }, { value:'go', label:'Go' }, { value:'rust', label:'Rust' }, { value:'php', label:'PHP' }, { value:'java', label:'Java' }, { value:'csharp', label:'C#' }, { value:'ruby', label:'Ruby' },
];
const FLAVORS: { value: RegexFlavor; label: string }[] = [
  { value:'ecmascript', label:'ECMAScript' }, { value:'pcre2', label:'PCRE2 10.47 WASM' }, { value:'python', label:'Python re · compatibility' }, { value:'go-re2', label:'Go / RE2 · compatibility' }, { value:'rust', label:'Rust regex · compatibility' }, { value:'oniguruma', label:'Oniguruma · compatibility' },
];
const initialResult: RegexRunResult = { engine:'ECMAScript · browser RegExp', capability:'execution', matches:[], durationMs:0, error:null };
const parseSharedState = () => { const query = window.location.hash.split('?')[1] ?? ''; const encoded = new URLSearchParams(query).get('state'); return encoded ? decodeRegexMatrixState(encoded) : null; };
const riskLabel = (risk: ReturnType<typeof analyzeRedos>['risk']) => risk === 'critical' ? 'Critical hazard' : risk === 'caution' ? 'Caution' : risk === 'linear' ? 'Linear / clean' : 'Unknown';
const escapeXml = (value: string) => value.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

const RegexWorkspace = () => {
  const shared = useMemo(parseSharedState, []);
  const [mode,setMode] = useState<RegexMode>(shared?.mode ?? 'studio');
  const [flavor,setFlavor] = useState<RegexFlavor>(shared?.flavor ?? 'ecmascript');
  const [pattern,setPattern] = useState(shared?.pattern ?? '(?<year>\\d{4})-(?<month>\\d{2})-(?<day>\\d{2})');
  const [flags,setFlags] = useState(shared?.flags ?? 'g');
  const [subject,setSubject] = useState(shared?.subject ?? 'Release: 2026-08-31\nArchive: 2025-12-14');
  const [result,setResult] = useState<RegexRunResult>(initialResult); const [busy,setBusy] = useState(false);
  const [replacement,setReplacement] = useState('${year}/${month}/${day}');
  const [positive,setPositive] = useState('2026-08-31\n2025-12-14'); const [negative,setNegative] = useState('31/08/2026\ninvalid');
  const [assertions,setAssertions] = useState<{ value:string; expected:boolean; passed:boolean }[]>([]);
  const [codeTarget,setCodeTarget] = useState<RegexCodeTarget>('typescript');
  const lessons = useMemo(() => ACADEMY_TRACKS.flatMap((track) => track.lessons.map((lesson) => ({ track, lesson }))), []);
  const [lessonId,setLessonId] = useState('negative-lookahead'); const lesson = lessons.find((entry) => entry.lesson.id === lessonId)?.lesson ?? lessons[0]!.lesson;
  const [academySolution,setAcademySolution] = useState(lesson.starter); const [lessonResult,setLessonResult] = useState<ReturnType<typeof validateAcademySolution> | null>(null);
  const [completed,setCompleted] = useState<Set<string>>(new Set()); const [status,setStatus] = useState('Ready. Execution stays on this device.');

  useEffect(() => { void loadRegexMatrixValue<string[]>('academy-progress').then((value) => { if (value) setCompleted(new Set(value)); }); }, []);
  useEffect(() => { setAcademySolution(lesson.starter); setLessonResult(null); }, [lesson.id]);
  const compatibility = useMemo(() => analyzeCompatibility(pattern), [pattern]);
  const redos = useMemo(() => flavor === 'ecmascript' ? analyzeRedos(pattern, flags) : { safe:true, risk:'unknown' as const, score:null, metricLabel:'Ambiguity path score' as const, note:'Static ReDoS scoring is limited to ECMAScript in this release.', trails:[] }, [flavor, flags, pattern]);
  const explanation = useMemo(() => { try { return buildRegexExplanation(pattern, flags, flavor); } catch (error) { return { id:'error', kind:'Pattern', label:error instanceof Error ? error.message : String(error), source:pattern, start:0, end:pattern.length, children:[] }; } }, [flavor, flags, pattern]);
  const code = useMemo(() => generateRegexSnippet(codeTarget, pattern, flags, subject), [codeTarget, flags, pattern, subject]);
  const replacementPreview = useMemo(() => { if (flavor !== 'ecmascript') return 'Replacement preview currently uses the ECMAScript execution engine.'; try { return subject.replace(new RegExp(pattern, flags), replacement); } catch (error) { return error instanceof Error ? error.message : String(error); } }, [flavor, flags, pattern, replacement, subject]);
  const activeCompatibility = compatibility.find((entry) => entry.flavor === flavor)!;

  const runPattern = async () => {
    if (!EXECUTABLE.has(flavor)) { setStatus(`${activeCompatibility.label} is compatibility-only in this release. Choose ECMAScript or PCRE2 to execute.`); return; }
    setBusy(true); const next = await executeRegexWithWatchdog(flavor as 'ecmascript'|'pcre2', pattern, flags, subject); setResult(next); setBusy(false); setStatus(next.error ? next.error : `${next.matches.length} match${next.matches.length === 1 ? '' : 'es'} in ${next.durationMs.toFixed(2)} ms.`);
  };
  const runAssertions = async () => {
    if (!EXECUTABLE.has(flavor)) { setStatus('Assertions require an execution engine.'); return; }
    const cases = [...positive.split(/\r?\n/).filter(Boolean).map((value) => ({value,expected:true})), ...negative.split(/\r?\n/).filter(Boolean).map((value) => ({value,expected:false}))];
    const rows=[] as { value:string; expected:boolean; passed:boolean }[];
    for (const item of cases) { const checked=await executeRegexWithWatchdog(flavor as 'ecmascript'|'pcre2', pattern, flags.replace(/g/g,''), item.value); rows.push({ ...item, passed: !checked.error && (checked.matches.length > 0) === item.expected }); }
    setAssertions(rows);
  };
  const checkLesson = () => { const checked=validateAcademySolution(lesson, academySolution, lesson.flags); setLessonResult(checked); if (checked.complete) { const next=new Set(completed); next.add(lesson.id); setCompleted(next); void saveRegexMatrixValue('academy-progress',[...next]); } };
  const openLesson = () => { setPattern(academySolution); setFlags(lesson.flags); setSubject(lesson.cases.map((item) => item.value).join('\n')); setMode('studio'); setStatus(`Opened “${lesson.title}” in Studio.`); };
  const share = async () => { const encoded=encodeRegexMatrixState({ mode, flavor, pattern, flags, subject }); const base=window.location.href.split('#')[0]!; const url=`${base}#/regex-matrix?state=${encoded}`; try { await navigator.clipboard.writeText(url); setStatus('Compressed local share URL copied.'); } catch { window.location.hash=`/regex-matrix?state=${encoded}`; setStatus('Share state placed in the address bar.'); } };
  const exportAssertions = () => downloadText(JSON.stringify({ engine:flavor, pattern, flags, positive:positive.split(/\r?\n/).filter(Boolean), negative:negative.split(/\r?\n/).filter(Boolean) }, null, 2), 'regex-matrix-tests.json', 'application/json;charset=utf-8');
  const exportDiagram = () => { const width=900; const nodes=explanation.children.slice(0,14); const height=Math.max(100, 48+nodes.length*34); const body=nodes.map((node,index) => `<g transform="translate(24 ${34+index*34})"><rect width="${Math.min(820,160+node.source.length*7)}" height="24" rx="4" fill="#13243a" stroke="#47627f"/><text x="10" y="16" fill="#e8f2ff" font-family="monospace" font-size="12">${escapeXml(node.label)} · ${escapeXml(node.source)}</text></g>`).join(''); downloadText(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="#0b1120"/>${body}</svg>`, 'regex-matrix-diagram.svg', 'image/svg+xml;charset=utf-8'); };

  return <div className="regex-matrix" data-testid="regex-matrix-workspace">
    <header className="regex-matrix-bar">
      <div className="regex-mode-switch" aria-label="Workspace mode"><button type="button" aria-pressed={mode==='studio'} onClick={() => setMode('studio')}>Studio</button><button type="button" aria-pressed={mode==='academy'} onClick={() => setMode('academy')}>Academy</button></div>
      <label>Engine flavor<select aria-label="Engine flavor" value={flavor} onChange={(event) => setFlavor(event.target.value as RegexFlavor)}>{FLAVORS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
      <span className="regex-engine-state" data-testid="engine-status"><strong>{activeCompatibility.capability === 'execution' ? 'Execution' : 'Compatibility'}</strong> · {activeCompatibility.label}</span>
      <a className="regex-coffee" href="https://buymeacoffee.com/aahplexx" target="_blank" rel="noreferrer">☕ Buy me a coffee ($3)</a>
    </header>

    {mode === 'studio' ? <>
      <section className="regex-pattern-strip" aria-label="Expression controls"><div className="regex-pattern-editor"><span>Pattern</span><RegexEditor label="Pattern" value={pattern} onChange={setPattern} compact /></div><label className="regex-flags">Flags<input aria-label="Flags" value={flags} onChange={(event) => setFlags(event.target.value)} /></label><button type="button" className="regex-run" disabled={busy || !EXECUTABLE.has(flavor)} onClick={() => void runPattern()}>{busy ? 'Running…' : 'Run pattern'}</button></section>
      <main className="regex-studio-grid">
        <section className="regex-editor-pane" aria-label="Test and replacement workspace"><div className="regex-pane-heading"><h2>Test subject</h2><span>{subject.length} chars</span></div><RegexEditor label="Test subject" value={subject} onChange={setSubject} />
          <div className="regex-substitute"><label>Replacement<input aria-label="Replacement" value={replacement} onChange={(event) => setReplacement(event.target.value)} /></label><pre tabIndex={0}>{replacementPreview}</pre></div>
          <details><summary>Assertion suite</summary><div className="regex-assertion-inputs"><label>Must match<textarea aria-label="Must match" value={positive} onChange={(event) => setPositive(event.target.value)} /></label><label>Must not match<textarea aria-label="Must not match" value={negative} onChange={(event) => setNegative(event.target.value)} /></label></div><button type="button" onClick={() => void runAssertions()}>Run assertions</button>{assertions.length ? <p>{assertions.filter((item) => item.passed).length}/{assertions.length} assertions pass</p> : null}</details>
        </section>
        <section className="regex-match-pane" aria-label="Match inspector"><div className="regex-pane-heading"><h2>Matches</h2><strong data-testid="match-count">{result.matches.length}</strong></div>{result.error ? <p className="regex-error" role="alert">{result.error}</p> : <div data-testid="match-inspector" className="regex-match-list">{result.matches.length ? result.matches.map((match,index) => <article key={`${match.index}-${index}`}><header><strong>Match {index+1}</strong><span>{match.index}–{match.end} · {match.match.length} chars</span></header><code>{match.match}</code>{Object.entries(match.namedGroups).length ? <dl>{Object.entries(match.namedGroups).map(([name,value]) => <div key={name}><dt>{name}</dt><dd>{value}</dd></div>)}</dl> : null}</article>) : <p className="regex-empty">Run the pattern to inspect matches and capture groups.</p>}</div>}<p className="regex-duration">Last execution: {result.durationMs.toFixed(2)} ms</p></section>
        <aside className="regex-diagnostic-pane" aria-label="Regex diagnostics"><section><div className="regex-pane-heading"><h2>Explain</h2><span>{explanation.children.length} tokens</span></div><ol className="regex-ast-list" tabIndex={0} aria-label="Regex structural explanation">{explanation.children.slice(0,18).map((node) => <li key={node.id}><code>{node.source || '∅'}</code><span>{node.label}</span><small>{node.start}–{node.end}</small></li>)}</ol></section>
          <section className={`regex-safety ${redos.risk}`}><div className="regex-pane-heading"><h2>ReDoS safety</h2><strong data-testid="redos-status">{riskLabel(redos.risk)}</strong></div><p>{redos.metricLabel}: {redos.score ?? 'n/a'}</p><small>{redos.note}</small></section>
        </aside>
      </main>
      <section className="regex-lower-grid">
        <div><div className="regex-pane-heading"><h2>Flavor compatibility</h2><span>Execution vs analysis is explicit</span></div><div className="regex-compat-table" role="table" aria-label="Flavor compatibility matrix">{compatibility.map((entry) => <div role="row" key={entry.flavor}><strong role="cell">{entry.label}</strong><span role="cell">{entry.capability === 'execution' ? 'Execution' : 'Compatibility only'}</span><span role="cell">{entry.supported ? 'Pattern supported' : entry.issues[0]}</span></div>)}</div></div>
        <div><div className="regex-pane-heading"><h2>Code generator</h2><label>Target<select aria-label="Code target" value={codeTarget} onChange={(event) => setCodeTarget(event.target.value as RegexCodeTarget)}>{TARGETS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label></div><pre className="regex-code" tabIndex={0}>{code}</pre></div>
      </section>
      <footer className="regex-exportbar"><button type="button" onClick={exportAssertions}>Export test JSON</button><button type="button" onClick={exportDiagram}>Export diagram SVG</button><button type="button" onClick={() => void share()}>Copy share URL</button><span role="status">{status}</span></footer>
    </> : <section className="regex-academy" data-testid="academy-panel">
      <aside className="regex-lesson-nav" aria-label="Academy lessons">{ACADEMY_TRACKS.map((track) => <section key={track.id}><h2>{track.title}</h2>{track.lessons.map((item) => <button type="button" key={item.id} className={item.id===lesson.id?'active':''} aria-pressed={item.id===lesson.id} onClick={() => setLessonId(item.id)}>{completed.has(item.id) ? '✓ ' : ''}{item.title}</button>)}</section>)}</aside>
      <article className="regex-lesson"><header><p>{lessons.find((entry) => entry.lesson.id === lesson.id)?.track.title}</p><h2>{lesson.title}</h2><p>{lesson.objective}</p></header><div className="regex-lesson-guide"><strong>How it works</strong><p>{lesson.guide}</p></div><label>Academy solution<textarea aria-label="Academy solution" value={academySolution} onChange={(event) => setAcademySolution(event.target.value)} /></label><div className="regex-lesson-actions"><button type="button" onClick={checkLesson}>Check solution</button><button type="button" onClick={openLesson}>Open in Studio</button></div><p className="regex-hint">Hint: {lesson.hint}</p>{lessonResult ? <div data-testid="lesson-status" className={lessonResult.complete?'regex-complete':'regex-incomplete'}>{lessonResult.error ?? (lessonResult.complete ? 'Lesson complete' : `${lessonResult.cases.filter((item) => item.passed).length}/${lessonResult.cases.length} cases pass`)}</div> : null}<ul className="regex-case-list">{lesson.cases.map((item) => <li key={item.value}><code>{item.value}</code><span>{item.shouldMatch ? 'must match' : 'must not match'}</span></li>)}</ul></article>
      <footer className="regex-academy-footer"><span>{completed.size}/{lessons.length} lessons complete on this device</span><button type="button" onClick={() => { const data=JSON.stringify({ version:1, completed:[...completed] },null,2); downloadText(data,'regex-matrix-progress.json','application/json;charset=utf-8'); }}>Export progress</button></footer>
    </section>}
  </div>;
};
export default RegexWorkspace;

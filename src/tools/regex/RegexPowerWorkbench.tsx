import { useEffect, useMemo, useState } from 'react';
import { downloadText } from '../../lib/download';
import { buildBenchmarkSummary, type RegexBenchmarkSummary } from './regex-benchmark';
import { buildDebugTrace, formatRegexForReview } from './regex-debugger';
import { REGEX_FLAVOR_CATALOG } from './regex-compat';
import { buildRegexAutomaton, simulateRegexAutomaton } from './regex-automaton';
import { buildMatchExportRows, serializeMatchRows } from './regex-list';
import { planRegexPortability } from './regex-portability';
import { searchRegexReference } from './regex-reference';
import { analyzeRedos } from './regex-redos';
import { buildRedosProbeInput, summarizeRedosProfile, type RedosProfilePoint, type RedosProfileSummary } from './regex-redos-profile';
import { generateFuzzCases, synthesizeRegexCandidates, type RegexSynthesisCandidate } from './regex-synthesis';
import type { RegexExplanationNode, RegexFlavor, RegexRunResult } from './regex-types';
import { executeRegexWithWatchdog, type RegexExecutionFlavor } from './regex-worker-client';

type PowerTool = 'reference' | 'benchmark' | 'list' | 'debugger' | 'automaton' | 'redos-profile' | 'format' | 'portability' | 'synthesize';
const TOOLS: readonly { readonly value: PowerTool; readonly label: string }[] = [
  { value:'reference', label:'Reference' },
  { value:'benchmark', label:'Benchmark' },
  { value:'list', label:'List & export' },
  { value:'debugger', label:'Debugger' },
  { value:'automaton', label:'Automaton' },
  { value:'redos-profile', label:'ReDoS Lab' },
  { value:'format', label:'Format' },
  { value:'portability', label:'Portability' },
  { value:'synthesize', label:'Synthesize' },
];
const EXECUTABLE = new Set<RegexFlavor>(['ecmascript','pcre2','oniguruma']);
interface Props {
  readonly flavor: RegexFlavor;
  readonly pattern: string;
  readonly flags: string;
  readonly subject: string;
  readonly result: RegexRunResult;
  readonly explanation: RegexExplanationNode;
  readonly onPatternChange: (value: string) => void;
  readonly onFlavorChange: (value: RegexFlavor) => void;
  readonly onSelectSource: (start: number, end: number, label: string) => void;
}
const lines = (value: string) => value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
const RegexPowerWorkbench = ({ flavor, pattern, flags, subject, result, explanation, onPatternChange, onFlavorChange, onSelectSource }: Props) => {
  const [active,setActive] = useState<PowerTool>('reference');
  const [referenceQuery,setReferenceQuery] = useState('');
  const [portabilityTarget,setPortabilityTarget] = useState<RegexFlavor>(flavor === 'python' ? 'ecmascript' : 'python');
  const [benchmark,setBenchmark] = useState<RegexBenchmarkSummary | null>(null);
  const [benchmarkBusy,setBenchmarkBusy] = useState(false);
  const [debugIndex,setDebugIndex] = useState(0);
  const [positive,setPositive] = useState('123\n456\n789');
  const [negative,setNegative] = useState('12a\n1234');
  const [candidates,setCandidates] = useState<RegexSynthesisCandidate[]>([]);
  const [fuzz,setFuzz] = useState<string[]>([]);
  const redosAssessment = useMemo(() => analyzeRedos(pattern, flags), [flags, pattern]);
  const [probePump,setProbePump] = useState(redosAssessment.probe.pump);
  const [probeSuffix,setProbeSuffix] = useState(redosAssessment.probe.suffix);
  const [redosProfile,setRedosProfile] = useState<RedosProfileSummary | null>(null);
  const [redosProfileBusy,setRedosProfileBusy] = useState(false);
  const reference = useMemo(() => searchRegexReference(referenceQuery, flavor).slice(0,80), [flavor,referenceQuery]);
  const portability = useMemo(() => planRegexPortability(pattern, flavor, portabilityTarget), [flavor, pattern, portabilityTarget]);
  const trace = useMemo(() => buildDebugTrace(explanation), [explanation]);
  const automaton = useMemo(() => buildRegexAutomaton(pattern, flags), [flags, pattern]);
  const automatonSimulation = useMemo(() => simulateRegexAutomaton(automaton, subject), [automaton, subject]);
  const [automatonIndex,setAutomatonIndex] = useState(0);
  useEffect(() => { setAutomatonIndex(0); }, [automatonSimulation]);
  useEffect(() => { if (portabilityTarget === flavor) setPortabilityTarget(flavor === 'ecmascript' ? 'python' : 'ecmascript'); }, [flavor, portabilityTarget]);
  useEffect(() => {
    setProbePump(redosAssessment.probe.pump);
    setProbeSuffix(redosAssessment.probe.suffix);
    setRedosProfile(null);
  }, [pattern, flags, redosAssessment.probe.pump, redosAssessment.probe.suffix]);
  const formatted = useMemo(() => formatRegexForReview(explanation), [explanation]);
  const matchRows = useMemo(() => buildMatchExportRows(result.matches), [result.matches]);
  const step = trace.steps[Math.min(debugIndex, Math.max(0,trace.steps.length-1))] ?? null;
  const automatonFrame = automatonSimulation.frames[Math.min(automatonIndex, Math.max(0,automatonSimulation.frames.length-1))] ?? null;
  const activeAutomatonStates = new Set(automatonFrame?.activeStateIds ?? []);
  const runBenchmark = async () => {
    if (!EXECUTABLE.has(flavor)) return;
    setBenchmarkBusy(true);
    const samples:number[]=[]; let timeouts=0;
    for (let index=0;index<12;index+=1) {
      const run=await executeRegexWithWatchdog(flavor as RegexExecutionFlavor,pattern,flags,subject);
      if (run.timedOut) timeouts+=1; else if (!run.error) samples.push(run.durationMs);
    }
    setBenchmark(buildBenchmarkSummary(samples,12,timeouts));
    setBenchmarkBusy(false);
  };
  const moveDebug = (delta:number) => {
    if (!trace.steps.length) return;
    const next=Math.max(0,Math.min(trace.steps.length-1,debugIndex+delta));
    setDebugIndex(next); const selected=trace.steps[next]; if(selected) onSelectSource(selected.start,selected.end,selected.label);
  };
  const moveAutomaton = (delta:number) => {
    if (!automatonSimulation.frames.length) return;
    setAutomatonIndex((current) => Math.max(0, Math.min(automatonSimulation.frames.length - 1, current + delta)));
  };
  const runRedosProfile = async () => {
    setRedosProfileBusy(true);
    setRedosProfile(null);
    const points: RedosProfilePoint[] = [];
    for (const repetitions of [4,8,12,16,20]) {
      const input=buildRedosProbeInput(redosAssessment.probe,repetitions,probePump,probeSuffix);
      const run=await executeRegexWithWatchdog('ecmascript',pattern,flags.replace(/g/g,''),input,400);
      points.push({ repetitions, inputLength:input.length, durationMs:run.durationMs, timedOut:Boolean(run.timedOut), error:run.error });
      if (run.timedOut) break;
    }
    setRedosProfile(summarizeRedosProfile(points));
    setRedosProfileBusy(false);
  };
  const runSynthesis = () => {
    const positiveRows=lines(positive), negativeRows=lines(negative);
    setCandidates(synthesizeRegexCandidates(positiveRows,negativeRows));
    setFuzz(generateFuzzCases(positiveRows,12));
  };
  const exportMatches = (format:'csv'|'json'|'text') => downloadText(serializeMatchRows(matchRows,format),`regex-matrix-matches.${format==='text'?'txt':format}`,format==='json'?'application/json;charset=utf-8':format==='csv'?'text/csv;charset=utf-8':'text/plain;charset=utf-8');
  return <section className="regex-power-workbench" aria-labelledby="regex-power-heading">
    <div className="regex-pane-heading"><h2 id="regex-power-heading">Power workbench</h2><span>Production diagnostics · reference · synthesis</span></div>
    <div className="regex-tool-tabs" role="tablist" aria-label="Regex power tools">{TOOLS.map((tool)=><button type="button" role="tab" key={tool.value} aria-selected={active===tool.value} onClick={()=>setActive(tool.value)}>{tool.label}</button>)}</div>
    <div className="regex-tool-panel">
      {active==='reference' ? <section aria-label="Regex quick reference"><label className="regex-tool-search">Search regex reference<input aria-label="Search regex reference" value={referenceQuery} onChange={(event)=>setReferenceQuery(event.target.value)} placeholder="lookbehind, quantifier, branch reset…" /></label><div className="regex-reference-results" data-testid="regex-reference-results">{reference.map((item)=><article key={item.id}><div><code>{item.token}</code><strong>{item.label}</strong><small>{item.category}</small></div><p>{item.description}</p><button type="button" onClick={()=>onPatternChange(`${pattern}${item.token}`)}>Insert</button></article>)}</div></section> : null}
      {active==='benchmark' ? <section aria-label="Regex benchmark"><div className="regex-tool-actions"><button type="button" disabled={!EXECUTABLE.has(flavor)||benchmarkBusy} onClick={()=>void runBenchmark()}>{benchmarkBusy?'Benchmarking…':'Run benchmark'}</button><small>12 isolated local executions through the selected real engine. Compatibility-only flavors cannot benchmark.</small></div>{benchmark ? <dl className="regex-benchmark-stats" data-testid="benchmark-summary"><div><dt>Median</dt><dd>{benchmark.medianMs.toFixed(3)} ms</dd></div><div><dt>P95</dt><dd>{benchmark.p95Ms.toFixed(3)} ms</dd></div><div><dt>Min / max</dt><dd>{benchmark.minMs.toFixed(3)} / {benchmark.maxMs.toFixed(3)} ms</dd></div><div><dt>Throughput</dt><dd>{benchmark.throughputPerSecond.toFixed(1)} runs/s</dd></div><div><dt>Timeouts</dt><dd>{benchmark.timeouts}/{benchmark.iterations}</dd></div></dl>:<p className="regex-empty">Run a benchmark to measure the current pattern, subject, flags, and execution engine.</p>}</section> : null}
      {active==='list' ? <section aria-label="Match list and export"><pre className="regex-match-export-preview" data-testid="match-export-preview" tabIndex={0}>{serializeMatchRows(matchRows,'text') || 'Run the pattern to build a match list.'}</pre><div className="regex-tool-actions"><button type="button" onClick={()=>exportMatches('csv')}>Export matches CSV</button><button type="button" onClick={()=>exportMatches('json')}>Export matches JSON</button><button type="button" onClick={()=>exportMatches('text')}>Export matches text</button></div></section> : null}
      {active==='debugger' ? <section aria-label="Structural regex debugger"><p className="regex-truth-note">Structural source traversal — not native-engine backtracking steps.</p>{step ? <article className="regex-debug-step" data-testid="debugger-step"><strong>Step {step.index+1} of {trace.steps.length}</strong><code>{step.source || '∅'}</code><p>{step.label}</p><small>Source {step.start}–{step.end}</small></article>:<p className="regex-empty" data-testid="debugger-step">No structural steps are available for this expression.</p>}<div className="regex-tool-actions"><button type="button" disabled={debugIndex<=0} onClick={()=>moveDebug(-1)}>Previous debug step</button><button type="button" disabled={debugIndex>=trace.steps.length-1} onClick={()=>moveDebug(1)}>Next debug step</button></div></section> : null}
      {active==='automaton' ? <section aria-label="Regex Thompson NFA automaton">
        <p className="regex-truth-note" data-testid="automaton-truth-note">{automaton.note}</p>
        {!automaton.supported ? <p className="regex-error" data-testid="automaton-unsupported">Unsupported by this automaton visualizer: {automaton.unsupported.join(' ')}</p> : <>
          <div className="regex-automaton-scroll" data-testid="automaton-canvas" tabIndex={0} aria-label="Regex automaton graph viewport">
            <svg className="regex-automaton-svg" width={automaton.width} height={automaton.height} viewBox={`0 0 ${automaton.width} ${automaton.height}`} role="img" aria-label="Thompson NFA state graph">
              <defs><marker id="regex-automaton-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" /></marker></defs>
              {automaton.transitions.map((transition) => {
                const from=automaton.states.find((state)=>state.id===transition.from), to=automaton.states.find((state)=>state.id===transition.to);
                if(!from||!to) return null;
                const backward=to.x<=from.x;
                const path=backward ? `M ${from.x} ${from.y-25} C ${from.x+24} ${Math.max(18,from.y-74)}, ${to.x-24} ${Math.max(18,to.y-74)}, ${to.x} ${to.y-25}` : `M ${from.x+27} ${from.y} C ${(from.x+to.x)/2} ${from.y}, ${(from.x+to.x)/2} ${to.y}, ${to.x-27} ${to.y}`;
                const labelX=backward?(from.x+to.x)/2:(from.x+to.x)/2, labelY=backward?Math.max(14,Math.min(from.y,to.y)-66):(from.y+to.y)/2-8;
                return <g key={transition.id} className={activeAutomatonStates.has(transition.from)?'active':''}><path className="regex-automaton-edge" d={path} markerEnd="url(#regex-automaton-arrow)" /><text className="regex-automaton-edge-label" x={labelX} y={labelY} textAnchor="middle">{transition.label}</text></g>;
              })}
              {automaton.states.map((state)=><g key={state.id} className={`regex-automaton-state ${state.kind}${activeAutomatonStates.has(state.id)?' active':''}`} transform={`translate(${state.x} ${state.y})`}><circle r="25" /><text textAnchor="middle" y="4">{state.label}</text>{activeAutomatonStates.has(state.id)?<text className="regex-automaton-active-label" textAnchor="middle" y="42">active</text>:null}</g>)}
            </svg>
          </div>
          <div className="regex-automaton-controls">
            <button type="button" disabled={automatonIndex<=0} onClick={()=>moveAutomaton(-1)}>Previous automaton step</button>
            <button type="button" disabled={automatonIndex>=automatonSimulation.frames.length-1} onClick={()=>moveAutomaton(1)}>Next automaton step</button>
            <span data-testid="automaton-step">{automatonFrame ? `Step ${automatonFrame.index+1}/${automatonSimulation.frames.length}: ${automatonFrame.description}` : 'No simulation steps.'}</span>
          </div>
          <p className="regex-automaton-match" data-testid="automaton-match">{automatonSimulation.match ? `Match: ${automatonSimulation.match.text} · ${automatonSimulation.match.start}–${automatonSimulation.match.end}` : 'No match found by the supported NFA simulation.'}</p>
        </>}
      </section> : null}
      {active==='redos-profile' ? <section aria-label="Empirical ReDoS trajectory lab">
        <p className="regex-truth-note" data-testid="redos-profile-truth">Empirical worker-isolated measured runtime samples. These timings are not engine step counts and are not proof of asymptotic complexity; interpret them beside the static ambiguity analysis.</p>
        <div className="regex-redos-profile-inputs">
          <label>Probe pump<input aria-label="Probe pump" value={probePump} onChange={(event)=>setProbePump(event.target.value)} /></label>
          <label>Failure suffix<input aria-label="Failure suffix" value={probeSuffix} onChange={(event)=>setProbeSuffix(event.target.value)} /></label>
        </div>
        <p className="regex-hint">Probe basis: {redosAssessment.probe.basis} Each point runs the ECMAScript engine in a disposable worker with a 400 ms watchdog.</p>
        <div className="regex-tool-actions"><button type="button" disabled={redosProfileBusy || !probePump} onClick={()=>void runRedosProfile()}>{redosProfileBusy?'Profiling…':'Run empirical profile'}</button></div>
        {redosProfile ? <>
          <div className="regex-redos-chart-scroll" tabIndex={0} data-testid="redos-profile-chart" aria-label="Empirical regex runtime trajectory chart">
            <svg className="regex-redos-chart" viewBox="0 0 620 240" width="620" height="240" role="img" aria-label="Measured runtime by adversarial probe length">
              <line x1="56" y1="18" x2="56" y2="202" className="regex-redos-axis" /><line x1="56" y1="202" x2="596" y2="202" className="regex-redos-axis" />
              {redosProfile.points.map((point,index) => {
                const x=redosProfile.points.length===1?326:72+(index*(508/(redosProfile.points.length-1)));
                const scale=Math.max(1,redosProfile.maxDurationMs);
                const y=point.timedOut?24:196-(Math.min(scale,point.durationMs)/scale)*158;
                return <g key={`${point.repetitions}-${index}`} className={point.timedOut?'timeout':''}><line x1={x} y1="202" x2={x} y2={y} className="regex-redos-bar" /><circle cx={x} cy={y} r="6" className="regex-redos-point" /><text x={x} y="220" textAnchor="middle" className="regex-redos-label">{point.repetitions}×</text><text x={x} y={Math.max(16,y-10)} textAnchor="middle" className="regex-redos-label">{point.timedOut?'timeout':`${point.durationMs.toFixed(2)} ms`}</text></g>;
              })}
              <text x="12" y="20" className="regex-redos-label">ms</text><text x="505" y="236" className="regex-redos-label">pump repetitions</text>
            </svg>
          </div>
          <p className="regex-redos-profile-summary" data-testid="redos-profile-summary">Measured runtime trajectory: {redosProfile.classification}. {redosProfile.timeouts} timeout{redosProfile.timeouts===1?'':'s'}; {redosProfile.growthRatio===null?'growth ratio unavailable':`observed growth ratio ${redosProfile.growthRatio.toFixed(2)}×`}.</p>
          <p className="regex-hint">{redosProfile.note}</p>
        </>:<p className="regex-empty">Run the bounded profile to compare measured runtimes across increasing probe lengths.</p>}
      </section> : null}
      {active==='format' ? <section aria-label="Regex review formatter"><p className="regex-truth-note">Readable structural review. This does not rewrite the executable expression or claim semantic-equivalent whitespace formatting.</p><pre className="regex-format-review" tabIndex={0}>{formatted}</pre></section> : null}
      {active==='portability' ? <section aria-label="Regex portability planner">
        <p className="regex-truth-note">Only documented syntax migrations are applied automatically. Unsupported target constructs remain manual; RegexMatrix never invents speculative polyfills or claims semantic equivalence it cannot prove.</p>
        <label className="regex-tool-search">Target flavor<select aria-label="Portability target" value={portabilityTarget} onChange={(event)=>setPortabilityTarget(event.target.value as RegexFlavor)}>{REGEX_FLAVOR_CATALOG.map((item)=><option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
        <p className="regex-hint" data-testid="portability-status">{portability.status==='safe-rewrite'?'Safe rewrite available':portability.status==='manual'?'Manual migration required':'Portable unchanged'}</p>
        <pre className="regex-format-review" data-testid="portability-preview" tabIndex={0}>{portability.outputPattern || '∅'}</pre>
        {portability.changes.length ? <ul>{portability.changes.map((change,index)=><li key={`${change.kind}-${index}`}><strong>{change.note}</strong> <code>{change.from}</code> → <code>{change.to}</code></li>)}</ul> : null}
        <div data-testid="portability-blockers">{portability.blockers.length ? <ul>{portability.blockers.map((blocker)=><li key={blocker}>{blocker}</li>)}</ul> : <p className="regex-hint">No target blockers detected by the current compatibility model.</p>}</div>
        <div className="regex-tool-actions"><button type="button" disabled={portability.status!=='safe-rewrite'} onClick={()=>{ onPatternChange(portability.outputPattern); onFlavorChange(portabilityTarget); }}>Apply safe rewrite</button></div>
      </section> : null}
      {active==='synthesize' ? <section className="regex-synthesis" aria-label="Sample-driven regex synthesis"><div className="regex-synthesis-inputs"><label>Positive synthesis samples<textarea aria-label="Positive synthesis samples" value={positive} onChange={(event)=>setPositive(event.target.value)} /></label><label>Negative synthesis samples<textarea aria-label="Negative synthesis samples" value={negative} onChange={(event)=>setNegative(event.target.value)} /></label></div><div className="regex-tool-actions"><button type="button" onClick={runSynthesis}>Generate candidates</button></div><div className="regex-synthesis-candidates" data-testid="synthesis-candidates">{candidates.length?candidates.map((candidate)=><article key={candidate.pattern}><div><code>{candidate.pattern}</code><strong>{candidate.label}</strong><small>{candidate.passesAllSamples?'All samples pass':'Review needed'} · score {candidate.score.toFixed(0)}</small></div><button type="button" disabled={!candidate.passesAllSamples} onClick={()=>onPatternChange(candidate.pattern)}>Use pattern</button></article>):<p className="regex-empty">Candidates appear here only after you request synthesis. RegexMatrix never silently replaces your pattern.</p>}</div>{fuzz.length?<details><summary>Generated edge cases ({fuzz.length})</summary><ul className="regex-fuzz-list">{fuzz.map((value,index)=><li key={`${index}-${value}`}><code>{JSON.stringify(value)}</code></li>)}</ul></details>:null}</section> : null}
    </div>
  </section>;
};
export default RegexPowerWorkbench;

import { useMemo, useState } from 'react';
import { downloadText } from '../../lib/download';
import { buildBenchmarkSummary, type RegexBenchmarkSummary } from './regex-benchmark';
import { buildDebugTrace, formatRegexForReview } from './regex-debugger';
import { buildMatchExportRows, serializeMatchRows } from './regex-list';
import { searchRegexReference } from './regex-reference';
import { generateFuzzCases, synthesizeRegexCandidates, type RegexSynthesisCandidate } from './regex-synthesis';
import type { RegexExplanationNode, RegexFlavor, RegexRunResult } from './regex-types';
import { executeRegexWithWatchdog } from './regex-worker-client';

type PowerTool = 'reference' | 'benchmark' | 'list' | 'debugger' | 'format' | 'synthesize';
const TOOLS: readonly { readonly value: PowerTool; readonly label: string }[] = [
  { value:'reference', label:'Reference' },
  { value:'benchmark', label:'Benchmark' },
  { value:'list', label:'List & export' },
  { value:'debugger', label:'Debugger' },
  { value:'format', label:'Format' },
  { value:'synthesize', label:'Synthesize' },
];
const EXECUTABLE = new Set<RegexFlavor>(['ecmascript','pcre2']);
interface Props {
  readonly flavor: RegexFlavor;
  readonly pattern: string;
  readonly flags: string;
  readonly subject: string;
  readonly result: RegexRunResult;
  readonly explanation: RegexExplanationNode;
  readonly onPatternChange: (value: string) => void;
  readonly onSelectSource: (start: number, end: number, label: string) => void;
}
const lines = (value: string) => value.split(/?
/).map((item) => item.trim()).filter(Boolean);
const RegexPowerWorkbench = ({ flavor, pattern, flags, subject, result, explanation, onPatternChange, onSelectSource }: Props) => {
  const [active,setActive] = useState<PowerTool>('reference');
  const [referenceQuery,setReferenceQuery] = useState('');
  const [benchmark,setBenchmark] = useState<RegexBenchmarkSummary | null>(null);
  const [benchmarkBusy,setBenchmarkBusy] = useState(false);
  const [debugIndex,setDebugIndex] = useState(0);
  const [positive,setPositive] = useState('123
456
789');
  const [negative,setNegative] = useState('12a
1234');
  const [candidates,setCandidates] = useState<RegexSynthesisCandidate[]>([]);
  const [fuzz,setFuzz] = useState<string[]>([]);
  const reference = useMemo(() => searchRegexReference(referenceQuery, flavor).slice(0,80), [flavor,referenceQuery]);
  const trace = useMemo(() => buildDebugTrace(explanation), [explanation]);
  const formatted = useMemo(() => formatRegexForReview(explanation), [explanation]);
  const matchRows = useMemo(() => buildMatchExportRows(result.matches), [result.matches]);
  const step = trace.steps[Math.min(debugIndex, Math.max(0,trace.steps.length-1))] ?? null;
  const runBenchmark = async () => {
    if (!EXECUTABLE.has(flavor)) return;
    setBenchmarkBusy(true);
    const samples:number[]=[]; let timeouts=0;
    for (let index=0;index<12;index+=1) {
      const run=await executeRegexWithWatchdog(flavor as 'ecmascript'|'pcre2',pattern,flags,subject);
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
      {active==='format' ? <section aria-label="Regex review formatter"><p className="regex-truth-note">Readable structural review. This does not rewrite the executable expression or claim semantic-equivalent whitespace formatting.</p><pre className="regex-format-review" tabIndex={0}>{formatted}</pre></section> : null}
      {active==='synthesize' ? <section className="regex-synthesis" aria-label="Sample-driven regex synthesis"><div className="regex-synthesis-inputs"><label>Positive synthesis samples<textarea aria-label="Positive synthesis samples" value={positive} onChange={(event)=>setPositive(event.target.value)} /></label><label>Negative synthesis samples<textarea aria-label="Negative synthesis samples" value={negative} onChange={(event)=>setNegative(event.target.value)} /></label></div><div className="regex-tool-actions"><button type="button" onClick={runSynthesis}>Generate candidates</button></div><div className="regex-synthesis-candidates" data-testid="synthesis-candidates">{candidates.length?candidates.map((candidate)=><article key={candidate.pattern}><div><code>{candidate.pattern}</code><strong>{candidate.label}</strong><small>{candidate.passesAllSamples?'All samples pass':'Review needed'} · score {candidate.score.toFixed(0)}</small></div><button type="button" disabled={!candidate.passesAllSamples} onClick={()=>onPatternChange(candidate.pattern)}>Use pattern</button></article>):<p className="regex-empty">Candidates appear here only after you request synthesis. RegexMatrix never silently replaces your pattern.</p>}</div>{fuzz.length?<details><summary>Generated edge cases ({fuzz.length})</summary><ul className="regex-fuzz-list">{fuzz.map((value,index)=><li key={`${index}-${value}`}><code>{JSON.stringify(value)}</code></li>)}</ul></details>:null}</section> : null}
    </div>
  </section>;
};
export default RegexPowerWorkbench;

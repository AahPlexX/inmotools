import { useMemo, useState } from 'react';
import { ACADEMY_TRACKS, validateAcademySolution } from './regex-academy';
import { buildRegexCrossword, validateRegexCrossword, type RegexCrosswordResult } from './regex-crossword';
import { buildPracticeChallenge } from './regex-practice';

const RegexPracticeLab = () => {
  const [mode,setMode]=useState<'challenge'|'crossword'>('challenge');
  const [seed,setSeed]=useState(0);
  const challenge=useMemo(()=>buildPracticeChallenge(ACADEMY_TRACKS,seed),[seed]);
  const [solution,setSolution]=useState(challenge.starter);
  const [status,setStatus]=useState<ReturnType<typeof validateAcademySolution>|null>(null);
  const [crosswordSeed,setCrosswordSeed]=useState(0);
  const puzzle=useMemo(()=>buildRegexCrossword(crosswordSeed),[crosswordSeed]);
  const [cells,setCells]=useState<string[]>(()=>Array(9).fill(''));
  const [crosswordResult,setCrosswordResult]=useState<RegexCrosswordResult|null>(null);
  const next=()=>{ const nextSeed=seed+1; const nextChallenge=buildPracticeChallenge(ACADEMY_TRACKS,nextSeed); setSeed(nextSeed); setSolution(nextChallenge.starter); setStatus(null); };
  const check=()=>setStatus(validateAcademySolution(challenge,solution,challenge.flags));
  const nextCrossword=()=>{ setCrosswordSeed((value)=>value+1); setCells(Array(9).fill('')); setCrosswordResult(null); };
  const updateCell=(index:number,value:string)=>{ const next=[...cells]; next[index]=value.slice(-1).toUpperCase(); setCells(next); setCrosswordResult(null); };
  return <article className="regex-practice-lab" data-testid="practice-lab">
    <div className="regex-academy-switch" aria-label="Practice activity"><button type="button" aria-pressed={mode==='challenge'} onClick={()=>setMode('challenge')}>Challenge</button><button type="button" aria-pressed={mode==='crossword'} onClick={()=>setMode('crossword')}>Regex Crossword</button></div>
    {mode==='challenge' ? <><header><p>Deterministic local practice</p><h2>{challenge.title}</h2><p>{challenge.objective}</p></header><label>Practice solution<textarea aria-label="Practice solution" value={solution} onChange={(event)=>setSolution(event.target.value)} /></label><div className="regex-lesson-actions"><button type="button" onClick={check}>Check practice</button><button type="button" onClick={next}>Next challenge</button></div><p className="regex-hint">Hint: {challenge.hint}</p>{status?<div className={status.complete?'regex-complete':'regex-incomplete'}>{status.error??(status.complete?'Practice challenge complete.':`${status.cases.filter((item)=>item.passed).length}/${status.cases.length} cases pass`)}</div>:null}<ul className="regex-case-list">{challenge.cases.map((item)=><li key={item.value}><code>{item.value}</code><span>{item.shouldMatch?'must match':'must not match'}</span></li>)}</ul></> :
    <section className="regex-crossword" data-testid="regex-crossword" aria-labelledby="regex-crossword-title"><header><p>Regex crossword · local puzzle</p><h2 id="regex-crossword-title">{puzzle.title}</h2><p>Every row and column must satisfy its own regular expression at the same time.</p></header><div className="regex-crossword-layout"><div className="regex-crossword-grid" role="group" aria-label="Regex crossword grid">{cells.map((value,index)=>{const row=Math.floor(index/puzzle.size)+1;const column=index%puzzle.size+1;return <input key={`${row}-${column}`} aria-label={`Crossword cell ${row},${column}`} value={value} maxLength={1} inputMode="text" autoCapitalize="characters" onChange={(event)=>updateCell(index,event.target.value)} />;})}</div><div className="regex-crossword-rules"><div><strong>Rows</strong>{puzzle.rowPatterns.map((pattern,index)=><code key={`row-${pattern}`} className={crosswordResult?.rows[index]?.passed?'pass':''}>R{index+1} {pattern}</code>)}</div><div><strong>Columns</strong>{puzzle.columnPatterns.map((pattern,index)=><code key={`column-${pattern}`} className={crosswordResult?.columns[index]?.passed?'pass':''}>C{index+1} {pattern}</code>)}</div></div></div><div className="regex-lesson-actions"><button type="button" onClick={()=>setCrosswordResult(validateRegexCrossword(puzzle,cells))}>Check crossword</button><button type="button" onClick={nextCrossword}>Next crossword</button></div><p data-testid="crossword-status" role="status" className={crosswordResult?.complete?'regex-complete':'regex-incomplete'}>{crosswordResult ? (crosswordResult.complete ? 'Crossword complete — every row and column matches.' : `${[...crosswordResult.rows,...crosswordResult.columns].filter((item)=>item.passed).length}/${puzzle.size*2} row/column constraints pass.`) : 'Fill all nine cells, then check the shared constraints.'}</p></section>}
  </article>;
};
export default RegexPracticeLab;

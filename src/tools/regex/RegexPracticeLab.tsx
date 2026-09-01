import { useMemo, useState } from 'react';
import { ACADEMY_TRACKS, validateAcademySolution } from './regex-academy';
import { buildPracticeChallenge } from './regex-practice';
const RegexPracticeLab = () => {
  const [seed,setSeed]=useState(0);
  const challenge=useMemo(()=>buildPracticeChallenge(ACADEMY_TRACKS,seed),[seed]);
  const [solution,setSolution]=useState(challenge.starter);
  const [status,setStatus]=useState<ReturnType<typeof validateAcademySolution>|null>(null);
  const next=()=>{ const nextSeed=seed+1; const nextChallenge=buildPracticeChallenge(ACADEMY_TRACKS,nextSeed); setSeed(nextSeed); setSolution(nextChallenge.starter); setStatus(null); };
  const check=()=>setStatus(validateAcademySolution(challenge,solution,challenge.flags));
  return <article className="regex-practice-lab" data-testid="practice-lab"><header><p>Deterministic local practice</p><h2>{challenge.title}</h2><p>{challenge.objective}</p></header><label>Practice solution<textarea aria-label="Practice solution" value={solution} onChange={(event)=>setSolution(event.target.value)} /></label><div className="regex-lesson-actions"><button type="button" onClick={check}>Check practice</button><button type="button" onClick={next}>Next challenge</button></div><p className="regex-hint">Hint: {challenge.hint}</p>{status?<div className={status.complete?'regex-complete':'regex-incomplete'}>{status.error??(status.complete?'Practice challenge complete.':`${status.cases.filter((item)=>item.passed).length}/${status.cases.length} cases pass`)}</div>:null}<ul className="regex-case-list">{challenge.cases.map((item)=><li key={item.value}><code>{item.value}</code><span>{item.shouldMatch?'must match':'must not match'}</span></li>)}</ul></article>;
};
export default RegexPracticeLab;

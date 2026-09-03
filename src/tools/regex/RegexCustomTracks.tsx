import { useEffect, useState } from 'react';
import { downloadText } from '../../lib/download';
import { decodeCustomTrackPackage, encodeCustomTrackPackage, parseCustomTrackPackage, serializeCustomTrackPackage, type RegexCustomTrackPackage } from './regex-custom-track';
import { loadRegexMatrixValue, saveRegexMatrixValue } from './regex-persistence';
import type { AcademyLesson } from './regex-types';

interface Props { readonly onOpenLesson: (lesson: AcademyLesson) => void; readonly initialEncodedTrack?: string | null; }
const SAMPLE = JSON.stringify({ schemaVersion:1, track:{ id:'my-track', title:'My Regex Track', lessons:[{ id:'first-lesson', title:'First lesson', objective:'Match one or more digits.', guide:'Use anchors when the whole value must match.', starter:'^\\d+$', flags:'', hint:'Try \d+ with anchors.', cases:[{ value:'123', shouldMatch:true },{ value:'12a', shouldMatch:false }] }] } },null,2);
const upsertTrack=(items:readonly RegexCustomTrackPackage[],next:RegexCustomTrackPackage)=>[next,...items.filter((item)=>item.track.id!==next.track.id)].slice(0,20);

const RegexCustomTracks = ({ onOpenLesson, initialEncodedTrack }: Props) => {
  const [source,setSource]=useState(SAMPLE);
  const [tracks,setTracks]=useState<RegexCustomTrackPackage[]>([]);
  const [message,setMessage]=useState('Custom tracks stay in this browser unless you export or share them.');
  useEffect(()=>{ void loadRegexMatrixValue<RegexCustomTrackPackage[]>('custom-tracks').then((stored)=>{ let next=(stored??[]).slice(0,20); if(initialEncodedTrack){try{next=upsertTrack(next,decodeCustomTrackPackage(initialEncodedTrack));setMessage('Shared custom track imported locally.');}catch(error){setMessage(error instanceof Error?error.message:String(error));}} setTracks(next); if(initialEncodedTrack) void saveRegexMatrixValue('custom-tracks',next);}); },[initialEncodedTrack]);
  const persist=(next:RegexCustomTrackPackage[])=>{setTracks(next);void saveRegexMatrixValue('custom-tracks',next);};
  const importTrack=()=>{try{const parsed=parseCustomTrackPackage(source);persist(upsertTrack(tracks,parsed));setMessage(`Imported “${parsed.track.title}” locally.`);}catch(error){setMessage(error instanceof Error?error.message:String(error));}};
  const exportTrack=(item:RegexCustomTrackPackage)=>downloadText(serializeCustomTrackPackage(item),`regex-matrix-track-${item.track.id}.json`,'application/json;charset=utf-8');
  const copyShare=async(item:RegexCustomTrackPackage)=>{const url=`${window.location.origin}${window.location.pathname}#/regex-matrix?track=${encodeCustomTrackPackage(item)}`;try{await navigator.clipboard.writeText(url);setMessage(`Copied a zero-backend share link for “${item.track.title}”.`);}catch{setMessage('Clipboard access is unavailable. Export the JSON package instead.');}};
  return <article className="regex-custom-tracks" data-testid="custom-track-library"><header><p>Local curriculum packages</p><h2>Custom Tracks</h2><p>Author or paste versioned JSON. Imports are validated and capped before they are stored on this device.</p></header><label>Custom track JSON<textarea aria-label="Custom track JSON" value={source} onChange={(event)=>setSource(event.target.value)} spellCheck={false} /></label><div className="regex-lesson-actions"><button type="button" onClick={importTrack}>Import custom track</button></div><p role="status" className="regex-hint">{message}</p><div className="regex-custom-track-list">{tracks.length?tracks.map((item)=><section key={item.track.id}><div className="regex-pane-heading"><div><small>{item.track.lessons.length} lesson{item.track.lessons.length===1?'':'s'}</small><h3>{item.track.title}</h3></div><div className="regex-lesson-actions"><button type="button" onClick={()=>exportTrack(item)}>{`Export ${item.track.title}`}</button><button type="button" onClick={()=>void copyShare(item)}>Copy share link</button></div></div>{item.track.lessons.map((lesson)=><article key={lesson.id} className="regex-custom-lesson"><div><strong>{lesson.title}</strong><p>{lesson.objective}</p><small>{lesson.cases.length} validation cases</small></div><button type="button" aria-label={`Open custom lesson ${lesson.title}`} onClick={()=>onOpenLesson(lesson)}>Open in Studio</button></article>)}</section>):<p className="regex-empty">No custom tracks imported yet.</p>}</div></article>;
};
export default RegexCustomTracks;

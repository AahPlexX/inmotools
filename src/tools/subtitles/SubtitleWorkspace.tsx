import { useMemo, useState } from 'react';
import { downloadText } from '../../lib/download';
import { applyLinearCorrection, parseSubtitle, serializeSubtitle } from './subtitle-engine';

const SAMPLE = `1\n00:00:00,000 --> 00:00:02,000\nFirst line\n\n2\n00:01:40,000 --> 00:01:42,000\nLast line\n`;

export default function SubtitleWorkspace() {
  const [text, setText] = useState(SAMPLE);
  const [sourceStart, setSourceStart] = useState(0); const [correctedStart, setCorrectedStart] = useState(0);
  const [sourceEnd, setSourceEnd] = useState(100000); const [correctedEnd, setCorrectedEnd] = useState(100000);
  const [status, setStatus] = useState('Set two trusted anchors, then apply the linear correction.');
  const parsed = useMemo(() => { try { return parseSubtitle(text); } catch { return null; } }, [text]);

  async function loadFile(next: File | null) {
    if (!next) return;
    try {
      setText(await next.text());
      setStatus(`Loaded ${next.name} locally.`);
    } catch (error) { setStatus(`Could not read that file: ${error instanceof Error ? error.message : 'unknown error'}`); }
  }

  function correctAndDownload() {
    try {
      const input = parseSubtitle(text);
      const cues = applyLinearCorrection(input.cues, {sourceStartMs:sourceStart, correctedStartMs:correctedStart, sourceEndMs:sourceEnd, correctedEndMs:correctedEnd});
      const output = serializeSubtitle({...input, cues});
      setText(output);
      downloadText(output, `corrected.${input.format}`, input.format === 'vtt' ? 'text/vtt' : 'application/x-subrip');
      setStatus(`Corrected ${cues.length} cues and downloaded the ${input.format.toUpperCase()} file.`);
    } catch (error) { setStatus(`Correction failed: ${error instanceof Error ? error.message : 'unknown error'}`); }
  }

  return <><div className="workspace-header"><div><h2>Two-anchor correction</h2><p>All cue timestamps use the same calculated slope and offset.</p></div></div><div className="workspace-body">
    <div className="field"><label htmlFor="subtitle-file">Choose subtitle file (optional)</label><input id="subtitle-file" type="file" accept=".srt,.vtt,application/x-subrip,text/vtt,text/plain" onChange={(event) => { void loadFile(event.target.files?.[0] ?? null); event.target.value = ''; }} /></div>
    <div className="field" style={{marginTop:16}}><label htmlFor="subtitle-text">Subtitle file contents</label><textarea id="subtitle-text" value={text} onChange={(event)=>setText(event.target.value)} /><small>{parsed ? `${parsed.cues.length} cues detected · ${parsed.format.toUpperCase()}` : 'Check subtitle syntax.'}</small></div>
    <div className="workspace-grid" style={{marginTop:18}}><div><strong className="field-label">Early anchor</strong><div className="workspace-grid"><div className="field"><label htmlFor="src-start">Source ms</label><input id="src-start" type="number" value={sourceStart} onChange={(e)=>setSourceStart(Number(e.target.value))}/></div><div className="field"><label htmlFor="dst-start">Correct ms</label><input id="dst-start" type="number" value={correctedStart} onChange={(e)=>setCorrectedStart(Number(e.target.value))}/></div></div></div><div><strong className="field-label">Late anchor</strong><div className="workspace-grid"><div className="field"><label htmlFor="src-end">Source ms</label><input id="src-end" type="number" value={sourceEnd} onChange={(e)=>setSourceEnd(Number(e.target.value))}/></div><div className="field"><label htmlFor="dst-end">Correct ms</label><input id="dst-end" type="number" value={correctedEnd} onChange={(e)=>setCorrectedEnd(Number(e.target.value))}/></div></div></div></div>
    <div className="button-row"><button className="action-button" type="button" onClick={correctAndDownload}>Correct and download</button></div><div className="status-line" role="status">{status}</div>
  </div></>;
}

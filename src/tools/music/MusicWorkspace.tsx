import { useEffect, useRef, useState } from 'react';
import { downloadBytes } from '../../lib/download';
import { buildChord, buildMidiBytes, tryBuildChord, validateProgression, voiceLeadingDistance, type ChordSpec } from './music-engine';

const START: ChordSpec[] = [
  { root: 'C4', quality: 'major', inversion: 0, beats: 4 },
  { root: 'F4', quality: 'major', inversion: 1, beats: 4 },
  { root: 'G4', quality: 'major', inversion: 1, beats: 4 },
  { root: 'C4', quality: 'major', inversion: 0, beats: 4 },
];

type ScheduledGraph = { context: AudioContext; sources: OscillatorNode[]; nodes: AudioNode[] };

export default function MusicWorkspace() {
  const [chords, setChords] = useState<ChordSpec[]>(START);
  const [bpm, setBpm] = useState(120);
  const [status, setStatus] = useState('Adjust inversions to reduce large jumps between neighboring voicings.');
  const graphRef = useRef<ScheduledGraph | null>(null);
  const timerRef = useRef<number | null>(null);
  const [playing, setPlaying] = useState(false);

  function update(index: number, patch: Partial<ChordSpec>) {
    setChords((current) => current.map((chord, chordIndex) => chordIndex === index ? { ...chord, ...patch } : chord));
  }

  function stopPlayback(report = true) {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const graph = graphRef.current;
    graphRef.current = null;
    if (graph) {
      for (const source of graph.sources) {
        try { source.stop(); } catch { /* already stopped */ }
      }
      for (const node of graph.nodes) {
        try { node.disconnect(); } catch { /* already disconnected */ }
      }
      void graph.context.close().catch(() => undefined);
    }
    setPlaying(false);
    if (report) setStatus('Playback stopped and the audio graph was released.');
  }

  useEffect(() => () => stopPlayback(false), []);

  async function play() {
    const errors = validateProgression(chords, bpm);
    if (errors.length) {
      setStatus(errors[0]);
      return;
    }
    stopPlayback(false);
    const context = new AudioContext();
    await context.resume();
    const graph: ScheduledGraph = { context, sources: [], nodes: [] };
    graphRef.current = graph;
    setPlaying(true);
    let time = context.currentTime + 0.05;
    for (const chord of chords) {
      const seconds = (60 / bpm) * (chord.beats ?? 4);
      for (const midi of buildChord(chord)) {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.frequency.value = 440 * Math.pow(2, (midi - 69) / 12);
        oscillator.type = 'triangle';
        gain.gain.setValueAtTime(0.0001, time);
        gain.gain.exponentialRampToValueAtTime(0.055, time + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, time + Math.max(0.08, seconds - 0.03));
        oscillator.connect(gain).connect(context.destination);
        oscillator.start(time);
        oscillator.stop(time + seconds);
        graph.sources.push(oscillator);
        graph.nodes.push(oscillator, gain);
      }
      time += seconds;
    }
    setStatus('Progression is playing through the browser Web Audio engine.');
    const total = chords.reduce((sum, chord) => sum + (60 / bpm) * (chord.beats ?? 4), 0);
    timerRef.current = window.setTimeout(() => {
      if (graphRef.current === graph) {
        stopPlayback(false);
        setStatus('Playback complete and the audio graph was released.');
      }
    }, (total + 0.15) * 1000);
  }

  function addChord() {
    setChords((current) => [...current, { ...(current[current.length - 1] ?? START[0]) }]);
  }

  function removeChord(index: number) {
    setChords((current) => current.length > 1 ? current.filter((_, chordIndex) => chordIndex !== index) : current);
  }

  function moveChord(index: number, delta: number) {
    setChords((current) => {
      const next = [...current];
      const target = index + delta;
      if (target < 0 || target >= next.length) return current;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  function exportMidi() {
    const errors = validateProgression(chords, bpm);
    if (errors.length) {
      setStatus(errors[0]);
      return;
    }
    const bytes = buildMidiBytes(chords, bpm);
    downloadBytes(bytes, 'inmotools-progression.mid', 'audio/midi');
    setStatus('Standard MIDI file created locally and sent to your downloads.');
  }

  return <>
    <div className="workspace-header"><div><h2>Harmony and voice-leading lab</h2><p>Web Audio handles auditioning; MIDI export stays binary and local.</p></div></div>
    <div className="workspace-body">
      <div className="field" style={{ maxWidth: 220 }}><label htmlFor="bpm">Tempo (BPM)</label><input id="bpm" type="number" min="30" max="300" value={bpm} onChange={(event) => setBpm(Number(event.target.value))} aria-invalid={!Number.isFinite(bpm) || bpm < 30 || bpm > 300} /><small>30–300 BPM.</small></div>
      <div className="workspace-grid" style={{ marginTop: 18 }}>
        {chords.map((chord, index) => {
          const notes = tryBuildChord(chord);
          const movement = index > 0 ? voiceLeadingDistance(chords[index - 1], chord) : null;
          return <div className="notice" key={index}>
            <strong>Chord {index + 1}</strong>
            <div className="workspace-grid" style={{ marginTop: 10 }}>
              <div className="field"><label htmlFor={`root-${index}`}>Root</label><input id={`root-${index}`} type="text" value={chord.root} onChange={(event) => update(index, { root: event.target.value })} aria-invalid={!notes} /></div>
              <div className="field"><label htmlFor={`quality-${index}`}>Quality</label><select id={`quality-${index}`} value={chord.quality} onChange={(event) => update(index, { quality: event.target.value as ChordSpec['quality'] })}><option value="major">Major</option><option value="minor">Minor</option><option value="diminished">Diminished</option><option value="sus2">Sus2</option><option value="sus4">Sus4</option></select></div>
              <div className="field"><label htmlFor={`inv-${index}`}>Inversion</label><select id={`inv-${index}`} value={chord.inversion} onChange={(event) => update(index, { inversion: Number(event.target.value) })}><option value="0">Root</option><option value="1">First</option><option value="2">Second</option></select></div>
              <div className="field"><label htmlFor={`beats-${index}`}>Beats</label><input id={`beats-${index}`} type="number" min="0.25" max="64" step="0.25" value={chord.beats} onChange={(event) => update(index, { beats: Number(event.target.value) })} aria-invalid={!Number.isFinite(chord.beats) || (chord.beats ?? 0) <= 0 || (chord.beats ?? 0) > 64} /></div>
            </div>
            <div className="button-row" style={{ marginTop: 10 }}><button className="action-button secondary" type="button" onClick={() => moveChord(index, -1)} disabled={index === 0} aria-label={`Move chord ${index + 1} earlier`}>←</button><button className="action-button secondary" type="button" onClick={() => moveChord(index, 1)} disabled={index === chords.length - 1} aria-label={`Move chord ${index + 1} later`}>→</button><button className="action-button secondary" type="button" onClick={() => removeChord(index)} disabled={chords.length === 1} aria-label={`Remove chord ${index + 1}`}>Remove</button></div>
            <div className="help-text" data-testid={`chord-notes-${index}`}>{notes ? `MIDI notes: ${notes.join(' · ')}${movement === null ? '' : ` · movement from prior chord: ${movement} semitones`}` : `Enter a MIDI-range root/voicing such as C4. “${chord.root}” cannot produce a valid 0–127 MIDI triad.`}</div>
          </div>;
        })}
      </div>
      <div className="button-row"><button className="action-button" type="button" onClick={() => void play()} disabled={playing}>Play progression</button><button className="action-button secondary" type="button" onClick={() => stopPlayback()} disabled={!playing} data-testid="midi-stop">Stop</button><button className="action-button secondary" type="button" onClick={addChord} data-testid="midi-add-chord">Add chord</button><button className="action-button secondary" type="button" onClick={exportMidi}>Export MIDI</button></div>
      <div className="status-line" role="status">{status}</div>
    </div>
  </>;
}

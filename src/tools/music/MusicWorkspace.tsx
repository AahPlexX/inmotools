import { useEffect, useRef, useState } from 'react';
import { downloadBytes, downloadText } from '../../lib/download';
import { consumeFileInput } from '../../lib/file-input';
import {
  buildChord,
  buildMidiBytes,
  parseProgressionJson,
  serializeProgression,
  tryBuildChord,
  validateProgression,
  voiceLeadingDistance,
  type ChordSpec,
} from './music-engine';

const START: ChordSpec[] = [
  { root: 'C4', quality: 'major', inversion: 0, beats: 4 },
  { root: 'F4', quality: 'major', inversion: 1, beats: 4 },
  { root: 'G4', quality: 'major', inversion: 1, beats: 4 },
  { root: 'C4', quality: 'major', inversion: 0, beats: 4 },
];

type PlaybackState = 'idle' | 'starting' | 'playing';
type ActiveChord = { index: number; chord: ChordSpec };
type ScheduledGraph = {
  session: number;
  context: AudioContext;
  sources: OscillatorNode[];
  gains: GainNode[];
  timers: number[];
  snapshot: ChordSpec[];
  bpm: number;
  loop: boolean;
};

const messageOf = (error: unknown) => error instanceof Error ? error.message : String(error || 'unknown error');

export default function MusicWorkspace() {
  const [chords, setChords] = useState<ChordSpec[]>(START);
  const [bpm, setBpm] = useState(120);
  const [status, setStatus] = useState('Adjust inversions to reduce large jumps between neighboring voicings.');
  const [playbackState, setPlaybackState] = useState<PlaybackState>('idle');
  const [activeChord, setActiveChord] = useState<ActiveChord | null>(null);
  const [loopAudition, setLoopAudition] = useState(false);
  const graphRef = useRef<ScheduledGraph | null>(null);
  const sessionRef = useRef(0);
  const mountedRef = useRef(true);

  function update(index: number, patch: Partial<ChordSpec>) {
    setChords((current) => current.map((chord, chordIndex) => chordIndex === index ? { ...chord, ...patch } : chord));
  }

  function clearCycleResources(graph: ScheduledGraph) {
    for (const timer of graph.timers) window.clearTimeout(timer);
    graph.timers = [];
    for (const source of graph.sources) {
      try { source.stop(); } catch { /* source may already have ended */ }
      try { source.disconnect(); } catch { /* already disconnected */ }
    }
    for (const gain of graph.gains) {
      try { gain.disconnect(); } catch { /* already disconnected */ }
    }
    graph.sources = [];
    graph.gains = [];
  }

  function closeContext(context: AudioContext) {
    if (context.state === 'closed') return;
    void context.close().catch(() => undefined);
  }

  function releaseGraph(graph: ScheduledGraph) {
    clearCycleResources(graph);
    closeContext(graph.context);
  }

  function stopPlayback(report = true) {
    sessionRef.current += 1;
    const graph = graphRef.current;
    graphRef.current = null;
    if (graph) releaseGraph(graph);
    if (mountedRef.current) {
      setPlaybackState('idle');
      setActiveChord(null);
      if (report) setStatus('Playback stopped and the audio graph was released.');
    }
  }

  useEffect(() => () => {
    mountedRef.current = false;
    stopPlayback(false);
  }, []);

  function scheduleCycle(graph: ScheduledGraph) {
    if (graphRef.current !== graph || sessionRef.current !== graph.session) return;
    clearCycleResources(graph);

    let audioTime = graph.context.currentTime + 0.05;
    let elapsed = 0;
    graph.snapshot.forEach((chord, index) => {
      const startOffset = elapsed;
      const seconds = (60 / graph.bpm) * (chord.beats ?? 4);
      const snapshotChord = { ...chord };
      if (index === 0) {
        if (mountedRef.current) setActiveChord({ index, chord: snapshotChord });
      } else {
        graph.timers.push(window.setTimeout(() => {
          if (mountedRef.current && graphRef.current === graph && sessionRef.current === graph.session) setActiveChord({ index, chord: snapshotChord });
        }, (startOffset + 0.05) * 1000));
      }

      for (const midi of buildChord(chord)) {
        const oscillator = graph.context.createOscillator();
        const gain = graph.context.createGain();
        oscillator.frequency.value = 440 * Math.pow(2, (midi - 69) / 12);
        oscillator.type = 'triangle';
        gain.gain.setValueAtTime(0.0001, audioTime);
        gain.gain.exponentialRampToValueAtTime(0.055, audioTime + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, audioTime + Math.max(0.08, seconds - 0.03));
        oscillator.connect(gain).connect(graph.context.destination);
        oscillator.start(audioTime);
        oscillator.stop(audioTime + seconds);
        graph.sources.push(oscillator);
        graph.gains.push(gain);
      }
      audioTime += seconds;
      elapsed += seconds;
    });

    graph.timers.push(window.setTimeout(() => {
      if (graphRef.current !== graph || sessionRef.current !== graph.session) return;
      if (graph.loop) {
        if (mountedRef.current) setStatus('Looping the audition snapshot. Edits remain queued for the next audition.');
        scheduleCycle(graph);
      } else {
        stopPlayback(false);
        if (mountedRef.current) setStatus('Playback complete and the audio graph was released.');
      }
    }, (elapsed + 0.12) * 1000));
  }

  async function play() {
    const errors = validateProgression(chords, bpm);
    if (errors.length) {
      setStatus(errors[0]);
      return;
    }

    stopPlayback(false);
    const session = sessionRef.current + 1;
    sessionRef.current = session;
    const snapshot = chords.map((chord) => ({ ...chord }));
    setPlaybackState('starting');
    setActiveChord(null);
    setStatus('Starting audio and acquiring the browser audio context…');

    let context: AudioContext;
    try {
      context = new AudioContext();
    } catch (error) {
      if (mountedRef.current && sessionRef.current === session) {
        setPlaybackState('idle');
        setStatus(`Audio playback failed: ${messageOf(error)}`);
      }
      return;
    }

    const graph: ScheduledGraph = {
      session,
      context,
      sources: [],
      gains: [],
      timers: [],
      snapshot,
      bpm,
      loop: loopAudition,
    };
    // Own the context before awaiting resume(). Stop/unmount can now close it
    // even while browser permission/hardware startup is still pending.
    graphRef.current = graph;

    try {
      await context.resume();
      if (graphRef.current !== graph || sessionRef.current !== session) {
        closeContext(context);
        return;
      }
      scheduleCycle(graph);
      if (mountedRef.current) {
        setPlaybackState('playing');
        setStatus(graph.loop ? 'Progression snapshot is looping through the browser Web Audio engine.' : 'Progression snapshot is playing through the browser Web Audio engine.');
      }
    } catch (error) {
      if (graphRef.current !== graph || sessionRef.current !== session) {
        closeContext(context);
        return;
      }
      graphRef.current = null;
      sessionRef.current += 1;
      releaseGraph(graph);
      if (mountedRef.current) {
        setPlaybackState('idle');
        setActiveChord(null);
        setStatus(`Audio playback failed: ${messageOf(error)}`);
      }
    }
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

  function saveProgressionJson() {
    try {
      downloadText(serializeProgression(chords, bpm), 'inmotools-progression.json', 'application/json;charset=utf-8');
      setStatus('Versioned progression JSON created locally and sent to your downloads.');
    } catch (error) {
      setStatus(`Could not save progression JSON: ${messageOf(error)}`);
    }
  }

  async function loadProgressionJson(file: File) {
    try {
      const document = parseProgressionJson(await file.text());
      setChords(document.chords);
      setBpm(document.bpm);
      setStatus(`Loaded ${document.chords.length} chord${document.chords.length === 1 ? '' : 's'} from ${file.name}. If an audition is active, the imported progression applies to the next audition.`);
    } catch (error) {
      setStatus(`Could not load progression JSON: ${messageOf(error)}`);
    }
  }

  const auditioning = playbackState !== 'idle';

  return <>
    <div className="workspace-header"><div><h2>Harmony and voice-leading lab</h2><p>Web Audio handles auditioning; MIDI and progression exports stay local.</p></div></div>
    <div className="workspace-body">
      <div className="workspace-grid">
        <div className="field"><label htmlFor="bpm">Tempo (BPM)</label><input id="bpm" type="number" min="30" max="300" value={bpm} onChange={(event) => setBpm(Number(event.target.value))} aria-invalid={!Number.isFinite(bpm) || bpm < 30 || bpm > 300} /><small>30–300 BPM.</small></div>
        <div className="field"><label style={{ display: 'flex', gap: 10, alignItems: 'center' }}><input type="checkbox" checked={loopAudition} disabled={auditioning} onChange={(event) => setLoopAudition(event.target.checked)} /> Loop audition</label><small>Loop choice is captured when Play starts and remains fixed for that audition.</small></div>
        <div className="field"><label htmlFor="midi-json-import">Load progression JSON</label><input id="midi-json-import" type="file" accept="application/json,.json" onChange={(event) => { const input = event.currentTarget; const file = input.files?.[0]; consumeFileInput(input, () => file ? loadProgressionJson(file) : undefined); }} /><small>Loads the versioned local progression format and validates every chord before applying it.</small></div>
      </div>

      <div className="notice" style={{ marginTop: 14 }}><strong>Audition snapshot behavior</strong><p className="help-text">Edits made during playback apply to the next audition. The current audition—including each loop cycle—continues from the validated chord and tempo snapshot captured when you pressed Play.</p></div>
      <div className="notice" data-testid="midi-active-chord" aria-live="polite" style={{ marginTop: 12 }}><strong>Active audition chord</strong><p className="help-text">{activeChord ? `Chord ${activeChord.index + 1}: ${activeChord.chord.root} ${activeChord.chord.quality}` : playbackState === 'starting' ? 'Preparing the audition snapshot…' : 'No chord is currently being auditioned.'}</p></div>

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
      <div className="button-row"><button className="action-button" type="button" onClick={() => void play()} disabled={auditioning}>Play progression</button><button className="action-button secondary" type="button" onClick={() => stopPlayback()} disabled={!auditioning} data-testid="midi-stop">Stop</button><button className="action-button secondary" type="button" onClick={addChord} data-testid="midi-add-chord">Add chord</button><button className="action-button secondary" type="button" onClick={exportMidi}>Export MIDI</button><button className="action-button secondary" type="button" onClick={saveProgressionJson}>Save progression JSON</button></div>
      <div className="status-line" role="status">{status}</div>
    </div>
  </>;
}

import { Midi } from '@tonejs/midi';

export interface ChordSpec { root: string; quality: 'major' | 'minor' | 'diminished' | 'sus2' | 'sus4'; inversion: number; beats?: number }

const NOTE_INDEX: Record<string, number> = { C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11 };
const INTERVALS: Record<ChordSpec['quality'], number[]> = { major: [0,4,7], minor: [0,3,7], diminished: [0,3,6], sus2: [0,2,7], sus4: [0,5,7] };

function noteToMidi(note: string): number {
  const match = /^([A-G](?:#|b)?)(-?\d+)$/.exec(note);
  if (!match || NOTE_INDEX[match[1]] === undefined) throw new Error(`Invalid note: ${note}`);
  return (Number(match[2]) + 1) * 12 + NOTE_INDEX[match[1]];
}

export function buildChord(spec: ChordSpec): number[] {
  const root = noteToMidi(spec.root);
  const notes = INTERVALS[spec.quality].map((interval) => root + interval);
  const inversion = ((spec.inversion % notes.length) + notes.length) % notes.length;
  for (let i = 0; i < inversion; i += 1) notes.push(notes.shift()! + 12);
  return notes;
}

export function buildMidiBytes(progression: ChordSpec[], bpm = 120): Uint8Array {
  const midi = new Midi();
  midi.header.setTempo(bpm);
  const track = midi.addTrack();
  let beat = 0;
  for (const chord of progression) {
    const beats = chord.beats ?? 4;
    for (const note of buildChord(chord)) track.addNote({ midi: note, ticks: beat * midi.header.ppq, durationTicks: beats * midi.header.ppq, velocity: 0.8 });
    beat += beats;
  }
  return midi.toArray();
}

import { Midi } from '@tonejs/midi';

export interface ChordSpec { root: string; quality: 'major' | 'minor' | 'diminished' | 'sus2' | 'sus4'; inversion: number; beats?: number }

const NOTE_INDEX: Record<string, number> = { C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11 };
const INTERVALS: Record<ChordSpec['quality'], number[]> = { major: [0, 4, 7], minor: [0, 3, 7], diminished: [0, 3, 6], sus2: [0, 2, 7], sus4: [0, 5, 7] };

function noteToMidi(note: string): number {
  const match = /^([A-G](?:#|b)?)(-?\d+)$/.exec(note.trim());
  if (!match || NOTE_INDEX[match[1]] === undefined) throw new Error(`Invalid note: ${note}`);
  const midi = (Number(match[2]) + 1) * 12 + NOTE_INDEX[match[1]];
  if (!Number.isInteger(midi) || midi < 0 || midi > 127) throw new Error(`Note ${note.trim()} is outside the MIDI 1.0 note range (0–127).`);
  return midi;
}

export function isValidNote(note: string): boolean {
  try {
    noteToMidi(note);
    return true;
  } catch {
    return false;
  }
}

export function tryBuildChord(spec: ChordSpec): number[] | null {
  try {
    return buildChord(spec);
  } catch {
    return null;
  }
}

export function buildChord(spec: ChordSpec): number[] {
  const root = noteToMidi(spec.root);
  const intervals = INTERVALS[spec.quality];
  if (!intervals) throw new Error(`Unsupported chord quality: ${String(spec.quality)}`);
  const notes = intervals.map((interval) => root + interval);
  const inversion = ((Math.trunc(spec.inversion) % notes.length) + notes.length) % notes.length;
  for (let index = 0; index < inversion; index += 1) notes.push(notes.shift()! + 12);
  if (notes.some((note) => note < 0 || note > 127)) throw new Error(`The ${spec.root.trim()} ${spec.quality} voicing exceeds the MIDI 1.0 note range (0–127). Lower the root or inversion.`);
  return notes;
}

export function validateProgression(progression: ChordSpec[], bpm: number): string[] {
  const errors: string[] = [];
  if (!Number.isFinite(bpm) || bpm < 30 || bpm > 300) errors.push('Tempo must be between 30 and 300 BPM.');
  if (!progression.length) errors.push('Add at least one chord.');
  progression.forEach((chord, index) => {
    if (!tryBuildChord(chord)) errors.push(`Chord ${index + 1} has an invalid or out-of-range voicing.`);
    const beats = chord.beats ?? 4;
    if (!Number.isFinite(beats) || beats <= 0 || beats > 64) errors.push(`Chord ${index + 1} duration must be greater than 0 and no more than 64 beats.`);
  });
  return errors;
}

export function voiceLeadingDistance(first: ChordSpec, second: ChordSpec): number | null {
  const a = tryBuildChord(first);
  const b = tryBuildChord(second);
  if (!a || !b || a.length !== b.length) return null;
  return a.reduce((sum, note, index) => sum + Math.abs(note - b[index]), 0);
}

export function buildMidiBytes(progression: ChordSpec[], bpm = 120): Uint8Array {
  const errors = validateProgression(progression, bpm);
  if (errors.length) throw new Error(errors.join(' '));
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

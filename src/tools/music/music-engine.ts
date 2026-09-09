import { Midi } from '@tonejs/midi';

export interface ChordSpec { root: string; quality: 'major' | 'minor' | 'diminished' | 'sus2' | 'sus4'; inversion: number; beats?: number }
export interface ProgressionDocument { version: 1; bpm: number; chords: ChordSpec[] }

const NOTE_INDEX: Record<string, number> = { C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11 };
const INTERVALS: Record<ChordSpec['quality'], number[]> = { major: [0, 4, 7], minor: [0, 3, 7], diminished: [0, 3, 6], sus2: [0, 2, 7], sus4: [0, 5, 7] };
const QUALITY_SET = new Set<ChordSpec['quality']>(['major', 'minor', 'diminished', 'sus2', 'sus4']);

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

function isChordDocument(value: unknown): value is ChordSpec {
  if (!value || typeof value !== 'object') return false;
  const chord = value as Record<string, unknown>;
  return typeof chord.root === 'string'
    && typeof chord.quality === 'string'
    && QUALITY_SET.has(chord.quality as ChordSpec['quality'])
    && typeof chord.inversion === 'number'
    && Number.isInteger(chord.inversion)
    && (chord.beats === undefined || (typeof chord.beats === 'number' && Number.isFinite(chord.beats)));
}

export function serializeProgression(chords: ChordSpec[], bpm: number): string {
  const errors = validateProgression(chords, bpm);
  if (errors.length) throw new Error(errors.join(' '));
  const document: ProgressionDocument = {
    version: 1,
    bpm,
    chords: chords.map((chord) => ({ ...chord })),
  };
  return JSON.stringify(document, null, 2);
}

export function parseProgressionJson(text: string): ProgressionDocument {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('Progression file is not valid JSON.');
  }
  if (!parsed || typeof parsed !== 'object') throw new Error('Progression JSON must contain an object.');
  const document = parsed as Record<string, unknown>;
  if (document.version !== 1) throw new Error(`Unsupported progression JSON version: ${String(document.version ?? 'missing')}. Expected version 1.`);
  if (typeof document.bpm !== 'number' || !Number.isFinite(document.bpm)) throw new Error('Progression JSON must contain a numeric BPM value.');
  if (!Array.isArray(document.chords)) throw new Error('Progression JSON must contain a chords array.');
  if (!document.chords.every(isChordDocument)) throw new Error('Progression JSON contains a malformed chord.');

  const chords = document.chords.map((chord) => ({ ...chord }));
  const errors = validateProgression(chords, document.bpm);
  if (errors.length) throw new Error(errors.join(' '));
  return { version: 1, bpm: document.bpm, chords };
}

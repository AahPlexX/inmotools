import type { ToolMeta } from '../../tool-meta';

export default {
  slug: "midi-harmony-lab",
  category: "audio",
  shortTitle: "MIDI Harmony Lab",
  title: "Web Audio Harmonic Progression & Voice-Leading MIDI Lab",
  audience: "Music producers · beatmakers · theory students",
  summary: "Build chord progressions, audition browser-synth voicings, compare note movement, and export standard MIDI.",
  privacy: "Chord generation, playback, and MIDI encoding happen on this device.",
  accepts: "Chord roots, qualities, inversions, beat lengths, and tempo",
  outputs: "Playable progression and downloadable MIDI file",
  steps: [
    "Build a progression from chord controls.",
    "Audition voicings and adjust inversions.",
    "Export the progression as a MIDI file for your DAW.",
  ],
  hint: "Use inversions to reduce large jumps between neighboring chords; smoother note movement usually transfers better to arranged parts.",
  load: () => import('./HarmonyWorkspace'),
} satisfies ToolMeta;

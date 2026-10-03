import type { ToolMeta } from '../../tool-meta';

export default {
  slug: "audio-mastering",
  category: "audio",
  shortTitle: "Audio Mastering",
  title: "Audio Editor, Restoration & Mastering Workstation with Loudness Metering",
  audience: "Musicians · podcasters · sound designers · mastering engineers",
  summary: "Cut, arrange, repair, and master recordings on a multitrack timeline, then check them against BS.1770 loudness, true peak, and a reference track while you listen.",
  privacy: "Decoding, editing, restoration, mastering, and metering run in this browser. Your audio never leaves the device.",
  accepts: "WAV, MP3, FLAC, Ogg, Opus, M4A/AAC, AIFF, and other audio your browser can decode",
  outputs: "Edited, restored, and mastered audio with loudness, true-peak, and spectrum readings",
  steps: [
    "Open one or more recordings. Each becomes a clip you can trim, move, and fade on its own track.",
    "Edit, arrange, and repair: cut and splice, stretch or shift pitch, remove clicks, hum, and noise, or paint out a sound on the spectrogram.",
    "Build the master chain and play it back live, comparing against the original or a reference track with loudness-matched switching.",
  ],
  hint: "Every edit can be undone and your source files are never changed. Long multitrack sessions use more browser memory, so split very long projects into shorter working sets.",
  load: () => import('./MusicWorkspace'),
} satisfies ToolMeta;

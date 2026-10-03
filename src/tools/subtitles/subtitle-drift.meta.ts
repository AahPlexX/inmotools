import type { ToolMeta } from '../../tool-meta';

export default {
  slug: "subtitle-drift",
  category: "media",
  shortTitle: "Subtitle Drift",
  title: "Linear Subtitle Time-Drift Corrector & Waveform Re-Aligner",
  audience: "Video editors · translators · creators",
  summary: "Correct both a fixed offset and gradual timing drift using two trusted synchronization anchors.",
  privacy: "Subtitle text is parsed and transformed locally in your browser. No captions are sent anywhere.",
  accepts: "SRT and WebVTT text",
  outputs: "Corrected SRT or VTT with preserved cue text",
  steps: [
    "Load or paste subtitles.",
    "Enter the source and correct time for an early cue.",
    "Enter the source and correct time for a late cue, then export.",
  ],
  hint: "Use anchors as far apart as practical. A wider anchor span makes frame-rate drift correction more reliable.",
  load: () => import('./SubtitleWorkspace'),
} satisfies ToolMeta;

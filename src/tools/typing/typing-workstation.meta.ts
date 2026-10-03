import type { ToolMeta } from '../../tool-meta';

export default {
  slug: "typing-workstation",
  category: "documents",
  shortTitle: "Typing Workstation",
  title: "Typing Workstation — Speed Calculator, Ergonomic Testing & Adaptive Motor-Skill Training",
  audience: "Kids · general public · court reporters · medical transcriptionists · software engineers · design teams",
  summary: "Measure typing speed with strict WPM/CPM math, drill weak keys with adaptive practice, audition mechanical-switch audio and metronome pacing, and export certificates, keystroke logs, and history CSV/JSON with editable tags.",
  privacy: "Every test, keystroke, drill, dictionary import, theme preference, and personal record is kept in your browser via IndexedDB. Nothing is uploaded and no account is required.",
  accepts: "Live keystrokes plus optional custom text, CSV word lists, and JSON test bundles",
  outputs: "Certificate PDF, CSV/JSON test exports with editable tags, keystroke logs, and Markdown session summaries",
  steps: [
    "Choose a mode (words, code, medical, legal, kids, quote, custom) and a duration or word ceiling.",
    "Type the visible sample; the caret, heatmap, n-gram analytics, and pacer update live.",
    "Save the test locally with tags, or export it as a certificate, CSV, JSON, keystroke log, or Markdown summary.",
  ],
  hint: "The engine uses the browser’s monotonic performance clock for input timing. Keep the typing area focused for comparable results; press F2 for fresh text, Escape to abort, or Tab to move to the next control.",
  workspaceFirst: true,
  load: () => import('./TypingWorkspace'),
} satisfies ToolMeta;

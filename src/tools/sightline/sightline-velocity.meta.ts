import type { ToolMeta } from '../../tool-meta';

export default {
  slug: "sightline-velocity",
  category: "documents",
  shortTitle: "Sightline Velocity Studio",
  title: "Sightline Velocity Studio — Document Reader & Pacing Tools",
  audience: "Students · everyday readers · researchers · legal and academic readers",
  summary: "Open PDF, EPUB, DOCX, Markdown, HTML, RTF, or text files. Read with anchored words, short chunks, a paced page, peripheral columns, or flash drills; adjust the pace and type; keep notes and bookmarks; and export the document when you are done.",
  privacy: "Documents, reading history, notes, and exports stay in this browser. The tool does not upload them.",
  accepts: "PDF, EPUB, DOCX, Markdown, HTML, RTF, and plain text files, pasted text, or dropped files",
  outputs: "Paced reading views, flash and cloze drills, reading history, and PDF, EPUB, HTML, Word, Markdown, text, CSV, and JSON exports",
  steps: [
    "Open, drop, or paste a document and choose a reading view.",
    "Set the pace and type, then add bookmarks, highlights, notes, or words to review as needed.",
    "Check your session history and export the document or reading data when you need a copy.",
  ],
  hint: "Higher reading rates can reduce comprehension. Punctuation pauses and rewind controls stay available so you can slow down or go back when the text needs more attention.",
  load: () => import('./SightlineWorkspace'),
} satisfies ToolMeta;

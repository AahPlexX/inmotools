import type { ToolMeta } from '../../tool-meta';

export default {
  slug: "markdown-workbench",
  category: "documents",
  shortTitle: "Markdown Workbench",
  title: "Markdown Workbench — Write, Preview & Export Markdown",
  audience: "Notes · documentation · research · publishing",
  summary: "Write or paste Markdown and see the result as you work. Add tables, math, diagrams, and citations, then save or export in the format you need.",
  privacy: "Your document and bibliography stay in this browser while you edit, preview, save drafts, and export.",
  accepts: "Markdown or plain-text input, local .md/.markdown/.txt files, local HTML import, and an optional BibTeX or CSL-JSON bibliography",
  outputs: "Markdown, rendered Markdown, Pandoc Markdown, plain text, standalone HTML, print/PDF, DOCX, EPUB, and an optional syntax-tree JSON export",
  steps: [
    "Write, paste, or open Markdown, or import a local HTML file.",
    "Use the live preview, outline, and Markdown help while you edit; add a bibliography only if you need citations.",
    "Save a local draft or choose an export format when the document is ready.",
  ],
  hint: "New to Markdown? Open Markdown help in the editor toolbar for a compact syntax guide and examples.",
  load: () => import('./MarkdownWorkspace'),
} satisfies ToolMeta;

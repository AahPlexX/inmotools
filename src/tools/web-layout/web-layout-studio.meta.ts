import type { ToolMeta } from '../../tool-meta';

export default {
  slug: "web-layout-studio",
  category: "design",
  shortTitle: "Web Layout Studio",
  title: "Web Layout Studio — Responsive Pages & Design Tokens",
  audience: "Learners · creators · frontend teams",
  summary: "Arrange semantic page blocks, compare responsive layouts, tune shared design values, and export portable HTML, CSS, tokens, and project backups.",
  privacy: "Your page content, previews, local drafts, and exports stay in this browser. No project content is uploaded.",
  accepts: "Visual layout controls and local Web Layout Studio JSON projects",
  outputs: "Standalone HTML, responsive CSS, design-token JSON, and editable project JSON",
  steps: [
    "Arrange page blocks and choose a Grid or Flexbox layout.",
    "Compare viewport widths and adjust theme, spacing, and typography.",
    "Review document metadata and download your page or a project backup.",
  ],
  hint: "Viewport previews use the current browser engine. They do not emulate other browsers or certify accessibility.",
  load: () => import('./WebLayoutWorkspace'),
} satisfies ToolMeta;

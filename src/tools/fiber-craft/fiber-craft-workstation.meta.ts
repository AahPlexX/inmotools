import type { ToolMeta } from '../../tool-meta';

export default {
  slug: "fiber-craft-workstation",
  category: "everyday",
  aliases: ["#/fiber-craft-workstation"],
  shortTitle: "Fiber Craft Workstation",
  title: "Fiber Craft Workstation — Crochet Chart Maker & Counted-Thread Pattern Workbench",
  audience: "Crocheters · amigurumi makers · cross-stitchers · pattern designers · teachers",
  summary: "Chart crochet in rounds or on a C2C/filet grid, place any stitch, chart increases and decreases, and watch the written pattern, stitch counts, and finished size update as you work. Counted-thread and knitting charts live here too.",
  privacy: "Your charts, palettes, progress, and drafts stay in this browser. Nothing is uploaded.",
  accepts: "Stitches you place, gauge and yarn details you enter, images for cross-stitch charts, and .craftproj files you saved earlier",
  outputs: "Pattern-book PDF, chart PNG, share card, written pattern (.txt), materials list (.csv), a .craftproj project file, or all of them in one zip",
  steps: [
    "Pick a round chart or a C2C/filet grid for crochet, or switch to a counted-thread or knitting chart.",
    "Click a stitch or use the arrow keys to place stitches. The written pattern, counts, and size update as you go, and Undo is always there.",
    "Add your title and credit, then export a PDF, PNG, text, CSV, or everything at once.",
  ],
  hint: "Crochet terms differ by region, so switch between US and UK names any time without redrawing. For an increase, tick “same base stitch” and it counts as two stitches worked into one.",
  load: () => import('./FiberCraftWorkspace'),
} satisfies ToolMeta;

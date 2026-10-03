import type { ToolMeta } from '../../tool-meta';

export default {
  slug: "svg-sprite-compiler",
  category: "design",
  shortTitle: "SVG Sprite Compiler",
  title: "SVG Sprite Sheet Compiler & Geometry Optimizer",
  audience: "Web performance engineers · frontend developers",
  summary: "Batch-optimize SVG files, normalize color to currentColor when desired, and compile deterministic symbol sprites.",
  privacy: "SVG source text is parsed, optimized, and combined locally in your browser.",
  accepts: "SVG files",
  outputs: "Optimized <symbol> sprite sheet and per-file size savings",
  steps: [
    "Choose SVG files.",
    "Choose whether fills/strokes should inherit currentColor.",
    "Compile, review savings, and download the sprite.",
  ],
  hint: "Review multicolor artwork before enabling currentColor normalization; that option is best for monochrome icon systems.",
  load: () => import('./SvgWorkspace'),
} satisfies ToolMeta;

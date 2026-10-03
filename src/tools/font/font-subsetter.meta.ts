import type { ToolMeta } from '../../tool-meta';

export default {
  slug: "font-subsetter",
  category: "design",
  shortTitle: "Font Subsetter",
  title: "OpenType Glyph Coverage, Unicode Subsetter & WOFF2 Exporter",
  audience: "Frontend developers · type designers · design-system teams",
  summary: "Inspect OpenType naming/metrics and cmap coverage, select Unicode presets or exact custom text, retain .notdef plus required glyphs, generate a new font locally, compress it to WOFF2, and export matching @font-face CSS.",
  privacy: "Font parsing, WOFF2 decompression/compression, glyph selection, reconstruction, and export run entirely in this browser. Font bytes are never uploaded.",
  accepts: "TTF, OTF, WOFF, and WOFF2 fonts supported by the local OpenType parser",
  outputs: "Locally generated WOFF2 subset and matching @font-face CSS snippet",
  steps: [
    "Choose a font and review source metrics and searchable cmap-backed glyph coverage.",
    "Select Unicode presets and/or paste the exact characters your product needs.",
    "Build the subset, review size/glyph counts, then download the WOFF2 file and CSS snippet.",
  ],
  hint: "Subsetting removes unselected character coverage and may not preserve every advanced shaping/table feature of complex fonts. Keep the original and test the subset with the languages and OpenType behaviors your product requires.",
  load: () => import('./FontWorkspace'),
} satisfies ToolMeta;

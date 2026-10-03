import type { ToolMeta } from '../../tool-meta';

export default {
  slug: "photo-studio",
  category: "media",
  shortTitle: "Photo Studio",
  title: "Photo Studio — Local Non-Destructive Photo Editor & Export Workbench",
  audience: "Families · creators · photographers · design teams",
  summary: "Edit photographs, TIFF scans, and camera RAW files with reversible light, color, crop, targeted adjustment, retouching, comparison, snapshot, recipe, multi-photo merge, and professional export controls in one local workspace.",
  privacy: "Source pixels and edit recipes stay on this device. Photo rendering, previews, metadata review, XMP sidecars, and image exports are created in your browser.",
  accepts: "JPEG, PNG, WebP, and other still images your browser can decode; 8- or 16-bit uncompressed or Deflate TIFF; camera RAW (DNG, CR2, CR3, NEF, ARW, RAF, ORF, RW2, PEF, SRW); two to nine photos for HDR, exposure fusion, panorama, or focus/average/median stack merges",
  outputs: "Edited JPEG, PNG, WebP, TIFF, or AVIF copies; PDF or PNG contact sheets; reviewed XMP metadata sidecars; reusable JSON edit recipes",
  steps: [
    "Open a local photo and use the grouped Edit or Crop controls for broad corrections.",
    "Add targeted adjustments or reversible retouch operations, compare before/after, and save snapshots when useful.",
    "Open Export to choose format, size, quality, filename behavior, and the metadata you intentionally want to preserve.",
  ],
  hint: "Browser image and canvas limits vary by device. Photo Studio checks encoder and render capability and reduces an oversized export safely rather than silently producing a blank file.",
  load: () => import('./PhotoWorkspace'),
} satisfies ToolMeta;

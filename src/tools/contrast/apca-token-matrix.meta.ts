import type { ToolMeta } from '../../tool-meta';

export default {
  slug: "apca-token-matrix",
  category: "design",
  shortTitle: "APCA Token Matrix",
  title: "APCA / OKLCH Color Token Matrix & Contrast Workbench",
  audience: "Design-system teams · frontend developers · accessibility reviewers",
  summary: "Parse modern CSS color tokens, compare every directional foreground/background pairing with APCA Lc guidance and conventional WCAG 2 contrast, preview component pairings, and export CSS custom properties.",
  privacy: "Color parsing, matrix calculation, previews, and CSS export run entirely in this browser. No design tokens are uploaded.",
  accepts: "Hex, RGB, HSL, OKLCH, and other supported CSS color token lines",
  outputs: "Directional APCA/WCAG matrix, component preview, and CSS custom-property export",
  steps: [
    "Paste or edit color tokens.",
    "Choose an APCA guidance role and inspect the accessible table or compact visual matrix.",
    "Review a component pairing, optional color-vision preview, then copy or download the CSS variables.",
  ],
  hint: "APCA Lc is shown as perceptual guidance and is not presented as WCAG 2.x conformance. Use the separately reported WCAG ratio for current WCAG 2 contrast checks.",
  load: () => import('./ContrastWorkspace'),
} satisfies ToolMeta;

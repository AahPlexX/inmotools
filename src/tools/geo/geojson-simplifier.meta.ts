import type { ToolMeta } from '../../tool-meta';

export default {
  slug: "geojson-simplifier",
  category: "maps",
  shortTitle: "GeoJSON Simplifier",
  title: "GeoJSON Simplifier: Reduce Coordinates, Keep Shared Borders",
  audience: "GIS developers · map designers · data visualization teams",
  summary: "Reduce GeoJSON coordinates in your browser while keeping shared borders aligned. Compare the shapes and download GeoJSON or TopoJSON.",
  privacy: "Your geometry is parsed, simplified, previewed, and exported in this browser. No map service or upload is used.",
  accepts: "GeoJSON Feature, FeatureCollection, or geometry file",
  outputs: "Simplified GeoJSON or TopoJSON file",
  steps: [
    "Choose a GeoJSON file.",
    "Set coordinate precision and the amount of geometry detail to retain.",
    "Compare the original and result, then download the selected format.",
  ],
  hint: "Simplification can remove important shape detail. Check the preview and coordinate counts before using the exported file.",
  load: () => import('./GeoWorkspace'),
} satisfies ToolMeta;

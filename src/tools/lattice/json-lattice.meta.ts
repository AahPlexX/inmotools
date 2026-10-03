import type { ToolMeta } from '../../tool-meta';

export default {
  slug: "json-lattice",
  category: "data",
  aliases: ["#/json-lattice"],
  shortTitle: "JSON Lattice Studio",
  title: "JSON Lattice Studio — Local Structured Data Graph, Diff & Query Workbench",
  audience: "Developers · data engineers · security reviewers",
  summary: "Normalize JSON, YAML, TOML, XML, or CSV into a local canonical model, explore and edit it as a graph, diff structures, protect sensitive values, generate schemas, query with JSONPath or DuckDB, and export locally.",
  privacy: "Structured data, graph layout, privacy analysis, queries, edits, autosave, and exports stay inside this browser. No payload is uploaded.",
  accepts: "JSON, YAML, TOML, XML, and CSV text or local files",
  outputs: "Edited structured data, schemas, flattened CSV, SVG/PNG/JPEG graph exports, and protected JSON copies",
  steps: [
    "Paste or open structured data and choose its source format.",
    "Search, collapse, edit, diff, protect, inspect, and query the canonical graph locally.",
    "Export the canonical data or reviewed graph and safe-copy artifacts without a server round-trip.",
  ],
  hint: "Privacy Shield and foreign-key links are heuristic or convention-based aids. Review sensitive exports, and remember browser/Wasm memory is finite for very large documents.",
  load: () => import('./LatticeWorkspace'),
} satisfies ToolMeta;

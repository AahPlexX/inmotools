import type { ToolMeta } from '../../tool-meta';

export default {
  slug: "fuzzy-deduplicator",
  category: "data",
  shortTitle: "Fuzzy Deduplicator",
  title: "Local Fuzzy Record Deduplicator & Canonical Merge Workbench",
  audience: "Data operations · CRM administrators · research teams",
  summary: "Find likely duplicate rows with weighted lexical and phonetic matching, review each cluster, choose canonical values, and export a deterministic reconciled CSV.",
  privacy: "CSV/XLSX parsing, candidate blocking, similarity scoring, reconciliation, and export stay on this device.",
  accepts: "CSV and XLSX spreadsheets",
  outputs: "Reviewed deduplicated CSV with source rows left unchanged",
  steps: [
    "Choose a CSV or XLSX file and select a sheet when needed.",
    "Choose matching columns, weights, and confidence threshold, then find clusters.",
    "Reconcile canonical values or dismiss false positives before exporting the deduplicated CSV.",
  ],
  hint: "Fuzzy matches are candidates, not facts. Review lower-confidence clusters carefully before merging identity-sensitive records.",
  load: () => import('./DedupeWorkspace'),
} satisfies ToolMeta;

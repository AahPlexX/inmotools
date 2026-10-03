import type { ToolMeta } from '../../tool-meta';

export default {
  slug: "regex-log-structurer",
  category: "developer",
  shortTitle: "Log Structurer",
  title: "Local-First Regex Delimited Log Structurer & Schema Extractor",
  audience: "Site reliability engineers · backend developers",
  summary: "Turn proprietary log lines into structured rows with named regex capture groups and export the result without a cloud parser.",
  privacy: "Log text and regex processing remain entirely in your browser.",
  accepts: "Plain-text logs and a JavaScript regular expression with named capture groups",
  outputs: "Structured table plus JSON, CSV, or Markdown export",
  steps: [
    "Paste or load log text.",
    "Write a regex with named capture groups such as (?<level>...).",
    "Inspect matched/unmatched lines and export the structured rows.",
  ],
  hint: "Start with one representative line, verify the captures, then run against the full incident log to avoid silently misclassifying rows.",
  load: () => import('./LogWorkspace'),
} satisfies ToolMeta;

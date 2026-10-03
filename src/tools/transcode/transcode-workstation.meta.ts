import type { ToolMeta } from '../../tool-meta';

export default {
  slug: "transcode-workstation",
  category: "data",
  shortTitle: "Transcode Workstation",
  title: "Transcode Workstation — Universal Local File Converter & Data Transcoder",
  audience: "Everyone · data engineers · archivists · creators · sound designers",
  summary: "Convert files between formats entirely on this device: tabular data (CSV, JSON, Parquet, XLSX, XML, YAML, TOML, SQL), documents, encodings, and more, with batch processing and one-click ZIP export.",
  privacy: "Your files are read into browser memory and converted locally. Nothing is uploaded anywhere.",
  accepts: "CSV, TSV, JSON, NDJSON, Parquet, XLSX, XML, Plist, YAML, TOML, Markdown/HTML tables, plain text, Base64, and raw binary files",
  outputs: "Converted files in the selected target format, plus a bundled ZIP of all results",
  steps: [
    "Drop one file or a whole batch into the intake area.",
    "Pick a destination format and tune the options if you want.",
    "Convert, preview text results, and download individually or as one ZIP.",
  ],
  hint: "Detection uses file contents first, then the extension, so a renamed file still converts correctly. Parquet export loads a local database engine on first use and may take a moment.",
  load: () => import('./TranscodeWorkspace'),
} satisfies ToolMeta;

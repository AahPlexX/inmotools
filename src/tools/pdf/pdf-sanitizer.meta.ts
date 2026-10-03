import type { ToolMeta } from '../../tool-meta';

export default {
  slug: "pdf-sanitizer",
  category: "documents",
  shortTitle: "PDF Sanitizer",
  title: "Client-Side PDF Splice, Flatten, and Form Sanitizer",
  audience: "Remote workers · legal staff · administrative teams",
  summary: "Merge PDFs, flatten interactive form fields, remove common document metadata, and download the processed file locally.",
  privacy: "PDF bytes are read and rewritten in browser memory. Documents are not uploaded to a server.",
  accepts: "PDF documents",
  outputs: "Merged and/or flattened sanitized PDF",
  steps: [
    "Choose one or more PDFs in the order you want them merged.",
    "Choose whether to flatten and sanitize metadata.",
    "Process and download the resulting PDF.",
  ],
  hint: "Flattening is intentionally irreversible in the output. Keep the original if the form may need later edits.",
  load: () => import('./PdfWorkspace'),
} satisfies ToolMeta;

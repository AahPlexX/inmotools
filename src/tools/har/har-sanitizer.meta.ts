import type { ToolMeta } from '../../tool-meta';

export default {
  slug: "har-sanitizer",
  category: "developer",
  shortTitle: "HAR Sanitizer",
  title: "Local HAR Credential Sanitizer & Network Waterfall Inspector",
  audience: "Security engineers · web developers · support teams",
  summary: "Find likely secrets in a HAR, inspect timing, and download a reviewed copy with selected values redacted, hashed, or masked. On-screen URLs hide passwords. Email and IP hiding are optional.",
  privacy: "HAR traffic metadata is parsed, reviewed, transformed, and exported only in this browser. Nothing is uploaded for analysis.",
  accepts: "HTTP Archive (.har) JSON files",
  outputs: "Sanitized HAR, finding-location CSV, and a windowed request waterfall",
  steps: [
    "Choose or drop a HAR file and review finding locations. Secret values are not listed.",
    "Filter the waterfall, jump from a finding to its request, and choose what to hide.",
    "Prepare the cleaned file, read the review, then download it.",
  ],
  hint: "A SHA-256 value is a stable pseudonym, not encryption. Low-entropy secrets may still be guessable, so use redaction when a stable identifier is unnecessary.",
  load: () => import('./HarWorkspace'),
} satisfies ToolMeta;

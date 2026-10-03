import type { ToolMeta } from '../../tool-meta';

export default {
  slug: "site-intelligence-analyzer",
  category: "developer",
  aliases: ["#/site-intelligence-analyzer"],
  shortTitle: "Site Intelligence Analyzer",
  title: "Universal Site Intelligence Analyzer — URL Forensics & Domain Health Audit Workstation",
  audience: "Casual users · students · security analysts · network engineers · technical SEO auditors",
  summary: "Decompose any raw or malformed URL, then run deterministic, telemetry-based DNS, registration, TLS, email-authentication, performance, and archive-history audits using only public CORS-compliant APIs — no scraping, no scanning, no accounts.",
  privacy: "Analysis runs in your browser. DNS-over-HTTPS, RDAP, Certificate Transparency, Wayback, and similar public lookups are queried directly from this device; saved audits, tags, notes, and settings stay in local IndexedDB.",
  accepts: "Any raw, partial, or malformed URL or domain",
  outputs: "Interactive audit report, composite health scorecard, network node graph, and PDF/JSON/Markdown/CSV exports plus a shareable social-card PNG",
  steps: [
    "Enter a URL or bare domain and choose Analyze.",
    "Review lexical forensics, DNS/network, registration, TLS, email-auth, and performance sections; every technical term has an info badge.",
    "Review the composite scorecard, edit audit metadata, then export a report or save it to the local vault.",
  ],
  hint: "This is a deterministic, telemetry-and-heuristics tool — it does not use AI/ML models, headless scraping, port scanning, or active exploitation. Some data sources (Certificate Transparency, Core Web Vitals) depend on third-party service availability or a user-supplied API key and degrade gracefully when unavailable.",
  load: () => import('./SiteIntelWorkspace'),
} satisfies ToolMeta;

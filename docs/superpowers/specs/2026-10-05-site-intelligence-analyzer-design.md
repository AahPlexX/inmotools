---
tool: site-intelligence-analyzer
folder: src/tools/site-intel
doc: spec
basis: as-built
status: active
spec: docs/superpowers/specs/2026-10-05-site-intelligence-analyzer-design.md
tracker: src/tools/site-intel/TRACKER.md
updated: 2026-10-05
---

# Site Intelligence Analyzer — spec

As built at `83b9d0bf` (last change under `src/tools/site-intel/`). Requirement prefix: `SIA`. Status of each requirement: [TRACKER.md](../../../src/tools/site-intel/TRACKER.md).

History (kept as written): [TRACKING.md](../../../src/tools/site-intel/TRACKING.md) (Features 1–38). "Formerly Feature N" refers to that numbering.

## Purpose

Audit a URL, domain or web page from the browser for anyone checking a link or a site: lexical URL forensics, DNS and hosting, registration and history, certificates, email authentication, technology fingerprints, and page-level HTML, SEO and accessibility checks, combined into a scorecard and exportable report.

## Scope

In scope: URL and domain analysis through public keyless sources (DNS-over-HTTPS, RDAP, Certificate Transparency, Wayback CDX, HSTS preload, ipapi.co) requested when the user runs an analysis; HTML pasted, loaded from a file or fetched directly from sites that allow CORS; scorecard, exports and a local audit vault.

Out of scope: CrUX field data and fetching through a CORS proxy (the `prohibited` rows); scanning, port probing and active exploitation; reading cross-origin pages or headers the site does not expose to CORS.

## Constraints

- Platform rules: no accounts or authentication; no server, API proxy or hosted database; everything runs in the browser and tool data stays in this browser (IndexedDB `inmotools-site-intelligence`); network use is limited to the site's own files and public keyless sources requested by the user's own action, with no API keys ([DOCUMENTATION_STANDARD.md](../../DOCUMENTATION_STANDARD.md#platform-rules-apply-to-every-tool-and-every-spec)).
- No large language models; findings come from deterministic parsing, public telemetry and heuristics.
- Third-party sources are used within their terms; crt.sh and ipapi.co availability and limits are outside the tool's control, and failures are reported, not guessed.
- Libraries in use stay as they are: Dexie, jsPDF, Papa Parse.

## Architecture and engine

- Engines and libraries: `dexie@4.4.6` stores the report vault; `jspdf@4.2.1` writes the PDF report; `papaparse@5.7.0` writes the CSV export; the lexical, scoring, fingerprint, redirect, mixed-content, email-auth and DNSBL engines are first-party code over DNS-over-HTTPS answers.
- Workers: none.
- Storage: IndexedDB database `inmotools-site-intelligence` (Dexie) with `audits` (saved audit records, tags, notes) and `settings` (key/value) stores (`vault-db.ts`).
- Browser APIs: fetch with AbortController timeouts for every lookup; Canvas 2D draws the node graph and renders the social-card PNG; Clipboard copies the sanitized URL; Blob downloads deliver exports. A failed or blocked lookup is reported as a blocked section and the other sections still render.
- Network: on Analyze, `cloudflare-dns.com` and `dns.google` (DNS-over-HTTPS), `rdap.org`, `crt.sh`, `hstspreload.org`, `ipapi.co` and `web.archive.org`; on a well-known path preview click, the analyzed site's own `/robots.txt`, `/sitemap.xml` or `/.well-known/security.txt`.

## Requirements

### URL parsing and lexical forensics

| ID | Requirement | Acceptance test |
| --- | --- | --- |
| SIA-R01 | Decomposes a raw, partial or malformed URL into RFC 3986 parts (scheme, credentials, host, port, path, query, fragment) and shows them as a breadcrumb; a bare domain gets https (formerly Feature 1) | Enter `paypa1.com/login?utm_source=test`; breadcrumb shows TLD com and SLD paypa1 |
| SIA-R02 | Detects homoglyph and Punycode (IDN) spoofing, naming the confusable characters (formerly Feature 2) | Cyrillic а in a Latin host is flagged |
| SIA-R03 | Scores Shannon entropy of the host label to flag DGA-like names (formerly Feature 3) | A long random token scores high; a short repetitive label low |
| SIA-R04 | Finds typosquat candidates by Levenshtein distance against a bundled list of frequently impersonated brand domains (formerly Feature 4) | `paypa1.com` lists `paypal.com`; the brand itself is not flagged |
| SIA-R05 | Classifies query parameters (tracking, session, functional) and builds a sanitized URL without tracking and session parameters (formerly Feature 5) | `utm_source` is classified as tracking and removed from the sanitized URL |
| SIA-R06 | Copies the sanitized URL to the clipboard | Copy puts the sanitized URL on the clipboard |
| SIA-R07 | Detects URL shorteners and vanity links, and resolves the destination only when the user chooses Resolve destination, reporting when CORS blocks it (formerly Feature 6) | `bit.ly/demo`: no request until Resolve destination; then the final URL shows |
| SIA-R08 | Flags plaintext HTTP, embedded credentials and non-standard ports in the URL (formerly Feature 23) | `http://user:pw@host:8080` gives risk findings; plain https gives good |
| SIA-R09 | Click-to-copy on each URL token and DNS answer | Click the host token; it is copied |

### DNS, network and hosting

| ID | Requirement | Acceptance test |
| --- | --- | --- |
| SIA-R10 | Resolves A, AAAA, CNAME, NS, SOA, TXT and MX records over DNS-over-HTTPS (Cloudflare, Google fallback) with TTLs (formerly Feature 7) | DNS & Network lists A records with TTL |
| SIA-R11 | Shows the reverse-DNS (PTR) name of each IPv4 answer on hover and in the node graph (formerly Feature 7) | Hover an A record; its PTR name shows |
| SIA-R12 | A DNS lookup that fails is reported as a lookup failure, not as an absent record, in the IPv6, CAA, DNSSEC, MX, SPF, DMARC and BIMI checks and the DNSBL summary | Make DoH fail; each check says the lookup failed |
| SIA-R13 | IPv6 readiness and dual-stack audit (formerly Feature 8) | A host with AAAA answers is reported ready |
| SIA-R14 | Nameserver geographic and ASN redundancy check (formerly Feature 9) | Nameservers in one ASN are flagged |
| SIA-R15 | CAA record validation (formerly Feature 10) | No CAA records gives a rogue-issuance finding |
| SIA-R16 | DNSSEC signals: DNSKEY, DS and RRSIG presence plus the resolver's authenticated-data bit (formerly Feature 11) | A signed zone reports DNSKEY, DS and AD |
| SIA-R17 | Hosting and ASN profile of each IP through ipapi.co (formerly Feature 12) | IP lists as `203.0.113.10 → Example Network` |
| SIA-R18 | GeoIP minimap plotting server coordinates as keyboard-focusable points with the selected location shown as text (formerly Feature 13) | Minimap region shows a focusable point for each IP |
| SIA-R19 | Anycast detection: IPs that geolocate to more than one country are reported as likely Anycast (formerly Feature 13) | IPs in two countries give "Likely Anycast distribution" |
| SIA-R20 | DNSBL reputation scan of the IP and domain against six zones (formerly Feature 18) | A listed target gives a risk; clean gives good |
| SIA-R21 | Interactive DNS and network node graph with drag-to-inspect, wheel/pinch zoom and pan (formerly Feature 33) | Drag a node; its details show; pinch zooms |
| SIA-R22 | Keyboard-accessible list of the node graph's nodes and links beside the graph | Tab through the list; each node's details read out |
| SIA-R23 | Edge CDN and cloud platform classification from CNAME/NS suffixes (formerly Feature 29) | A known CDN suffix is identified |

### Registration and history

| ID | Requirement | Acceptance test |
| --- | --- | --- |
| SIA-R24 | RDAP registration profile through the rdap.org bootstrap (formerly Feature 14) | Registration & History shows registrar, dates and status |
| SIA-R25 | Domain age and longevity index (formerly Feature 15) | A newly registered domain is high risk |
| SIA-R26 | Expiration countdown and renewal risk (formerly Feature 16) | `redemptionPeriod` status is an expiration risk |
| SIA-R27 | Wayback Machine snapshot timeline with content-change points from the CDX digest, each linking to its capture (formerly Feature 17) | Timeline lists captures and change points |
| SIA-R28 | Wayback capture counts per year | Timeline shows a count for each year |

### TLS and certificates

| ID | Requirement | Acceptance test |
| --- | --- | --- |
| SIA-R29 | Certificate Transparency log ingestion through crt.sh, reporting a blocked state when the service is unavailable (formerly Feature 19) | CT section lists certificates or says crt.sh is unreachable |
| SIA-R30 | Subject Alternative Name subdomain discovery from CT (formerly Feature 20) | SAN subdomains list |
| SIA-R31 | The SAN list shows the first 50 names followed by "…and N more" | A certificate with 60 SANs ends with "…and 10 more" |
| SIA-R32 | Certificate expiry and automated-renewal check (formerly Feature 21) | A certificate near expiry is flagged |
| SIA-R33 | HSTS preload list status through hstspreload.org (formerly Feature 22) | A preloaded domain is good |

### Email authentication

| ID | Requirement | Acceptance test |
| --- | --- | --- |
| SIA-R34 | MX priority and backup-MX evaluation (formerly Feature 24) | Two MX records report backup presence |
| SIA-R35 | SPF validation (RFC 7208): `+all`, self-include loop and include count (formerly Feature 25) | `v=spf1 +all` is a risk |
| SIA-R36 | SPF nested `include:` mechanisms are resolved and DNS lookups counted against the RFC 7208 limit of 10 | A record needing 11 lookups is flagged |
| SIA-R37 | SPF self-include detection treats the hostname literally (regular-expression characters escaped) | A hostname containing regex characters is matched literally |
| SIA-R38 | DMARC policy and alignment inspection (RFC 7489) (formerly Feature 26) | Missing DMARC is a spoofing risk; `p=reject` parses |
| SIA-R39 | BIMI readiness check (formerly Feature 27) | No BIMI record reports gracefully |

### Performance and technology

| ID | Requirement | Acceptance test |
| --- | --- | --- |
| SIA-R40 | Core Web Vitals field data from the Chrome UX Report (CrUX) (formerly Feature 28) | — |
| SIA-R41 | No API key field or key-bearing request; a CrUX key stored by earlier versions is deleted on load | Seed the old key; reload; it is gone and no CrUX request is made |
| SIA-R42 | CMS and platform fingerprint from URL path signatures (formerly Feature 30) | `/wp-content/` identifies WordPress |
| SIA-R43 | Generates robots.txt, sitemap.xml and security.txt paths with a best-effort in-app preview that falls back to opening them directly (formerly Feature 31) | Paths list; preview loads or offers to open directly |

### Page and HTML audit

| ID | Requirement | Acceptance test |
| --- | --- | --- |
| SIA-R44 | Accepts HTML by paste or local file and parses it in a sandboxed document without running its scripts | Paste HTML with a script; DOM parses; script does not run |
| SIA-R45 | Fetches a live page's HTML directly when the site allows CORS, and says so when it does not | Fetch a CORS-enabled page; HTML loads; a blocked site shows the reason |
| SIA-R46 | Fetching arbitrary pages through a CORS proxy | — |
| SIA-R47 | Semantic HTML5 checks (landmark elements, lists, buttons vs links) | A div-only layout is flagged |
| SIA-R48 | Heading outline with skipped levels flagged | h1 then h3 flags a skipped level |
| SIA-R49 | Meta description, OpenGraph and Twitter card tags audit with a preview | Missing og:image is flagged |
| SIA-R50 | Canonical link and meta robots directives audit | A noindex meta is reported |
| SIA-R51 | Viewport meta and mobile readability check | Missing viewport meta is flagged |
| SIA-R52 | Colour contrast of text against its background for WCAG 2.2 AA and AAA | Grey #999 on white fails AA |
| SIA-R53 | Colour-blindness simulation (protanopia, deuteranopia, tritanopia, achromatopsia) of the page preview | Choose deuteranopia; preview re-renders |
| SIA-R54 | Image alt text audit | An img without alt is flagged |
| SIA-R55 | Form label audit | An input without a label is flagged |
| SIA-R56 | ARIA landmark and role validation | An invalid role value is flagged |
| SIA-R57 | Touch target size check against WCAG 2.2 target size (24 × 24 CSS px) | A 16 px button is flagged |
| SIA-R58 | Internal links and in-page anchors resolve within the document | A link to a missing #id is flagged |
| SIA-R59 | `target="_blank"` links without `rel="noopener"` flagged | Such a link is flagged |
| SIA-R60 | Inline style inventory | Elements with style attributes are counted and listed |
| SIA-R61 | Deprecated HTML elements and attributes flagged | `<font>` and `<center>` are flagged |
| SIA-R62 | CSS parsing with selectors that match nothing in the document listed | A selector with no match is listed |
| SIA-R63 | DOM depth and node count | Report shows maximum depth and total nodes |
| SIA-R64 | Resource weight estimate of referenced scripts, styles, images and fonts | Report lists each resource and an estimated total |
| SIA-R65 | Critical rendering path view (render-blocking scripts and styles in the head) | A synchronous head script is listed as blocking |
| SIA-R66 | Third-party script inventory by host | Scripts from other hosts list by host |
| SIA-R67 | Mixed-content subresources (http:// on an https page) in the HTML | An http image on an https page is flagged |
| SIA-R68 | Security headers (CSP, HSTS, X-Frame-Options, Referrer-Policy, Permissions-Policy) from `http-equiv` meta tags and from response headers the site exposes to CORS | A page without CSP is flagged |
| SIA-R69 | Web font loading risk (font-display, preload, count) | @font-face without font-display is flagged |
| SIA-R70 | Favicon and touch icon check | Missing apple-touch-icon is flagged |
| SIA-R71 | Web app manifest check | A manifest link without icons is flagged |
| SIA-R72 | JSON-LD structured data validation (parse errors, @context, @type) | Invalid JSON-LD is flagged |
| SIA-R73 | Readability score of the page text | Report shows a readability grade |
| SIA-R74 | Visual DOM inspector: selecting a node in the tree highlights it in the preview | Select a node; it is outlined in the preview |
| SIA-R75 | Viewport emulation from 320 to 1920 px with a horizontal-overflow check of the page preview | Emulate 320 px; overflowing elements are listed |

### Scorecard, export and vault

| ID | Requirement | Acceptance test |
| --- | --- | --- |
| SIA-R76 | Composite health scorecard with letter grades per vector, shown as a radar chart (formerly Feature 32) | Scorecard & Export shows the radar; a clean report is A+ |
| SIA-R77 | Selecting a radar axis opens that section (formerly Feature 32) | Click the Email axis; Email Authentication opens |
| SIA-R78 | Prioritized fix list ordered by severity and score impact | Risks list before warnings with the fix for each |
| SIA-R79 | Info badge on every technical term with a glossary tooltip (hover on desktop, tap on touch) (formerly Feature 35) | Hover the DNSSEC badge; its definition shows |
| SIA-R80 | Exports the audit report as PDF (formerly Feature 36) | Export PDF downloads `site-intelligence-audit.pdf` |
| SIA-R81 | Exports the audit report as JSON (formerly Feature 36) | Export JSON downloads a parseable file |
| SIA-R82 | Exports the audit report as Markdown (formerly Feature 36) | Export Markdown downloads `.md` |
| SIA-R83 | Exports the audit report as CSV (formerly Feature 36) | Export CSV downloads `.csv` |
| SIA-R84 | JSON export includes the raw per-engine telemetry | JSON has a section per engine with its raw responses |
| SIA-R85 | Audit metadata editor (auditor name, organization, notes) carried into exports (formerly Feature 37) | Fill metadata; it appears in the Markdown export |
| SIA-R86 | Social card PNG (1200 × 630) of the URL, score and metadata (formerly Feature 37) | Generate social card downloads a 1200 × 630 PNG |
| SIA-R87 | Saves an audit to the local IndexedDB vault (formerly Feature 38) | Save to local vault; it lists after Refresh |
| SIA-R88 | Lists and deletes saved audits (formerly Feature 38) | Delete removes the record |
| SIA-R89 | Purges all local records (formerly Feature 38) | Purge all local records empties the vault |
| SIA-R90 | Tags saved audits and searches the vault by URL, notes and tags (formerly Feature 38) | Tag an audit, search the tag; it lists |
| SIA-R91 | Re-opens a saved audit from the vault | Open a saved audit; its report shows |

### Non-functional

| ID | Requirement | Acceptance test |
| --- | --- | --- |
| SIA-R92 | Report sections in a sticky tab bar, each reachable and headed | Click each tab; its heading shows |
| SIA-R93 | Workspace follows the site-wide theme chosen in the site header (light, dark, system) and passes the colour-contrast check in dark | Switch the site theme to dark; colours follow; axe colour-contrast passes |
| SIA-R94 | No horizontal overflow from 320 to 2560 px, with container-query layouts at 768, 1024 and 1440 px (formerly Feature 34) | Viewport check at 320, 375, 768, 1024, 1440, 1920, 2560 px |
| SIA-R95 | No serious or critical axe violations | Catalog-wide accessibility spec for this route |
| SIA-R96 | Works offline for saved audits and URL forensics (PWA shell); network checks call only public keyless sources at the user's request (formerly Feature 38) | Offline: URL forensics and the vault work |

## Non-functional requirements

Section navigation, theme, responsive layout, accessibility and offline behaviour are the rows under "Non-functional" above.

## Definition of done

The tool is complete when every requirement is `verified` or `prohibited`, and the completion gates in `.tasks/PROJECT_COMPLETION.md` are met.

## Technique decisions

None recorded.

## Intent not recorded

- Readability score formula for the page text (conservative default: Flesch reading ease for English text; owner may override).

## Change log

- 2026-10-05 — Created: 96 requirements as built at `83b9d0bf`.

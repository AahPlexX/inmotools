# Site Intelligence Analyzer — Living Tracking Document

> **Historical record (banner added 2026-10-05).** Written before the current workflow. Branches, pull requests, PR numbers and registration steps mentioned here (`src/catalog.ts` entries, `workspaces.tsx` loaders, `ToolSlug`, `.tasks/IN_PROGRESS.md`, `.tasks/config.json` IDs) are no longer used: tools register through `src/tools/<folder>/<slug>.meta.ts`, work starts with `pnpm task:start`, and pushes merge without pull requests ([AGENTS.md](../../../AGENTS.md)). Feature facts and evidence below stay valid as a record; current status is in the tool's tracker or task file.

**Do not let this document go stale.** Update it in the same change that alters
implementation status. This is the single source of truth for what is done,
what is partial, and what remains for this tool. It lives only inside this
tool's own directory (`src/tools/site-intel/`) per the scoped-permissions rule
for this workstream.

- Branch: `feature/site-analysis-workstation` (this worktree is
  `inmotools-site-analysis`, checked out from `origin/main` at the time this
  branch was created; the branch has **not** been merged and must not be
  merged until every item below is either Done or explicitly accepted as
  Rejected/Deferred with rationale).
- Tool slug: `site-intelligence-analyzer` (registered by
  `src/tools/site-intel/site-intelligence-analyzer.meta.ts`).
- No "AI" branding anywhere in this tool's copy, feature names, or docs. Every
  finding is produced by deterministic parsing, public-API telemetry, or
  static heuristic pattern matching — never a model.

## How to resume this work

1. Read this file top to bottom before changing anything.
2. Re-run `pnpm exec tsc --noEmit -p tsconfig.app.json`, the `site-intel-*`
   unit tests, and `tests/e2e/site-intel.spec.ts` before and after your change.
3. Update the status table and the "Known blockers / explicit substitutions"
   section in the same commit as any implementation change.
4. Do not merge to `main` until Section "Definition of done" is fully satisfied.

## Status legend

`Done` = implemented, unit-tested (and/or e2e-covered), builds clean.
`Partial` = implemented but with a named, narrower scope than the spec text.
`Blocked` = cannot be implemented as literally specified in a static,
client-only, CORS-constrained environment; a substitution is implemented and
flagged, or the feature is stubbed pending a resolvable blocker.
`Prohibited` = excluded by a platform rule (no API keys or credentials); the reason is in the row.

## Feature status (all 38)

### Group 1 — Core URL Parsing, Lexical Forensics & Syntactic Security
| # | Feature | Status | Implementation |
|---|---|---|---|
| 1 | RFC 3986 canonical URL decomposition engine | Done | `url-forensics.ts:parseUrl`, breadcrumb UI in `SiteIntelWorkspace.tsx` |
| 2 | Homoglyph & Punycode (IDN) spoofing detector | Done | `url-forensics.ts:detectHomoglyphs`, curated confusable map in `reference-data.ts` |
| 3 | Lexical Shannon entropy & DGA analyzer | Done | `url-forensics.ts:shannonEntropy` |
| 4 | Typosquatting & Levenshtein brand-distance calculator | Done | `url-forensics.ts:findTyposquatMatches` against curated `BRAND_REFERENCE_DOMAINS` (not a live Tranco fetch — see substitutions) |
| 5 | Query parameter & privacy tracking profiler | Done | `url-forensics.ts:classifyQueryParams` / `buildSanitizedUrl` |
| 6 | Deep URL shortener & vanity link detector | Done | `url-forensics.ts:detectShortener` plus explicit user-triggered, CORS-dependent resolution in `redirect-engine.ts`; desktop/mobile browser proof in run `36323940637` verifies no shortener contact occurs before the user chooses Resolve destination |

### Group 2 — DNS Architecture, Infrastructure & Network Routing
| # | Feature | Status | Implementation |
|---|---|---|---|
| 7 | DNS-over-HTTPS multi-record resolving engine | Done | `doh-client.ts`, `dns-engine.ts:fetchDnsTable` (Cloudflare primary, Google fallback), PTR hover via `resolvePtrRecords` |
| 8 | IPv6 readiness & dual-stack auditor | Done | `dns-engine.ts:auditIpv6Readiness` |
| 9 | Nameserver geographic & ASN redundancy checker | Done | `network-engine.ts:checkNameserverRedundancy` |
| 10 | CAA record validator | Done | `dns-engine.ts:validateCaaRecords` |
| 11 | DNSSEC cryptographic chain verification | Partial | `dns-engine.ts:checkDnssecSignals` reports DNSKEY/DS/RRSIG presence plus the resolver's authenticated-data (AD) bit rather than re-deriving the full root-to-zone signature chain client-side (see substitutions) |
| 12 | BGP ASN & hosting profiler | Done | `network-engine.ts:profileHosting` via ipapi.co |
| 13 | GeoIP server location & Anycast detector | Done | `network-engine.ts:detectAnycast` plus dependency-free, keyboard-accessible coordinate minimap in `components/GeoIpMap.tsx`; desktop/mobile browser proof in run `36323940637` covers the DNS→IP-intel→map path |

### Group 3 — Domain Registration, Lifecycles & Historical Records
| # | Feature | Status | Implementation |
|---|---|---|---|
| 14 | ICANN RDAP bootstrap registration profiler | Done | `rdap-engine.ts:fetchRdap` via rdap.org bootstrap redirector |
| 15 | Domain age & longevity health index | Done | `rdap-engine.ts:assessDomainAge` |
| 16 | Domain expiration countdown & renewal risk telemetry | Done | `rdap-engine.ts:assessExpiration` |
| 17 | Wayback Machine historical snapshot timeline | Partial | `wayback-engine.ts:fetchWaybackTimeline`; title-change detection substituted with CDX `digest` content-hash change detection (see substitutions) |
| 18 | DNSBL & IP/domain blacklist reputation multi-scanner | Done | `blacklist-engine.ts:scanDnsbl` against 6 zones via ordinary A-record DoH queries |

### Group 4 — SSL/TLS, Encryption & Security Posture
| # | Feature | Status | Implementation |
|---|---|---|---|
| 19 | Public Certificate Transparency (CT) log ingestion | Partial | `ct-engine.ts:fetchCtLog` via crt.sh JSON; crt.sh does not guarantee CORS/uptime SLA — degrades to a reported "blocked" state (see substitutions) |
| 20 | SAN subdomain discovery | Done | `ct-engine.ts:summarizeSanSubdomains` (depends on #19 succeeding) |
| 21 | Certificate expiration & automated-renewal sentinel | Done | `ct-engine.ts:assessCertificateExpiry` (depends on #19 succeeding) |
| 22 | Chromium HSTS preload list status checker | Done | `hsts-engine.ts` via hstspreload.org status API |
| 23 | Mixed content risk & default scheme security analyzer | Done | `mixed-content-engine.ts:analyzeSchemeSecurity` |

### Group 5 — Email Deliverability & Domain Authentication
| # | Feature | Status | Implementation |
|---|---|---|---|
| 24 | MX priority & health evaluator | Done | `email-auth-engine.ts:fetchMxRecords` |
| 25 | SPF syntax & rule validator (RFC 7208) | Done | `email-auth-engine.ts:validateSpf` (self-include loop + `+all` + include-count checks; does not recursively resolve every nested `include:` — see substitutions) |
| 26 | DMARC policy & alignment enforcement inspector (RFC 7489) | Done | `email-auth-engine.ts:inspectDmarc` |
| 27 | BIMI readiness checker | Done | `email-auth-engine.ts:checkBimi` |

### Group 6 — Performance Telemetry, Web Vitals & Technology Footprint
| # | Feature | Status | Implementation |
|---|---|---|---|
| 28 | Public Core Web Vitals (CrUX) explorer | Prohibited (needs an API key) | Removed 2026-10-04 (T-site-intelligence-analyzer-20261003-ba98): the key field, its IndexedDB setting and `crux-engine.ts` are gone; Performance & Tech shows that field data is not available without a key; a key saved by earlier versions is deleted on load (`vault-db.ts:purgeRetiredCredentials`). |
| 29 | Edge CDN & cloud infrastructure classifier | Done | `fingerprint-engine.ts:classifyCdn` via CNAME/NS suffix signatures |
| 30 | Web technology signature & CMS profiler | Done | `fingerprint-engine.ts:fingerprintCms` via URL/path pattern signatures |
| 31 | Robots.txt & sitemap auto-path generator | Done | `wellknown-engine.ts`; in-app preview is best-effort (falls back to "open directly" when a target has no CORS header) |

### Group 7 — Interface Ergonomics, Scoring & Export Pipeline
| # | Feature | Status | Implementation |
|---|---|---|---|
| 32 | Unified composite domain health scorecard (radar matrix) | Done | `scoring-engine.ts`, `components/ScoreRadar.tsx` (click-to-jump wired to section tabs) |
| 33 | Interactive visual DNS & network node graph | Done | `components/NodeGraph.tsx` — canvas node-link diagram, drag-to-inspect, wheel/pinch zoom, background-drag pan |
| 34 | Device-agnostic responsive layout with fluid viewport calibrator | Done | `site-intel-workspace.css` — container-query breakpoints at 768/1024/1440px, sticky tab bar, accordion-on-mobile |
| 35 | Non-intrusive context-aware tooltip & metric glossary | Done | `glossary.ts`, `components/InfoBadge.tsx` — hover tooltip desktop, tap-friendly on touch (same component, `onClick` toggle) |
| 36 | Multi-format audit report exporter (PDF/JSON/Markdown/CSV) | Done | `export-engine.ts` |
| 37 | Audit metadata & OpenGraph social card studio | Done | metadata editor in `SiteIntelWorkspace.tsx`, `social-card-engine.ts` (1200×630 canvas PNG) |
| 38 | Zero-database offline report vault (IndexedDB, PWA) | Done | `vault-db.ts` (Dexie, scoped DB name `inmotools-site-intelligence`); the app's existing Vite PWA plugin already provides offline-shell support app-wide |

## Known blockers / explicit substitutions (flagged per task instructions)

1. **Feature 28 (CrUX)** — prohibited: the Chrome UX Report API requires a Google Cloud API key, and the platform rules allow keyless sources only. No keyless replacement is used: the PageSpeed Insights API can be called without a key, but its documentation states its real-world (CrUX) data is soon to be discontinued ([PageSpeed Insights API, Get started](https://developers.google.com/speed/docs/insights/v5/get-started), read 2026-10-04). The UI states that field data is not available without a key.
2. **Feature 19/20/21 (Certificate Transparency via crt.sh)** — crt.sh is a
   community service without an uptime/CORS SLA. Verify current behavior in
   a network-enabled environment before relying on it for production
   guarantees; the UI already degrades to a "blocked" explanation rather than
   a hard error when it is unreachable.
3. **Feature 11 (DNSSEC)** — full from-the-root RRSIG/DNSKEY/DS chain
   validation is not realistically re-derivable client-side without shipping
   a DNSSEC validator + root trust anchors. Substituted with DNSKEY/DS/RRSIG
   presence plus the resolver's authenticated-data (AD) bit, the same signal
   every public DoH resolver already exposes for "this passed DNSSEC
   validation."
4. **Feature 17 (Wayback title changes)** — substituted literal `<title>`
   diffing (which would need dozens of extra, CORS-uncertain fetches of
   archived HTML) with the CDX API's own `digest` content-hash field to
   detect meaningful content changes over time.
5. **Feature 6 (shortener redirect-unwrapping)** — implemented as an explicit user action rather than an automatic request. The browser performs a bounded `HEAD` request with `redirect: 'follow'`, no credentials, no referrer, and no cache; `Response.url` is shown only when CORS permits the redirect inspection. When the shortener blocks CORS, the UI reports that limitation and does not guess or route through a proxy. Intermediate redirect hops are deliberately not claimed because the Fetch API exposes only the final response URL.
6. **Feature 13 (GeoIP minimap)** — implemented without a map/tile dependency. The minimap plots the latitude/longitude coordinates already returned by the hosting lookup, exposes each point as a keyboard-focusable control, and keeps the selected IP/location/ASN text visible below the plot. No additional network request is introduced.
7. **ipapi.co dependency (Features 9, 12, 13)** — free-tier rate limits and
   CORS terms should be re-verified from https://ipapi.co/api/ in a
   network-enabled environment before this ships to real production traffic
   at scale.

## Outstanding work (not yet started / not yet complete)

- [x] Feature 13 GeoIP minimap implemented and promoted to Done after desktop/mobile browser validation (`36323940637`).
- [x] Feature 6 explicit CORS-aware resolver implemented and promoted to Done after desktop/mobile browser validation (`36323940637`).
- [ ] Broaden `BRAND_REFERENCE_DOMAINS` beyond the current curated ~100-domain
      list if a larger, still-offline-friendly reference set is wanted.
- [ ] Add focused unit coverage for `export-engine.ts` (JSON/Markdown/CSV/PDF
      byte-for-byte shape) and `social-card-engine.ts` (canvas rendering is
      hard to unit-test headlessly; currently only exercised manually/via e2e).
- [ ] Add an e2e assertion that actually exercises a real DNS/RDAP/CT round
      trip end-to-end (current `tests/e2e/site-intel.spec.ts` intentionally
      only asserts on the network-independent Group 1 + UI-shell behavior to
      avoid flakiness when run without outbound internet access).
- [ ] Content-Security-Policy / `connect-src` allowlist review for every
      external host this tool calls (Cloudflare/Google DoH, rdap.org,
      web.archive.org, crt.sh, hstspreload.org, ipapi.co) if/when this repository adopts a CSP meta tag.
- [ ] Visual polish pass (spacing, empty states, dark/light theme parity with
      the rest of InMo Tools) once functional scope is accepted.

## Verified/implemented so far (what a resuming agent can trust as tested)

- 2026-10-04, `fix/site-intelligence-analyzer` from `main` @ `0153cf5a`: CrUX key field removed (Feature 28 not planned). `tests/unit/site-intel-no-api-key.test.ts` 2 passed (both fail against the previous source); `tests/e2e/site-intel.spec.ts` 10 passed on desktop and mobile Chromium, including "has no CrUX API key field, clears a previously stored key and never calls the CrUX API"; accessibility spec route `site-intelligence-analyzer` 2 passed; `tests/e2e/app.spec.ts` 18 passed; `tsc` clean; `pnpm build` passed.

- 2026-09-27 completion slice: run `36323940637` passed Site Intelligence units, production build, Chromium install, and all 8 Site Intelligence browser executions on desktop/mobile after red-first proof (`36323072877`) established the missing resolver/minimap contracts. Feature 6 and Feature 13 are now Done.

- All Group 1 functions: 14 unit tests passing (`tests/unit/site-intel-url-forensics.test.ts`).
- Scoring, mixed-content, CDN/CMS fingerprint heuristics: unit tested
  (`tests/unit/site-intel-scoring-and-heuristics.test.ts`).
- DoH/DNS/email-auth/DNSBL/RDAP/Wayback/HSTS engines: unit tested against
  mocked `fetch` (`tests/unit/site-intel-network-engines.test.ts`).
- Full app type-check (`tsc --noEmit -p tsconfig.app.json`) is clean.
- Full production build (`pnpm build`) succeeds; the tool lazy-loads as its
  own chunk (`SiteIntelWorkspace-*.js`).
- `pnpm vitest run tests/unit` — 1264/1266 passing; the 2 failures are
  pre-existing, unrelated `markdown-citation.test.ts` timeouts in a different
  tool, not caused by this work.
- `tests/e2e/site-intel.spec.ts` passes on both `desktop-chromium` and
  `mobile-chromium` Playwright projects (tab navigation, lexical breadcrumb,
  typosquat/tracking-param detection, scorecard rendering, export buttons
  present).

## Definition of done (required before proposing a merge to `main`)

- [ ] Every row above is `Done` or has an explicitly accepted `Partial`/
      `Blocked` rationale reviewed by a human maintainer (not silently
      downgraded).
- [ ] Outstanding-work checklist above is empty or explicitly deferred with
      rationale moved into this file's substitutions section.
- [ ] Full unit suite green with zero unrelated regressions.
- [ ] `tests/e2e/site-intel.spec.ts` green on both configured Playwright
      projects, plus at least one additional real-network validation run
      confirming DoH/RDAP/CT/Wayback/HSTS/ipapi.co endpoints behave as
      documented above (see verification notes).
- [ ] `pnpm build` green.
- [ ] This file reconciled with actual code state (no stale checkmarks).

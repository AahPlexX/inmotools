# Site Intelligence Analyzer — Living Tracking Document

**Do not let this document go stale.** Update it in the same change that alters
implementation status. This is the single source of truth for what is done,
what is partial, and what remains for this tool. It lives only inside this
tool's own directory (`src/tools/site-intel/`) per the scoped-permissions rule
for this workstream.

- Branch: `feature/site-analysis-workstation` (this worktree is
  `inmotools-site-analysis`, checked out from `origin/main` at the time this
  branch was created; it has since been pushed to `origin/feature/site-analysis-workstation`
  but has **not** been merged and must not be merged until every item below is
  either Done or explicitly accepted as Rejected/Deferred with rationale).
- Tool slug: `site-intelligence-analyzer` (registered in `src/catalog.ts` and
  `src/tools/workspaces.tsx`).
- No "AI" branding anywhere in this tool's copy, feature names, or docs. Every
  finding is produced by deterministic parsing, public-API telemetry, or
  static heuristic pattern matching — never a model.

## How to resume this work

1. Read this file top to bottom before changing anything.
2. Re-run `pnpm exec tsc --noEmit -p tsconfig.app.json`, the `site-intel-*`
   unit tests, and `tests/e2e/site-intel.spec.ts` before and after your change.
3. **Run `pnpm build` before running e2e tests whenever source has changed.**
   `playwright.config.ts`'s `webServer` runs `vite preview`, which only serves
   the existing `dist/` folder — it does not rebuild. Testing against a stale
   build looks like passing-but-wrong or mysteriously-timing-out assertions
   for newly added UI, not a build error (learned the hard way on 2026-09-18).
4. Update the status table and the "Known blockers / explicit substitutions"
   section in the same commit as any implementation change.
5. Do not merge to `main` until Section "Definition of done" is fully satisfied.

## Status legend

`Done` = implemented, unit-tested (and/or e2e-covered), builds clean.
`Partial` = implemented but with a named, narrower scope than the spec text.
`Blocked` = cannot be implemented as literally specified in a static,
client-only, CORS-constrained environment; a substitution is implemented and
flagged, or the feature is stubbed pending a resolvable blocker (e.g. a
user-supplied credential).

## Feature status (all 38)

### Group 1 — Core URL Parsing, Lexical Forensics & Syntactic Security
| # | Feature | Status | Implementation |
|---|---|---|---|
| 1 | RFC 3986 canonical URL decomposition engine | Done | `url-forensics.ts:parseUrl`, breadcrumb UI in `SiteIntelWorkspace.tsx` |
| 2 | Homoglyph & Punycode (IDN) spoofing detector | Done | `url-forensics.ts:detectHomoglyphs`, curated confusable map in `reference-data.ts` |
| 3 | Lexical Shannon entropy & DGA analyzer | Done | `url-forensics.ts:shannonEntropy` |
| 4 | Typosquatting & Levenshtein brand-distance calculator | Done | `url-forensics.ts:findTyposquatMatches` against curated `BRAND_REFERENCE_DOMAINS` (~175 domains as of 2026-09-18, not a live Tranco fetch — see substitutions) |
| 5 | Query parameter & privacy tracking profiler | Done | `url-forensics.ts:classifyQueryParams` / `buildSanitizedUrl` |
| 6 | Deep URL shortener & vanity link detector | Done | `url-forensics.ts:detectShortener` (detection) + `shortener-resolver.ts:resolveShortenedUrl` (best-effort client-side redirect resolution, wired to a "Resolve destination" button; degrades to an honest CORS-blocked explanation when a service does not allow it — see substitutions) |

### Group 2 — DNS Architecture, Infrastructure & Network Routing
| # | Feature | Status | Implementation |
|---|---|---|---|
| 7 | DNS-over-HTTPS multi-record resolving engine | Done | `doh-client.ts`, `dns-engine.ts:fetchDnsTable` (Cloudflare primary, Google fallback), PTR hover via `resolvePtrRecords` |
| 8 | IPv6 readiness & dual-stack auditor | Done | `dns-engine.ts:auditIpv6Readiness` |
| 9 | Nameserver geographic & ASN redundancy checker | Done | `network-engine.ts:checkNameserverRedundancy` |
| 10 | CAA record validator | Done | `dns-engine.ts:validateCaaRecords` |
| 11 | DNSSEC cryptographic chain verification | Partial | `dns-engine.ts:checkDnssecSignals` reports DNSKEY/DS/RRSIG presence plus the resolver's authenticated-data (AD) bit rather than re-deriving the full root-to-zone signature chain client-side (see substitutions) |
| 12 | BGP ASN & hosting profiler | Done | `network-engine.ts:profileHosting` via ipapi.co |
| 13 | GeoIP server location & Anycast detector | Done | `network-engine.ts:detectAnycast`, `components/GeoMinimap.tsx` (interactive equirectangular lat/long minimap with click-to-inspect markers — see substitutions for why it draws a graticule instead of coastlines) |

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
| 23 | Mixed content risk & default scheme security analyzer | Done | `url-forensics.ts:analyzeSchemeSecurity` (merged from a standalone file 2026-09-18, see ponytail-audit note below) |

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
| 28 | Public Core Web Vitals (CrUX) explorer | Blocked → user-key pattern implemented | `crux-engine.ts`; requires a user-supplied free Google CrUX API key stored only in local IndexedDB (Settings panel). No key ships in the bundle. This is a genuine external-credential blocker per the task's own escalation rule — flagged, not silently worked around. |
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

1. **Feature 28 (CrUX)** — genuine credential blocker. The Chrome UX Report
   API requires a Google Cloud API key; there is no account-free way to call
   it from a static site on behalf of every visitor. Resolution: users supply
   their own free key, stored only in local IndexedDB. Not silently worked
   around; surfaced in the UI as a "blocked" state with instructions until a
   key is supplied.
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
5. **Feature 6 (shortener redirect-unwrapping)** — resolved per option (b) in
   the original judgment-call note: `shortener-resolver.ts` makes a bounded,
   honestly-labeled best-effort `fetch(..., { redirect: 'follow' })` attempt.
   It reads `response.url` when the browser discloses a different final URL,
   and otherwise shows a plain-language explanation that the shortener does
   not allow cross-origin resolution rather than pretending to have resolved
   it. Verified end-to-end against a real `bit.ly` URL in
   `tests/e2e/site-intel.spec.ts` (asserts one of the two honest outcomes,
   not a specific one, since success is inherently target-dependent).
6. **Feature 13 (GeoIP minimap)** — no world-map/coastline dataset exists
   anywhere in this repository to reuse (verified by search), and bundling an
   unverified third-party coastline dataset was rejected rather than
   fabricated. `GeoMinimap.tsx` instead draws an honest equirectangular
   lat/long graticule (30° meridians/parallels) with clickable markers at
   each resolved IP's coordinates — accurate, verifiable, and needs no new
   dependency or bundled asset.
7. **ipapi.co dependency (Features 9, 12, 13)** — free-tier rate limits and
   CORS terms should be re-verified from https://ipapi.co/api/ in a
   network-enabled environment before this ships to real production traffic
   at scale.

## Outstanding work (not yet started / not yet complete)

- [x] ~~GeoIP interactive minimap UI for Feature 13~~ — done 2026-09-18
      (`components/GeoMinimap.tsx`).
- [x] ~~Decide and implement the Feature 6 substitution judgment call~~ — done
      2026-09-18 (`shortener-resolver.ts`, option (b): best-effort resolve).
- [x] ~~Broaden `BRAND_REFERENCE_DOMAINS`~~ — done 2026-09-18, ~175 curated
      domains across finance, retail, airlines, government, education,
      streaming, crypto/fintech, and telecom.
- [x] ~~Add focused unit coverage for `export-engine.ts`~~ — done 2026-09-18
      (`tests/unit/site-intel-export-engine.test.ts`, 5 tests covering
      JSON/Markdown/CSV/PDF output shape).
- [ ] `social-card-engine.ts` still has no headless unit test — it needs a
      real `<canvas>` (no `document` in this repo's Node/vitest environment,
      and adding jsdom/node-canvas just for this one function would be new
      dependency bloat for marginal value). It is instead exercised by the
      real-browser e2e test ("renders a GeoIP minimap panel and generates a
      downloadable social card"), which is arguably more faithful anyway.
      Revisit only if jsdom becomes a repo-wide dependency for other reasons.
- [ ] Add an e2e assertion that actually exercises a real DNS/RDAP/CT round
      trip end-to-end with asserted *content* (current spec intentionally
      only asserts UI-shell/best-effort-outcome behavior so it does not
      become flaky when run without outbound internet access; both e2e runs
      so far happened to have real internet access and passed against live
      Cloudflare DoH/RDAP/Wayback/HSTS/ipapi.co responses, but that is not
      guaranteed in every environment this suite might run in).
- [ ] Content-Security-Policy / `connect-src` allowlist review for every
      external host this tool calls (Cloudflare/Google DoH, rdap.org,
      web.archive.org, crt.sh, hstspreload.org, ipapi.co, chromeuxreport
      googleapis.com) if/when this repository adopts a CSP meta tag. This is
      deliberately left to a maintainer decision since a document-level CSP
      would affect every other tool in this shared app, not just this one.
- [ ] Visual polish pass (spacing, empty states) beyond the light-theme-token
      fix already applied to `site-intel-workspace.css` on 2026-09-18.

## Verified/implemented so far (what a resuming agent can trust as tested)

- All Group 1 functions: 14 unit tests passing (`tests/unit/site-intel-url-forensics.test.ts`).
- Scoring, mixed-content, CDN/CMS fingerprint heuristics: unit tested
  (`tests/unit/site-intel-scoring-and-heuristics.test.ts`).
- DoH/DNS/email-auth/DNSBL/RDAP/Wayback/HSTS engines: unit tested against
  mocked `fetch` (`tests/unit/site-intel-network-engines.test.ts`).
- Export pipeline (JSON/Markdown/CSV/PDF byte-for-byte shape): unit tested
  (`tests/unit/site-intel-export-engine.test.ts`, 5 tests).
- Best-effort shortener resolution (resolved / not-disclosed / CORS-blocked
  paths): unit tested against mocked `fetch`
  (`tests/unit/site-intel-shortener-resolver.test.ts`, 3 tests).
- Full app type-check (`tsc --noEmit -p tsconfig.app.json`) is clean.
- Full production build (`pnpm build`) succeeds; the tool lazy-loads as its
  own chunk (`SiteIntelWorkspace-*.js`).
- `pnpm vitest run tests/unit` — 1273/1274 passing (as of 2026-09-18); the 1
  failure is a pre-existing, unrelated `markdown-citation.test.ts` timeout in
  a different tool, not caused by this work (it is flaky in isolation too —
  observed 2 failures in one run and 1 in the next, same test, same file).
- `tests/e2e/site-intel.spec.ts` (8 tests) passes on both `desktop-chromium`
  and `mobile-chromium` Playwright projects as of 2026-09-18: tab navigation,
  lexical breadcrumb, typosquat/tracking-param detection, scorecard
  rendering, export buttons present, shortener detection + best-effort
  resolve action, GeoIP minimap rendering, and social-card PNG download.
  This run had real outbound internet access, so it also incidentally
  exercised live Cloudflare DoH, rdap.org, web.archive.org, hstspreload.org,
  and ipapi.co responses end-to-end without a documented format mismatch.
- **ponytail-review pass (2026-09-18):** three cuts applied and re-verified
  green (tsc + unit + e2e): inlined the single-caller `lookupIpIntelBatch`
  wrapper into `profileHosting`; dropped a speculative regex-based JSON
  repair in `ct-engine.ts` for an unverified crt.sh quirk (plain `res.json()`
  now, existing try/catch already degrades gracefully); deleted a dead
  `v6`-destructured-then-voided placeholder in `SiteIntelWorkspace.tsx`.
  `ScoreRadar.tsx`'s custom SVG (vs. the already-installed `chart.js`) was
  considered and deliberately kept — chart.js's canvas radar has no built-in
  per-vertex click-to-navigate, which this tool needs.
- **ponytail-audit pass (2026-09-18, whole-tool scan):** three more cuts,
  re-verified green: deleted `CruxReport.collectionPeriod` (declared and
  parsed for, never assigned or read anywhere); deleted
  `ExportBundle.findingsByVector` (computed on every render, never read by
  `exportJson`/`Markdown`/`Csv`/`Pdf` — they all read `scorecard.vectors`
  directly; JSON export still contains the same data via `scorecard`, just
  without the redundant reshaped copy); merged `mixed-content-engine.ts`
  (Feature 23, a 22-line file exporting exactly one pure/sync function with
  no network dependency) into `url-forensics.ts` alongside every other
  Group 1 function, then deleted the standalone file. `social-card-engine.ts`
  and `shortener-resolver.ts` were also single-export files but were kept
  separate — `social-card-engine.ts` isolates canvas-only rendering from
  React component code, and `shortener-resolver.ts` isolates async/network
  code from `url-forensics.ts`'s deliberately pure/sync contract, both real
  boundaries rather than arbitrary splits.
- **Reminder for future runs:** `pnpm build` must be re-run before `playwright
  test` whenever source changed since the last build — `vite preview` only
  serves the existing `dist/` folder and will silently serve stale UI
  otherwise (see "How to resume this work" above).

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

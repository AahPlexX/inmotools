---
tool: site-intelligence-analyzer
folder: src/tools/site-intel
doc: tracker
basis: as-built
status: active
spec: docs/superpowers/specs/2026-10-05-site-intelligence-analyzer-design.md
tracker: src/tools/site-intel/TRACKER.md
updated: 2026-10-05
---

# Site Intelligence Analyzer — tracker

## Resume here

96 requirements: 26 verified, 23 implemented, 4 partial, 41 missing, 2 prohibited. Next action: port the archived fixes (task T-site-intelligence-analyzer-20261005-5f7e), then build the page and HTML audit rows.

## Documents

- Spec: [2026-10-05-site-intelligence-analyzer-design.md](../../../docs/superpowers/specs/2026-10-05-site-intelligence-analyzer-design.md)
- Older tracking file (Features 1–38, substitutions, evidence): [TRACKING.md](TRACKING.md)
- Tasks: `.tasks/items/T-site-intelligence-analyzer-20261003-ba98.md` (CrUX key removal, done), `.tasks/items/T-site-intelligence-analyzer-20261005-5f7e.md` (archived fixes, next), `.tasks/items/T-site-intelligence-analyzer-20261005-6a8f.md` (ledger gaps, next)
- Archived work: tag `archive/site-intel-local-20260918`
- Index row: [TOOL_INDEX.md](../../../docs/TOOL_INDEX.md)
- Tests: `tests/unit/site-intel-*.test.ts`, `tests/e2e/site-intel.spec.ts`, `tests/e2e/accessibility.spec.ts`

## Requirement status

`e2e` = `tests/e2e/site-intel.spec.ts` (accessibility: `tests/e2e/accessibility.spec.ts`); `unit` = `tests/unit/site-intel-*.test.ts`.

### URL parsing and lexical forensics

| ID | Status | Evidence | Notes |
| --- | --- | --- | --- |
| SIA-R01 | verified | e2e "parses a bare domain into a lexical breadcrumb and renders the composite scorecard"; unit "repairs a bare domain by adding https and splitting host", "parses a fully specified URL with port, path, query, and fragment", "flags an out-of-bounds port" |  |
| SIA-R02 | verified | unit "flags Cyrillic confusables mixed with Latin characters", "does not flag a plain ASCII hostname" |  |
| SIA-R03 | verified | unit "scores a short, repetitive label as low entropy", "scores a long random-looking token as high entropy" |  |
| SIA-R04 | verified | e2e "parses a bare domain into a lexical breadcrumb and renders the composite scorecard"; unit "flags a single-character substitution against a known brand", "does not flag the exact brand domain itself" |  |
| SIA-R05 | verified | e2e "parses a bare domain into a lexical breadcrumb and renders the composite scorecard"; unit "categorizes known tracking keys", "strips tracking and session params from the sanitized URL" |  |
| SIA-R06 | implemented | — |  |
| SIA-R07 | verified | e2e "short-link resolution is explicit and only contacts the destination after user action"; unit "identifies a known shortener host", "does not flag an ordinary host" |  |
| SIA-R08 | verified | unit "flags plaintext HTTP as a risk", "flags embedded credentials and non-standard ports", "treats https with no port/credentials as good" |  |
| SIA-R09 | missing | — |  |

### DNS, network and hosting

| ID | Status | Evidence | Notes |
| --- | --- | --- | --- |
| SIA-R10 | verified | unit "parses a successful A-record answer" |  |
| SIA-R11 | implemented | — |  |
| SIA-R12 | missing | — | Archived fixes on tag `archive/site-intel-local-20260918` (task T-site-intelligence-analyzer-20261005-5f7e) |
| SIA-R13 | verified | unit "reports IPv6 readiness when AAAA answers exist" |  |
| SIA-R14 | implemented | — |  |
| SIA-R15 | verified | unit "flags missing CAA records as a rogue-issuance risk" |  |
| SIA-R16 | partial | — | Full root-to-zone signature chain validation is not done in the browser; presence and the resolver's AD bit are reported |
| SIA-R17 | verified | e2e "hosting coordinates render an accessible GeoIP distribution minimap" | ipapi.co free-tier limits apply |
| SIA-R18 | verified | e2e "hosting coordinates render an accessible GeoIP distribution minimap" |  |
| SIA-R19 | implemented | — |  |
| SIA-R20 | verified | unit "reports clean when no DNSBL zone returns a listing", "reports a risk when at least one zone lists the target" |  |
| SIA-R21 | implemented | — |  |
| SIA-R22 | missing | — |  |
| SIA-R23 | verified | unit "detects a known CDN suffix", "reports no match for an unrecognized host" |  |

### Registration and history

| ID | Status | Evidence | Notes |
| --- | --- | --- | --- |
| SIA-R24 | implemented | — |  |
| SIA-R25 | verified | unit "flags a newly registered domain as high risk" |  |
| SIA-R26 | verified | unit "flags a redemptionPeriod status as an expiration risk" |  |
| SIA-R27 | partial | unit "summarizes captures and detects content-change points via digest" | Page-title change detection is replaced by CDX content-digest changes |
| SIA-R28 | missing | — |  |

### TLS and certificates

| ID | Status | Evidence | Notes |
| --- | --- | --- | --- |
| SIA-R29 | implemented | — | crt.sh has no CORS or uptime guarantee |
| SIA-R30 | implemented | — |  |
| SIA-R31 | missing | — | Currently truncated at 50 without a note |
| SIA-R32 | implemented | — |  |
| SIA-R33 | verified | unit "describes a preloaded domain as good" |  |

### Email authentication

| ID | Status | Evidence | Notes |
| --- | --- | --- | --- |
| SIA-R34 | verified | unit "identifies backup MX presence" |  |
| SIA-R35 | verified | unit "flags an insecure +all SPF wildcard" |  |
| SIA-R36 | missing | — |  |
| SIA-R37 | missing | — | Archived fix (task T-site-intelligence-analyzer-20261005-5f7e) |
| SIA-R38 | verified | unit "flags a missing DMARC record as a spoofing risk", "parses a DMARC policy tag" |  |
| SIA-R39 | verified | unit "reports no BIMI record gracefully" |  |

### Performance and technology

| ID | Status | Evidence | Notes |
| --- | --- | --- | --- |
| SIA-R40 | prohibited | — | Needs an API key (Google Cloud key for the CrUX API); platform rules allow keyless sources only |
| SIA-R41 | verified | e2e "has no CrUX API key field, clears a previously stored key and never calls the CrUX API"; unit "has no API key field, key storage or key-bearing request in its source", "lists the retired CrUX key setting for removal" |  |
| SIA-R42 | verified | unit "detects a WordPress path signature" |  |
| SIA-R43 | implemented | — |  |

### Page and HTML audit

| ID | Status | Evidence | Notes |
| --- | --- | --- | --- |
| SIA-R44 | missing | — |  |
| SIA-R45 | missing | — |  |
| SIA-R46 | prohibited | — | Needs a server (proxy); platform rules allow no server |
| SIA-R47 | missing | — |  |
| SIA-R48 | missing | — |  |
| SIA-R49 | missing | — |  |
| SIA-R50 | missing | — |  |
| SIA-R51 | missing | — |  |
| SIA-R52 | missing | — |  |
| SIA-R53 | missing | — |  |
| SIA-R54 | missing | — |  |
| SIA-R55 | missing | — |  |
| SIA-R56 | missing | — |  |
| SIA-R57 | missing | — |  |
| SIA-R58 | missing | — |  |
| SIA-R59 | missing | — |  |
| SIA-R60 | missing | — |  |
| SIA-R61 | missing | — |  |
| SIA-R62 | missing | — |  |
| SIA-R63 | missing | — |  |
| SIA-R64 | missing | — |  |
| SIA-R65 | missing | — |  |
| SIA-R66 | missing | — |  |
| SIA-R67 | missing | — |  |
| SIA-R68 | missing | — |  |
| SIA-R69 | missing | — |  |
| SIA-R70 | missing | — |  |
| SIA-R71 | missing | — |  |
| SIA-R72 | missing | — |  |
| SIA-R73 | missing | — |  |
| SIA-R74 | missing | — |  |
| SIA-R75 | missing | — |  |

### Scorecard, export and vault

| ID | Status | Evidence | Notes |
| --- | --- | --- | --- |
| SIA-R76 | verified | e2e "parses a bare domain into a lexical breadcrumb and renders the composite scorecard"; unit "grades a clean report as A+", "penalizes risk findings more than warn findings", "maps score bands to expected letter grades" |  |
| SIA-R77 | implemented | — |  |
| SIA-R78 | missing | — |  |
| SIA-R79 | implemented | — |  |
| SIA-R80 | implemented | — |  |
| SIA-R81 | implemented | — |  |
| SIA-R82 | implemented | — |  |
| SIA-R83 | implemented | — |  |
| SIA-R84 | missing | — | Archived fix (task T-site-intelligence-analyzer-20261005-5f7e) |
| SIA-R85 | implemented | — |  |
| SIA-R86 | implemented | — |  |
| SIA-R87 | implemented | — |  |
| SIA-R88 | implemented | — |  |
| SIA-R89 | implemented | — |  |
| SIA-R90 | partial | — | Vault storage indexes tags and has a search function; the workspace offers no tag field or search box |
| SIA-R91 | missing | — |  |

### Non-functional

| ID | Status | Evidence | Notes |
| --- | --- | --- | --- |
| SIA-R92 | verified | e2e "every tab in the sticky section nav is reachable and shows its heading" |  |
| SIA-R93 | partial | — | Workspace colours use the site palette variables; six literal colours remain in `site-intel-workspace.css`; no dark-theme contrast check covers this workspace |
| SIA-R94 | implemented | — | No viewport check exists |
| SIA-R95 | verified | e2e "has no serious or critical axe violations at <route>" | `tests/e2e/accessibility.spec.ts`, route `#/tools/site-intelligence-analyzer` |
| SIA-R96 | implemented | — |  |

## Open work

1. Archived fixes (T-site-intelligence-analyzer-20261005-5f7e): lookup failure vs absent record, SPF literal hostname, SAN overflow note, click-to-copy, Wayback per-year counts, raw telemetry in JSON, keyboard list beside the node graph.
2. Page and HTML audit rows (HTML input, live CORS fetch, and every check under "Page and HTML audit").
3. SPF nested include resolution; prioritized fix list; vault tags, search and re-open.
4. Dark-theme contrast check and viewport check; tests for the `implemented` rows (exports, social card, vault, RDAP, CT, node graph).

## Known limitations

- DNSSEC is reported from record presence and the resolver's AD bit, not a full chain validation.
- Wayback change points use content digests, not page titles.
- crt.sh and ipapi.co have no CORS or uptime guarantee; failures show as blocked.
- Only CORS-exposed response headers of other sites can be read.

## Verification evidence

- 2026-10-05, `expand/site-intelligence-analyzer` from `main` @ `b159b359`: `pnpm tool:check site-intelligence-analyzer --base origin/main` 28/96 (verified 26, implemented 23, partial 4, missing 41, prohibited 2), no errors; `pnpm docs:sync` and `pnpm docs:check` passed; `pnpm exec vitest run tests/unit/cad-progress.test.ts tests/unit/sheets-wave-b.test.ts tests/unit/deployment-config.test.ts` 23 passed.
- Earlier evidence (Features 1–38): [TRACKING.md](TRACKING.md) "Verified/implemented so far".

## Change log

- 2026-10-05 — Created per `docs/DOCUMENTATION_STANDARD.md`: 96 requirements, 26 verified, 23 implemented, 4 partial, 41 missing, 2 prohibited.

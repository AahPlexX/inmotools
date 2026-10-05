---
tool: har-sanitizer
folder: src/tools/har
doc: tracker
basis: as-built
status: done
spec: docs/superpowers/specs/2026-10-01-har-sanitizer-design.md
tracker: src/tools/har/TRACKER.md
updated: 2026-10-04
---

# HAR Sanitizer — tracker

## Resume here

On `origin/main`. 18 requirements: 16 verified, 2 missing (HAR-R17, HAR-R18). Next action: build HAR-R18; HAR-R17 with the site-wide theme selector. No blocker.

## Documents

- Spec: [2026-10-01-har-sanitizer-design.md](../../../docs/superpowers/specs/2026-10-01-har-sanitizer-design.md)
- Original design and audit addendum: "Tool 11" in [2026-08-29-next-ten-local-tools-design.md](../../../docs/superpowers/specs/2026-08-29-next-ten-local-tools-design.md)
- Behaviour notes and fixes: [README.md](README.md)
- Task history: `.tasks/DONE.md` (2026-10-01 audit entry)
- Index row: [TOOL_INDEX.md](../../../docs/TOOL_INDEX.md)
- Unit tests: `tests/unit/har.test.ts`; browser tests: `tests/e2e/har.spec.ts`

## Requirement status

`unit` = `tests/unit/har.test.ts`; `e2e` = `tests/e2e/har.spec.ts`.

| ID | Status | Evidence | Notes |
| --- | --- | --- | --- |
| HAR-R01 | verified | e2e "prepares, reviews, and only then downloads a lossless sanitized HAR" (file picker), e2e "HAR-R01 loads a HAR by drag-and-drop and by the sample, and Clear empties it" | |
| HAR-R02 | verified | unit "finds headers, cookies, URL/query values, URL credentials, redirect credentials, form bodies, and response JSON without echoing values" | |
| HAR-R03 | verified | unit "finds and redacts emails, server IPs, and extra field names only when those controls are on" | |
| HAR-R04 | verified | unit "reports URL user:password as a credential, not as an email address" | |
| HAR-R05 | verified | unit "redacts credentials across…", "hashes deterministically and supports a custom mask" | |
| HAR-R06 | verified | unit "base64 bodies" group | |
| HAR-R07 | verified | unit "preserves unsafe integer JSON lexemes…", "preserves unsupported exponent numeric lexemes…", "preserves a literal __proto__ member…", "round-trips significant decimal digits…"; e2e checks `9007199254740993` in the download | |
| HAR-R08 | verified | unit "reports only deliberately unselected credential locations as remaining risk"; e2e "prepares, reviews, and only then downloads a lossless sanitized HAR" | |
| HAR-R09 | verified | e2e "HAR-R09 any policy change invalidates the prepared file" | |
| HAR-R10 | verified | unit "hides credentials in the on-screen URL without changing the export policy" | |
| HAR-R11 | verified | e2e "filters findings and exposes a bounded accessible request table" (category filter), e2e "HAR-R11 a finding jumps to its request" | |
| HAR-R12 | verified | e2e "HAR-R12 downloads a findings CSV with category, request number and path only" | |
| HAR-R13 | verified | e2e "filters findings and exposes a bounded accessible request table", e2e "HAR-R13 search narrows the request table" | |
| HAR-R14 | verified | unit "does not double-count SSL inside connect in waterfall phases", "uses protected decimal timings for the waterfall…"; e2e "HAR-R14 windows waterfall rows to the scrollport at the device pixel ratio" | |
| HAR-R15 | verified | `tests/e2e/accessibility.spec.ts` route `har-sanitizer` | |
| HAR-R16 | verified | e2e "HAR-R16 lays out without horizontal overflow at <name> px" | |
| HAR-R17 | missing | — | Delivered through the site-wide theme selector |
| HAR-R18 | missing | — | Added 2026-10-02 |

## Open work

0. Build the requirements added 2026-10-02: HAR-R18.
1. HAR-R17 with the site-wide theme selector.

## Known limitations

- SHA-256 mode is a stable stand-in, not encryption (README).

## Verification evidence

- 2026-10-04, `expand/har-sanitizer`: `pnpm build`; `PW_PORT=4205 pnpm exec playwright test tests/e2e/har.spec.ts --repeat-each=3` 69 passed, 21 skipped (viewport matrix runs on the desktop project only), 0 failed; covers HAR-R01, R09, R11, R12, R13, R14, R16.
- 2026-10-01, `main` @ `2d1e07f5`: `tests/unit/har.test.ts` 15/15; `tests/e2e/har.spec.ts` 4 passed (desktop and mobile); accessibility spec for the route 2 passed.

## Change log

- 2026-10-04 — Covered HAR-R01, R09, R11, R12, R16 with browser tests (now verified); added the search test for HAR-R13 and the row-windowing and device-pixel-ratio test for HAR-R14.
- 2026-10-02 — Added HAR-R18 (default integration rule).
- 2026-10-01 — Created per `docs/DOCUMENTATION_STANDARD.md`.

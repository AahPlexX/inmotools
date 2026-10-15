---
task: T-tactical-matchboard-studio-20261012-r121
tool: tactical-matchboard-studio
doc: task
kind: fix
state: done
branch: cursor/matchboard-pdf-unicode-review-fixes
created: 2026-10-12
updated: 2026-10-15
---

# Matchboard coaching PDF Unicode review fixes

## Request

PR #121 merged to main at 248af883 (squash of tip 74555385). Automated reviewers (Greptile, Sourcery, CodeAnt, Copilot) commented AFTER the merge and nobody addressed them. Do one fix pass: first read those review comments on https://github.com/AahPlexX/inmotools/pull/121 and VERIFY each finding against the code on main before changing anything; fix only the real ones, and say which you rejected and why. Findings to check:
1. The Teams line swaps unsupported characters for '?', but metadata.json does not store team or player names, so a name such as 字 is lost from both outputs, which contradicts what the help text promises. Either store the original names in metadata (if that fits the existing metadata schema and its tests) or change the help text to state the exact behavior; pick the one the existing docs and ledger support.
2. THIRD_PARTY_NOTICES.md names @pdf-lib/fontkit as MIT but omits the MIT copyright and permission notice although fontkit code ships in the bundle. Add the full MIT notice with the correct copyright holders, verified from the package's primary source (npm tarball or upstream repo license); do not guess holders. Check whether pdf-lib's and pako's licenses also need notices for code that now ships, and add if so.
3. Two teams with plain basic-Latin names still load the ~1 MB Unicode font chunk and add a Teams line because the separator character counts as non-Latin. Fix the detection so basic-Latin-only rosters stay on Helvetica with no extra line and no font chunk load, with a test.
4. The Teams line silently keeps only six wrapped lines, so long rosters lose names with no indication. Make truncation visible (for example an explicit '+N more' marker) or wrap fully, with a test.
5. Smaller items: when the font fails to load the export silently substitutes '?' with no warning, so surface a visible notice or status; decomposed accents (combining marks) may render wrong, so test and handle or document; an empty team name yields a leading colon; the '?' fallback constant is defined in two places, so dedupe.
Rules: new branch cursor/matchboard-pdf-unicode-review-fixes from current origin/main, DRAFT PR against main, do not undraft or merge. Exact pins only; do not add dependencies. No vendor agent files. Add unit tests for an unsupported roster name and for two ASCII teams loading no font chunk; run tsc, build, lint, tactics units, the Matchboard Playwright spec, docs:check; update ledger, HANDOFF tip SHA, changelog and copy so nothing is stale (instructional copy, no filler). Report: new tip SHA, PR URL, which findings were real vs rejected with evidence, test counts, CI links.

Owner exception to GOVERNANCE.md §3 and the branch workflow: this task does not use `pnpm task:start`, and the branch is `cursor/matchboard-pdf-unicode-review-fixes` with a draft pull request so `integrate.yml` cannot auto-merge it.

## Resume here

DONE. PR #122 was squash-merged to `main` as `2eb5bec8bf112057cafd51f63705b843825bd554` on 2026-10-14. Nothing for PDF Unicode remains in flight. The successor work unit is `T-tactical-matchboard-studio-20261014-r82` on `fix/tactical-matchboard-studio`, implementing TMS-R82 site-theme behavior.

## Log

- 2026-10-12: claimed `cursor/matchboard-pdf-unicode-review-fixes` from `origin/main` `248af883`. Every finding was checked against main before changing code.
- 2026-10-12: implementation `d36406ead39061d7817857a67041c75dbc80c577`. `pnpm build` (includes `tsc --noEmit -p tsconfig.app.json`) succeeded. `pnpm lint` exited 0. `tests/unit/tactics-*.test.ts` 176/176; the seven new export tests fail against main's `export-pdf.ts`. `tests/e2e/tactical-matchboard-studio.spec.ts` 80 passed, 2 skipped. `pnpm docs:check` passed. `pnpm tool:check tactical-matchboard-studio --base origin/main` 76/85, no errors. Lazy chunk `pdf-unicode-font-*.js` unchanged at 1,023.46 kB, gzip 493.18 kB. Integrating commit: none yet.
- 2026-10-12: notice and copy correction, no export logic change. THIRD_PARTY_NOTICES.md lists both bundled versions of `base64-js` (1.3.1, 1.3.0) and `tiny-inflate` (1.0.2, 1.0.3), names `rollup-plugin-node-builtins` 2.1.2 as the source of the `EventEmitter` and stream sections with no copyright holder published, and calls itself the repository's notice record. Help and the PDF note say N counts players left off, plus 1 for each left-off team that has no players.
- 2026-10-14: PR #122 was marked ready after its checks and review threads were confirmed clean, then squash-merged to `main` as `2eb5bec8bf112057cafd51f63705b843825bd554`. This task is closed; no Unicode-PDF follow-up remains pending.

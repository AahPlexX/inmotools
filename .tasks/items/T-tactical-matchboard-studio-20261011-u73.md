---
task: T-tactical-matchboard-studio-20261011-u73
tool: tactical-matchboard-studio
doc: task
kind: expand
state: active
branch: cursor/matchboard-pdf-unicode
created: 2026-10-11
updated: 2026-10-11
---

# Matchboard coaching PDF Unicode page text

## Request

Repo AahPlexX/inmotools, base = current origin/main. Owner-authorized task: remove the Tactical Matchboard PDF WinAnsi limitation by adding @pdf-lib/fontkit and an embedded Unicode font to the Matchboard PDF export only. The Matchboard residuals wave is already on main (#100, 67/67). Known facts: PDF page text is currently WinAnsi, so characters outside basic Latin (for example accented player names, non-Latin scripts) fail or degrade. Unicode page text needs a font embedder.

Rules: read GOVERNANCE.md, HANDOFF/FEATURE_MATRIX/standard tracker conventions and CI workflows first and obey them. Do not create AGENTS.md, CLAUDE.md, .cursorrules or any vendor agent file. Browser-local only: no network fetch at export time, no backend, no auth, no AI. EXACT dependency pins (no ^ or ~), pnpm lockfile hygiene, and record dependency evidence (version, license, why, size) wherever the repo records pins. Choose a font with a permissive open license (for example SIL OFL) that covers Latin, Latin Extended, Greek and Cyrillic at minimum; verify the license from the primary source and record it plus any attribution the license requires in the repo's notices location. Keep bundle impact small: load the font and fontkit lazily only when a PDF export runs (dynamic import, separate chunk), subset or otherwise limit font size, and report the added bytes (gzip) honestly. Keep the existing PDF export behavior and layout otherwise identical; characters the font cannot cover must degrade visibly and predictably, never throw or silently drop the whole export. Do not touch the PDF tool, sheets, or other tools beyond a conflict-free dependency addition.

Tests (required): unit tests that export a Matchboard PDF with accented Latin, Greek and Cyrillic player/team names and assert the PDF builds and the text is embedded using the Unicode font (not WinAnsi), plus a fallback test for an uncovered glyph; update the Playwright spec if the export flow is covered there; keep all existing Matchboard tests green (167 units, 80 pass/2 skip e2e baseline). Update FEATURE_MATRIX/ledger rows, standard tracker (TMS requirements that mention PDF/Unicode), HANDOFF tip SHA, changelog and help copy: remove the WinAnsi residual statement and replace it with the new behavior. Copy must be instructional (what to do, what appears), no filler, every term used only after it is taught. Final stale-reference sweep.

Branch and PR: create branch cursor/matchboard-pdf-unicode (NOT feature/, expand/ or fix/, so the integrate workflow cannot auto-merge it). Open a DRAFT PR against main. Do not undraft or merge. Run tsc, production build, lint, focused tactics units, the Matchboard Playwright spec, docs:check and the repo gates; report exact counts and CI links.

REPORT BACK conclusions: new tip SHA, PR URL, exact pins and license evidence, added bundle bytes, font chosen and why, test counts and CI results (note anything running or red and whether it is out of suite), ledger counts, confirmation no vendor agent files, and anything a reviewer must double-check.

Owner exception to GOVERNANCE.md §3 and the branch workflow: this task does not use `pnpm task:start`, and the branch is `cursor/matchboard-pdf-unicode` with a draft pull request so `integrate.yml` cannot auto-merge it.

## Resume here

TMS-R73 is verified on `cursor/matchboard-pdf-unicode`. The draft pull request stays draft. Do not undraft or merge. Do not start another feature row.

## Log

- 2026-10-11: claimed `cursor/matchboard-pdf-unicode` from `origin/main` `e134af68a6d8670f545a7bc1a4d568deb3d0b3bf`. `@pdf-lib/fontkit` 1.1.1 and the Noto Sans v2.015 subset embed Matchboard PDF page text outside basic Latin. A letter outside the subset is shown as ?.
- 2026-10-11: implementation `9a298eeebdf2981f5babfe0512b6c7f2da33a287`. `pnpm exec tsc --noEmit -p tsconfig.app.json` is inside `pnpm build`, which succeeded. `pnpm lint` exited 0. `tests/unit/tactics-*.test.ts` 169/169. `tests/e2e/tactical-matchboard-studio.spec.ts` 80 passed, 2 skipped. `pnpm docs:check` passed. `pnpm tool:check tactical-matchboard-studio --base origin/main` is 76/85 with no errors. `pnpm branch:check` rejects this branch name, which is the owner exception so integrate.yml cannot auto-merge it. Lazy chunk `pdf-unicode-font-*.js` is 1,023.46 kB, gzip 493.18 kB.

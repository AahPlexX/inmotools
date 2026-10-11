---
task: T-tactical-matchboard-studio-20261011-6d6f
tool: tactical-matchboard-studio
doc: task
kind: expand
state: active
branch: cursor/matchboard-residuals-restore
created: 2026-10-11
updated: 2026-10-11
---

# Matchboard residuals restore

## Request

Owner, 2026-10-11: restore closed unmerged PR #93 from tip `6d6fe379faf01e83db61e43ceb183a5e9f73cc3b` onto current `origin/main`. No new features. Do not add a dependency or pin, and do not change `package.json` or the lockfile. Keep the residuals (timeline virtualization with a 2,048-track cap, 64 players per team, pitch zoom 1–4 with pan and reset, separate opposition formation with omit-still-mirrors, training markings on `pitch.overlays`, Build board confirm, video export cap 60 with `sampleExportTimes` still refusing above 240, board freehand at 2 to 2,000 points, and the help-copy phrases). PDF page text stays WinAnsi. `@pdf-lib/fontkit` plus an embedded font is a separate follow-on after this wave merges, authorized by the owner and not implemented here. Open a draft PR against main titled `feat(tactics): Matchboard residuals wave (restored onto current main)`. Do not undraft or merge.

## Resume here

Draft PR stays draft. Do not merge. Do not add `@pdf-lib/fontkit` on this branch. Runtime code matches `origin/main` `e134af68a6d8670f545a7bc1a4d568deb3d0b3bf`. Feature matrix 67/67. Tracker 75/85 verified.

## Log

- 2026-10-11: rebased `6d6fe379` onto `origin/main` `e134af68a6d8670f545a7bc1a4d568deb3d0b3bf`. The three closed-PR commits were already upstream (squash `#100` `6c5d42a4`) and were dropped. Main's ZIP date fix, `MEDIABUNNY_PIN` `1.60.0`, tracker, and retired in-progress list stayed.
- 2026-10-11: Node v22.23.3. `tsc` exit 0. Production build `✓ built in 6.33s`. Tactical units 167/167 across 21 files. `tests/unit/e2e-spec-selection.test.mjs` 8/8. Playwright `tests/e2e/tactical-matchboard-studio.spec.ts` 80 passed / 2 skipped / 0 failed. `pnpm tool:check tactical-matchboard-studio --base origin/main` 75/85, no errors.

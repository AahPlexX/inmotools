---
task: T-crystal-field-update-retry-20261007-c492
tool: crystal-lattice-studio
doc: task
kind: fix
state: backlog
branch: fix/crystal-lattice-studio
created: 2026-10-07
updated: 2026-10-07
---

# Investigate mobile scalar-field update that passed on retry

## Request

Investigate the unattributed full-suite scalar-field update failure without weakening its original expectation or default timeout. Preserve the frozen tool order; no Crystal code or tests changed for this observation.

## Resume here

At 2026-10-07 15:44:07 UTC, completed main full run 37640254171 on References source 230f637 reports 1710 browser passes, one flaky case and 171 skips (43.5m); units 3896 passes/14 skips. Mobile tests/e2e/crystal-lattice-studio-phase4.spec.ts:35 imports a local scalar field and exposes slice plus isosurface results failed its first attempt and passed retry. At line 48, after Positive isosurface level 3.5 and Update field views click, crystal-isosurface-status remained Field loaded. Choose levels, then update field views. instead of containing triangles for the original 5000ms. Cause is unknown. Current frozen cursor remains Markdown R55; investigate at the Crystal tool's ordered pass or associated completion work. This backlog file is not an active branch claim. No failure-repair or regression attribution.

## Evidence and reproduction

[Official completed run](https://github.com/AahPlexX/inmotools/actions/runs/37640254171), validate log, failure emitted 15:19:00 UTC, summary 15:36:47 UTC. Exact test and app files under src/tools/crystal did not differ between preceding main 500adae and source 230f637. The earlier exact runtime full integration 37637141396 passed all 1711 browser cases without retries. Reproduce the original mobile test on unchanged exact source before attributing cause; retain fixture, click, status expectation, timing and retry evidence. Capture field-read/update/worker state only if needed to explain a reproduced failure. Non-reproduction is not a repair; no timeout/retry changes justified. Follow current Crystal spec/tracker and platform rules before claiming its branch or editing code.

## Log

- 2026-10-07 15:44:07 UTC: Confirmed sole retry from official completed logs and unchanged Crystal app/test diff. Backlog recorded during cross-tool full verification; no other tool advanced or modified.

- 2026-10-07 16:10:49 UTC: Current later metadata full 37643618281 passed all 1715 browser cases without retries, including this unchanged Crystal case. Fresh non-reproduction does not explain the earlier retry or establish a repair; keep backlog for its ordered review.

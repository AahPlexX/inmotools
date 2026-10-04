---
task: T-repository-site-theme-20261004-814a
doc: task
kind: expand
state: done
branch: main
created: 2026-10-04
updated: 2026-10-04
---

# Site-wide theme selector (light, dark, follow system): shared part of TASK-028

## Request
Owner, 2026-10-04: build the shared part of [TASK-028](../NEXT.md#task-028-one-site-wide-theme-selector-light-dark-follow-system) as agreed there: a labelled, keyboard-operable Light / Dark / System control in the site header that exposes its state; `data-theme="light|dark"` (resolved) on `<html>`; the choice saved in localStorage; System follows `prefers-color-scheme`, including live changes; a pre-paint inline script in `index.html` (no flash), with `<meta name="color-scheme">` and `theme-color` following the resolved theme, and any Content-Security-Policy handled; dark values for the `:root` tokens in `src/styles.css` and hard-coded shell colours moved onto tokens; Tailwind `@custom-variant dark` keyed to `data-theme`; `data-tool="<slug>"` on the tool page wrapper. No per-tool restyling; tools with their own theme and fixed-dark tools are not broken; exports stay light; the default light appearance is unchanged. Unit tests for resolution and storage; `tests/e2e/site-theme.spec.ts` covers switching and persistence, System via `emulateMedia`, `data-theme` by DOMContentLoaded, and axe on the landing page and a tool shell in both themes. An optional dark run of `tests/e2e/accessibility.spec.ts` reports per-route dark violations; shell ones are fixed, per-tool ones are listed.

## Resume here
Done. Per-tool theme behaviour continues in each tool under TASK-028 ([.tasks/NEXT.md](../NEXT.md#task-028-one-site-wide-theme-selector-light-dark-follow-system)); routes whose tool workspace has serious or critical axe violations in dark are listed in the log.

## Log
- 2026-10-04: started from `origin/main` at `14e5d9af`.
- 2026-10-04: no Content-Security-Policy exists (`index.html`, `vite.config.ts`, GitHub Pages sends none), so the pre-paint script needs no hash or nonce. The PWA manifest `theme_color` is unchanged; the `theme-color` meta overrides it in the page.
- 2026-10-04: dark token values apply to `@media screen` only, so printing uses the light values. `tests/e2e/accessibility.spec.ts` audits with a stored theme when `E2E_THEME=light|dark` is set; without it the run is unchanged.
- 2026-10-04: commits `0376bdea` (data-tool), `f9d5c9b1` (theme selector, tokens, pre-paint script, unit and browser tests), `f18a0929` (optional themed axe run).
- 2026-10-04: verification at `f18a0929`: tsc clean; unit 345 files / 3,731 tests passed (2 files / 14 tests skipped); build clean; full `pnpm test:e2e` in the default theme 1,584 passed, 132 skipped, 0 failed; `tests/e2e/site-theme.spec.ts --repeat-each=5` 100 passed.
- 2026-10-04: `E2E_THEME=dark` axe run of `tests/e2e/accessibility.spec.ts`: 65 passed, 17 failed; every failing node is `color-contrast` inside the tool workspace (none in the shell): sightline-velocity, markdown-workbench, transcode-workstation, typing-workstation, tabular-sheet-workstation, svg-sprite-compiler, audio-mastering, digital-logic-workstation, energy-macro-planner, fiber-craft-workstation.

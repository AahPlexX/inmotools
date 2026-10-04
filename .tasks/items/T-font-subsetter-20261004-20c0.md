---
task: T-font-subsetter-20261004-20c0
tool: font-subsetter
doc: task
kind: expand
state: done
branch: expand/font-subsetter
created: 2026-10-04
updated: 2026-10-04
---

# Cover untested requirements

## Request
Owner, 2026-10-03: integrate and run missing tests for untested requirements; fix wrong statuses when fully resolvable.

## Resume here
Done. FNT-R05, R07, R11 implemented → verified; FNT-R06 partial → verified after drawing glyph tiles from parsed outlines; FNT-R01 test extended to OTF, WOFF and WOFF2. FNT-R14 and R15 stay missing. Tracker updated.

## Log
- 2026-10-04: claimed `expand/font-subsetter`.
- 2026-10-04: `font-engine.ts` gained `glyphOutlines` (SVG path per glyph from the parsed font); `FontWorkspace.tsx` draws each coverage tile from it instead of rendered text.
- 2026-10-04: tests added in `tests/unit/font.test.ts` (FNT-R01, R06) and `tests/e2e/font.spec.ts` (FNT-R05, R06, R07 ×2, R11); unit 10/10 three runs, e2e `--repeat-each=3` 42 passed, 0 failed; accessibility spec for the route 2 passed.

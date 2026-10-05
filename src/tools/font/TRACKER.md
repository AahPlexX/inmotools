---
tool: font-subsetter
folder: src/tools/font
doc: tracker
basis: as-built
status: active
spec: docs/superpowers/specs/2026-10-01-font-subsetter-design.md
tracker: src/tools/font/TRACKER.md
updated: 2026-10-04
---

# Font Subsetter — tracker

## Resume here

On `origin/main`. 15 requirements: 13 verified, 2 missing (FNT-R14, FNT-R15). Glyph tiles are drawn from parsed outlines (`glyphOutlines` in `font-engine.ts`). Next action: build FNT-R15; FNT-R14 with the site-wide theme selector.

## Documents

- Spec: [2026-10-01-font-subsetter-design.md](../../../docs/superpowers/specs/2026-10-01-font-subsetter-design.md)
- Original design: "Tool 15" in [2026-08-29-next-ten-local-tools-design.md](../../../docs/superpowers/specs/2026-08-29-next-ten-local-tools-design.md)
- Code: `font-engine.ts` (inspection, code points, glyph outlines, subset, WOFF2), `FontWorkspace.tsx` (UI)
- Index row: [TOOL_INDEX.md](../../../docs/TOOL_INDEX.md)
- Unit tests: `tests/unit/font.test.ts`; browser tests: `tests/e2e/font.spec.ts`

## Requirement status

`unit` = `tests/unit/font.test.ts`; `e2e` = `tests/e2e/font.spec.ts`.

| ID | Status | Evidence | Notes |
| --- | --- | --- | --- |
| FNT-R01 | verified | unit "FNT-R01 inspects TTF, OTF (CFF), WOFF and WOFF2 input"; e2e loads a font | |
| FNT-R02 | verified | unit "extracts source metrics, weight/style, cmap glyphs, and safety diagnostics"; e2e (`font-source-weight`) | |
| FNT-R03 | verified | unit "…treats shaping-table tags case-insensitively", "recognizes the standard four-character SVG color table tag as unsafe to subset" | |
| FNT-R04 | verified | unit "deduplicates and sorts Unicode code points from presets plus custom text" | |
| FNT-R05 | verified | e2e "FNT-R05 searches the paged glyph coverage list with names and advance widths" | |
| FNT-R06 | verified | unit "FNT-R06 builds each glyph preview from its parsed outline"; e2e "FNT-R06 previews each listed glyph from its parsed outline" | |
| FNT-R07 | verified | e2e "FNT-R07 previews source and subset fonts in the browser", e2e "FNT-R07 explains when the browser cannot load the font for preview" | |
| FNT-R08 | verified | unit "retains notdef plus requested glyphs, reports missing coverage…", "preserves and verifies the actual generated OS/2 weight…"; e2e "verifies generated weight metadata…" | |
| FNT-R09 | verified | unit "blocks an output that would retain only .notdef"; e2e (Build disabled) | |
| FNT-R10 | verified | e2e "…invalidates exports when the selection changes" | |
| FNT-R11 | verified | unit "generates compact unicode-range descriptors"; e2e "FNT-R11 downloads the WOFF2, the CSS with a compact unicode-range, and the ZIP bundle" | |
| FNT-R12 | verified | `tests/e2e/accessibility.spec.ts` route `font-subsetter` | |
| FNT-R13 | verified | e2e "reflows populated font inspection across phone portrait, landscape, and tablet viewports" | |
| FNT-R14 | missing | — | Delivered through the site-wide theme selector |
| FNT-R15 | missing | — | Added 2026-10-02 |

## Open work

0. Build the requirements added 2026-10-02: FNT-R15.
1. FNT-R14 with the site-wide theme selector.

## Known limitations

- Subsetting can break shaping for scripts that rely on GSUB/GPOS; the diagnostics warn about it.

## Verification evidence

- 2026-10-04, `expand/font-subsetter`: `pnpm exec vitest run tests/unit/font.test.ts` 10/10, three runs; `pnpm build`; `PW_PORT=4205 pnpm exec playwright test tests/e2e/font.spec.ts --repeat-each=3` 42 passed, 0 failed; accessibility spec for the route 2 passed. Covers FNT-R01 (OTF, WOFF, WOFF2), R05, R06, R07, R11.
- 2026-10-01, `main` @ `046706dc`: `tests/unit/font.test.ts` 8/8; `tests/e2e/font.spec.ts` 4 passed (desktop and mobile); accessibility spec for the route 2 passed.

## Change log

- 2026-10-04 — Glyph coverage tiles drawn from parsed outlines (FNT-R06); FNT-R05, R06, R07, R11 verified by new tests; FNT-R01 test extended to OTF, WOFF and WOFF2.
- 2026-10-02 — Added FNT-R15 (default integration rule).
- 2026-10-01 — Created per `docs/DOCUMENTATION_STANDARD.md`.

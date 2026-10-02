---
tool: font-subsetter
folder: src/tools/font
doc: tracker
basis: as-built
status: active
spec: docs/superpowers/specs/2026-10-01-font-subsetter-design.md
tracker: src/tools/font/TRACKER.md
updated: 2026-10-01
---

# Font Subsetter — tracker

## Resume here

On `origin/main`. 15 requirements: 9 verified, 3 implemented without a covering test, 1 partial, 2 missing. Glyphs are previewed as rendered text, not from parsed outlines as the design asks (FNT-R06). Next action: build outline previews; add tests for the `implemented` rows.

## Documents

- Spec: [2026-10-01-font-subsetter-design.md](../../../docs/superpowers/specs/2026-10-01-font-subsetter-design.md)
- Original design: "Tool 15" in [2026-08-29-next-ten-local-tools-design.md](../../../docs/superpowers/specs/2026-08-29-next-ten-local-tools-design.md)
- Code: `font-engine.ts` (inspection, code points, subset, WOFF2), `FontWorkspace.tsx` (UI)
- Index row: [TOOL_INDEX.md](../../../docs/TOOL_INDEX.md)
- Unit tests: `tests/unit/font.test.ts`; browser tests: `tests/e2e/font.spec.ts`

## Requirement status

`unit` = `tests/unit/font.test.ts`; `e2e` = `tests/e2e/font.spec.ts`.

| ID | Status | Evidence | Notes |
| --- | --- | --- | --- |
| FNT-R01 | verified | unit "reads WOFF1 table directories…"; e2e loads a font | WOFF2 input has no test |
| FNT-R02 | verified | unit "extracts source metrics, weight/style, cmap glyphs, and safety diagnostics"; e2e (`font-source-weight`) | |
| FNT-R03 | verified | unit "…treats shaping-table tags case-insensitively", "recognizes the standard four-character SVG color table tag as unsafe to subset" | |
| FNT-R04 | verified | unit "deduplicates and sorts Unicode code points from presets plus custom text" | |
| FNT-R05 | implemented | — | |
| FNT-R06 | partial | — | Text preview through `FontFace`; no per-glyph outline |
| FNT-R07 | implemented | — | |
| FNT-R08 | verified | unit "retains notdef plus requested glyphs, reports missing coverage…", "preserves and verifies the actual generated OS/2 weight…"; e2e "verifies generated weight metadata…" | |
| FNT-R09 | verified | unit "blocks an output that would retain only .notdef"; e2e (Build disabled) | |
| FNT-R10 | verified | e2e "…invalidates exports when the selection changes" | |
| FNT-R11 | implemented | unit "generates compact unicode-range descriptors" covers the range | Downloads have no test |
| FNT-R12 | verified | `tests/e2e/accessibility.spec.ts` route `font-subsetter` | |
| FNT-R13 | verified | e2e "reflows populated font inspection across phone portrait, landscape, and tablet viewports" | |
| FNT-R14 | missing | — | Delivered through TASK-028 |
| FNT-R15 | missing | — | Added 2026-10-02 |

## Open work

0. Build the requirements added 2026-10-02: FNT-R15.
1. FNT-R06 outline previews.
2. Add tests for FNT-R05, R07, R11 downloads, and WOFF2 input.
3. FNT-R14 with TASK-028.

## Known limitations

- Subsetting can break shaping for scripts that rely on GSUB/GPOS; the diagnostics warn about it.

## Verification evidence

- 2026-10-01, `main` @ `046706dc`: `tests/unit/font.test.ts` 8/8; `tests/e2e/font.spec.ts` 4 passed (desktop and mobile); accessibility spec for the route 2 passed.

## Change log

- 2026-10-02 — Added FNT-R15 (default integration rule).
- 2026-10-01 — Created per `docs/DOCUMENTATION_STANDARD.md`.

---
tool: font-subsetter
folder: src/tools/font
doc: spec
basis: as-built
status: active
spec: docs/superpowers/specs/2026-10-01-font-subsetter-design.md
tracker: src/tools/font/TRACKER.md
updated: 2026-10-01
---

# Font Subsetter — spec

As built at `aafe4d56` (last change under `src/tools/font/`). Requirement prefix: `FNT`. Status of each requirement: [TRACKER.md](../../../src/tools/font/TRACKER.md). Original design: "Tool 15" in [2026-08-29-next-ten-local-tools-design.md](2026-08-29-next-ten-local-tools-design.md#tool-15--font-glyph-subsetter--metrics-inspector).

## Purpose

Inspect a font's metrics and character coverage and build a smaller WOFF2 that keeps only the characters a site needs, with a matching `@font-face` rule, for frontend developers and type-conscious designers.

## Scope

In scope:
- TTF, OTF, WOFF and WOFF2 input; metrics, coverage and safety diagnostics; Unicode presets and custom text; WOFF2 subset and CSS export.

Out of scope:
- Editing glyph outlines or metrics.

## Constraints

- Platform rules: no accounts, no server or database, everything runs in the browser ([DOCUMENTATION_STANDARD.md](../../DOCUMENTATION_STANDARD.md#platform-rules-apply-to-every-tool-and-every-spec)).
- Parsing with OpenType.js; WOFF2 encoding with `woff2-encoder` in the browser (design).

## Requirements

| ID | Requirement | Acceptance test |
| --- | --- | --- |
| FNT-R01 | Load a TTF, OTF, WOFF or WOFF2 file | Each format inspects |
| FNT-R02 | Show family, style, weight, units per em, ascender, descender, cap height when present, and cmap coverage | Metrics and weight match the source |
| FNT-R03 | Safety diagnostics flag tables that subsetting can break (shaping tables, SVG color table), matching tags case-insensitively | Diagnostics list those tables |
| FNT-R04 | Requested characters come from presets (Basic Latin, Latin-1, digits, punctuation) plus custom text, deduplicated and sorted | Code points deduplicated and sorted |
| FNT-R05 | A paged, searchable glyph coverage list with names and advance widths | Search finds a glyph; pages move |
| FNT-R06 | Glyphs are previewed from their parsed outlines (design) | Each glyph shows its outline |
| FNT-R07 | Source and subset text previews in the browser, with a message when the browser cannot load the font | Preview shows; failure explained |
| FNT-R08 | The subset keeps `.notdef` plus requested glyphs and source layout metrics, reports missing coverage, and verifies the generated OS/2 weight against the source | Output weight `700` matches; missing coverage reported |
| FNT-R09 | A subset that would keep only `.notdef` is blocked | Build disabled when nothing requested is present |
| FNT-R10 | Changing the selection invalidates the built subset until it is rebuilt | Download hidden after a change |
| FNT-R11 | Download the WOFF2 and a CSS `@font-face` with a compact `unicode-range` | Both download; range is compact |
| FNT-R12 | No serious or critical axe violations | Catalog-wide accessibility spec for this route |
| FNT-R13 | Populated inspection reflows on phone portrait, landscape and tablet | Reflow test at those viewports |
| FNT-R14 | Workspace follows the site-wide theme chosen in the site header (light, dark, system) | Workspace switches with the site theme; axe passes in both themes |
| FNT-R15 | Subset output also as TTF/OTF and WOFF | Each output format downloads and loads in the browser |

## Definition of done

The tool is complete when every requirement is `verified` or `prohibited`, and the completion gates in `.tasks/PROJECT_COMPLETION.md` are met.

## Intent not recorded

- None.

## Change log

- 2026-10-02 — Added FNT-R15 under the default integration rule (ideas that fit the platform rules become requirements).
- 2026-10-01 — Created as an as-built spec from `src/tools/font/`, the shared design section and the tool's tests.

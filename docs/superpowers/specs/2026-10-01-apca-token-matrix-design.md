---
tool: apca-token-matrix
folder: src/tools/contrast
doc: spec
basis: as-built
status: done
spec: docs/superpowers/specs/2026-10-01-apca-token-matrix-design.md
tracker: src/tools/contrast/TRACKER.md
updated: 2026-10-01
---

# APCA Token Matrix — spec

As built at `954c9d6e` (last change under `src/tools/contrast/`). Requirement prefix: `APC`. Status of each requirement: [TRACKER.md](../../../src/tools/contrast/TRACKER.md). Original design: "Tool 17" in [2026-08-29-next-ten-local-tools-design.md](2026-08-29-next-ten-local-tools-design.md#tool-17--apcaoklch-token-matrix).

## Purpose

Check every foreground/background pairing in a set of colour tokens for APCA perceptual contrast and the WCAG 2 ratio at once, for design-system authors and frontend developers.

## Scope

In scope:
- `name: color` token lines in any CSS colour syntax, including OKLCH and alpha; a backdrop for translucent tokens; directional pairings; table and heatmap views; colour-vision previews; CSV and CSS export.

Out of scope:
- Claiming WCAG 2.x conformance from APCA: APCA is shown as guidance, with the WCAG 2 ratio alongside (design).

## Constraints

- Platform rules: no accounts, no server or database, everything runs in the browser ([DOCUMENTATION_STANDARD.md](../../DOCUMENTATION_STANDARD.md#platform-rules-apply-to-every-tool-and-every-spec)).
- APCA via `apca-w3`; colour parsing via Culori (design).
- At most 100 tokens, so the matrix stays within a bounded synchronous budget.

## Requirements

| ID | Requirement | Acceptance test |
| --- | --- | --- |
| APC-R01 | Parse `name: color` lines in CSS colour syntax including OKLCH; invalid lines are listed with their reason | Invalid lines reported |
| APC-R02 | Alpha is kept; translucent tokens are composited over a chosen opaque backdrop; a translucent backdrop is refused | Alpha preserved; translucent backdrop refused |
| APC-R03 | Duplicate exported token names, including case variants, are refused | Duplicate name reported |
| APC-R04 | Every directional non-self pairing gets a signed APCA Lc and a separate WCAG 2 ratio | Pairings exclude self pairs; both values present |
| APC-R05 | More than 100 tokens are refused | Over-budget set refused |
| APC-R06 | Role guidance (body, large, UI) with a pass/fail filter against the selected APCA target | Filter shows only passing or failing pairs |
| APC-R07 | Sort by token name, APCA magnitude or WCAG ratio | Sort order changes |
| APC-R08 | Views: accessible paged table and an axis-labelled heatmap | Heatmap has row and column headers |
| APC-R09 | Metric text in the matrix uses a readable colour chosen independently of the tested foreground | Readable metric colour test passes |
| APC-R10 | A component sandbox previews a chosen pair with protanopia, deuteranopia and tritanopia previews, labelled as preview aids | Sandbox renders each simulation |
| APC-R11 | Export the current (filtered) pairings as CSV | `contrast-matrix.csv` downloads |
| APC-R12 | Copy or download CSS custom properties containing only valid tokens | CSS contains only valid tokens |
| APC-R13 | No serious or critical axe violations | Catalog-wide accessibility spec for this route |
| APC-R14 | No horizontal overflow and controls usable from 320 px to 2560 px | Viewport check at the standard widths |
| APC-R15 | Workspace follows the site-wide theme chosen in the site header (light, dark, system) | Workspace switches with the site theme; axe passes in both themes |
| APC-R16 | For a failing pair, suggest the nearest OKLCH lightness of the foreground that meets the selected target | Suggested colour meets the target |

## Definition of done

The tool is complete when every requirement is `verified` or `prohibited`, and the completion gates in `.tasks/PROJECT_COMPLETION.md` are met.

## Intent not recorded

- None.

## Change log

- 2026-10-02 — Added APC-R16 under the default integration rule (ideas that fit the platform rules become requirements).
- 2026-10-01 — Created as an as-built spec from `src/tools/contrast/`, the shared design section and the tool's tests.

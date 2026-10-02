---
tool: fluid-type-matrix
folder: src/tools/typography
doc: spec
basis: as-built
status: active
spec: docs/superpowers/specs/2026-10-01-fluid-type-matrix-design.md
tracker: src/tools/typography/TRACKER.md
updated: 2026-10-01
---

# Fluid Type Matrix — spec

As built at `1f601f9a` (last change under `src/tools/typography/`). Requirement prefix: `FTM`. Status of each requirement: [TRACKER.md](../../../src/tools/typography/TRACKER.md).

## Purpose

Generate correct CSS `clamp()` rules for a fluid type scale and show how each size resolves at chosen viewport widths, so frontend developers and product designers can copy a scale they have checked.

## Scope

In scope:
- One fluid base size between two viewport widths, in rem or px, and a modular scale of named steps.
- Endpoint checks, a live browser check, viewport previews, and CSS copy and download.

Out of scope:
- Testing inside the person's real layout: the previews are a comparison surface (catalog hint).

## Constraints

- Platform rules: no accounts, no server or database, everything runs in the browser ([DOCUMENTATION_STANDARD.md](../../DOCUMENTATION_STANDARD.md#platform-rules-apply-to-every-tool-and-every-spec)).
- No network requests.

## Requirements

| ID | Requirement | Acceptance test |
| --- | --- | --- |
| FTM-R01 | A base `clamp()` is generated from minimum and maximum size and minimum and maximum viewport, with a correct vw coefficient | 1–2 rem over 320–1440 px gives `clamp(1rem, calc(0.7143rem + 1.4286vw), 2rem)` |
| FTM-R02 | In rem mode the configured root font size changes the vw coefficient, and the assumption is written next to the result and into the CSS | Root 20 px gives `1.7857vw`; CSS comment states the root |
| FTM-R03 | Switching between rem and px keeps the same physical sizes | 1–2 rem at root 20 becomes 20–40 px |
| FTM-R04 | Invalid ranges, roots, ratios and fractional steps are refused with a message instead of producing CSS | Ratio 0 shows the error |
| FTM-R05 | Tiny valid values get more decimal places instead of rounding to zero | 0.00001–0.00002 rem does not emit `0rem` |
| FTM-R06 | The emitted CSS is evaluated at both viewport endpoints and each shows Pass or Mismatch | Endpoint checks show Pass |
| FTM-R07 | A modular scale with a ratio and an integer step range (−8 to 8) gives every step its own clamp, named `--step-<n>` | Each step reaches its bounds; fractional steps truncated |
| FTM-R08 | A live preview applies the base clamp in this browser and reports the computed size, the page's real root size and the configured root, updated on resize | Computed size changes after a resize |
| FTM-R09 | Preview text and up to eight preview widths show the size each width resolves to | Two widths show two previews with the text |
| FTM-R10 | Copy the CSS custom properties to the clipboard, with a message if the browser blocks it | Clipboard receives the CSS block |
| FTM-R11 | Download the CSS as `fluid-type-scale.css` | File downloads |
| FTM-R12 | A fluid spacing scale (space steps with their own clamps), as the catalog title promises | Spacing steps are emitted as custom properties alongside the type steps |
| FTM-R13 | No serious or critical axe violations | Catalog-wide accessibility spec for this route |
| FTM-R14 | No horizontal overflow and controls usable from 320 px to 2560 px | Viewport check at the standard widths |
| FTM-R15 | Workspace follows the site-wide theme (light, dark, system) from TASK-028 | Workspace switches with the site theme; axe passes in both themes |

## Definition of done

The tool is complete when every requirement is `verified` or `not planned`, and the completion gates in `.tasks/PROJECT_COMPLETION.md` are met.

## Intent not recorded

- FTM-R12 comes from the catalog title ("Typography & Spacing"); no design exists. Unknown: whether to build the spacing scale or remove "Spacing" from the title.
- Inputs are not saved between visits. Unknown: whether they should persist in this browser.

## Change log

- 2026-10-01 — Created as an as-built spec from `src/tools/typography/`, the catalog entry and the tool's tests.

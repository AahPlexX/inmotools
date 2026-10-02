---
tool: fuzzy-deduplicator
folder: src/tools/dedupe
doc: spec
basis: as-built
status: done
spec: docs/superpowers/specs/2026-10-01-fuzzy-deduplicator-design.md
tracker: src/tools/dedupe/TRACKER.md
updated: 2026-10-01
---

# Fuzzy Deduplicator — spec

As built at `c2769f86` (last change under `src/tools/dedupe/`). Requirement prefix: `FDD`. Status of each requirement: [TRACKER.md](../../../src/tools/dedupe/TRACKER.md). Original design: "Tool 19" in [2026-08-29-next-ten-local-tools-design.md](2026-08-29-next-ten-local-tools-design.md#tool-19--fuzzy-deduplicator).

## Purpose

Find near-duplicate records in a CSV or spreadsheet, review each cluster with its evidence, choose the canonical values, and export a deduplicated CSV, without the data leaving the browser, for data stewards, CRM administrators and analysts.

## Scope

In scope:
- CSV (UTF-8 or Windows-1252) and XLSX input with sheet choice; weighted fuzzy matching with blocking in a worker; cluster review; reconciled CSV export.

Out of scope:
- Changing the source file: export is always a new file (design).

## Constraints

- Platform rules: no accounts, no server or database, everything runs in the browser ([DOCUMENTATION_STANDARD.md](../../DOCUMENTATION_STANDARD.md#platform-rules-apply-to-every-tool-and-every-spec)).
- Matching runs in `dedupe.worker.ts`; candidate blocking avoids comparing every pair (design).

## Requirements

| ID | Requirement | Acceptance test |
| --- | --- | --- |
| FDD-R01 | Load a CSV (UTF-8 or Windows-1252) or an XLSX workbook and choose a sheet; a slower earlier read cannot overwrite a newer selection | Windows-1252 decodes cleanly; late read ignored |
| FDD-R02 | Malformed CSV (unterminated quote) is refused rather than partly imported | Error shown, nothing imported |
| FDD-R03 | Header collisions after normalization are made unique and reported; cells beyond the header get generated headers | Collisions reported; extra cells kept |
| FDD-R04 | Matching columns are chosen with weights; similarity combines normalized exact match, Jaro-Winkler, Levenshtein and Double Metaphone keys, bounded and deterministic | Similarity and phonetic tests pass |
| FDD-R05 | A configurable threshold produces stable clusters; blocking never hides a pair that meets the configured threshold | Lower threshold finds the pair |
| FDD-R06 | Each cluster shows per-pair confidence and per-column evidence; transitive cluster confidence is the weakest pair | Weakest pair shown |
| FDD-R07 | Matching runs in a worker with progress and Stop | Stop ends the run |
| FDD-R08 | Each cluster must be reviewed: Approve merge with a chosen canonical value per field (default first nonblank), or mark False positive | Export requires review |
| FDD-R09 | Large clusters are bounded and paged; review columns can be shown or hidden independently of matching columns | Large cluster paged; column visibility independent |
| FDD-R10 | Export a deterministic reconciled CSV with progress; zero-cluster export is allowed | Export downloads with progress |
| FDD-R11 | CSV export neutralizes formula prefixes while keeping signed numbers and phone numbers exactly | Formula cells neutralized |
| FDD-R12 | No serious or critical axe violations | Catalog-wide accessibility spec for this route |
| FDD-R13 | No horizontal overflow and controls usable from 320 px to 2560 px | Viewport check at the standard widths |
| FDD-R14 | Workspace follows the site-wide theme (light, dark, system) from TASK-028 | Workspace switches with the site theme; axe passes in both themes |
| FDD-R15 | Export the reconciled result as XLSX as well as CSV | XLSX downloads and reopens with the same rows |

## Definition of done

The tool is complete when every requirement is `verified` or `not planned`, and the completion gates in `.tasks/PROJECT_COMPLETION.md` are met.

## Intent not recorded

- None.

## Change log

- 2026-10-02 — Added FDD-R15 under the default integration rule (ideas that fit the platform rules become requirements).
- 2026-10-01 — Created as an as-built spec from `src/tools/dedupe/`, the shared design section and the tool's tests.

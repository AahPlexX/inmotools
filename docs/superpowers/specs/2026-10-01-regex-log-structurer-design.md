---
tool: regex-log-structurer
folder: src/tools/logs
doc: spec
basis: as-built
status: done
spec: docs/superpowers/specs/2026-10-01-regex-log-structurer-design.md
tracker: src/tools/logs/TRACKER.md
updated: 2026-10-01
---

# Log Structurer — spec

As built at `4740cca7` (last change under `src/tools/logs/`). Requirement prefix: `LGS`. Status of each requirement: [TRACKER.md](../../../src/tools/logs/TRACKER.md).

## Purpose

Turn unstructured or proprietary log text into a table using a regular expression with named capture groups, keep every unmatched line visible, and export the result, so SREs and backend developers can analyse incident logs without a cloud parser.

## Scope

In scope:
- Pasted or loaded log text (up to 8 MB), one JavaScript regex with named groups and flags, line-by-line or whole-document scanning.
- Structured table with source line numbers and inferred column kinds; unmatched-line review; CSV, JSON, Markdown and unmatched-TSV export.

Out of scope:
- Uploading logs or calling a parsing service (platform rules).

## Constraints

- Platform rules: no accounts, no server or database, everything runs in the browser ([DOCUMENTATION_STANDARD.md](../../DOCUMENTATION_STANDARD.md#platform-rules-apply-to-every-tool-and-every-spec)).
- Matching runs in a Web Worker with a deadline, so a runaway pattern cannot freeze the page (TASK-016).

## Requirements

| ID | Requirement | Acceptance test |
| --- | --- | --- |
| LGS-R01 | Paste log text, or load a `.log`/`.txt`/`.out`/`.json` file; files over 8 MB are cut to the first 8 MB with a message | File loads; oversize note shown |
| LGS-R02 | Each named capture group becomes a column; group names are read from the pattern, ignoring look-behinds, escaped parentheses and character classes, and keeping non-ASCII names | Declared groups listed; no invented columns |
| LGS-R03 | Flags: ignore case (i), dot matches newline (s), multiline anchors (m); only flags that can apply in the chosen scan mode are offered | Flags change matching; inapplicable flag not offered |
| LGS-R04 | Line mode gives one record per line; whole-document mode finds records spanning several lines, collects the text between matches as unmatched, and skips zero-length matches with a count | Multi-line record matched in document mode |
| LGS-R05 | Each row shows its source line number, in both modes | Line numbers match the source |
| LGS-R06 | Column kinds (integer, decimal, timestamp, text, empty) are inferred and shown next to the header without changing its accessible name | Kinds shown; header name is the group name |
| LGS-R07 | Unmatched lines stay visible with line numbers, including blank lines and whitespace, and can be exported as TSV | Unmatched review lists them; TSV export quotes tabs |
| LGS-R08 | A pattern that matches but declares no named groups is explained instead of showing empty rows; declared columns are reported even when nothing matches | Diagnosis message shown |
| LGS-R09 | Matching runs in a reused Web Worker with a deadline; a deadline miss replaces the worker; a run can be stopped; newer input cancels an older run | Runaway pattern times out; Stop works; stale result never overwrites newer state |
| LGS-R10 | Without Worker support the tool still structures the text | Falls back to synchronous structuring |
| LGS-R11 | Input changes are applied after a 300 ms pause | Typing triggers one run after the pause |
| LGS-R12 | Results are paged with first, last and typed-page navigation instead of mounting every row | Large result is paged |
| LGS-R13 | Long or multi-line cell values are shortened with a disclosure showing the full value | Long cell opens fully |
| LGS-R14 | Export CSV (RFC 4180 quoting, spreadsheet formulas neutralized, plain negative numbers kept), JSON and Markdown (table delimiters escaped) | Each export downloads with correct escaping |
| LGS-R15 | No serious or critical axe violations | Catalog-wide accessibility spec for this route |
| LGS-R16 | No horizontal overflow and controls usable from 320 px to 2560 px | Viewport check at the standard widths |
| LGS-R17 | Workspace follows the site-wide theme (light, dark, system) from TASK-028 | Workspace switches with the site theme; axe passes in both themes |
| LGS-R18 | A library of ready patterns (nginx, Apache, syslog, JSON lines) that fill the pattern field | Choosing a pattern structures a sample line |
| LGS-R19 | Patterns can be saved by name in this browser | Saved pattern survives a reload |
| LGS-R20 | Filter structured rows by a column value | Filter narrows rows |

## Definition of done

The tool is complete when every requirement is `verified` or `not planned`, and the completion gates in `.tasks/PROJECT_COMPLETION.md` are met.

## Intent not recorded

- None.

## Change log

- 2026-10-02 — Added LGS-R18, LGS-R19, LGS-R20 under the default integration rule (ideas that fit the platform rules become requirements).
- 2026-10-01 — Created as an as-built spec from `src/tools/logs/`, the catalog entry, `.tasks/DONE.md` TASK-016 and the tool's tests.

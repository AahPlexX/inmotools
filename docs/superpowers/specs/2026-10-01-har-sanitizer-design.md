---
tool: har-sanitizer
folder: src/tools/har
doc: spec
basis: as-built
status: done
spec: docs/superpowers/specs/2026-10-01-har-sanitizer-design.md
tracker: src/tools/har/TRACKER.md
updated: 2026-10-01
---

# HAR Sanitizer — spec

As built at `a8c5455e` (last change under `src/tools/har/`). Requirement prefix: `HAR`. Status of each requirement: [TRACKER.md](../../../src/tools/har/TRACKER.md). Original design: "Tool 11" in [2026-08-29-next-ten-local-tools-design.md](2026-08-29-next-ten-local-tools-design.md#tool-11--har-sanitizer), including its 2026-10-01 addendum. Behaviour notes: [README.md](../../../src/tools/har/README.md).

## Purpose

Remove credentials and personal data from an HTTP Archive (HAR) before it is shared with support or a colleague, and show the request waterfall, without the file leaving the browser.

## Scope

In scope:
- One HAR file: findings by category, replacement by redaction, SHA-256 or mask, reviewed export, findings CSV, request table and waterfall.

Out of scope (from the README):
- Upload, remote analysis and live capture (platform rules).
- Custom value patterns beyond field names, emails and IPs.

## Constraints

- Platform rules: no accounts, no server or database, everything runs in the browser ([DOCUMENTATION_STANDARD.md](../../DOCUMENTATION_STANDARD.md#platform-rules-apply-to-every-tool-and-every-spec)).
- The exported file stays valid HAR JSON and keeps unrelated fields and number lexemes exactly.

## Requirements

| ID | Requirement | Acceptance test |
| --- | --- | --- |
| HAR-R01 | Load a HAR by file picker, drag-and-drop or a sample capture; Clear empties it | File, drop and sample all load |
| HAR-R02 | Findings cover sensitive headers, cookies, URL and redirect query values, URL credentials, form and JSON bodies and response JSON, listed by location without printing values | Findings list every location and no secret |
| HAR-R03 | Optional email and IP categories (off by default) cover `serverIPAddress`, forwarding headers, body IP literals and IP URL hosts (rewritten to `redacted.invalid`); extra field names can be added | Emails, IPs and extra names found only when switched on |
| HAR-R04 | URL `user:password` is reported as a credential, not as an email | No email finding for URL user info |
| HAR-R05 | Replacement modes: `[REDACTED]`, deterministic SHA-256, or a custom mask | Each mode replaces values as described |
| HAR-R06 | Base64 bodies are decoded, checked and re-encoded; a mislabelled encoding is treated as plain text | Base64 transport preserved |
| HAR-R07 | Export keeps unsafe integers, exponent forms, significant decimals and literal `__proto__` members exactly | Lexemes unchanged after export |
| HAR-R08 | Prepare builds the cleaned HAR and a review: changed locations, locations left because their category is off, and a rescan; Download stays disabled until Prepare | Download disabled before Prepare; review shows 0 remaining when all on |
| HAR-R09 | Any change to the policy invalidates the prepared file | Changing a category disables Download |
| HAR-R10 | On-screen URLs hide user info and sensitive query values regardless of export mode | Displayed URL hides credentials |
| HAR-R11 | Findings can be filtered by category and each finding can jump to its request | Category filter narrows findings; jump selects the request |
| HAR-R12 | Download a findings CSV with category, request number and path only | CSV contains no values |
| HAR-R13 | A paged, searchable request table usable without the canvas | Table lists method and status; search narrows it |
| HAR-R14 | Canvas waterfall with blocked, DNS, connect (TLS removed), TLS, send, wait and receive; `-1` drawn as zero; rows windowed to the scrollport; device-pixel-ratio aware | SSL not double-counted in connect; waterfall labelled with request count |
| HAR-R15 | No serious or critical axe violations | Catalog-wide accessibility spec for this route |
| HAR-R16 | No horizontal overflow and controls usable from 320 px to 2560 px | Viewport check at the standard widths |
| HAR-R17 | Workspace follows the site-wide theme (light, dark, system) from TASK-028 | Workspace switches with the site theme; axe passes in both themes |
| HAR-R18 | Custom value patterns (regular expressions) as an extra redaction category, run with a time limit | A custom pattern redacts matching values |

## Definition of done

The tool is complete when every requirement is `verified` or `prohibited`, and the completion gates in `.tasks/PROJECT_COMPLETION.md` are met.

## Intent not recorded

- None.

## Change log

- 2026-10-02 — Added HAR-R18 under the default integration rule (ideas that fit the platform rules become requirements).
- 2026-10-01 — Created as an as-built spec from `src/tools/har/`, its README, the shared design section and the tool's tests.

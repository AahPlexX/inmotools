---
task: T-markdown-citation-locators-20261007-d713
tool: markdown-workbench
doc: task
kind: fix
state: active
branch: fix/markdown-workbench
created: 2026-10-07
updated: 2026-10-08
---

# Preserve compound citation prefixes, suffixes and locators

## Request

Confirmed associated Pandoc/citation gap for MDW-R82 and MDW-R47: formatted compound citation markers must retain their prefixes, locators and suffixes, and use a style-correct cluster. Preserve original Markdown and native code/metadata exclusions.

## Resume here

2026-10-08 20:31:39 UTC: final compound-citation and keyboard-focus runtime/tests d9ac316996072b002c59ff92eaa8ee9b98d14400 are published through GitHub MCP; fetched tree equals the locally checked tree. Local final citation suite passed 534 Markdown/recovery units (one optional Pandoc skip), TypeScript/build and final keyboard/citation/R15 production acceptance passed 8/8 desktop/touch (125.9s), zero retries/skips; earlier combined References/Pandoc/TXT acceptance passed 28/28 (185.0s). Required fresh full validation 37840159373 runs on exact source d9ac316. This immediate record-only checkpoint supersedes initial owned integration 37840057312; let the latest integration and independent full validation complete without further record-only pushes. Main currently 64c6c5c, so no released/full-pass claim. Obtain official receipts, compare main runtime/tests, verify Pages/live, then close d713 and 628f. R15 cause and one-off mobile export pageerror remain unestablished; repeats and fresh full diagnostics may supply evidence but non-reproduction is not a fix. Next frozen tool: pdf-sanitizer, PDF-R02.

## Reproduction

Open Markdown Workbench, enter the exact source above, open Bibliography, choose CSL-JSON and load two book records: alpha / Alpha specimen / author family Alpha / issued 2026; beta / Beta specimen / author family Beta / issued 2025. Select APA and wait for native preview citations to settle. Actual current preview has both bibliography entries but no p. 14, chap. 2, see or compare prefix. Original source is retained. The R38 comparison waits for the exact rendered in-text string rather than a References heading because R38 lacks that document section.

## Primary source and implementation boundary

[Current Pandoc manual citation syntax](https://pandoc.org/MANUAL.html#citations) retrieved live through Firecrawl at 2026-10-07 14:36:56 UTC, HTTP 200: distinct citation items are separated by semicolons; citation items may contain prefix, locator and suffix; rendering depends on the style; citation key grammar distinguishes internal/trailing punctuation and braced keys. Direct urllib retrieval returned HTTP 403 at 14:38 UTC; no content from that blocked request is used. The successful live primary-source excerpt is evidence, not an assertion that every manual section was read.

Current substituteInTextCitations extracts only keys, joins their independently formatted map values with semicolon-space and replaces the entire original marker. formatCitations processes one citeproc cluster per resolved key; its current type supports IDs but not locator/prefix/suffix fields. Native marker/cluster parsing and style formatter context must be specified and checked against installed citeproc 2.4.63/current primary API before implementing full syntax. Unknown/unsupported syntax must preserve source information and present a useful status instead of silently losing it. Test same key with different pages, compound author/date collapse, numeric clusters, unknown/mixed keys, quote/escape/braced-key grammar, code/metadata exclusions, all bundled styles and actual exports. Published original-source preservation does not substitute for rendered semantic preservation.

## Log

- 2026-10-07 14:38:21 UTC: Actual current and unchanged R38 browser baselines both show annotation loss. Finding recorded for the ordered Pandoc/associated tool repair; no runtime change and no fixed claim.
- 2026-10-07: claimed `fix/markdown-workbench`.

- 2026-10-08 20:04:41 UTC: current Pandoc manual and developer-primary citeproc running/CSL-JSON documentation fetched live (HTTP 200). The documentation header reports older 1.1.73; verify fields/results against the installed 2.4.63 implementation and exact bundled styles. No runtime edit yet.

- 2026-10-08: latest-main production baseline reproduced on desktop/touch. Local source-aware cluster formatter, conservative syntax parser, async annotation invalidation, per-occurrence outputs and wrapping unsupported-syntax notice implemented. Initial test/harness failures and corrected style expectations are retained in VERIFICATION.md. Final checks/publication pending.

- 2026-10-08: tool-check initially rejected a quoted describe-group title as a verified-test citation; replaced it with concrete existing it titles. No runtime or assertion change.

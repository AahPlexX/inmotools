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

2026-10-08 20:14 UTC: resumed on current main 6a27d901658f27fbbf90d79f0e73ad7a1b4232d3 after R86 completed the frozen 92-item Markdown inventory. Its Pandoc export preserves authored annotations, but citation-engine.ts still replaces entire annotated markers with key-only formatting. Repair this associated semantic-loss bug before advancing to PDF-R02. Specify MDW-R93 for document-order compound clusters, plain prefixes/suffixes, common locators, suppress-author, braced keys and a lossless unsupported-syntax fallback with a visible notice. Source/downloads and native code/metadata boundaries must survive. Locator/prefix edits must invalidate asynchronous formatting, even when keys are unchanged. No new dependency.

Shared scope reason: owned Markdown unit/browser regression tests outside the tool folder and current ordered-inventory/task/index records need updates to prove annotation preservation and remove stale pending R55/R56/R57/R81-R86 notes. Run the full browser suite under GOVERNANCE.md as well as focused checks. R15 typewriter and mobile export pageerror tasks remain unresolved; do not close them from successful retries.

## Reproduction

Open Markdown Workbench, enter the exact source above, open Bibliography, choose CSL-JSON and load two book records: alpha / Alpha specimen / author family Alpha / issued 2026; beta / Beta specimen / author family Beta / issued 2025. Select APA and wait for native preview citations to settle. Actual current preview has both bibliography entries but no p. 14, chap. 2, see or compare prefix. Original source is retained. The R38 comparison waits for the exact rendered in-text string rather than a References heading because R38 lacks that document section.

## Primary source and implementation boundary

[Current Pandoc manual citation syntax](https://pandoc.org/MANUAL.html#citations) retrieved live through Firecrawl at 2026-10-07 14:36:56 UTC, HTTP 200: distinct citation items are separated by semicolons; citation items may contain prefix, locator and suffix; rendering depends on the style; citation key grammar distinguishes internal/trailing punctuation and braced keys. Direct urllib retrieval returned HTTP 403 at 14:38 UTC; no content from that blocked request is used. The successful live primary-source excerpt is evidence, not an assertion that every manual section was read.

Current substituteInTextCitations extracts only keys, joins their independently formatted map values with semicolon-space and replaces the entire original marker. formatCitations processes one citeproc cluster per resolved key; its current type supports IDs but not locator/prefix/suffix fields. Native marker/cluster parsing and style formatter context must be specified and checked against installed citeproc 2.4.63/current primary API before implementing full syntax. Unknown/unsupported syntax must preserve source information and present a useful status instead of silently losing it. Test same key with different pages, compound author/date collapse, numeric clusters, unknown/mixed keys, quote/escape/braced-key grammar, code/metadata exclusions, all bundled styles and actual exports. Published original-source preservation does not substitute for rendered semantic preservation.

## Log

- 2026-10-07 14:38:21 UTC: Actual current and unchanged R38 browser baselines both show annotation loss. Finding recorded for the ordered Pandoc/associated tool repair; no runtime change and no fixed claim.
- 2026-10-07: claimed `fix/markdown-workbench`.

- 2026-10-08 20:14 UTC: current Pandoc manual and developer-primary citeproc running/CSL-JSON documentation fetched live (HTTP 200). The documentation header reports older 1.1.73; verify fields/results against the installed 2.4.63 implementation and exact bundled styles. No runtime edit yet.

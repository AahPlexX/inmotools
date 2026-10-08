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

2026-10-08 20:53:16 UTC: citation/keyboard runtime d9ac316996072b002c59ff92eaa8ee9b98d14400 is integrated on main f526d76621edf35e3647186ff13756dcbfcc64c3. Official integration 37840304306 on record head 7525aa2 succeeded: 4039 unit passes/15 skips, 320 browser passes (10.4m), no browser retries/skips. Main runtime/tests match the validated source. Required independent full validation 37840159373 remains active on d9ac316; main Pages 37842135029 succeeded on f526d766 and live production acceptance passed 6/6 desktop/touch (87.0s), zero retries/skips, including actual downloads, keyboard accessibility and viewport warning bounds. Obtain the remaining exact full receipt before closing d713 and 628f. Local acceptance remains 534 units/one optional skip, TypeScript/build, 8/8 final browsers and 28/28 export regression. Material stress evidence: 79/80 mobile export repeats, one separate startup-editor visibility timeout; subsequent isolated startup 40/40 and R15 mobile 12/12 passed, neither is a root-cause fix. Tasks 6b82 and 17bf stay open. Next associated item MDW-R94 / task 9a5c fixes confirmed missing author-in-text bibliography embedding in Pandoc export. Next frozen tool remains pdf-sanitizer, PDF-R02, after associated Markdown work. Do not repeat completed R55-R86 or R93 implementation.

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

---
task: T-markdown-citation-locators-20261007-d713
tool: markdown-workbench
doc: task
kind: fix
state: done
branch: fix/markdown-workbench
created: 2026-10-07
updated: 2026-10-08
---

# Preserve compound citation prefixes, suffixes and locators

## Request

Confirmed associated Pandoc/citation gap for MDW-R82 and MDW-R47: formatted compound citation markers must retain their prefixes, locators and suffixes, and use a style-correct cluster. Preserve original Markdown and native code/metadata exclusions.

## Resume here

2026-10-08 21:29:32 UTC: citation/keyboard runtime d9ac316996072b002c59ff92eaa8ee9b98d14400 is integrated and deployed; current fetched main 57293d5662522e5de6b3900edcb30780346ff0d6 has identical runtime/tests. Required full validation [37840159373](https://github.com/AahPlexX/inmotools/actions/runs/37840159373), validate job 113527207416, succeeded: 4039 unit passes/15 skips; 1788 browser passes, 171 skips and one unrelated Photo white-balance retry (53.3m). Markdown citation/keyboard and original R15 cases passed without retry; no centering diagnostic was emitted. The Photo retry raised image.decode EncodingError, then passed; its cause is not established and is recorded for the later ordered Photo review. Owned integration 37840304306 passed 320 browsers without retries/skips; main Pages 37844849210 succeeded on 57293d5. Live acceptance passed 6/6 desktop/touch (87.0s), including actual exports, unrestricted axe, keyboard reachability and phone portrait/landscape, tablet and desktop bounds. Citation task d713 and keyboard task 628f are done. Local 534 units/one optional skip, TypeScript/build, final 8/8 browsers and 28/28 export regressions remain valid; a separate verified official Pandoc 3.12.1 run passed all 11 export units including real conversion, with no skip. Material stress evidence remains 79/80 mobile exports with one separate startup visibility timeout, then isolated startup 40/40 and original R15 mobile 12/12 passes. Tasks 6b82 and 17bf remain open; passing checks do not establish their causes or fixes. Next associated implementation is MDW-R94 / task 9a5c: missing author-in-text bibliography embedding and existing literal-key false positives in Pandoc export, with released-reader research and production baselines. Next frozen tool is PDF-R02 after associated Markdown work. Do not repeat completed R55-R86 or R93 implementation or dispatch another full run for documentation alone.

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

- 2026-10-08 21:29:32 UTC: required immutable-source full validation 37840159373 succeeded with the exact counts in Resume here. Runtime/tests match deployed main. Associated repair complete; unresolved centering/startup investigations remain separate.

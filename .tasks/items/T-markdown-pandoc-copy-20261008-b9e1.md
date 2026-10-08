---
task: T-markdown-pandoc-copy-20261008-b9e1
tool: markdown-workbench
doc: task
kind: fix
state: backlog
branch: fix/markdown-workbench
created: 2026-10-08
updated: 2026-10-08
---

# Clarify citation preview count and Pandoc export wording

## Request

Associated citation QoL: accurately label the preview-only key count and Pandoc export limitations/style selection. No change to citation extraction or original source.

## Resume here

2026-10-08 23:12 UTC: queued after R94 release validation. Current summary calls citekeys.length referenced even though those are bracketed preview keys; the passing R94 author-only fixture embeds one source but leaves the preview count zero. Specify the count scope explicitly. With keys crossing native markup, current status first says no cited source was found, then explains that keys were not auto-embedded; use neutral wording when extraction is unsupported. Current status also says default style unless --csl, while the official released Pandoc manual supports csl and citation-style metadata. Its nearby engine comment has the same inaccurate omission. Correct these small wording issues without expanding the preview grammar or changing exports. No fix or verification claimed yet.

## Acceptance

Check actual author-only and unsupported-key status; counts distinguish preview from Pandoc export. Existing authored references remain preserved. Style hint accurately includes metadata style selection. Check wrapping on phone portrait/landscape and desktop. No parser/dependency/CSS changes or mirror tests for copy-only edits. Record manual production acceptance plus appropriate owned checks.

## Evidence

Official released https://github.com/jgm/pandoc/blob/3.12.1/MANUAL.txt section Specifying a citation style, fetched HTTP200 on 2026-10-08: --csl, csl or citation-style metadata choose the style. Default is Chicago author-date subject to default.csl in the user data directory. Do not imply the Workbench selected CSL style automatically controls Pandoc. Existing R94 production cases and current MarkdownWorkspace.tsx establish count/status scope.

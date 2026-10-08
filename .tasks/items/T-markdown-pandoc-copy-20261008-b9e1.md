---
task: T-markdown-pandoc-copy-20261008-b9e1
tool: markdown-workbench
doc: task
kind: fix
state: active
branch: fix/markdown-workbench
created: 2026-10-08
updated: 2026-10-08
---

# Clarify citation preview count and Pandoc export wording

## Request

Associated citation QoL: accurately label the preview-only key count and Pandoc export limitations/style selection. No change to citation extraction or original source.

## Resume here

2026-10-08 23:14:44 UTC: active, restricted to wording/comments after R94 integration and 10/10 live acceptance. Core full validation remains in progress on immutable ed970297. Current summary calls citekeys.length referenced even though those are bracketed preview keys; the passing R94 author-only fixture embeds one source but leaves the preview count zero. Specify the count scope explicitly. With keys crossing native markup, current status first says no cited source was found, then explains that keys were not auto-embedded; use neutral wording when extraction is unsupported. Current status also says default style unless --csl, while the official released Pandoc manual supports csl and citation-style metadata. Its nearby engine comment has the same inaccurate omission. Correct these small wording issues without expanding the preview grammar or changing exports. The wording candidate is implemented and locally accepted below; integration and live acceptance remain pending.

## Acceptance

Check actual author-only and unsupported-key status; counts distinguish preview from Pandoc export. Existing authored references remain preserved. Style hint accurately includes metadata style selection. Check wrapping on phone portrait/landscape and desktop. No parser/dependency/CSS changes or mirror tests for copy-only edits. Record manual production acceptance plus appropriate owned checks.

## Evidence

Official released https://github.com/jgm/pandoc/blob/3.12.1/MANUAL.txt section Specifying a citation style, fetched HTTP200 on 2026-10-08: --csl, csl or citation-style metadata choose the style. Default is Chicago author-date subject to default.csl in the user data directory. Do not imply the Workbench selected CSL style automatically controls Pandoc. Existing R94 production cases and current MarkdownWorkspace.tsx establish count/status scope.


## Candidate evidence

2026-10-08 23:18:03 UTC: TypeScript and clean build passed (14.43s). Production manual acceptance passed six desktop/touch export cycles covering author-only count, unsupported native markup key and authored csl/references metadata, plus two separate singular-count cycles: eight total, 32 viewport geometry checks, zero page errors. Sizes 320x568, 844x390, 768x1024 and 2560x1440; status children do not overlap and page/status do not overflow. Actual Pandoc downloads preserve body and authored YAML bytes; one source is embedded for supported markers. External repeatable script pandoc-copy-acceptance.mjs with candidate/extra modes and pandoc-copy-{candidate,extra}.json/log receipts supplements this durable record. No new mirror unit/browser test was added for these small copy changes.

Baseline three production cycles on immutable ed970297 artifact4221 confirm the ambiguous 0 referenced label and inaccurate default-unless--csl hint; a loaded alpha$beta source is excluded by native math boundaries while the status asserts no cited source was found. Released Pandoc3.12.1 reader independently reports citationId alpha$beta for See @alpha$beta$. The corrected status says No sources were auto-embedded and retains the external-bibliography notice; it does not falsely claim supported full grammar.

The first external manual harness failed before launching a browser because its direct playwright import path was unavailable. The error log is preserved as pandoc-copy-setup-error.log; corrected to the verified installed @playwright/test module without installing/changing dependencies. This was a harness setup failure, not an application failure.

Code diff against immutable ed970297 is limited to three MarkdownWorkspace UI wording changes and a pandoc-export-engine comment. Extractor, returned export data, tests, CSS and dependencies are unchanged. Core full run37856784792 continues on ed970297; no duplicate full dispatch for copy alone. Publish this candidate and obtain its separate owned integration, main Pages and actual live copy acceptance before closing this task.

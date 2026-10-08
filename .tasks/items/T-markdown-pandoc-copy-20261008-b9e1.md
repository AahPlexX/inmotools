---
task: T-markdown-pandoc-copy-20261008-b9e1
tool: markdown-workbench
doc: task
kind: fix
state: done
branch: fix/markdown-workbench
created: 2026-10-08
updated: 2026-10-08
---

# Clarify citation preview count and Pandoc export wording

## Request

Associated citation QoL: accurately label the preview-only key count and Pandoc export limitations/style selection. No change to citation extraction or original source.

## Resume here

2026-10-08 23:34:25 UTC: done. Wording source7f16c6090679f0c6d4959c057c4f786bf62c7fd0 is integrated/deployed on main0051a4d05632d1fc212c9a2b5bdcb4c75f3b5a3c. Owned integration37858786373, Pages37859956828 and eight actual live desktop/touch export cycles passed. The preview-key label, unsupported-source status and metadata style hint are corrected; source bytes and export entries remain unchanged. Core full37856784792 is still pending on ed970297 and is tracked separately in active task9a5c; it does not validate these later strings.

## Acceptance

Check actual author-only and unsupported-key status; counts distinguish preview from Pandoc export. Existing authored references remain preserved. Style hint accurately includes metadata style selection. Check wrapping on phone portrait/landscape and desktop. No parser/dependency/CSS changes or mirror tests for copy-only edits. Record manual production acceptance plus appropriate owned checks.

## Evidence

Official released https://github.com/jgm/pandoc/blob/3.12.1/MANUAL.txt section Specifying a citation style, fetched HTTP200 on 2026-10-08: --csl, csl or citation-style metadata choose the style. Default is Chicago author-date subject to default.csl in the user data directory. Do not imply the Workbench selected CSL style automatically controls Pandoc. Existing R94 production cases and current MarkdownWorkspace.tsx establish count/status scope.


## Candidate evidence

2026-10-08 23:18:03 UTC: TypeScript and clean build passed (14.43s). Production manual acceptance passed six desktop/touch export cycles covering author-only count, unsupported native markup key and authored csl/references metadata, plus two separate singular-count cycles: eight total, 32 viewport geometry checks, zero page errors. Sizes 320x568, 844x390, 768x1024 and 2560x1440; status children do not overlap and page/status do not overflow. Actual Pandoc downloads preserve body and authored YAML bytes; one source is embedded for supported markers. External repeatable script pandoc-copy-acceptance.mjs with candidate/extra modes and pandoc-copy-{candidate,extra}.json/log receipts supplements this durable record. No new mirror unit/browser test was added for these small copy changes.

Baseline three production cycles on immutable ed970297 artifact4221 confirm the ambiguous 0 referenced label and inaccurate default-unless--csl hint; a loaded alpha$beta source is excluded by native math boundaries while the status asserts no cited source was found. Released Pandoc3.12.1 reader independently reports citationId alpha$beta for See @alpha$beta$. The corrected status says No sources were auto-embedded and retains the external-bibliography notice; it does not falsely claim supported full grammar.

The first external manual harness failed before launching a browser because its direct playwright import path was unavailable. The error log is preserved as pandoc-copy-setup-error.log; corrected to the verified installed @playwright/test module without installing/changing dependencies. This was a harness setup failure, not an application failure.

Code diff against immutable ed970297 is limited to three MarkdownWorkspace UI wording changes and a pandoc-export-engine comment. Extractor, returned export data, tests, CSS and dependencies are unchanged. Core full run37856784792 continues on ed970297; no duplicate full dispatch for copy alone. Publish this candidate and obtain its separate owned integration, main Pages and actual live copy acceptance before closing this task.


## Completion receipts

- Published through GitHub MCP as7f16c6090679f0c6d4959c057c4f786bf62c7fd0; fetched tree equals locally accepted source. Main0051a4d has identical tree.
- [Owned integration37858786373](https://github.com/AahPlexX/inmotools/actions/runs/37858786373), job113589294735:4055 unit passes/16 optional skips;330 browsers10.5m,zero browser retries/skips.
- [Main Pages37859956828](https://github.com/AahPlexX/inmotools/actions/runs/37859956828): success.
- Actual live8/8 manual export cycles,32 geometry checks,zero page errors; preserves authored YAML csl/references, names preview count scope in zero/singular cases, and avoids false absence status for the native-markup key. Distinct preserved artifacts pandoc-copy-live-candidate.json/log and pandoc-copy-live-extra.json/log; local receipts were not overwritten. Reproduce using the external acceptance script candidate/extra modes against the live URL with fourth argument live-candidate/live-extra.
- Code is limited to wording/comment changes within the owned tool folder; no shared runtime or tests were changed. Original full37856784792 remains reserved for the core R94 source, with current state in task9a5c. No duplicate full dispatch for this separate wording-only change.

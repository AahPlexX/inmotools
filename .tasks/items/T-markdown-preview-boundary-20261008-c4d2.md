---
task: T-markdown-preview-boundary-20261008-c4d2
tool: markdown-workbench
doc: task
kind: fix
state: active
branch: fix/markdown-workbench
created: 2026-10-08
updated: 2026-10-09
---

# Preserve literal word and email boundaries in citation preview

## Request

Correct a confirmed native citation false positive in preview and review rendered exports using the same marker parser. Keep supported plain citation prefixes/locators/suppression working, and retain authored source bytes. This is separate from R94's repaired export-only key extraction.

## Resume here

2026-10-09 14:29 UTC: MDW-R95 is partial; task c4d2 is active. Immutable repair source 68757745fd98ff46ea12ebd8b251e97fb6867285 is integrated as main 15bdec65e736f452a7e5e65865e2d6e7e336da55, with identical runtime/tests. [Owned integration37942247007](https://github.com/AahPlexX/inmotools/actions/runs/37942247007), job113859323149, succeeded: 4080 unit passes/17 optional skips and336 browser passes (7.1m), no browser retries/skips. [Main Pages37943298127](https://github.com/AahPlexX/inmotools/actions/runs/37943298127) succeeded; deployment completed14:21:58 UTC. Actual available-release live acceptance passed6/6 desktop/touch (1.4m), no retries/skips, including downloads, edits/Undo and four viewport sizes. Served entry bytes match the immutable candidate. Local578 units with real Pandoc, TypeScript/build, new6 browsers and existing16 citation/export regressions remain accepted. The single required [full37942247199](https://github.com/AahPlexX/inmotools/actions/runs/37942247199), validate job113859327303, is still running on exact6875774; its unit/build stages succeeded. Next: read its completed result/logs; only then verify R95 and close c4d2. Do not dispatch or repeat unchanged gates for records alone. Earlier live attempts separately preserved previous-bundle failures and a new-entry HTTP404 startup failure, followed by HTTP200 and accepted live6/6. The transition's cause is unestablished; no site/runtime repair claimed. Tasks17bf/6b82 retain their separate unresolved causes. Next frozen tool PDF-R02 after this associated Markdown gate; no PDF implementation started.

## Baseline evidence

Live observed2026-10-08T23:42:16.865Z. External citation-preview-boundary-baseline.mjs/json/log preserves source, actual preview, summary and actual Pandoc download. Repository source citation-marker.ts keysIn scans keyPattern without a native word boundary; parseItem turns the adjacent name into a prefix. The released reader's citeKey first guards notAfterString, then consumes optional suppression hyphen and @. Official source https://github.com/jgm/pandoc/blob/3.12.1/src/Text/Pandoc/Parsing/Citations.hs, retrieved today and corroborated with the SHA256-verified official release binary. No source change for this baseline.

## Next implementation and acceptance

Research released-reader cases before modifying lexical boundaries, especially word/number/period prefixes, escaped periods, punctuation and the difference between a suppression hyphen and an authored prefix hyphen. A guessed lookbehind can misclassify valid prefix/suppression combinations. Existing native prose exclusions and R93 complex-annotation preservation remain authoritative; do not expand author-in-text preview grammar. Record focused failing regressions before implementation, then preserve literal source in preview and actual prepared rendered downloads, with no false bibliography entry/count. Verify genuine prefixes, locators and suppression still format; original/Pandoc Markdown remain authored and R94 ordered embedding remains correct. Include desktop/touch and portrait/landscape wrapping. Shared meaningful unit/browser tests require a fresh immutable-source full gate; do not reuse ed970297's pending/result full receipt for a parser change.

Next frozen tool remains PDF-R02 after associated Markdown work. R15 task17bf and startup task6b82 remain separate unresolved causes.


## Released-reader follow-up

Observed2026-10-08 23:46:53 UTC:16 reader cases saved external pandoc-author-research/preview-boundary-reader-probes.json. Word/number/Unicode word, ordinary terminal period and closing emphasis before @ produce no Cite nodes. Escaped period permits NormalCitation; the existing complex-annotation preservation contract may keep that source raw without silently extending supported preview syntax. [name-@alpha] is NormalCitation with prefix name-, while [name -@alpha] and [-@alpha] suppress the author. [word.-@alpha] keeps word.- as a normal prefix. Comma and underscore permit normal citation. [name@alpha; @beta] yields beta AuthorInText, whereas [name@alpha @beta] yields beta NormalCitation with the literal email-like prefix. Check complete-cluster eligibility; do not invent a genuine bracketed citation from a bare author marker inside a failed bracket cluster. Preserve the explicit author-in-text preview limitation.

2026-10-08 checkpoint: MDW-R95 was specified before implementation, tracker missing and task next. R94's completed full receipt cannot validate a future parser change. Retain all accepted valid-cluster regressions and add meaningful baseline-failing cases before editing.

## Log

- 2026-10-09: activated c4d2 on the existing fix/markdown-workbench checkout after task:start. Shared meaningful unit/browser regressions are necessary to validate source-aware recognition across preview and actual prepared exports; this is the reason for tests outside the tool folder and a fresh full browser gate. No dependency, workflow or other-tool change is planned.
- 2026-10-09: external preview-boundary-reader-probes-20261009.json records32 fresh official released-reader cases and current immutable-source HTTP200/hash/date receipts. Failed semicolon clusters yield bare author citations in native Pandoc, which the preview contract deliberately keeps authored; do not fabricate bracketed citations from their later keys.

- 2026-10-09: baseline corrected21-unit run17failed/4passed; both active immutable production browser profiles failed with fabricated References. Retained r95-unit-baseline-corrected.log and r95-browser-baseline-active.json/log/results. The initial stopped preview caused connection failures only; those separate artifacts are not product evidence.
- 2026-10-09: bounded marker repair plus26 regressions. Focused96units passed before splitting the combined case. Initial broad566/567 result includes one5000ms combined-case timeout; retained r95-final-units.log. Splitting five independent supported-but-complex cases and the blocked-email prefix case leaves timeout unchanged. Corrected final Markdown/deployment-recovery44files578/578 passed102.36s, including three optional official-Pandoc tests with PANDOC set and no skips. The initial command named a nonexistent recovery-store test; final command uses the verified deployment-recovery.test.ts.
- 2026-10-09: production build34.01s and first TypeScript passed. New actual-download and edit/viewport browsers6/6 passed1.6m, no retries/skips; r95-first-browser.json/log/results preserve evidence. Existing R93/R94 regression16/16 passed2.4m and final TypeScript passed. Owned37942247007 and single full37942247199 on immutable6875774 are running; main/live acceptance pending. No R95 complete claim.

- 2026-10-09 14:18 UTC: immutable68757745fd98ff46ea12ebd8b251e97fb6867285 published via GitHub MCP. Owned37942247007/job113859323149 and required single full37942247199/validate job113859327303 are active; full unit/build succeeded and browser stage active. This evidence checkpoint is committed locally while the owned run finishes; publishing another branch revision now would cancel that run. Publish this record with main/Pages/live receipts after the owned candidate completes. No fresh full dispatch for records alone.

- 2026-10-09 14:29 UTC: owned37942247007/job113859323149 succeeded with4080 unit passes/17 optional skips and336 browser passes7.1m, no browser retries/skips. Exact runtime/tests6875774 integratedmain15bdec65; mainPages37943298127 succeeded, deploy completed14:21:58. Initial live run started prematurely and loaded the previous entry index-1cnKoH45.js (trace proof); it was stopped and retained. A subsequent post-deploy run timed out before the editor: trace showed entry index-Dm5-ig-7.js HTTP404. It too was stopped and retained. That exact entry later returnedHTTP200 and byte-matched the immutable candidate, and its Markdown chunk returnedHTTP200. Environment availability changed; fresh unique available-release live6/6 passed1.4m, no retries/skips. No timeout or assertion weakened, no cause or site repair asserted. Full37942247199 still pending; R95 remains partial. Publish this completed evidence checkpoint now that the owned run is finished.

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

2026-10-09 14:10 UTC: R95/taskc4d2 active and partial. The bounded citation-marker repair now rejects native word/number/Unicode/period/closing-emphasis boundaries, distinguishes authored prefix hyphens from suppression, retains failed semicolon clusters and replaces eligible markers by source offset. No dependency, style or export-only R94 grammar change. Baseline corrected21 units:17 failures/4 passes; immutable prior production artifact:2 desktop/touch failures with fabricated References. Initial stopped-server attempts are environmental only. Focused repair96/96 units and TypeScript passed. Broader initial566/567 units had one five-second timeout in a combined five-fixture case; retained evidence, split independent fixtures without changing timeout. Final44 Markdown/recovery files578/578 passed (102.36s), with real Pandoc enabled and no skips. Production build passed (34.01s). New6/6 browsers passed (1.6m), no retries/skips, covering actual original/Pandoc/HTML/DOCX/EPUB/text/AST downloads, styles/Undo, long text and four viewport sizes. Existing R93/R94 production regression16/16 passed (2.4m), no retries/skips; final TypeScript passed. Next: publish the frozen candidate through GitHub MCP, owned integration plus one required full suite, then main Pages/live acceptance; no final verification claimed. Clean record base main516c593 includes claim6200d33 (integration37940664722 success). Accepted R93/R94 gates remain unchanged. Frozen next PDF-R02; tasks17bf/6b82 causes unresolved.

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
- 2026-10-09: production build34.01s and first TypeScript passed. New actual-download and edit/viewport browsers6/6 passed1.6m, no retries/skips; r95-first-browser.json/log/results preserve evidence. Existing R93/R94 regression16/16 passed2.4m and final TypeScript passed. Required full CI and main/live acceptance pending. No R95 complete claim.

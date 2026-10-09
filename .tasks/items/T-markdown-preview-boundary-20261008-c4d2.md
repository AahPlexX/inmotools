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

2026-10-09 13:58 UTC: active R95, still missing. Current clean base main23e304e7cc1affe867d9fc7503bc6c1f76ec3729 contains final R94 records f5cefad; integration37862265819 and Pages37862426450 succeeded. R94 runtime/tests7f16c60 unchanged and all accepted gates remain valid. task:start from the primary checkout resumed the existing owned worktree; this specifically queued task was activated manually to avoid selecting the unrelated older backlog. GitHub MCP refreshed official latest Pandoc3.12.1 (published2026-10-08T01:48:41Z) today; immutable release reader sources returned HTTP200.32 fresh reader probes confirm literal Unicode/email/period/closing-emphasis boundaries, authored hyphens versus suppression and failure of whole semicolon clusters when one item lacks an eligible key. No R95 implementation or acceptance yet. Next: baseline-failing regressions, smallest marker parser repair, local/owned/full/main/live acceptance on the final candidate, then close this task. Keep R93 complex syntax preservation and R94 export-only grammar independent.

## Baseline evidence

Live observed2026-10-08T23:42:16.865Z. External citation-preview-boundary-baseline.mjs/json/log preserves source, actual preview, summary and actual Pandoc download. Repository source citation-marker.ts keysIn scans keyPattern without a native word boundary; parseItem turns the adjacent name into a prefix. The released reader's citeKey first guards notAfterString, then consumes optional suppression hyphen and @. Official source https://github.com/jgm/pandoc/blob/3.12.1/src/Text/Pandoc/Parsing/Citations.hs, retrieved today and corroborated with the SHA256-verified official release binary. No source change for this baseline.

## Next implementation and acceptance

Research released-reader cases before modifying lexical boundaries, especially word/number/period prefixes, escaped periods, punctuation and the difference between a suppression hyphen and an authored prefix hyphen. A guessed lookbehind can misclassify valid prefix/suppression combinations. Existing native prose exclusions and R93 complex-annotation preservation remain authoritative; do not expand author-in-text preview grammar. Record focused failing regressions before implementation, then preserve literal source in preview and actual prepared rendered downloads, with no false bibliography entry/count. Verify genuine prefixes, locators and suppression still format; original/Pandoc Markdown remain authored and R94 ordered embedding remains correct. Include desktop/touch and portrait/landscape wrapping. Shared meaningful unit/browser tests require a fresh immutable-source full gate; do not reuse ed970297's pending/result full receipt for a parser change.

Next frozen tool remains PDF-R02 after associated Markdown work. R15 task17bf and startup task6b82 remain separate unresolved causes.


## Released-reader follow-up

Observed2026-10-08 23:46:53 UTC:16 reader cases saved external pandoc-author-research/preview-boundary-reader-probes.json. Word/number/Unicode word, ordinary terminal period and closing emphasis before @ produce no Cite nodes. Escaped period permits NormalCitation; the existing complex-annotation preservation contract may keep that source raw without silently extending supported preview syntax. [name-@alpha] is NormalCitation with prefix name-, while [name -@alpha] and [-@alpha] suppress the author. [word.-@alpha] keeps word.- as a normal prefix. Comma and underscore permit normal citation. [name@alpha; @beta] yields beta AuthorInText, whereas [name@alpha @beta] yields beta NormalCitation with the literal email-like prefix. Check complete-cluster eligibility; do not invent a genuine bracketed citation from a bare author marker inside a failed bracket cluster. Preserve the explicit author-in-text preview limitation.

MDW-R95 is specified before implementation; tracker missing and task next. R94's completed full receipt cannot validate a future parser change. Retain all accepted valid-cluster regressions and add meaningful baseline-failing cases before editing.

## Log

- 2026-10-09: activated c4d2 on the existing fix/markdown-workbench checkout after task:start. Shared meaningful unit/browser regressions are necessary to validate source-aware recognition across preview and actual prepared exports; this is the reason for tests outside the tool folder and a fresh full browser gate. No dependency, workflow or other-tool change is planned.
- 2026-10-09: external preview-boundary-reader-probes-20261009.json records32 fresh official released-reader cases and current immutable-source HTTP200/hash/date receipts. Failed semicolon clusters yield bare author citations in native Pandoc, which the preview contract deliberately keeps authored; do not fabricate bracketed citations from their later keys.

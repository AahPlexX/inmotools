---
task: T-markdown-pandoc-author-20261008-9a5c
tool: markdown-workbench
doc: task
kind: fix
state: next
branch: fix/markdown-workbench
created: 2026-10-08
updated: 2026-10-08
---

# Embed author-in-text citation sources in Pandoc Markdown

## Request

Associated MDW-R82 export gap: embed all supported author-in-text sources, not just bracketed markers, while preserving original Markdown and native literal/metadata exclusions. Added requirement MDW-R94 specifies this separately without downgrading verified R82 acceptance.

## Resume here

2026-10-08: next after the current compound-citation/keyboard full release receipt. No implementation. On immutable production build of published source d9ac316, with a loaded CSL-JSON alpha book record, source `@alpha [p. 14] discusses the claim.` exports exactly that body without YAML references. Status incorrectly implies no cited source was found despite the loaded alpha record. Source inspection: buildPandocMarkdown uses extractCitekeys, which scans only bracketed markers. The current official Pandoc manual explicitly documents author-in-text `@smith04 [p. 33]`. Keep R93 preview's bracketed-cluster scope intact; a Pandoc-export-specific extraction path must recognize the broader grammar without fabricating reference IDs from emails, escapes, code, links or metadata. R15/startup concerns remain open; next frozen tool after associated Markdown work is PDF-R02.

## Acceptance and boundaries

Source and Pandoc-export body bytes stay authored. Verify author-in-text with and without locator brackets, braced punctuation keys, repeated/deduplicated mixed bracketed/author citations, unknown keys, accidental email/URL matches, escaped @ and original CR/LF/native code/metadata exclusions. Embedded references preserve document order and include no uncited library entries. Status names unresolved keys accurately. Use the existing pinned parser/bibliography engine; no dependency or network service. Where syntax is unsupported, name the limitation instead of claiming no known source exists. Verify actual download and a real Pandoc conversion when available; retain optional CI skip truth.

Shared reason: owned Markdown regression tests outside the tool folder and current inventory records; full browser suite required. Research current Pandoc reader source/API before choosing a lexical boundary, since the manual excerpt alone does not define every ambiguous key/email case.

## Evidence

Official [Pandoc citation syntax](https://pandoc.org/MANUAL.html#citation-syntax) fetched live HTTP 200 on 2026-10-08. Current production-browser download retains `@alpha [p. 14] discusses the claim.` with no references block; status reads `No cited source was found in your bibliography, so none was embedded.` No source or export-engine change for this observation.

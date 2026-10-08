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


## Released-reader research checkpoint

2026-10-08 21:01 UTC: official GitHub release API reports Pandoc 3.12.1 published at 01:48:41 UTC today. Retrieved the released [citation key parser](https://github.com/jgm/pandoc/blob/3.12.1/src/Text/Pandoc/Parsing/Citations.hs) and current reader commit e51c9c6054c8f4ec5c3209d5abe10939dfe2963e. The key parser is identical at these two refs. Its source requires a boundary via notAfterString, accepts optional author suppression, Unicode alphanumeric/underscore simple keys, single internal punctuation followed by a regular key character, special colon/slash sequences, and balanced non-whitespace braced keys. A simple marker regex alone does not establish native parser boundaries. No implementation change.

Downloaded the official Linux amd64 3.12.1 release outside the repository and verified its SHA-256 against the release asset digest: d0c90410e90204c9ca83b8539fac5c7aed01fd537207e4585849f8abc5df20b8. Thirty-one actual reader probes confirm author-in-text, suppression, nested braced keys, Unicode, odd/even backslash escapes, mixed clusters and punctuation behavior. Default Pandoc markdown recognizes citations inside a bare URL or explicit link label, whereas the existing workbench intentionally excludes native links and URLs from citation extraction. Retain the workbench's established exclusion contract and describe that boundary; do not claim complete Pandoc grammar parity. A citation-looking line starting with @alpha followed by a period can be an example list, so prose-context probes are required before treating that input as an author citation. Code, math, metadata and escaped/entity-generated @ markers are not native prose citations. @* is accepted by the reader; investigate wildcard/nocite semantics before treating it as a library ID.

External reproducible evidence: /workspace/inmotools-implementation-evidence/pandoc-author-research/metadata.json, released-reader-probe.json, released source files and verified binary. These workspace artifacts supplement the durable primary-source refs above and are not guaranteed to survive a workspace replacement. Reproduce with the exact release binary and markdown-to-JSON reader; inspect citationId and citationMode in the blocks, excluding metadata. The existing markdown-pandoc-export unit file passed all 11 tests with PANDOC pointing to this binary, including the real --citeproc conversion (1.02s; no skip). This proves the existing mixed bracketed/author fixture converts, not that the author-only omission is fixed.


Additional native-boundary baseline: actual production downloads on unchanged main 6a27d901 (port 4216) and released citation source d9ac316 (port 4220) both embed alpha for `Contact [name@alpha] today.` and report one cited source. The released Pandoc 3.12.1 reader produces only literal Str nodes for this source, no citations. This false-positive boundary is pre-existing on both versions, not introduced by R93. Include it in the planned export-specific key extraction regressions; the public status must not label a literal word as a cited source. Evidence: external citation-native-boundary-baseline.mjs/jsonl plus the released reader command recorded above. Broader preview boundary alignment is a separate behavior decision; do not silently expand the author-in-text preview scope.

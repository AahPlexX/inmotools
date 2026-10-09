---
task: T-markdown-citation-key-space-20261009-a36e
tool: markdown-workbench
doc: task
kind: fix
state: next
branch: fix/markdown-workbench
created: 2026-10-09
updated: 2026-10-09
---

# Use the native braced-key space predicate in citation consumers

## Request

Repair confirmed false citations for braced keys containing native spaces and missing Pandoc references for valid non-space Unicode keys. Preserve original source, valid ordinary/braced citations, native exclusions and current R93–R95 behavior. Add a useful plain-language key-syntax hint. This follows the separately validated R95 word/suppression repair.

## Resume here

2026-10-09 15:02 UTC: next, MDW-R96 missing and specified before code. R95's single full37942247199 on6875774 is still running; finish its receipt before this sequential implementation. Current remote record main04bdb101 and local523c57 have identical21 root entries through GitHub MCP tree verification; Git command-line fetch authentication is unavailable, but MCP publication works. Actual live runtime6875774 confirms the separate braced-key bug. No R96 code or acceptance yet. Next: source-aware failing regressions, native predicate repair in preview and export-only extraction, source/key hint, local/owned/fresh-full/main/live gates. Future parser changes require their own immutable-source full; do not attribute R95's pending full to this repair. Frozen next tool PDF-R02 after associated Markdown repairs.

## Evidence

- At2026-10-09 14:52:32–35 UTC, live sources [@{alpha beta}], [@{alpha\tbeta}], and a no-break-space variant each format as (SpaceKey,2026), add References and show1previewkey for a matching imported CSL JSON ID. Actual Pandoc downloads remain literal. Official released Pandoc3.12.1 returns no Cite nodes for all three. External braced-key-space-baseline-20261009.mjs/json/log preserves actual UI/download evidence.
- At14:59:03–06, actual Rendered Markdown also formats the invalid ordinary-space key. Valid keys containing U+FEFF or U+2028 format in preview/rendered Markdown, but actual Pandoc downloads omit their matching loaded references. The released reader does produce the matching Cite IDs. External braced-key-space-export-baseline-20261009.mjs/json/log preserves all three cycles, zero pageerrors.
- Native braced-space probes cover all25 Node Unicode White_Space codepoints plus U+FEFF, using the verified released binary. U+0085, U+2028, U+2029 and U+FEFF are valid native key characters, so neither JavaScript \s nor Unicode White_Space is an accurate blanket predicate. U+000D is removed by reader input normalization in the fixture and produces alphabeta; this is not a claim that authored multiline/normalized keys are supported by the workbench. Preserve the existing unsupported source-boundary contract rather than embedding a guessed ID.
- Primary released citeKey uses charsInBalanced with not.isSpace. Official GHC9.12.2 source GHC/Internal/Unicode.hs, retrievedHTTP200 today, implements isSpace as ASCIIspace, U+0009–000D, no-break-space and Unicode Space category (Zs). This corroborates the binary results; no claim about the release binary's compiler version. Source https://github.com/ghc/ghc/blob/ghc-9.12.2-release/libraries/ghc-internal/src/GHC/Internal/Unicode.hs. External ghc-native-space-primary-20261009.hs/json and native-braced-space-probes-20261009.json preserve dated receipts.
- Current preview keyPattern allows ordinary spaces/tabs inside braces. Export-only braced-key whitespace count uses JavaScript \s, rejecting some characters the native predicate allows. The existing balanced-brace, source-range and native-literal checks must remain intact.

## Acceptance and scope

Reject genuine native-space keys without creating citations, bibliography entries or unresolved-key warnings in preview and actual prepared exports. Valid punctuation and the supported non-space Unicode keys must still resolve, and the actual Pandoc download must embed their matching IDs in source order with exact body preservation. Keep own metadata/reference opacity, native literal exclusions, suppression/locators and key-boundary behavior. Include source edits/Undo, desktop/touch and phone portrait/landscape long-key wrapping. Test real Pandoc conversion when available, including YAML round-trip for supported unusual keys. Do not claim full native input-normalization or grammar parity.

Shared meaningful unit/browser regressions outside the tool folder are necessary to verify client preview and actual exports; this is the reason for shared test changes and a fresh full browser gate. No dependency or workflow change is planned. The static key-syntax hint should help a user choose valid bibliography IDs, without exposing parser implementation details.

## Log

- 2026-10-09: recorded confirmed live UI and actual rendered/Pandoc download differences, plus26released-reader cases and primary space predicate. No runtime change or complete claim.

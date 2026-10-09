---
task: T-markdown-citation-key-space-20261009-a36e
tool: markdown-workbench
doc: task
kind: fix
state: done
branch: fix/markdown-workbench
created: 2026-10-09
updated: 2026-10-09
---

# Use the native braced-key space predicate in citation consumers

## Request

Repair confirmed false citations for braced keys containing native spaces and missing Pandoc references for valid non-space Unicode keys. Preserve original source, valid ordinary/braced citations, native exclusions and current R93–R95 behavior. Add a useful plain-language key-syntax hint. This follows the separately validated R95 word/suppression repair.

## Resume here

2026-10-09 16:29 UTC: MDW-R96 is verified and task a36e is done. Required [full run 37953387063](https://github.com/AahPlexX/inmotools/actions/runs/37953387063), validate job 113897656914, succeeded on immutable runtime/test source 81fc788074dee56cf768112e356f7e40cd2129ce; completed 16:26:50 UTC. Official logs report 4110 unit passes/18 optional skips (368 files passed/2 skipped), 1810 browser passes, 171 skips and one unrelated Crystal substitution retry (45.3m). All six new R96 cases passed on desktop/touch without retry. The sole flaky case expected Na1 element Fe after Create substitution but retained Na for 5000ms, then passed retry; its separate backlog d7a8 preserves the original assertion, unknown cause and later ordered review. Original R15 and Photo white-balance cases passed both profiles without retry; this is non-reproduction, not a cause or repair. Runtime is integrated as main fb06f5c3396ed3e62dc5967982564b95d75845e0 and main runtime/tests remain unchanged. Owned 37953388639 passed 4110/18 units and 342 browsers (7.3m), no browser retries/skips; main Pages 37954479271 succeeded. Actual asset-qualified live 6/6 passed 1.2m, no retries/skips, with served entry/register and both Markdown chunks HTTP200 and byte-matched to the tested artifact. Local 609 real-Pandoc units, TypeScript/build, new 6 and existing 22 production cases remain accepted. Do not repeat unchanged gates for records alone. Next frozen item is PDF-R02: claim its own worktree, refresh current PDF source and records, specify the password-opening/mixed-intake/cancellation cycle before implementation; preserve PDF-R03 refusal to modify encrypted inputs. Read-only official/owned-fixture preparation is in the ordered parent task; no PDF application implementation or routing repair. Markdown tasks 17bf/6b82 retain separate unresolved causes.

Previous claim (history):

2026-10-09 15:54 UTC: MDW-R96 / task a36e remains partial until its required full receipt. Immutable runtime/test source81fc788074dee56cf768112e356f7e40cd2129ce is integrated as mainfb06f5c3396ed3e62dc5967982564b95d75845e0; fetched main runtime/tests compare equal to the candidate. Owned [37953388639](https://github.com/AahPlexX/inmotools/actions/runs/37953388639), job113897675757, succeeded:4110 unit passes/18 optional skips (368 files passed/2 skipped),342 browser passes (7.3m), no browser retries/skips. Main [Pages37954479271](https://github.com/AahPlexX/inmotools/actions/runs/37954479271) succeeded. Qualified live6/6 desktop/touch passed1.2m, no retries/skips; actual served entry/register script and both Markdown chunks returnedHTTP200 and byte-matched the local tested artifact at15:51–52 UTC. Local609 units with real Pandoc, TypeScript/build, new6 and existing22 production cases remain accepted. Single required [full37953387063](https://github.com/AahPlexX/inmotools/actions/runs/37953387063), validate job113897656914, is running on exact81fc788; unit/build stages succeeded, browser stage active. Next: obtain its completed result/logs; only then verify R96 and close a36e. Do not repeat unchanged gates for records alone. R95 remains verified/c4d2done. Frozen next tool PDF-R02; read-only research confirmed mixed normal/protected intake loss and pending-password cancellation requirements, recorded in the ordered parent task. No PDF implementation or routing repair. Separate17bf/6b82 causes remain unresolved.

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

- 2026-10-09 15:20 UTC: task:start resumed the existing worktree and CLI fetch succeeded. Activated after R95 full success/closure, before R96 runtime changes. Shared meaningful regression/full-gate reason remains recorded under Acceptance and scope.

- 2026-10-09 15:28 UTC: initial unit baseline27failed/3passed includes two fixture expectations corrected before implementation: APA sorts Gamma before KeyAuthor, and native default Chicago title case is Key Specimen. Browser baseline6/6failed on unchanged immutable6875774, actual valid-key Pandoc downloads omit three matching records. Native YAML probes reveal another same-cycle issue: literal NEL in quoted IDs folds to a space; literal LS/PS in plain IDs cause native YAML parse errors. Explicit quoted Unicode escapes preserve exact IDs and resolve all four native non-space cases. Add only targeted special-ID serialization; preserve imported records and ordinary metadata output. Official YAML/custom-tag docs and released-reader metadata/HTML receipts are preserved in r96-yaml-primary-probes-20261009.json and r96-yaml-official-receipts-20261009.json. The first probe aborted on a native YAML error; the complete corrected per-case run retains every result. The public Pandoc manual request returned403, not evidence; released source/manual and binary remain primary.

- 2026-10-09 15:30 UTC: corrected baseline26failed/4passed;6/6browserbaselinefailed on immutable6875774. Native predicate, targeted YAML scalar ID escapes and key hint implemented; focused repair check running. Ordinary output/imported record identity and native source exclusions remain regression requirements. No completed repair/release claim.

- 2026-10-09 15:31 UTC: focused R96/R95/Pandoc export67/67units passed19.00s with real official Pandoc, no skips. Added imported-record/non-ID-field preservation regression; broader Markdown/recovery units then TypeScript/build run sequentially to avoid resource overlap. Production repair acceptance pending.

- 2026-10-09 15:33 UTC: broad45files609/609units passed89.30s with real Pandoc/zero skips; TypeScript and clean production build passed sequentially. Separate r96-final-dist preview4224 was confirmedHTTP200 before6freshproduction cases; browser acceptance now running. Unique r96-first-browser.json/log/results preserve results independently of baseline.

- 2026-10-09 15:34 UTC: new6/6production cases passed48.9s, desktop/touch, zero retries/skips. Actual original/Pandoc/rendered/plain/AST/HTML/DOCX/EPUB downloads, exact YAML IDs, edits/Undo and320portrait/844landscape/768tablet/2560desktop bounds passed. Existing citation R93/R94/R95 regressions running on the same immutable artifact; no full/main/live R96 receipt yet.

- 2026-10-09 15:39 UTC: existing R93/R94/R95 production regressions22/22 passed, zero retries/skips, on the unchanged r96-final-dist. Local validation is complete for this runtime/test source. Freeze and publish with one fresh required full gate; no reuse of the accepted R95 full.

- 2026-10-09 15:40 UTC: frozen81fc788074dee56cf768112e356f7e40cd2129ce published via GitHub MCP; local and fetched complete trees compare equal. Owned37953388639 and required single full37953387063 active. Keep this source fixed, no repeated gates for records alone; publish the local documentation checkpoint once the owned candidate completes to avoid cancellation.

- 2026-10-09 15:54 UTC: owned37953388639 succeeded4110/18 units and342 browsers7.3m, no browser retries/skips; mainfb06f5c runtime/tests equal81fc788. MainPages37954479271 success. Actual byte-qualified live6/6 passed1.2m, no retries/skips; r96-live-availability-proof.json and unique r96-live-browser.json/log/results preserve evidence. Required full37953387063/job113897656914 remains active; R96 partial. Publish this evidence checkpoint now that the owned candidate is complete; no repeated full dispatch.

- 2026-10-09 16:29 UTC: retrieved completed exact-source full37953387063/job113897656914 through GitHub MCP. 4110/18 units; 1810 browser passes, one Crystal substitution flaky and171skips (45.3m). New R96 desktop/touch cases pass without retry; sole unrelated retry recorded separately in taskd7a8, no timeout/assertion/source changes. Prior local/owned/main/Pages/live receipts remain valid; R96 verified and taskdone. No new import defect: parseCslJson preserves String(entry.id) without trimming. Frozen next PDF-R02; no PDF code changed.

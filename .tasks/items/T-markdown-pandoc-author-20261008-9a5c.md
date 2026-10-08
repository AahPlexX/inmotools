---
task: T-markdown-pandoc-author-20261008-9a5c
tool: markdown-workbench
doc: task
kind: fix
state: done
branch: fix/markdown-workbench
created: 2026-10-08
updated: 2026-10-08
---

# Embed author-in-text citation sources in Pandoc Markdown

## Request

Associated MDW-R82 export gap: embed all supported author-in-text sources, not just bracketed markers, while preserving original Markdown and native literal/metadata exclusions. Added requirement MDW-R94 specifies this separately without downgrading verified R82 acceptance.

## Resume here

2026-10-08 23:54:53 UTC: R94 is verified and task9a5c done. Required full [37856784792](https://github.com/AahPlexX/inmotools/actions/runs/37856784792), validate job113582773567, succeeded on immutable core ed970297: 4055 unit passes/16 optional skips; 1799 browser passes/171 skips (52.7m), zero retries. All ten R94 browser cases passed; no centering diagnostic was logged. Core local552 units with real Pandoc, TypeScript/build,20 production, owned330 and live10 remain accepted. Deployed wording runtime7f16c60 has only three text changes and an engine comment beyond core; its separate owned37858786373 (4055/16 units,330 browsers,no retries/skips), Pages37859956828 and8 live export cycles/32 geometry checks passed; taskb9e1 done. Latest fetched record main5d2446d and Pages37861295012 succeeded with unchanged runtime/tests. Next associated requirement R95 is missing, taskc4d2 next: live email-like bracket falsely formats Alpha in preview although native Pandoc has no Cite and repaired Pandoc export is literal. Sixteen released-reader probes distinguish word/period/formatting boundaries and authored hyphens from suppression; no preview fix claimed. Tasks17bf/6b82 remain unresolved; current full success is non-reproduction, not a cause/fix. Next frozen tool PDF-R02 after associated Markdown repairs. Do not repeat completed unchanged gates for these final records.

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


Released-reader wildcard probe: with alpha and beta YAML references, body `See @*.` produced `See .` and a citation-with-no-printed-form warning, while metadata nocite: "@*" included both bibliography records. Do not turn the reader's wildcard token into an ordinary resolved ID or automatic include-all export without a separately specified contract. The original metadata/literal exclusions remain authoritative for this tool.


2026-10-08 21:38:28 UTC: final previous release records integrated on main ddfd06b; Pages 37847673837 succeeded. Task-start invoked from the existing tool worktree tried to create a doubled worktree path and failed because its branch already exists; no work was discarded or extra worktree created. Continue the existing owned worktree and activate this selected queued task; publish the claim via GitHub MCP.

Further actual 3.12.1 reader probes confirm that adjacent closing emphasis/strong markup blocks author-in-text citations, while strikeout and inline-code endings do not. Example-list labels such as a line beginning @alpha. consume author-in-text references to that label; an explicit bracketed [@alpha] still cites the bibliography. Native extraction must preserve that distinction or conservatively identify unsupported syntax rather than silently treating every @ occurrence as a citation. Probe _@alpha_ yields the simple key alpha_ because underscore is a key character, not a delimiter in that context. These measured boundaries guide export extraction only, without rewriting the source or broadening preview citation support.

- 2026-10-08: task-start from primary repository /workspace/inmotools correctly resumed the existing worktree. Selected queued task 9a5c activated without duplication; previous wrong-working-directory invocation is retained above.


## First implementation evidence

- 2026-10-08: new source-embedding baseline units failed 9/10, one passed and the optional real-Pandoc case skipped. Baseline receipt pandoc-author-baseline-units.log; existing actual-download baselines remain authoritative.
- New helper pandoc-citation-source.ts handles native eligible prose separately from preview extraction. Source-range metadata from citation-source.ts supplies emphasis endpoints, including reparsed disclosure captions. Balanced-brace indexing avoids repeated scans for malformed nested keys; escape checks run only at delimiters. Reuse the existing parsed tree and pinned dependencies. No new library, backend or authentication.
- Focused first candidate: 52 passes/one Chicago-style timeout (36.83s), concurrently with TypeScript. Sequential candidate checks passed 53/53 then 54/54 (20.12s/20.27s), with real Pandoc enabled; cause of the timeout remains unestablished. The first TypeScript gate passed. Later authored-reference and hint changes still require the fresh expanded gate; do not count the earlier receipts as final acceptance.
- Actual immutable d9ac316 browser baseline with its own valid YAML references and no imported library retained the exact document but claimed no cited source was found. The candidate checks authored references before the imported-library empty return and avoids reporting imported-library misses for an opaque retained authored block. It does not validate or rewrite the author's entries. Unit coverage includes LF, CRLF and CR, with/without an imported library.
- Five owned desktop/touch browser cases cover actual author-only/original downloads, mixed order and edit refresh, example-label/bracket distinction, authored metadata status and long unknown-key wrapping at phone portrait/landscape, tablet and desktop sizes. The completed 20-case production gate includes all ten R94 profile/case combinations. Native preview author markers remain authored; no broader preview grammar claim.
- The later 22:57 checkpoint supersedes earlier pending local gates; full CI and release verification remain pending. Shared browser/unit test reason remains recorded; a fresh immutable-candidate full browser run is required after publication.


## Final local candidate evidence

- Final units: 552/552, 43 files, 42.56s, zero skips; includes both optional real-Pandoc conversions using the verified official binary. Artifacts: pandoc-author-final-units.log. Seventeen new R94 unit cases cover normal boundaries and preservation.
- TypeScript completed successfully before the chained build, whose final log reports built in 17.11s and generated the PWA files. The process-control session expired before a direct completion receipt was retained; the complete build log and immutable artifact establish the sequential result. Artifacts: pandoc-author-final-types.log, pandoc-author-final-build.log, pandoc-author-final-dist.
- Production 20/20, 2.2m, zero retries/skips: new five-case R94 spec plus existing R82 and R93 specs on desktop/touch, served from the immutable final artifact at port 4221. Actual downloads and portrait/landscape/tablet/desktop bounds are covered. Artifacts: pandoc-author-final-browser.log/json and unique pandoc-author-final-results directory. Preserve these before another run.
- Added edge regressions first failed against the previous candidate: three native-boundary assertions, one example-number-wrap assertion and one native-literal-cut assertion. Fixed without weakening assertions. Primary sources: released Pandoc Parsing/Citations.hs and Parsing/Lists.hs; signed wrapping confirmed against released reader and current official https://tc39.es/ecma262/#sec-bigint.asintn (HTTP 200, 2026-10-08). Numeric conversion processes bounded chunks under the existing ES2022 target.
- Earlier Chicago timeout cause remains unknown; sequential final gates pass without changing its assertion or timeout. This is not a root-cause fix claim. Full shared browser validation, successful integration/main Pages, and live acceptance are still required before closing this task or verifying R94.


## Final release acceptance

2026-10-08 23:54:53 UTC: [full37856784792](https://github.com/AahPlexX/inmotools/actions/runs/37856784792), job113582773567, completed success on exact core sourceed970297dc21076a6b9e0317ee3e90074758366c. Official completed logs:4055 unit passes/16 optional skips;366 unit files passed/2 skipped;1799 browser passes/171 skips52.7m,zero retries. All ten new R94 profile/case combinations passed. Original R15 cases and previously flaky Photo white-balance case passed without retry; no centering diagnostic. This does not establish causes or repairs for those separate observations. Feature-ref Pages jobs skipped intentionally; main Pages/live releases are separately accepted below.

Core source integrated main68b31b1 through37856777714 (4055/16 units;330 browsers10.7m,no browser retries/skips). Main Pages37858018047 succeeded;actual live R94 ten cases passed44.6s without retries/skips. Local552 units included both real-Pandoc cases without optional skips, plus types/build and20 production cases. Later wording source7f16c60 differs only in three UI strings and an engine comment, with extractor/export data/tests/dependencies/CSS unchanged; its own integration37858786373 and Pages37859956828 succeeded, with8 actual live wording export cycles and32 geometry checks. It is not attributed to the older exact-core full receipt.

Latest record-only main5d2446d, integration37861180104 and Pages37861295012 succeeded. R94 closes; native preview false-positive R95 remains missing in separate taskc4d2, now next. Original centering17bf and mobile startup/page-error6b82 stay open with unknown causes. Complete mandatory records/link/branch checks before final publication; do not dispatch another unchanged full run for documentation.

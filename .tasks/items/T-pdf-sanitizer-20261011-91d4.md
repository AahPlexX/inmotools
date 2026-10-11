---
task: T-pdf-sanitizer-20261011-91d4
tool: pdf-sanitizer
doc: task
kind: expand
state: active
branch: fix/pdf-sanitizer
created: 2026-10-11
updated: 2026-10-11
---

# PDF-R07–R09 ordered split exports

## Request

Continue development from before the lint dependency requests, following the frozen complete requirement inventory. Implement R07 range splitting, then R08 burst splitting, then R09 actual-byte size-ceiling/best-fit splitting as a related ordered batch. Preserve privacy, device/viewport/theme support, meaningful behavioral coverage and live/main publication without PRs. Keep portable progress current.

## Resume here

2026-10-11 19:48 UTC: local R07/R08/R09 candidatec1b2f34 passes ten split units854ms, TypeScript, production build17.01s, scoped lint6files/42warnings/0errors and all12native client cases across Chromium/Firefox/WebKit desktop/compact/mobile1.8m, zero retries/skips or timeout changes. Candidate artifact is immutable split-candidate-dist4252. Client cases verify actual range/burst/size PDFs, metadata and attachment bytes, ZIP entries, exact byte reporting/ceilings, invalid/form refusal, cancellation, source-plan invalidation,20-result groups,320portrait/844landscape/tablet/desktop and Light/Dark/System axe. Original old R05 artifact correctly fails at absent Prepare split PDFs control; initial TypeScript attachment-scope error was fixed and its log retained. Preparing direct GitHub MCP main publication; source main0e2bc88 was fresh-checked. Main selected consumer CI/deploy and qualified live gates are still pending; no R07–R09 acceptance yet. Restart by refreshing main and exact workflow runs; do not rerun the matching unchanged local matrix. Evidence: /workspace/inmotools-implementation-evidence/pdf-split-research/{split-unit-10.log,types-fixed.log,split-build.log,split-native.log,split-native.json,split-native.exit,split-lint.json,split-scope-binding.json,old-baseline.log,old-baseline.json,primary-receipts.json,si-units-receipt.json}.

Official research: pinned PDFDocument source https://raw.githubusercontent.com/Hopding/pdf-lib/v1.17.1/src/api/PDFDocument.ts HTTP200/SHA25647f8eb90141be50c5e7ffb66772d39b67a70c94b6eb374f4f355bd98624bd198; JSZip3.10.2 registry HTTP200/SHA2569042fb77e205b431157ece8ad7e0f81e341966df6987061d8e6b24ec6b66ee6d; official JSZip generateAsync https://stuk.github.io/jszip/documentation/api_jszip/generate_async.html HTTP200/SHA256dba69b22f858a0ade14792b9efa3abe3d271a0099bd8cc060d4b11d9f02729cf at19:23 UTC. SI decimal mega confirmed by https://www.bipm.org/en/measurement-units/si-prefixes HTTP200/SHA256b7bdc8c97f2135823a4c7e6105e85f903781da8702a660b6e30defdd0a1328e2 at19:36:33 UTC; NIST403 retained as unavailable. Installed public JSZip StreamHelper pause/resume/data handling inspected; cancellation never throws through generateAsync update callbacks or accesses private workers.

## Breaking points

Validate empty/malformed/out-of-bounds/reversed ranges before writing; preserve range order/repeats and ensure unique portable filenames. Do not turn an empty range into All. Cover source byte immutability, encrypted/structural/form refusal, output page/order/metadata/attachment bytes, omitted/repeated pages and partially failed preparation with no download. Source/selection/metadata/geometry/overlay/attachment/filename changes invalidate prepared results; Clear, cancellation and route changes abort/ignore stale completions. ZIP is one user-triggered download; separate per-part controls avoid requiring automatic multi-download permission. Guard invalid/non-integer/non-finite ceilings, oversized individual pages, serialization/resource limits, non-monotonic compression and report actual bytes/source pages. Best fit is a heuristic, never an optimal-bin-count claim. Keep page order an explicit choice. Render bounded result groups with keyboard/touch labels and all themes, no root overflow at320portrait/844landscape/tablet/desktop. No auth/backend/upload/new runtime dependency.

## Validation scope

Installed pdf-lib/JSZip handle encoding, parser and ZIP format; installed fast-check covers suitable parser/invariant boundaries, axe covers detectable accessibility violations, Oxlint/TypeScript cover code patterns/types. Add only material split behavior/error/cancellation tests. Reuse unchanged R05 reader/thumbnail evidence within exact matching scopes. Shared owned browser tests, README/generated task/index records support this tool and current policy.

## Intent not recorded — conservative defaults (owner may override)

Splitting applies to the current prepared editable output plan, including existing edits/overlays and explicitly staged metadata/attachments, rather than quietly operating on an unrelated original source. Newly authored editable forms block split because native copyPages does not preserve their editable field graph. Size mode offers ordered packing and explicit best-fit regrouping; source pages are listed for every output. Conservative preparation budgets:1000parts,128MiB prepared input/output bytes and5000candidate serializations, with readable refusal instead of silently incomplete export. These are implementation bounds, not universal device-memory guarantees. Range/burst/size result preparation is atomic; files download only from successful current results. ZIP uses existing JSZip with STORE for already-compressed PDF bytes.

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

2026-10-11 19:28 UTC: active after verified R05 main3be3493. No split implementation yet. Contract appended to current spec before code. Current official PDFDocument v1.17.1 source, JSZip3.10.2 registry and official generateAsync docs retrieved19:23HTTP200, exact digests in external pdf-split-research/primary-receipts.json. Source confirms copyPages copies selected page objects into a new document, not document-level metadata/attachments/forms. Existing splicePdfs already protects encrypted/structurally incomplete inputs and requires flattening copied source fields. New splitting must reuse that verified output pipeline, load the prepared source once, preserve staged metadata/attachments in every part and block newly authored editable forms rather than dropping them. Next implement R07 helper/UI and meaningful ranges/round-trip/guard tests, R08 through same writer, then R09 real serialized-byte packing. One focused final native batch and one selected main PDF gate; no duplicate unchanged global/browser run.

## Breaking points

Validate empty/malformed/out-of-bounds/reversed ranges before writing; preserve range order/repeats and ensure unique portable filenames. Do not turn an empty range into All. Cover source byte immutability, encrypted/structural/form refusal, output page/order/metadata/attachment bytes, omitted/repeated pages and partially failed preparation with no download. Source/selection/metadata/geometry/overlay/attachment/filename changes invalidate prepared results; Clear, cancellation and route changes abort/ignore stale completions. ZIP is one user-triggered download; separate per-part controls avoid requiring automatic multi-download permission. Guard invalid/non-integer/non-finite ceilings, oversized individual pages, serialization/resource limits, non-monotonic compression and report actual bytes/source pages. Best fit is a heuristic, never an optimal-bin-count claim. Keep page order an explicit choice. Render bounded result groups with keyboard/touch labels and all themes, no root overflow at320portrait/844landscape/tablet/desktop. No auth/backend/upload/new runtime dependency.

## Validation scope

Installed pdf-lib/JSZip handle encoding, parser and ZIP format; installed fast-check covers suitable parser/invariant boundaries, axe covers detectable accessibility violations, Oxlint/TypeScript cover code patterns/types. Add only material split behavior/error/cancellation tests. Reuse unchanged R05 reader/thumbnail evidence within exact matching scopes. Shared owned browser tests, README/generated task/index records support this tool and current policy.

## Intent not recorded — conservative defaults (owner may override)

Splitting applies to the current prepared editable output plan, including existing edits/overlays and explicitly staged metadata/attachments, rather than quietly operating on an unrelated original source. Newly authored editable forms block split because native copyPages does not preserve their editable field graph. Size mode offers ordered packing and explicit best-fit regrouping; source pages are listed for every output. Conservative preparation budgets:1000parts,128MiB prepared input/output bytes and5000candidate serializations, with readable refusal instead of silently incomplete export. These are implementation bounds, not universal device-memory guarantees. Range/burst/size result preparation is atomic; files download only from successful current results. ZIP uses existing JSZip with STORE for already-compressed PDF bytes.

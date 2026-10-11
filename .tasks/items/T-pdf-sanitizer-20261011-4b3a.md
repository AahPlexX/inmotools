---
task: T-pdf-sanitizer-20261011-4b3a
tool: pdf-sanitizer
doc: task
kind: expand
state: next
branch: fix/pdf-sanitizer
created: 2026-10-11
updated: 2026-10-11
---

# PDF-R05 lazy thumbnail page rail

## Request
Continue the frozen inventory after accepted PDF-R04. Implement a lazy thumbnail page rail; the original acceptance is: open a 20-page PDF and render additional thumbnails as the rail scrolls. Preserve existing PDF reader, exact password handling, editable/export refusal boundaries and device/viewport/theme support.

## Resume here
Queued preparation only; no R05 application code or acceptance. Preceding PDF-R04 accepted at 2026-10-11 08:11 UTC on main f992c97. Read canonical src/tools/pdf/TRACKER.md and VERIFICATION.md for the exact receipts/source, then refresh actual main/time before implementation. Reuse matching R04/reader scope receipts, but never treat those as thumbnail acceptance. Specify the client cycle and bounded render/DOM/memory ownership before writing code; keep this task/tracker/evidence current per phase.

Current-source facts: PdfRenderCoordinator in src/tools/pdf/pdf-renderer.ts uses Map<number,...> and replace(pageNumber,task) cancels the previous task for that page; pdfjs-browser.ts renderPage registers through that coordinator. A thumbnail for the same page must not cancel the main viewer render. PdfCanvas owns unprotected sessions and borrows protected intake-owned sessions; switching previews must not destroy borrowed sessions, reopen passwords, leak workers or share stale canvases. No current thumbnail implementation is claimed.

Primary preparation at 2026-10-11 07:56:12UTC: official pinned PDF.js 6.3.289 display API HTTP 200, SHA-256 9858ca9516c732acd46eeb4b8ca1eafea942ff4c708aeaff34eb4f93315a150c. Authoritative source https://github.com/mozilla/pdf.js/blob/v6.3.289/src/display/api.js; getPage line 773, getViewport line 1423, cleanup line 1844 and RenderTask.cancel line 3311. Receipt r05-primary-api-receipt-20261011.json in /workspace/inmotools-implementation-evidence/pdf-r04-research. Re-fetch the official pinned URL in a future workspace/date; local artifact paths are conveniences, not required implementation inputs.

## Breaking points and acceptance planning
- Real 20-page owned specimen: bounded initial rendering, newly visible thumbnails after native scroll, page label/selection and main viewer synchronization; no all-pages eager render or unbounded large-document DOM.
- Same-page viewer/thumbnail concurrency, stale completion after file switch, repeated Clear/remove/navigation and cancellation while loading/rendering; no detached source publication, borrowed-session destruction or leaked workers/canvases.
- Extremely tall/wide/rotated/UserUnit pages, device pixel ratios, resizing and phone portrait/landscape; keep rendered thumbnail dimensions bounded and titles readable. No overlapping/smooshed text or root horizontal overflow.
- Keyboard page selection, focus retention, labelled controls/current-page state, Light/Dark/System and axe; thumbnail errors remain local while readable pages survive.
- Real protected reading uses existing exact passwords and read-only output exclusion. Thumbnail display must not introduce uploads, accounts, database, third-party dependencies or decrypted export.

## Validation scope
Use meaningful focused helper/unit tests only where a helper has independent behavior, real native browser acceptance for scrolling/render/cancellation and owned reader dependency consumers selected under docs/VALIDATION_POLICY.md. Reuse accepted unchanged scopes; original assertions/timeouts remain intact. Repository-wide browser validation is reserved for explicit broad/unknown or stable/final checkpoints, not each integration.

## Log
- 2026-10-11 07:56 UTC: queued preparation from current source and refreshed official API; no R05 implementation.

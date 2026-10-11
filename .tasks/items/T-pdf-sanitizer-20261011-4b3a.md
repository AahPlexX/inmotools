---
task: T-pdf-sanitizer-20261011-4b3a
tool: pdf-sanitizer
doc: task
kind: expand
state: active
branch: fix/pdf-sanitizer
created: 2026-10-11
updated: 2026-10-11
---

# PDF-R05 lazy thumbnail page rail

## Request
Continue the frozen inventory after accepted PDF-R04. Implement a lazy thumbnail page rail; the original acceptance is: open a 20-page PDF and render additional thumbnails as the rail scrolls. Preserve existing PDF reader, exact password handling, editable/export refusal boundaries and device/viewport/theme support.

## Resume here

2026-10-11 19:22 UTC: local R05 acceptance ready for publication. Original native6ordinary passes reused with identical runtime/ordinary test hash9d626e4e…ac9; corrected protected navigation passes6/6 across Chromium/Firefox/WebKit desktop/compact/mobile (37.5s), zero PDF workers after destination loads. The original6navigation failures remain preserved: read-only diagnostic confirms PDF worker closes; Markdown creates its own table-formula.worker. Only new test scope corrected, no runtime repair/assertion timeout/retry changes. First corrected setup attempt loaded two installed Playwright instances and ran0application cases; corrected external config uses current dependency path and keeps separate receipts. Focused lint25files passes0errors/56warnings; original TypeScript/build and renderer4/password6 units reused for unchanged thumbnail sourcebd2520f and unchanged pinned library versions. Refreshed official Playwright/PDF.js19:19HTTP200/digests preserved; local-scope-reuse.json documents relevant hashes. Next direct main publication, selected PDF dependency/main gates and qualified-live acceptance; R05 partial, task4b3a active, 36/167verified (1implemented/20partial/110missing). Shared test/README/generated records support this tool and current validation policy.

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

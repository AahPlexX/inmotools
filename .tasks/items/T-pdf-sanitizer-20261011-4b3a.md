---
task: T-pdf-sanitizer-20261011-4b3a
tool: pdf-sanitizer
doc: task
kind: expand
state: done
branch: fix/pdf-sanitizer
created: 2026-10-11
updated: 2026-10-11
---

# PDF-R05 lazy thumbnail page rail

## Request
Continue the frozen inventory after accepted PDF-R04. Implement a lazy thumbnail page rail; the original acceptance is: open a 20-page PDF and render additional thumbnails as the rail scrolls. Preserve existing PDF reader, exact password handling, editable/export refusal boundaries and device/viewport/theme support.

## Resume here

2026-10-11 19:28 UTC: R05 verified; task4b3a done. Main3be3493b9a820e1324e3c7b2ed1bac20e5d35b6e Pages38167795102/validate114553877122 SUCCESS:4160units/18skips,374files/2skips72.54s; build7.71s; all62selectedbrowsercases in10PDFspecs passed2.1m, no browser skips/retry markers. Build/deploy, Docs38167795095 and Static analysis38167795103 succeed. Qualified live4/4desktop/mobile26.3s; workspaceJS/CSS/readerhelper eachHTTP200 byte-equal to candidate-dist, root module only fetched. Local six ordinary native passes precisely reused, six corrected protected native passes37.5s; earlier wrong-all-workers assertion failures and zero-case duplicate-Playwright setup failure preserved. Diagnostic proves PDF worker closes and Markdown creates table-formula.worker. Focused lint25files0errors/56warnings, original reader4/password6 units/types/build reused for unchanged bd2520f thumbnail runtime. PDF37/167verified,1implemented/19partial/110missing. Next frozen cursorR07 range/R08burst/R09actual-size-ceiling, active task91d4; no new split implementation yet.

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

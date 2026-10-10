---
task: T-pdf-sanitizer-20261009-c061
tool: pdf-sanitizer
doc: task
kind: fix
state: next
branch: fix/pdf-sanitizer
created: 2026-10-09
updated: 2026-10-10
---

# PDF-R04 document diagnostics and recoverable structural warnings

## Request
Complete PDF-R04 in frozen inventory order after PDF-R02/R03 acceptance. Show accurate document diagnostics and correct associated optional-structure inspection/error-message defects. Preserve browser-only processing, encrypted modification refusal, original inputs and responsive interaction.

## Resume here
2026-10-10 22:23 UTC: queued; no R04 application implementation. Preceding [7f9e](T-pdf-sanitizer-20261009-7f9e.md) remains active, R02/R03 partial pending final full receipt. Frozena25535a is on main94abf91; owned52/4119units, local20Chromium/40native, qualified-live20, exact live assets and Pages38090688282 succeeded. One final full38090462219/job114325656434 remains unread (browser stage observed active22:18UTC); fetch its current outcome and preserve actual retries/flaky/skips/failures. Do not redispatch unchanged full or edit frozen runtime/tests. Activate this task only after preceding acceptance closes; read current [tracker](../../src/tools/pdf/TRACKER.md) and [verification](../../src/tools/pdf/VERIFICATION.md) for exact receipts/portable sources. Records-only commits preserve matching source scope.

Confirmed preparation: queue summaries omit encryption/action/structural diagnostics. Owned malformed unused object99is recovered by pdf-lib asPDFInvalidObject without user warning; both authored pages still queue. Catalog JavaScript name-tree/OpenAction indicators remain inert and are not reported. One-page UserUnit2/Rotate90 hybrid AcroForm/XFA specimen proves raw dimensions differ from rendered dimensions and getForm removes XFA in memory. These are library/baseline facts, not R04 implementation acceptance.

Additional reproduced defect: a one300×200page specimen with deliberately malformed optional catalog Names=PDFString remains readable by pinned PDF.js, with metadata/page support and zero pageerrors. Existing inspector's typed Names/PDFDict lookup throws; production refuses the file with opaque notice “Expected instance of t, but got instance of t”. Desktop/mobile preserve a previously readable peer. Optional-structure failure must be diagnosed accurately; do not label failed or partial inspection clean or silently drop its warning. No automatic repair/export safety claim is established yet. External optional-names-probe.*, optional-names-app-baseline.* and native-optional-names-probe.* preserve receipts; regenerate through the simple recipe above in any workspace.

Next after preceding gate: claim/activate this task; refresh actual main/current time and primary sources; specify bounded diagnostics contract and associated defects before code; add meaningful baseline regressions, implement, then owned/full/main/Pages/qualified-live gates. Shared meaningful unit/browser tests require one fresh full on the frozen R04 candidate; no new dependencies/workflows are planned. Protect read-only session ownership/cancellation, avoid ignoreEncryption or executing stored actions, expose scan limits/unknowns, and wrap values in the existing320portrait/844landscape/tablet/desktop and Light/Dark/System matrix. Later editing/removal/redaction/encryption features remain later frozen items.

If the PDF worktree already exists, scripts/task-start.mjs returns from the reuse branch before queued-task activation. After preceding task7f9e is accepted and closed, verify c061 changes from next to active; do not assume that reusing the worktree activated it. Keep its tracker, task and generated task inventory synchronized.

## Log
- 2026-10-09 22:45 UTC: queued from primary source and owned baseline preparation; source remains unchanged while preceding full gate runs.

- 2026-10-10 22:33 UTC: queued preparation only. Refreshed8pinned official source receiptsHTTP200/hash-identical to October9; current live desktop/touch baseline reproduces malformed optional Names rejection with opaque type text, prior source retained and zero pageerrors/action execution. New owned probe confirms getForm creates an AcroForm/one parsed object for no-form source while original byte hash remains unchanged. Source diagnostics must precede mutating getters; whole-array enumeration occurs before traversal limits. Exact receipts, recipes and pinned lines are in VERIFICATION.md. No application code or task activation; final preceding full remains pending.

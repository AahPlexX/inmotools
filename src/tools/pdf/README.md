# PDF Workstation

Local PDF viewing and preparation. Files are processed in this browser; no account, server or document upload is used. Current implemented capabilities and limits are in [TRACKER.md](TRACKER.md); the [spec](../../../docs/superpowers/specs/2026-10-05-pdf-sanitizer-design.md) defines acceptance.

## Continue here

Read [tracker Resume here](TRACKER.md#resume-here), active [diagnostics task](../../../.tasks/items/T-pdf-sanitizer-20261009-c061.md), [verification](VERIFICATION.md) and [ordered inventory](../../../.tasks/items/T-ordered-requirement-inventory-20261006-9cf1.md). PDF-R02/R03 are verified; R04 diagnostics is the current ordered work. The tracker records exact source/run identities and pending gates; reuse matching evidence and retain historical failures. Keep tracker/task/evidence current in each working commit.

Document diagnostics distinguish observed data from incomplete inspection, report stored indicators without running actions, and keep readable malformed optional sources available for viewing. Export is blocked when required inspection or XFA/signature content preservation cannot be verified. Raw page boxes retain PDF units; displayed dimensions include visible bounds, rotation and UserUnit. Protected diagnostics use reader information; only the first page's dimensions and document JavaScript indicators are inspected, and raw structural validity remains unassessed. Object traversal limits apply after parsing, not to library parsing allocations.

Editable inputs are inspected with pdf-lib; PDF.js supplies worker-backed viewing, text search and zoom. Protected PDFs use a separate read-only viewer list with password retry, Cancel/Escape and exact password text. Readable peers remain queued when another selected file fails or is cancelled. The encrypted-input modification refusal remains the boundary; read-only viewing does not imply decryption or editable export. Remove or clear read-only sources to release their viewer sessions. Documents and passwords must not be uploaded or passwords persisted.

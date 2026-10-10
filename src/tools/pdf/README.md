# PDF Workstation

Local PDF viewing and preparation. Files are processed in this browser; no account, server or document upload is used. Current implemented capabilities and limits are in [TRACKER.md](TRACKER.md); the [spec](../../../docs/superpowers/specs/2026-10-05-pdf-sanitizer-design.md) defines acceptance.

## Continue here

Read tracker Resume here, then the active [password-opening task](../../../.tasks/items/T-pdf-sanitizer-20261009-7f9e.md), [verification](VERIFICATION.md) and [ordered inventory](../../../.tasks/items/T-ordered-requirement-inventory-20261006-9cf1.md). PDF-R02/R03 remain partial. The current password-opening and focus corrections are on main; the published-source full suite has passed. The current draft places Clear queue beside the picker, verifies actual empty state before worker cleanup and scopes instant document scrolling to this workstation, restoring prior route behavior. Final acceptance remains pending. Earlier retained-queue failure does not establish a post-clear worker leak. Read the current tracker/task for exact receipts. The frozen inventory overrides older default R31 guidance. Keep current tracker/task/evidence in the same commit as each working step.

Editable inputs are inspected with pdf-lib; PDF.js supplies worker-backed viewing, text search and zoom. Protected PDFs use a separate read-only viewer list with password retry, Cancel/Escape and exact password text. Readable peers remain queued when another selected file fails or is cancelled. The encrypted-input modification refusal remains the boundary; read-only viewing does not imply decryption or editable export. Remove or clear read-only sources to release their viewer sessions. Documents and passwords must not be uploaded or passwords persisted.

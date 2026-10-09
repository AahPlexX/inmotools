# PDF Workstation

Local PDF viewing and preparation. Files are processed in this browser; no account, server or document upload is used. Current implemented capabilities and limits are in [TRACKER.md](TRACKER.md); the [spec](../../../docs/superpowers/specs/2026-10-05-pdf-sanitizer-design.md) defines acceptance.

## Continue here

Read tracker Resume here, then the active [password-opening task](../../../.tasks/items/T-pdf-sanitizer-20261009-7f9e.md), [verification](VERIFICATION.md) and [ordered inventory](../../../.tasks/items/T-ordered-requirement-inventory-20261006-9cf1.md). At2026-10-09 21:31 UTC PDF-R02 is specified and missing; no password implementation or acceptance yet. The frozen inventory overrides older default R31 guidance. Keep current tracker/task/evidence in the same commit as each working step.

Editable inputs are inspected with pdf-lib; PDF.js supplies worker-backed viewing, text search and zoom. Existing encrypted-input modification refusal remains the boundary; planned R02 read-only password viewing does not imply decryption or editable export. Documents and passwords must not be uploaded or passwords persisted.

---
tool: pdf-sanitizer
doc: research
updated: 2026-10-09
---

# Ordered PDF verification

Current state: [TRACKER.md](TRACKER.md). Current task: [7f9e](../../../.tasks/items/T-pdf-sanitizer-20261009-7f9e.md). Frozen cross-tool order: [ordered inventory](../../../.tasks/items/T-ordered-requirement-inventory-20261006-9cf1.md).

## Current checkpoint

2026-10-09 21:31 UTC: PDF-R02 specified before code, still missing. Base mainf33c0047bab18f97585f479981b6a23977039bdd. New password/reader/intake app acceptance has not run. Older tracker R31 default is superseded by frozen R02 order. Current source confirms inspectPdf rejects protected input before queue append; a batch-level throw drops its readable peers. Pending PdfCanvas open is assigned only after await, so future password-loading cleanup must abort before resolution. Protected viewing must not create fake editable inspection metadata or use ignoreEncryption for rewriting.

## Current primary evidence

Retrieved2026-10-09 21:28:22UTC, allHTTP200:

- [Pinned PDF.js6.3.289 API](https://github.com/mozilla/pdf.js/blob/v6.3.289/src/display/api.js): getDocument loading task, onPassword callback, promise and destroy.
- [Pinned reader password/retry/cancellation tests](https://github.com/mozilla/pdf.js/blob/v6.3.289/test/unit/api_spec.js).
- [pdf-lib1.17.1 README](https://github.com/Hopding/pdf-lib/blob/v1.17.1/README.md): encrypted documents are unsupported; ignoreEncryption does not decrypt.
- [WHATWG native dialog](https://html.spec.whatwg.org/multipage/interactive-elements.html#the-dialog-element): showModal, modal focus and cancellation.

Exact installed pins remain pdfjs-dist6.3.289/pdf-lib1.17.1; no dependency upgrade. Primary receipts externally preserved as pdf-password-research/r02-current-primary-receipts-20261009.json and r02-current-*.txt. A direct pinned pdf-lib load of the owned AES256 specimen emits its encrypted-document error; instanceof EncryptedPDFError is false in this installed build, so do not assume that predicate works.

## Preparation and reproduction

Earlier same-day live and immutable-production desktop/touch baselines confirm no password field/view/download, readable peers dropped in both mixed orders, and an existing queued file retained. They are preparation receipts, not implementation acceptance. Optional evidence root /workspace/inmotools-implementation-evidence; pdf-password-baseline-20261009.*, pdf-mixed-password-baseline-20261009.* and corrected cjs log. Initial Node ES import failure happened before browser execution and is excluded from app evidence.

Owned two-page content:320×240/400×260, Helvetica18 at25,160, text Owned specimen page1/page2 (with spaces as in generator), fixed2026-10-09 metadata, no object streams. Official qpdf12.4.2 creates AES256, AES128 (--use-aes=y), empty-user/owner-restricted, exact-space and Unicode fixtures. Public fixture passwords are test data, not credentials. Official Linux archive SHA256db367d897829f22c4198ce1094143c9d467bd6ee7dfabc44ba6f02056b24f8b1 matched release API and checksum; Apache licence/manual/version/qpdf structural checks recorded in ordered parent and external pdf-password-research. Random salts change regeneration hashes; reader count/text/password cycle is portable acceptance. Third-party public PDF specimens are not cleared for repository redistribution; use owned content.

Standalone real-worker probes passed desktop/touch wrong→correct, AES128/AES256 opening, empty-user opening without prompt, exact leading/trailing spaces and composed Unicode/emoji. Immediate loading destroy rejects Error Loading aborted; prompt destroy can reject PasswordExceptioncode1. Cancellation state governs; do not infer cancellation from one exception name. Subsequent open/render returns both exact authored texts and real dark pixels, zero pageerrors. These facts do not establish PDF-R02 app acceptance or decrypted export. getPermissions returns a Set; serialize Array.from. Await getPage, then getTextContent. No universal Unicode interoperability claim.

Planned committed regressions verify actual worker/password/dialog/search/page/zoom, edits/refusal/export boundaries, cancel/clear/navigation/reopen, mixed malformed/protected/readable intake, repeat selection and phone portrait/landscape/tablet/desktop bounds. Run pnpm exec vitest run tests/unit/pdf*.test.ts; pnpm exec tsc --noEmit -p tsconfig.app.json; pnpm build; production pnpm exec playwright test tests/e2e/pdf*.spec.ts. Shared meaningful tests require one fresh frozen-source full regression gate. Each receipt must state exact source and preserve earlier failures separately.

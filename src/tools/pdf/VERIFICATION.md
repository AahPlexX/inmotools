---
tool: pdf-sanitizer
doc: research
updated: 2026-10-09
---

# Ordered PDF verification

Current state: [TRACKER.md](TRACKER.md). Current task: [7f9e](../../../.tasks/items/T-pdf-sanitizer-20261009-7f9e.md). Frozen cross-tool order: [ordered inventory](../../../.tasks/items/T-ordered-requirement-inventory-20261006-9cf1.md).

## Current checkpoint

2026-10-09 22:06 UTC: PDF-R02/R03 remain partial, task7f9e active. Final candidate local14/14production cases passed1.5m, desktop/touch, zero retries/skips, on immutable pdf-r02-frozen-dist afterHTTP200 readiness. Covers exact password/retry/error semantics, native first/last Tab/axe, three typed/cancelled same-file cycles and focus return per profile, navigation/pending worker termination/reopen, read-only/source switching/View/reset/search/page/zoom, empty-user modification refusal, mixed malformed/protected/readable actual3page download, full selected filename and four viewport bounds.42PDFunits passed2.98s for unchanged reader/writer logic; final TypeScript and clean build passed15.64s. Previous32legacycases passed in their scopes; no claim they ran on the final focus/accessibility source yet. Freeze and publish current runtime/tests, then one fresh exact-source full and owned integration, main/Pages/qualified-live14 receipts. Do not modify this source or duplicate unchanged gates while its required full runs. Protected inputs never enter editable output; no ignoreEncryption/decrypted export, dependencies/workflows/auth/backend/newstorage. Earlier failures and current primary sources retained in VERIFICATION.md. After final acceptance verifyR02/R03 and advance frozenR04; separate Markdown/Crystal causes remain unresolved.

Previous final-candidate checkpoint (history):

2026-10-09 22:00 UTC: PDF-R02 partial, focus-repaired14/14production cases passed1.8m, no retries/skips. Three typed/cancelled same-file cycles per profile retain focus; navigation destroys pending workers and reopening succeeds. Native first/last Tab and unrestricted modal axe pass; protected reading/search/page/zoom, AES128/AES256/empty-user/exact-space/Unicode and mixed malformed-file actual download boundaries pass. Visual320portrait/844landscape measured0overlap/0pageoverflow/0pageerrors; full protected filename wraps. Native select visually clips its selected long value, so a full selected-source helper is added, with exact-text viewport regression; View read-only button/reset cycle strengthened. Fresh final helper types/build and targeted source/view acceptance pending; no release/full/main/live claim.42units and prior32legacyPDFcases remain accepted in their stated scopes. Next freeze/publish final candidate after these checks; one required fresh full gate.

Previous repair checkpoint (history):

2026-10-09 21:55 UTC: PDF-R02 partial. Keyboard-repaired production13passed/1failed1.3m: desktop cancellation did not focus Add PDF files. Keyboard wrapping and unrestricted modal axe pass; same cancellation case mobile passed, no underlying cause attribution beyond observed focus behavior. Removed timed requestAnimationFrame focus callback; return now checks committed picker enabled state and native dialog closure, invoked from close event and state effect. React useEffect primaryHTTP200 refreshed today; W3C APG focus-return requirement retained. No test assertion/timeout/retry weakened. Fresh focus-repaired types/build, all14password cases and explicit repeated cancellation are required before candidate release; no full/main/live acceptance yet.

Previous focus checkpoint (history):

2026-10-09 21:51 UTC: PDF-R02 partial. Repaired TypeScript and clean production build passed (26.75s) after owned first/last Tab wrapping; fresh14password cases running on immutable pdf-r02-keyboard-dist afterHTTP200 readiness. Prior finalexplicit partition34passed/2matchingkeyboardfailures3.9m; queue/exportpartition10passed38.4s, no other failures. No test assertions/timeouts/retries weakened. Direct native focus probe shows first Shift+Tab changes activeElement toBODY/document.hasFocusfalse; W3C APG says first/last tabbable elements wrap. Modal axe checks did not run in the failed cases before this repair.42PDFunits remain accepted for unchanged loading/writing logic. Current source not released; next inspect repaired actual password results and visual geometry, freeze/publish, then exact owned/full/main/Pages/live gates.

Previous keyboard checkpoint (history):

2026-10-09 21:49 UTC: PDF-R02 partial; strengthened final browser run exposed a native reverse-Tab boundary failure before axe analysis. Direct focus probe and W3C modal-dialog APG refreshedHTTP200 today corroborate first/last tabbable wrapping. Added owned first/last Tab handling; no test assertion/timeout weakened. Existing final10queue/exportcases and42units/types/build remain prior-source receipts. Fresh repaired TypeScript/build and password keyboard/axe/long-name acceptance required; all final partition results will be read separately. No candidate release/full claim.

Previous acceptance checkpoint (history):

2026-10-09 21:45 UTC: PDF-R02 partial. Final TypeScript/build passed after two wording improvements; first production14/14passed1.2m. Final queue/export partition10/10passed38.4s. A filename regex selected only pdf.spec.ts; remaining pdf-.*.spec.ts files run separately on the same immutable pdf-r02-final-dist, including stronger keyboard/axe/opened-long-name coverage. No case is intentionally omitted or counted twice. Broad42/42PDFunits passed2.98s. New/full/main/live final-source receipts remain pending. Next: inspect remaining production results, then freeze/publish candidate and one fresh required full gate.

Previous production checkpoint (history):

2026-10-09 21:41 UTC: PDF-R02 partial; 42/42 PDF units passed2.98s, corrected TypeScript and clean production build passed. New production14case desktop/touch password/view/search/download/cancellation/responsiveness acceptance is running on immutable pdf-r02-first-dist at4227 afterHTTP200 readiness. Corrected unchanged-runtime baseline4/4failed; initial JSON-loader failure and implicit-any typing error preserved separately and corrected. No new full/main/live implementation receipt yet. Next: inspect actual production results, fix confirmed failures, run existing PDF regressions, freeze candidate and publish through GitHub MCP with one fresh required full gate.

Previous implementation checkpoint (history):

2026-10-09 21:39 UTC: PDF-R02 implementation draft is present: cancellable reader loading, native password retry dialog, separate owned protected sessions, per-file readable-peer preservation and cleanup. Corrected production baseline4/4 failed on unchanged PDF runtime in immutable R96 artifact (source81fc788, PDF identical to mainf33c004), missing password UI; original JSON-import run failed before tests and is setup evidence only. Focused13/13 lifecycle/refusal/renderer units passed1.68s. First TypeScript found untyped callback parameters; corrected explicit signatures are being checked. New production acceptance and broader units/build are pending; R02 remains partial, R03 retains modification refusal. No release or full-validation claim.

Previous specification checkpoint (history):

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

Baseline: pdf-r02-browser-baseline.log records JSON import setup failure, no cases ran. Corrected pdf-r02-corrected-browser-baseline.json/log/results records4failures on actual immutable old production runtime, both desktop/touch. Focused pdf-r02-first-units.log13passes1.68s. First pdf-r02-first-types.log records two implicit-any callback parameters, corrected before final validation. Unique artifacts retain these attempts; no all-pass claim.

- 2026-10-09 21:48 UTC: finalPDFregression file selection corrected to explicit seven pdf-*.spec.ts paths; --list confirms36cases/7files, running on unchanged finalartifact, plus earlier10/10pdf.spec.ts partition. A regex invocation unintentionally selected1996catalog cases and was interrupted; its separate log/JSON is not full validation or included in acceptance totals. No product failure asserted from that setup attempt. Final total expected46cases, report actual completion counts only.

- 2026-10-09 21:49 UTC: PDF-R02 partial; strengthened final browser run exposed a native reverse-Tab boundary failure before axe analysis. Direct focus probe and W3C modal-dialog APG refreshedHTTP200 today corroborate first/last tabbable wrapping. Added owned first/last Tab handling; no test assertion/timeout weakened. Existing final10queue/exportcases and42units/types/build remain prior-source receipts. Fresh repaired TypeScript/build and password keyboard/axe/long-name acceptance required; all final partition results will be read separately. No candidate release/full claim.

## Keyboard boundary primary evidence

[W3C modal-dialog APG](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/) retrievedHTTP200 at2026-10-09 21:49:31UTC specifies Tab from last to first, Shift+Tab from first to last, Escape and focus restoration. External pdf-r02-focus-probe.mjs/json confirms actual native browser navigation at both boundaries leaves page focus; second keypress returns inside. Owned boundary handling follows APG while preserving ordinary field navigation and native Escape. Primary HTML/r02-w3c-dialog-pattern receipts and before-repair screenshots/traces are retained. This is a workbench keyboard repair, not a claim of a universal native-browser defect.

[React useEffect](https://react.dev/reference/react/useEffect) retrievedHTTP2002026-10-09 21:55:08UTC confirms setup runs after component commit. Focus return is gated by both dialog closure and the enabled picker; native close event covers closure ordering, state effect covers completed loading. No timed retry or broadened focus assertion. Committed cancellation test repeats three typed/cancelled same-file cycles and then navigation/reopen, with original focus assertion and worker termination checks.

- 2026-10-09 22:01 UTC: visual review prompted full selected-source filename helper next to native select; full protected filenames remain available rather than relying on clipped native selected text. Final accessibility markup links the prompt to the current filename and the rejected field to its existing error message/invalid state. View read-only button/reset and full selected-name regression strengthened. Freeze runtime/tests after fresh types/build and final14case run; no further speculative scope or unchanged full dispatch. Source remains unreleased/partial.

## Frozen local candidate reproduction

Final actual candidate: pdf-r02-frozen-browser.json/log/results,14passes1.5m,no retries/skips; pdf-r02-frozen-types.log and frozen-build.log15.64s. Broad unit42passes2.98s in pdf-r02-broad-units.log. Prior successful32legacyPDFcases: final-browser10passes38.4s plus22existing cases in final-explicit-browser; that partition total34passes/2native-keyboard failures3.9m. Keyboard-repaired browser13passes/1desktopfocus-return failure1.3m; focus-repaired14passes1.8m. Those prior attempts are historical, not final success. Unique artifact directories preserve failures. Initial JSON-import failure had no cases; regex-selected catalog run was interrupted,19passes/1interrupted/1976notrun, excluded from full acceptance.

Native open/cancel unit mocks cover resources before document resolution; actual e2e use the bundled worker and owned encrypted PDFs. Committed tests/fixtures/pdf-password-fixtures.json includes own authored content, public known passwords, SHA256 and generation recipe; third-party fixture content not included. Reproduce pnpm exec vitest run tests/unit/pdf*.test.ts; pnpm exec tsc --noEmit -p tsconfig.app.json; pnpm build; pnpm exec playwright test tests/e2e/pdf-password-opening.spec.ts. Existing PDF regressions should use explicit filenames from tests/e2e/pdf*.spec.ts; record actual selected count before long execution, not an unverified filename regex. All test assertions/defaults remain unchanged except strengthened meaningful keyboard/error/full-name/control/repeated-cycle coverage.

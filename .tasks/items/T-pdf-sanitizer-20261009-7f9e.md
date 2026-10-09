---
task: T-pdf-sanitizer-20261009-7f9e
tool: pdf-sanitizer
doc: task
kind: fix
state: active
branch: fix/pdf-sanitizer
created: 2026-10-09
updated: 2026-10-09
---

# Open encrypted PDFs read-only with cancellable password prompts and preserve mixed intake

## Request
Owner, 2026-10-09: "Continue". Continue the frozen ordered tool audit at PDF-R02; implement supported local password opening and associated mixed-intake/cancellation defects while preserving PDF-R03 encrypted modification refusal. The ordered parent task carries the accepted sequence and platform constraints.

## Resume here
2026-10-09 21:39 UTC: PDF-R02 implementation draft is present: cancellable reader loading, native password retry dialog, separate owned protected sessions, per-file readable-peer preservation and cleanup. Corrected production baseline4/4 failed on unchanged PDF runtime in immutable R96 artifact (source81fc788, PDF identical to mainf33c004), missing password UI; original JSON-import run failed before tests and is setup evidence only. Focused13/13 lifecycle/refusal/renderer units passed1.68s. First TypeScript found untyped callback parameters; corrected explicit signatures are being checked. New production acceptance and broader units/build are pending; R02 remains partial, R03 retains modification refusal. No release or full-validation claim.

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

Previous specification checkpoint (history):

2026-10-09 21:31 UTC: active, contract specified before code. Base mainf33c0047bab18f97585f479981b6a23977039bdd; PDF-R02 missing. Refreshed primary pinned API/tests, writing-library README and native dialog specification returnedHTTP200 today. Standalone owned-fixture evidence is preparation only. Next: failing production/lifecycle regressions, implementation, fresh validation. No encrypted export or runtime acceptance claimed. Meaningful shared tests/owned fixture JSON are necessary to verify actual worker/password/download boundaries, so one fresh full browser gate is required on the frozen candidate. No dependency/workflow changes planned.

## Log
- 2026-10-09: claimed `fix/pdf-sanitizer`.

- 2026-10-09 21:31 UTC: refreshed source/main through GitHub MCP and fetch; specified R02 contract, updated current tracker and portable research/README before implementation. Prior MarkdownR96 remains verified.

- 2026-10-09 21:39 UTC: PDF-R02 implementation draft is present: cancellable reader loading, native password retry dialog, separate owned protected sessions, per-file readable-peer preservation and cleanup. Corrected production baseline4/4 failed on unchanged PDF runtime in immutable R96 artifact (source81fc788, PDF identical to mainf33c004), missing password UI; original JSON-import run failed before tests and is setup evidence only. Focused13/13 lifecycle/refusal/renderer units passed1.68s. First TypeScript found untyped callback parameters; corrected explicit signatures are being checked. New production acceptance and broader units/build are pending; R02 remains partial, R03 retains modification refusal. No release or full-validation claim.

- 2026-10-09 21:43 UTC: firstproduction14/14passed1.2m, desktop/touch, no retries/skips. Meaningful native-worker/password/render/search/download/cancel/remove/clear tests pass. Strengthened keyboard focus trap, unrestricted modal axe and opened long-name viewport coverage; corrected a misplaced test edit before execution. Clarified password retention statement to refer to this tool and added remove-unused-source memory hint. New immutable final build/strengthened acceptance and existing PDF regressions pending; no release/full claim.

- 2026-10-09 21:48 UTC: finalPDFregression file selection corrected to explicit seven pdf-*.spec.ts paths; --list confirms36cases/7files, running on unchanged finalartifact, plus earlier10/10pdf.spec.ts partition. A regex invocation unintentionally selected1996catalog cases and was interrupted; its separate log/JSON is not full validation or included in acceptance totals. No product failure asserted from that setup attempt. Final total expected46cases, report actual completion counts only.

- 2026-10-09 21:49 UTC: PDF-R02 partial; strengthened final browser run exposed a native reverse-Tab boundary failure before axe analysis. Direct focus probe and W3C modal-dialog APG refreshedHTTP200 today corroborate first/last tabbable wrapping. Added owned first/last Tab handling; no test assertion/timeout weakened. Existing final10queue/exportcases and42units/types/build remain prior-source receipts. Fresh repaired TypeScript/build and password keyboard/axe/long-name acceptance required; all final partition results will be read separately. No candidate release/full claim.

- 2026-10-09 22:01 UTC: visual review prompted full selected-source filename helper next to native select; full protected filenames remain available rather than relying on clipped native selected text. Final accessibility markup links the prompt to the current filename and the rejected field to its existing error message/invalid state. View read-only button/reset and full selected-name regression strengthened. Freeze runtime/tests after fresh types/build and final14case run; no further speculative scope or unchanged full dispatch. Source remains unreleased/partial.

- 2026-10-09 22:06 UTC: PDF-R02/R03 remain partial, task7f9e active. Final candidate local14/14production cases passed1.5m, desktop/touch, zero retries/skips, on immutable pdf-r02-frozen-dist afterHTTP200 readiness. Covers exact password/retry/error semantics, native first/last Tab/axe, three typed/cancelled same-file cycles and focus return per profile, navigation/pending worker termination/reopen, read-only/source switching/View/reset/search/page/zoom, empty-user modification refusal, mixed malformed/protected/readable actual3page download, full selected filename and four viewport bounds.42PDFunits passed2.98s for unchanged reader/writer logic; final TypeScript and clean build passed15.64s. Previous32legacycases passed in their scopes; no claim they ran on the final focus/accessibility source yet. Freeze and publish current runtime/tests, then one fresh exact-source full and owned integration, main/Pages/qualified-live14 receipts. Do not modify this source or duplicate unchanged gates while its required full runs. Protected inputs never enter editable output; no ignoreEncryption/decrypted export, dependencies/workflows/auth/backend/newstorage. Earlier failures and current primary sources retained in VERIFICATION.md. After final acceptance verifyR02/R03 and advance frozenR04; separate Markdown/Crystal causes remain unresolved.

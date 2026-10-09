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
Continue the frozen ordered tool audit at PDF-R02; implement supported local password opening and associated mixed-intake/cancellation defects while preserving PDF-R03 encrypted modification refusal. The ordered parent task carries the accepted sequence and platform constraints.

## Resume here

2026-10-09 22:21 UTC: PDF-R02 and PDF-R03 remain partial; task 7f9e is active. Main `43eef1b1497e5744944bcfe0f8893fb472bff754` includes initial password-opening source `7fe9ac49606237e0b41b9de76acba4beb32eaa23`. Its dark dialog used undefined `--text` against dark `--surface`: the new measured-contrast regression fails in both profiles at 1.13257:1. The standalone axe scan returned no violations despite that visible defect; do not treat axe alone as contrast proof.

The narrow correction uses the existing `--ink` and `--line` tokens. Types and clean production build passed. After confirmed preview HTTP 200, the strengthened theme regression passed 2/2 in 41.8s, without retries or skips: desktop and touch each exercise Light, Dark and System, require at least 4.5:1 for dialog heading/filename/labels, run unrestricted dialog and owned read-only-control axe, open/render and clear. Earlier 14/14 password-flow cases and 42 PDF unit cases remain accepted only in their stated prior-source scopes. Existing 32 legacy browser cases retain their original receipts.

Old owned run `37997434143` and full run `37997433850` on `7fe9ac4` completed cancelled and are superseded. Cancellation happened after main contained the first runtime; that source was not kept off main. Publish the corrected immutable candidate through GitHub MCP, then run one replacement full gate. Do not reuse cancelled full validation or change runtime/tests during the replacement gate. Corrected main, Pages, qualified-live 16-case and completed full receipts are still pending. Complete those before verifying R02/R03 or implementing the next frozen item, PDF-R04. Current primary sources and distinct failed setup/baseline/repair attempts remain in VERIFICATION.md; no new auth, backend, dependency, workflow or password persistence.

## Log
- 2026-10-09: claimed `fix/pdf-sanitizer`.

- 2026-10-09 21:31 UTC: refreshed source/main through GitHub MCP and fetch; specified R02 contract, updated current tracker and portable research/README before implementation. Prior MarkdownR96 remains verified.

- 2026-10-09 21:39 UTC: PDF-R02 implementation draft is present: cancellable reader loading, native password retry dialog, separate owned protected sessions, per-file readable-peer preservation and cleanup. Corrected production baseline4/4 failed on unchanged PDF runtime in immutable R96 artifact (source81fc788, PDF identical to mainf33c004), missing password UI; original JSON-import run failed before tests and is setup evidence only. Focused13/13 lifecycle/refusal/renderer units passed1.68s. First TypeScript found untyped callback parameters; corrected explicit signatures are being checked. New production acceptance and broader units/build are pending; R02 remains partial, R03 retains modification refusal. No release or full-validation claim.

- 2026-10-09 21:43 UTC: firstproduction14/14passed1.2m, desktop/touch, no retries/skips. Meaningful native-worker/password/render/search/download/cancel/remove/clear tests pass. Strengthened keyboard focus trap, unrestricted modal axe and opened long-name viewport coverage; corrected a misplaced test edit before execution. Clarified password retention statement to refer to this tool and added remove-unused-source memory hint. New immutable final build/strengthened acceptance and existing PDF regressions pending; no release/full claim.

- 2026-10-09 21:48 UTC: finalPDFregression file selection corrected to explicit seven pdf-*.spec.ts paths; --list confirms36cases/7files, running on unchanged finalartifact, plus earlier10/10pdf.spec.ts partition. A regex invocation unintentionally selected1996catalog cases and was interrupted; its separate log/JSON is not full validation or included in acceptance totals. No product failure asserted from that setup attempt. Final total expected46cases, report actual completion counts only.

- 2026-10-09 21:49 UTC: PDF-R02 partial; strengthened final browser run exposed a native reverse-Tab boundary failure before axe analysis. Direct focus probe and W3C modal-dialog APG refreshedHTTP200 today corroborate first/last tabbable wrapping. Added owned first/last Tab handling; no test assertion/timeout weakened. Existing final10queue/exportcases and42units/types/build remain prior-source receipts. Fresh repaired TypeScript/build and password keyboard/axe/long-name acceptance required; all final partition results will be read separately. No candidate release/full claim.

- 2026-10-09 22:01 UTC: visual review prompted full selected-source filename helper next to native select; full protected filenames remain available rather than relying on clipped native selected text. Final accessibility markup links the prompt to the current filename and the rejected field to its existing error message/invalid state. View read-only button/reset and full selected-name regression strengthened. Freeze runtime/tests after fresh types/build and final14case run; no further speculative scope or unchanged full dispatch. Source remains unreleased/partial.

- 2026-10-09 22:06 UTC: PDF-R02/R03 remain partial, task7f9e active. Final candidate local14/14production cases passed1.5m, desktop/touch, zero retries/skips, on immutable pdf-r02-frozen-dist afterHTTP200 readiness. Covers exact password/retry/error semantics, native first/last Tab/axe, three typed/cancelled same-file cycles and focus return per profile, navigation/pending worker termination/reopen, read-only/source switching/View/reset/search/page/zoom, empty-user modification refusal, mixed malformed/protected/readable actual3page download, full selected filename and four viewport bounds.42PDFunits passed2.98s for unchanged reader/writer logic; final TypeScript and clean build passed15.64s. Previous32legacycases passed in their scopes; no claim they ran on the final focus/accessibility source yet. Freeze and publish current runtime/tests, then one fresh exact-source full and owned integration, main/Pages/qualified-live14 receipts. Do not modify this source or duplicate unchanged gates while its required full runs. Protected inputs never enter editable output; no ignoreEncryption/decrypted export, dependencies/workflows/auth/backend/newstorage. Earlier failures and current primary sources retained in VERIFICATION.md. After final acceptance verifyR02/R03 and advance frozenR04; separate Markdown/Crystal causes remain unresolved.

- 2026-10-09 22:16 UTC: PDF-R02/R03 partial, task7f9e active. New confirmed dark-dialog contrast defect: initial7fe9ac4 used undefined --text with dark --surface; corrected to existing --ink/--line tokens. Current main43eef1b1497e5744944bcfe0f8893fb472bff754 contains prior7fe9ac4 runtime; old owned/full cancellation was requested after main had integrated, so no claim that old candidate stayed off main. New theme-corrected candidate types/build and targeted2/2desktop/touch passed36.9s, each exercises Light/Dark/System plus unrestricted modal/owned-readonly-control axe and native reading/clear. Earlier14passwordflow cases remain valid in their Light/geometry scope; no test assertion or retry weakened. Old37997434143/37997433850 on7fe9ac4 are superseded, not final corrected-source acceptance. Freeze/publish this narrowly corrected source and one replacement fresh full; do not reuse cancelled old full as final validation. Precise primary CSS/source and W3C contrast receipts retained; native theme control is radio, manual baseline setup failures excluded. No corrected main/Pages/live/full receipt yet. Next complete owned/main/qualified-live16 and exact freshfull before R02/R03 verification/R04.

---
tool: crystal-lattice-studio
doc: research
updated: 2026-10-10
---

# Point-defect gate dependency verification

Current state: [TRACKER.md](TRACKER.md). Current task: [d7a8](../../../.tasks/items/T-crystal-substitution-retry-20261009-d7a8.md). Frozen inventory: [ordered task](../../../.tasks/items/T-ordered-requirement-inventory-20261006-9cf1.md). Earlier cross-tool full/live evidence and portable initial diagnostics remain in [PDF verification](../pdf/VERIFICATION.md); this document records the narrow Crystal dependency repair.

## Current checkpoint

2026-10-10 23:39 UTC: actual scoped effect and route regression pass16/16 focused production cases without retries/skips/flaky/global errors: Chromium8 in91.595s (320portrait,844landscape,1440desktop,390touch), Firefox/WebKit8 in82.640s (desktop/compact or touch). TypeScript exit0; production build exit0 in15.18s. Original defect test body/assertion/default5000ms is byte-identical to a25535a. New route baseline had failed2/2 on unchanged production artifact. Frozen runtime/tests are ready for publication; owned integration, one changed-source full, main/Pages/qualified-live gates are next. No full-release acceptance or inventory advance.

PDF-R02/R03 remain partial,7f9e active, R04c061 queued. Canonical narrow dependency evidence and portable recipe are in Crystal VERIFICATION.md. Shared test change proves scope; shared parent/PDF task changes preserve gate status. Other Crystal work remains frozen later.

### New contract baseline

External crystal-scroll-contract-red-20261010.json/log/exit/results records two cases selected with --list before execution, unchanged a255 artifact, real desktop/mobile Chromium, retries0/default5000ms polling. Both failed at the mounted root scroll contract, rather than fixture/setup. Portable recipe: run committed CLS-R030 route test against prior immutable production artifact, then repeat against actual newly built source. Report statistics: {"startTime":"2026-10-10T23:36:28.537Z","duration":16198.766000000001,"expected":0,"skipped":0,"unexpected":2,"flaky":0}.

## Existing baseline and limits

Official full [38090462219](https://github.com/AahPlexX/inmotools/actions/runs/38090462219), validate job114325656434, sourcea25535a failed:1830browserpasses/171skips/1failure54.0m;4119unitpasses/18skips and build7.65s passed. Sole failed case is mobile original vacancy/substitution/interstitial/Undo, tests/e2e/crystal-lattice-studio.spec.ts396/408, expectedNa1 elementFe/receivedNa through5000ms on initial and retry. Runner artifact11685031973 downloadHTTP403; no runner trace inspected. A later original isolated mobile case passed1/1 in11.350s, no retries/skips/errors. This is not a repair or proof of CI-load cause.

External original-case passive pointer comparison completed5passes/1failure54.964s, default smooth2/3 and root-auto prototype3/3, original assertions/timeouts/retries0, iPhone13 Chromium profile, one worker, unchanged immutable a25535a production artifact. Failing default repeat1 matched the original assertion. Pointerdown/up/click targetDIV, selectedSite nacl-site-5 and elementFe were recorded with unchanged vacancy status. Local trace call31 computed button x178.171875/y320.0625/width133.40625/height24, intended click244.87,332.06, action root10067, pointer root10079 and after root10328. This establishes a local missed pointer activation; unavailable runner trace does not establish identical runner cause.

External receipts under /workspace/inmotools-implementation-evidence: crystal-substitution-baseline-20261010.json/log/exit/results; crystal-substitution-pointer-20261010.json/log/exit/results and compact -summary.json; per-mode/repeat JSON under crystal-substitution-pointer-20261010. Initial anchored grep selected zero cases; separate -selection receipts retain that setup error, corrected --list selected1case. These prior artifacts are not application repair acceptance. Portable reproduction: retain original test body, add passive capture pointerdown/up/click listeners recording target/coordinates/root scroll and selected-site/element/status, without synchronous bounding-rectangle reads; compare unchanged default root with inline auto at DOMContentLoaded, three repeats each, save complete reports/exits/trace. Existing detailed recipe remains in PDF verification.

## Primary sources and reuse — 2026-10-10

Reuse same-date retrieved authoritative sources and the already tested PDF scope pattern; no new dependency or speculative shared abstraction is needed. Receipt pdf-password-research/r02-scroll-scope-primary-20261010.json includes URLs/HTTP200/times/hashes and source artifacts, retrieved21:58:09–10UTC:

- [CSSWG CSS Overflow3](https://drafts.csswg.org/css-overflow-3/#smooth-scrolling): root scroll-behavior applies to viewport; auto is instant; manual scrolling is unaffected; UAs may ignore it, so actual engine checks are required. Source hash4635826dcd37bbf938b4043c08359ccf5c9a0befe88c6c8a33480bae523cd979.
- [React useEffect](https://react.dev/reference/react/useEffect): setup/cleanup ownership and development StrictMode stress cycle. Hash0c0193ae759d0678037480f2666c4b7f4fc134b4ecc0a43092a59aad1870e3ae. Current src/main.tsx uses StrictMode; root access must explicitly use the browser document rather than the component's model document.
- [MDN getPropertyPriority](https://developer.mozilla.org/en-US/docs/Web/API/CSSStyleDeclaration/getPropertyPriority): important or empty priority, needed for exact inline restoration. Hashc4ea88e422d69b1c3ccff825740a824dce5fad0f6ca2e98f8253da97a3912ef7.

PDF's existing scoped-scroll pattern passed actual six-profile preference/cancellation checks. Reuse its contract/implementation technique, but validate the actual Crystal source; prototype/manual style injection does not establish effect cleanup or release correctness. Shared stylesheet, history/model engines, dependencies, workflows, auth/backend/storage stay outside this repair.

## Actual repair scoped acceptance — 2026-10-10

Source input receipt crystal-scroll-repair-inputs-20261010.json captures SHA256: CrystalWorkspace.tsx ac14bda90329585a19d00ecc1e19dadd4a791ae39fc8a864ba602fd7c4348cdf; browser test bfd49cc034442a380a8fe27fd7e193b3cbf144fa2bf15c98d2ca6874b1c9b658. External immutable build crystal-scroll-repair-dist-20261010 completed15.18s/exit0, type receipt crystal-scroll-repair-typecheck-20261010.log/exit0. Dependency/shared CSS/PDF source unchanged. Original test body comparison with a25535a passed. Initial docs-check filename was nonexistent; corrected scripts/docs-sync.mjs --check plus scripts/check-doc-links.mjs passed180documents, and branch/tool checks passed with unchanged50/171 accepted requirements.

Managed wrappers own preview lifecycle, readinessHTTP200, serviceWorkers block, workers1/retries0, reports/exit capture. Chromium crystal-scroll-repair-chromium-20261010.json/log/exit/results records8/8pass91.595s; native crystal-scroll-repair-native-20261010.json/log/exit/results records8/8pass82.640s, no retries/skips/flaky/globalerrors/exits0. Each profile runs original vacancy/substitution/interstitial/Undo and new CLS-R030 route contract (default, important, reduced-motion; preserve a later changed declaration). Chromium profiles320×568portrait,844×390landscape,1440×900desktop,390×844touch; native Firefox desktop1440×900/compact390×844, WebKit desktop1440×900/touch390×844. Native official host libraries/launch proof reused; disabling advisory host validation does not replace actual engine launches. Physical phones or installed Safari are not certified.

Portable commands: build with pinned Vite; preview immutable output with /inmotools/ base and owned process cleanup; run tests/e2e/crystal-lattice-studio.spec.ts with grep `builds vacancy, substitution and interstitial defects with undo|CLS-R030 keeps automatic reveals local and restores route preferences`, listed projects, retries0 and JSON reporting. Keep original assertion/default5000ms intact. Primary source receipts above are reused within this same date. Scope checks do not replace required owned/full/main/Pages/live gates.

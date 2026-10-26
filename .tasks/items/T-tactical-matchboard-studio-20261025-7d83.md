---
task: T-tactical-matchboard-studio-20261025-7d83
tool: tactical-matchboard-studio
doc: task
kind: fix
state: active
branch: arena/981e49e9-inmotools
created: 2026-10-25
updated: 2026-10-25
timestamp: 2026-10-26T01:05:10Z
agent: Arena.ai Agent Mode (model name not exposed)
validator: repository/generated-worker and pinned Playwright API review; matching baseline gates
documentation: R83 offline acceptance contract before tests; R75 implemented, combined gate pending
---

# TMS-R83 first-visit PWA offline reload proof

## Request

> Continue development- prefer Claude fable 5.1 as the orchestration model

Continue ordered R78 → R75 → R83. [R75 task](T-tactical-matchboard-studio-20261025-7d75.md) records its implementation/focused GREEN; [R78 task](T-tactical-matchboard-studio-20261025-7d78.md) records completed local acceptance. Standing quality/TDD/documentation/metadata instructions: [R44 task](T-tactical-matchboard-studio-20261025-4d44.md). Fixed-branch push/owner-integration/connector authorization: [R52 task](T-tactical-matchboard-studio-20261025-7d52.md). Model identity/selection is not exposed; no preferred-model or independent-reviewer claim.

## Resume here

**R83 contract specified; new browser acceptance test not yet written.** Existing site PWA precaches the tool, so do not fabricate a RED or edit production code if the new behavioral proof is already GREEN. R75 runtime candidate `7419a52ff9b396aa168875bc80c77f57bc38c6b5` passes **4,255 full units / 18 existing skips** (181.29 s), type/production/PWA build **16.08 s / 408 entries**, full lint **4,103 warnings / 0 errors** (14.0 s); new/legacy export browser **4 passed / zero retries**. R75 and R83 both remain **implemented, not verified** until the combined canonical gate completes. Next add/run real first-online-visit → activated native PWA → network-offline reload/fresh-tab controls/export proof in both configured Chromium projects, then selected validators/lint/docs and a frozen four-spec checkpoint. No second full units/build for this test/Markdown-only follow-up while relevant inputs match.

## Workflow and scope

- Work/push only `arena/981e49e9-inmotools`; owner integrates. No `task:start` (would create/switch branch), branch-policy weakening, other branch/main push, force push, PR or connector action. Keep the task active for owner integration only after local acceptance.
- Shared-file reason: the owned browser contract and generated task/index records close this tool's acceptance gap. No other tool, dependency, schema, backend, shell, configuration or workflow change is planned. A newly demonstrated global-worker defect would need its real wider scope, not an assertion relaxation.
- Generated `dist/registerSW.js` registers the existing `/inmotools/sw.js` on load with `/inmotools/` scope. Current build has 408 precache entries and the Tactical workspace JS/CSS. Registration is `prompt`; do not demand that the first document already be controlled before its first navigation after activation.
- Baseline source/build/unit/config inputs are unchanged since `7419a52`; R83 is a browser-test/Markdown acceptance addition. Preserve all previous assertions/default timeouts/skips/retries, particularly R78 native interaction contracts. No full-site/official-browser/hosted/deployment/physical-device claim.

## Contract before the new test

1. Use the ordinary first online visit in a fresh Playwright context, relying on the real application-generated service-worker registration. Wait on native `navigator.serviceWorker.ready` and observed active/activated state; verify the expected base scope. No synthetic worker registration, cache insertion, route fulfillment, fake network response, app source injection or fixed warm-up sleep.
2. Set the real browser context offline, then reload the actual Tactical hash route. The navigation response must be successful and fulfilled by the service-worker Fetch handler; the heading, rendered players and native authoring controls must be usable while `navigator.onLine` is false.
3. Capture actual offline tool-script delivery from the service worker. Move a player through the existing precision control, undo it and download a real current-board SVG offline; verify the downloaded player content. Do not invent automatic project restoration: the existing explicit recovery/vault behavior is unchanged.
4. Open the same cached route in a **new tab/client** while still offline; its successful navigation must also come from the service worker and render the workspace/players/export control. Close the new tab and restore connectivity in `finally`, including on assertion failure.
5. This verifies the cached browser app after a successful online visit, not a first-ever offline visit, OS-level PWA installation, cache-eviction durability, cross-version deployment/update behavior or physical hardware. No new product defaults are needed; owner may override the acceptance breadth.

## Validation plan

- Add the observable contract before any potential runtime correction. The existing implemented behavior may pass immediately; record that honestly instead of manufacturing RED.
- Execute both projects with one worker, zero retries and original defaults. Protect any failures before another run. If the real app fails, diagnose without injecting caches/loosening assertions; record actual cause and changed scope.
- Once focused proof passes, run relevant selected validation/docs regressions, full lint for the changed browser file, docs sync/check, canonical impact selector and **all four owned specs** on frozen source/test/fixture/build/dependency/config/environment inputs, list plus structured JSON.
- Reuse the matching 4,255-unit / type/build evidence from runtime `7419a52` for test/Markdown-only changes. Verify all frozen inputs after browser exit; a running/failed/focused-only result is not full acceptance. Only then promote R75 and R83 and compute tool completion.

## Primary API review

- Reviewed 2026-10-25: installed **Playwright 1.63.0** `playwright-core/types/types.d.ts`, `Response.fromServiceWorker()`: returns whether the response was fulfilled by a service-worker Fetch handler. Resolve transitively through `@playwright/test` → `playwright` → `playwright-core` in this non-hoisted pinned install; no dependency/config change. Existing Fiber/photo offline browser tests establish the repository's native readiness/offline pattern; their source is not modified.

## Log

- timestamp: 2026-10-26T01:05:10Z | agent: Arena.ai Agent Mode (model name not exposed) | validator: source/config/generated-registration inspection and automated baseline | documentation: R75 feature working step committed/pushed as `7419a52ff9b396aa168875bc80c77f57bc38c6b5`; **4,255 repository units passed / 18 existing skips**, 380 passed files / 2 existing skipped files, 181.29 s; full lint **4,103 warnings / 0 errors**, 14.0 s. Receipts `/home/user/inmotools-r75-full-{units,lint}.log`; matching type/PWA build 16.08 s / 408 and four focused new/legacy export browser passes already recorded in task 7d75. No source/fixture/dependency/evaluator drift since that runtime. R83 contract recorded before test edits; no runtime or shared-worker edit anticipated.

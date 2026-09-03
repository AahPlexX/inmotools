# Next

## TASK-003: Decide the PWA precache policy for DuckDB WebAssembly
**Priority:** P1 | **Tags:** performance, pwa, deployment

The service worker precaches 48 entries totalling roughly 80 MB because `workbox.globPatterns` includes `wasm` and `maximumFileSizeToCacheInBytes` is 50 MB, so both DuckDB binaries (34 MB and 39 MB) are fetched for every visitor including those who never open the DuckDB workbench. Against the documented 100 GB per month GitHub Pages soft bandwidth limit this allows roughly 1,200 first visits per month.

### Plan

- Confirm whether offline DuckDB is a required capability or an unintended side effect of the glob pattern.
- If not required, exclude the DuckDB `wasm` assets from precache and register them as runtime cache entries populated on first use.
- Re-measure the reported precache total and record the resulting first-visit transfer size.

---

## TASK-004: Stop publishing sourcemaps to the deployed site
**Priority:** P2 | **Tags:** deployment, performance

`build.sourcemap` is `true`, so about 20 MB of `.map` files ship to GitHub Pages inside a 100 MB `dist`. Keep sourcemaps available for debugging without serving them from the published site.

### Plan

- Disable published sourcemaps or emit them as a build artifact retained by the workflow instead.
- Verify the deployed `dist` size and confirm the application still builds and runs.

---

## TASK-005: Harden the shared scrollable regions for keyboard users
**Priority:** P2 | **Tags:** accessibility

`.code-output` and `.result-table-wrap` are shared by thirteen suites. Both were made keyboard reachable where axe proved a violation, but the remaining usages only pass today because their empty states do not overflow. The catalog-driven axe sweep audits empty states only, so a populated overflowing region can still regress.

### Plan

- Introduce one focusable, labelled scroll-region primitive and adopt it across the remaining usages.
- Extend accessibility coverage to at least one populated state per scrollable suite.

---

## TASK-006: Broaden per-tool browser coverage
**Priority:** P2 | **Tags:** testing

Five of the registered suites have behavioural browser specs. Every route now receives an axe sweep, but most suites have no interaction test, so regressions in their engines surface only through unit tests.

### Plan

- Add a focused behavioural spec per uncovered suite, exercising its primary local workflow and its export path.
- Keep each spec deterministic and independent of shared browser state.

---

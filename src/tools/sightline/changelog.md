# Sightline Velocity changelog

## 2026-10-01 — Browser-only model and anchor corrections

- `segmentation-engine.ts`: correct sentence start offsets; remap and order explicit chapter boundaries after filtering; omit fully filtered chapters; preserve zero-width joiners/non-joiners; mark the page-geometry import as type-only.
- `orp-engine.ts`: select and split grapheme clusters without changing the UTF-16 offset contract; recognize Unicode letters/numbers; sanitize non-finite and out-of-range ratios; retain the ASCII anchor table; support a dependency-free fallback when `Intl.Segmenter` is unavailable.
- `tests/unit/sightline-browser-audit-regressions.test.ts`: add coverage for sentence/token range round trips, filtered chapter navigation, Unicode preservation, ASCII parity, ratio edge cases, complete-grapheme anchors, and the no-Segmenter fallback.
- `README.md`: document browser-only/no-auth/no-backend boundaries, local persistence limitations, model contracts, acceptance gates, and remaining token-guard work.
- Preserve all existing Sightline design/plan documents and unrelated tools. No dependency, authentication, remote storage, or network integration is added.

This entry records the patch scope; acceptance remains gated on fresh repository CI. The ingestion token-guard issue remains open.

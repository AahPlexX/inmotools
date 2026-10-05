---
tool: exif-scrubber
folder: src/tools/exif
doc: tracker
basis: as-built
status: active
spec: docs/superpowers/specs/2026-10-01-exif-scrubber-design.md
tracker: src/tools/exif/TRACKER.md
updated: 2026-10-04
---

# EXIF Scrubber — tracker

## Resume here

20 requirements: 17 verified, 3 missing (EXF-R16, R19, R20). Next action: build HEIC stripping (EXF-R16), then MP4/MOV metadata (EXF-R20).

## Documents

- Spec: [2026-10-01-exif-scrubber-design.md](../../../docs/superpowers/specs/2026-10-01-exif-scrubber-design.md)
- Behaviour notes and fixes: [README.md](README.md)
- Code: `exif-engine.ts` (classification, stripping, animation detection), `ExifWorkspace.tsx` (UI)
- Task history: `.tasks/WORK_LOG.md` 2026-10-01 "EXIF Scrubber audit"
- Index row: [TOOL_INDEX.md](../../../docs/TOOL_INDEX.md)
- Unit tests: `tests/unit/exif.test.ts`; browser tests: `tests/e2e/exif.spec.ts`

## Requirement status

`unit` = `tests/unit/exif.test.ts`; `e2e` = `tests/e2e/exif.spec.ts`.

| ID | Status | Evidence | Notes |
| --- | --- | --- | --- |
| EXF-R01 | verified | e2e "sanitizes an image locally…", "supports batch ZIP…", "EXF-R01 accepts JPEG, PNG, WebP and HEIC files dropped on the drop zone" | |
| EXF-R02 | verified | unit "identifies location and device identifiers…", "flags IPTC location and byline fields…", "keeps exposure settings out of the privacy list…", "EXF-R02 treats ICC colour-profile tags as settings, not identity fields" | |
| EXF-R03 | verified | e2e "sanitizes an image locally…" | |
| EXF-R04 | verified | e2e "EXF-R04 filters the shown fields and copies a value and the privacy-field list" | |
| EXF-R05 | verified | unit "strips JPEG EXIF and comments without touching the scan", "drops PNG text and EXIF chunks…", "drops WebP EXIF chunks…" | |
| EXF-R06 | verified | e2e "EXF-R06 keeps the JPEG color profile unless the option is turned off" | |
| EXF-R07 | verified | unit "detects APNG animation control chunks…", "does not classify a PNG … as animated", "detects WebP animation from VP8X feature flags" | |
| EXF-R08 | verified | e2e "EXF-R08 flattens an animation only after explicit confirmation when rebuilding", "EXF-R08 rebuilds pixels into another format, applies quality and paints JPEG transparency on the chosen background" | |
| EXF-R09 | verified | e2e "EXF-R09 inspects HEIC, explains that stripping is refused, and rebuilds only when the browser can decode it" | |
| EXF-R10 | verified | e2e "sanitizes an image locally, reinspects it…" | |
| EXF-R11 | verified | unit "builds non-destructive output names", "derives the output extension…"; e2e | |
| EXF-R12 | verified | e2e "supports batch ZIP, per-file removal…", "EXF-R12 retries a file whose sanitizing failed" | |
| EXF-R13 | verified | e2e "supports batch ZIP…" | |
| EXF-R14 | verified | e2e "EXF-R14 downloads a local JSON inspection report with the original values" | |
| EXF-R15 | verified | e2e "leaving during encoding prevents a later download" | |
| EXF-R16 | missing | — | README: not implemented |
| EXF-R17 | verified | `tests/e2e/accessibility.spec.ts` route `exif-scrubber` | |
| EXF-R18 | verified | e2e "EXF-R18 lays out without horizontal overflow at <width> px" (320, 375, 768, 1024, 1440, 1920, 2560) | |
| EXF-R19 | missing | — | Delivered through the site-wide theme selector |
| EXF-R20 | missing | — | Added 2026-10-02 |

## Open work

0. Build the requirements added 2026-10-02: EXF-R20.
1. Build EXF-R16 (HEIC strip).
2. EXF-R19 with the site-wide theme selector.

## Known limitations

- Pixel-level hidden data is not removed by Strip.
- Rebuild is limited by canvas size and the browser's decoders.

## Verification evidence

- 2026-10-04, `expand/exif-scrubber` from `main` @ `8d40893f`: `pnpm exec vitest run tests/unit/exif.test.ts` 12 passed (the EXF-R02 ICC test fails without the fix); `pnpm build` passed; `PW_PORT=4203 pnpm exec playwright test tests/e2e/exif.spec.ts --repeat-each=3` 87 passed, 21 skipped (EXF-R18 width matrix runs on the desktop project only). `pnpm tool:check exif-scrubber --base origin/main` 17/20, no errors; `tsc` clean; `pnpm test:unit` 3,702 passed, 2 timed out at 5 s in `mastering-loudness.test.ts` under sandbox CPU load (13 passed with `--testTimeout=120000`); `docs:sync` and `docs:check` passed.
- 2026-10-01, `main` @ `0f5c36b1`: `tests/unit/exif.test.ts` 11/11; `tests/e2e/exif.spec.ts` 6 passed (desktop and mobile); accessibility spec for the route 2 passed.

## Change log

- 2026-10-04 — Tests added for EXF-R01 (drag and drop), R04, R06, R08, R09, R12 (retry), R14, R18; R04, R06, R08, R09, R14, R18 now `verified`. Fix: ICC colour-profile tags (`ICC Copyright`, `Profile Creator`) were classified as identity fields, so every JPEG with a kept colour profile was reported as still carrying privacy fields after stripping; they are now camera/colour settings.
- 2026-10-02 — Added EXF-R20 (default integration rule).
- 2026-10-01 — Created per `docs/DOCUMENTATION_STANDARD.md`.

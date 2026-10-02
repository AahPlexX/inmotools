---
tool: exif-scrubber
folder: src/tools/exif
doc: tracker
basis: as-built
status: active
spec: docs/superpowers/specs/2026-10-01-exif-scrubber-design.md
tracker: src/tools/exif/TRACKER.md
updated: 2026-10-01
---

# EXIF Scrubber — tracker

## Resume here

On `origin/main`. 19 requirements: 11 verified, 6 implemented without a covering test, 2 missing. Next action: build HEIC stripping (EXF-R16) and add tests for the `implemented` rows; owner decision on video metadata (spec, "Intent not recorded").

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
| EXF-R01 | verified | e2e "sanitizes an image locally…", "supports batch ZIP…" | Drag-and-drop has no test |
| EXF-R02 | verified | unit "identifies location and device identifiers…", "flags IPTC location and byline fields…", "keeps exposure settings out of the privacy list…" | |
| EXF-R03 | verified | e2e "sanitizes an image locally…" | |
| EXF-R04 | implemented | — | |
| EXF-R05 | verified | unit "strips JPEG EXIF and comments without touching the scan", "drops PNG text and EXIF chunks…", "drops WebP EXIF chunks…" | |
| EXF-R06 | implemented | — | |
| EXF-R07 | verified | unit "detects APNG animation control chunks…", "does not classify a PNG … as animated", "detects WebP animation from VP8X feature flags" | |
| EXF-R08 | implemented | e2e "supports batch ZIP…" checks the JPEG background option | Animation confirmation has no test |
| EXF-R09 | implemented | — | |
| EXF-R10 | verified | e2e "sanitizes an image locally, reinspects it…" | |
| EXF-R11 | verified | unit "builds non-destructive output names", "derives the output extension…"; e2e | |
| EXF-R12 | verified | e2e "supports batch ZIP, per-file removal…" | Retry has no test |
| EXF-R13 | verified | e2e "supports batch ZIP…" | |
| EXF-R14 | implemented | — | |
| EXF-R15 | verified | e2e "leaving during encoding prevents a later download" | |
| EXF-R16 | missing | — | README: not implemented |
| EXF-R17 | verified | `tests/e2e/accessibility.spec.ts` route `exif-scrubber` | |
| EXF-R18 | implemented | — | No viewport test for this route |
| EXF-R19 | missing | — | Delivered through TASK-028 |

## Open work

1. Build EXF-R16 (HEIC strip).
2. Add tests for EXF-R04, R06, R08 (animation confirmation), R09, R14, and EXF-R18.
3. EXF-R19 with TASK-028.

## Known limitations

- Pixel-level hidden data is not removed by Strip.
- Rebuild is limited by canvas size and the browser's decoders.

## Verification evidence

- 2026-10-01, `main` @ `0f5c36b1`: `tests/unit/exif.test.ts` 11/11; `tests/e2e/exif.spec.ts` 6 passed (desktop and mobile); accessibility spec for the route 2 passed.

## Change log

- 2026-10-01 — Created per `docs/DOCUMENTATION_STANDARD.md`.

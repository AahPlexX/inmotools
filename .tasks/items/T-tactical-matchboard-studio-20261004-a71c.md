---
task: T-tactical-matchboard-studio-20261004-a71c
tool: tactical-matchboard-studio
doc: task
kind: fix
state: done
branch: fix/tactical-matchboard-studio
created: 2026-10-04
updated: 2026-10-04
---

# Make the vector frame ZIP unit test deterministic

## Request
Found 2026-10-04: in an integrate run for `expand/video-keyframe-slicer`, `tests/unit/tactics-export.test.ts` "does not call the encoder for an unconfirmed format and writes a vector frame ZIP" failed because two ZIP exports differed by one byte, consistent with a file timestamp crossing a second boundary. A rerun passed.

## Resume here
Done. Frame-sequence ZIP exports are byte-identical regardless of the clock; covered by the two tests named in the log.

## Log
- 2026-10-04: recorded during the untested-requirement coverage pass.
- 2026-10-04: claimed on `fix/tactical-matchboard-studio` with T-tactical-matchboard-studio-20261003-2c29.
- 2026-10-04: root cause: `zipBytes` in `src/tools/tactics/export-engine.ts` added files with `createFolders: true`; JSZip 3.10.2 creates the implicit `frames/` folder entry without the passed date, so it carries the current time (DOS time, 2 s resolution) and two exports straddling a 2 s boundary differ. Reproduced with the clock faked to 10:00:00.900 and 10:00:03.100 between the two exports (byte comparison failed). Fix: `zipBytes` adds every parent folder entry explicitly with the fixed 1980-01-01 date. The test now fakes `Date` between the two exports; new test "stamps every frame ZIP entry, including the frames/ folder, with the fixed 1980-01-01 date". `tests/unit/tactics-export.test.ts` 13/13 in 20/20 runs; `tests/unit/tactics-*.test.ts` 167/167.

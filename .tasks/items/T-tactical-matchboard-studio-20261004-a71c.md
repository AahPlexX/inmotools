---
task: T-tactical-matchboard-studio-20261004-a71c
tool: tactical-matchboard-studio
doc: task
kind: fix
state: next
branch: fix/tactical-matchboard-studio
created: 2026-10-04
updated: 2026-10-04
---

# Make the vector frame ZIP unit test deterministic

## Request
Found 2026-10-04: in an integrate run for `expand/video-keyframe-slicer`, `tests/unit/tactics-export.test.ts` "does not call the encoder for an unconfirmed format and writes a vector frame ZIP" failed because two ZIP exports differed by one byte, consistent with a file timestamp crossing a second boundary. A rerun passed.

## Resume here
Not started. Reproduce, make the test deterministic, run it 20 times.

## Log
- 2026-10-04: recorded during the untested-requirement coverage pass.

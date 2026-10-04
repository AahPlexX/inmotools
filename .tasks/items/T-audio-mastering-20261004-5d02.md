---
task: T-audio-mastering-20261004-5d02
tool: audio-mastering
doc: task
kind: fix
state: next
branch: fix/audio-mastering
created: 2026-10-04
updated: 2026-10-04
---

# Stop mastering loudness unit tests timing out under load

## Request
Found 2026-10-04: two tests in `tests/unit/mastering-loudness.test.ts` exceeded the 5 s Vitest timeout in several `pnpm test:unit` runs while the machine was heavily loaded; the file passes alone. Either speed up the fixtures or give these tests an explicit timeout.

## Resume here
Not started. Reproduce, make the test deterministic, run it 20 times.

## Log
- 2026-10-04: recorded during the untested-requirement coverage pass.

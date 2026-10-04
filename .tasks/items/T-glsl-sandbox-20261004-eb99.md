---
task: T-glsl-sandbox-20261004-eb99
tool: glsl-sandbox
doc: task
kind: expand
state: done
branch: expand/glsl-sandbox
created: 2026-10-04
updated: 2026-10-04
---

# Cover untested requirements

## Request
Owner, 2026-10-03: integrate and run missing tests for untested requirements; fix wrong statuses when fully resolvable.

## Resume here
Done; GLS-R01, R09 and R13 verified; GLS-R05, R06 and R10 evidence completed. The four `missing` requirements (GLS-R14 to R17) are build work, not tests.

## Log
- 2026-10-04: claimed `expand/glsl-sandbox`.
- 2026-10-04: tests added to `tests/e2e/shader.spec.ts` for GLS-R01, R05, R06, R09, R10, R13 (7 widths); 75 passed, 33 skipped over three repeats, desktop and mobile. GLS-R13 test found the `u_texture1` file input overflowing its column at 768 px; fixed in `ShaderWorkspace.tsx` (input width bound to its column).

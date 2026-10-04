---
tool: glsl-sandbox
folder: src/tools/shader
doc: tracker
basis: as-built
status: done
spec: docs/superpowers/specs/2026-10-01-glsl-sandbox-design.md
tracker: src/tools/shader/TRACKER.md
updated: 2026-10-04
---

# GLSL Sandbox — tracker

## Resume here

On `origin/main`. 17 requirements: 13 verified, 4 missing. Next action: build the missing requirements (Open work). No blocker.

## Documents

- Spec: [2026-10-01-glsl-sandbox-design.md](../../../docs/superpowers/specs/2026-10-01-glsl-sandbox-design.md)
- Original design: "Tool 18" in [2026-08-29-next-ten-local-tools-design.md](../../../docs/superpowers/specs/2026-08-29-next-ten-local-tools-design.md)
- Code: `shader-engine.ts`, `ShaderEditor.tsx`, `ShaderWorkspace.tsx`
- Index row: [TOOL_INDEX.md](../../../docs/TOOL_INDEX.md)
- Unit tests: `tests/unit/shader.test.ts`; browser tests: `tests/e2e/shader.spec.ts` (several lifecycle cases run on desktop only)

## Requirement status

`unit` = `tests/unit/shader.test.ts`; `e2e` = `tests/e2e/shader.spec.ts`.

| ID | Status | Evidence | Notes |
| --- | --- | --- | --- |
| GLS-R01 | verified | e2e "GLS-R01 edits compile automatically after 350 ms and Compile now compiles at once" | |
| GLS-R02 | verified | unit "normalizes common WebGL compiler diagnostics into line-addressable messages" | |
| GLS-R03 | verified | e2e "a failed compile cannot replace the last linked shader used for export" | |
| GLS-R04 | verified | e2e "keyboard arrows update u_mouse and redraw a paused focused preview" | |
| GLS-R05 | verified | e2e "a paused preview redraws after its rendered size changes…", "a texture that finishes loading after a paused frame triggers another draw", "GLS-R05 Pause holds u_time, Resume continues it and Reset time returns it to zero" | |
| GLS-R06 | verified | e2e "texture decode failures are reported…", "a texture that finishes loading after a paused frame triggers another draw", "GLS-R06 u_texture1 shows a black placeholder until an image is chosen and after it is removed"; unit "embeds supplied textures without losing the placeholder setup…" | |
| GLS-R07 | verified | unit "bounds render scale to a predictable device-load range" | |
| GLS-R08 | verified | e2e "a lost WebGL context can be restored…" | Skipped where `WEBGL_lose_context` is missing |
| GLS-R09 | verified | e2e "GLS-R09 Editor, Split and Preview layouts switch views and Reset starter shader restores the starter" | |
| GLS-R10 | verified | unit "exports preview-equivalent placeholder textures…"; e2e "GLS-R10 the exported HTML runs on its own with uniforms, animation, pointer, resize and textures" | |
| GLS-R11 | verified | e2e "…stays bounded in short landscape" | |
| GLS-R12 | verified | `tests/e2e/accessibility.spec.ts` route `glsl-sandbox` | |
| GLS-R13 | verified | e2e "GLS-R13 lays out without horizontal overflow at <width> px" (320, 375, 768, 1024, 1440, 1920, 2560) | |
| GLS-R14 | missing | — | Delivered through TASK-028 |
| GLS-R15 | missing | — | Added 2026-10-02 |
| GLS-R16 | missing | — | Added 2026-10-02 |
| GLS-R17 | missing | — | Added 2026-10-02 |

## Open work

1. Build the requirements added 2026-10-02: GLS-R15, GLS-R16, GLS-R17.
2. GLS-R14 with TASK-028.

## Known limitations

- Needs WebGL2.

## Verification evidence

- 2026-10-04, `expand/glsl-sandbox`: `pnpm build` clean; `PW_PORT=4202 pnpm exec playwright test tests/e2e/shader.spec.ts --repeat-each=3` 75 passed, 33 skipped (desktop-only lifecycle and viewport-matrix cases skipped on mobile by design), WebGL2 in headless Chromium; accessibility spec for the route 2 passed.
- 2026-10-01, `main` @ `f6989a3c`: `tests/unit/shader.test.ts` 4/4; `tests/e2e/shader.spec.ts` 9 passed / 3 skipped (desktop-only cases); accessibility spec for the route 2 passed.

## Change log

- 2026-10-04 — Tests added for GLS-R01, R05 (Resume, Reset time), R06 (`u_texture1`), R09, R10 (exported page runs on its own), R13 (7 widths); those rows verified. Texture file inputs now shrink to their column, which overflowed it at 768 px.
- 2026-10-02 — Added GLS-R15, GLS-R16, GLS-R17 (default integration rule).
- 2026-10-01 — Created per `docs/DOCUMENTATION_STANDARD.md`.

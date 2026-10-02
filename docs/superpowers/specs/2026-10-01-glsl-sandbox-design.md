---
tool: glsl-sandbox
folder: src/tools/shader
doc: spec
basis: as-built
status: done
spec: docs/superpowers/specs/2026-10-01-glsl-sandbox-design.md
tracker: src/tools/shader/TRACKER.md
updated: 2026-10-01
---

# GLSL Sandbox — spec

As built at `6d38cd60` (last change under `src/tools/shader/`). Requirement prefix: `GLS`. Status of each requirement: [TRACKER.md](../../../src/tools/shader/TRACKER.md). Original design: "Tool 18" in [2026-08-29-next-ten-local-tools-design.md](2026-08-29-next-ten-local-tools-design.md#tool-18--glsl-live-sandbox).

## Purpose

Write a WebGL2 fragment shader, see it render live with line-addressed compiler errors, and export it as one standalone HTML file, for graphics programmers, creative coders and students.

## Scope

In scope:
- One editable fragment shader over a fixed full-screen vertex shader; standard uniforms; two optional local image textures; standalone HTML export.

Out of scope:
- Vertex shaders, multiple passes and 3D geometry.

## Constraints

- Platform rules: no accounts, no server or database, everything runs in the browser ([DOCUMENTATION_STANDARD.md](../../DOCUMENTATION_STANDARD.md#platform-rules-apply-to-every-tool-and-every-spec)).
- Editor: CodeMirror 6 with the `shader` mode from `@codemirror/legacy-modes` (design).
- The export never depends on InmoTools code (design).

## Requirements

| ID | Requirement | Acceptance test |
| --- | --- | --- |
| GLS-R01 | The fragment shader compiles automatically 350 ms after editing, or at once with Compile now | Edit recompiles; Compile now compiles |
| GLS-R02 | Compile and link errors are shown as line-addressed diagnostics | WebGL messages normalized to lines |
| GLS-R03 | A failed compile keeps the last linked shader running and used for export | Export after a failed compile contains the last good shader |
| GLS-R04 | Uniforms `u_resolution`, `u_time` and `u_mouse`; arrow keys move `u_mouse` on the focused preview | Arrows update `u_mouse` and redraw |
| GLS-R05 | Pause/Resume and Reset time; a paused preview redraws when its size changes or a texture finishes loading | Paused preview redraws on resize and texture load |
| GLS-R06 | Two optional local image textures bound to `u_texture0` and `u_texture1`, with placeholders for empty slots; decode failures are reported | Decode failure reported |
| GLS-R07 | Render scale is bounded to a predictable device-load range | Scale bound test passes |
| GLS-R08 | A lost WebGL context can be restored and the linked shader is rebuilt | Context restore rebuilds resources |
| GLS-R09 | Editor, Split and Preview layouts; Reset starter shader | Layout buttons switch views |
| GLS-R10 | Export one standalone HTML file with the shader, canvas setup, uniforms, animation loop, resize handling, pointer tracking and embedded textures (placeholders for empty slots) | Exported HTML runs without the site |
| GLS-R11 | The preview stays bounded in short landscape viewports | Short landscape test passes |
| GLS-R12 | No serious or critical axe violations | Catalog-wide accessibility spec for this route |
| GLS-R13 | No horizontal overflow and controls usable from 320 px to 2560 px | Viewport check at the standard widths |
| GLS-R14 | Workspace follows the site-wide theme (light, dark, system) from TASK-028 | Workspace switches with the site theme; axe passes in both themes |
| GLS-R15 | Shaders can be saved by name in this browser and reopened | Saved shader survives a reload |
| GLS-R16 | Export a PNG still of the preview | PNG downloads at the preview size |
| GLS-R17 | Record a short WebM clip of the preview where MediaRecorder is supported | WebM downloads |

## Definition of done

The tool is complete when every requirement is `verified` or `not planned`, and the completion gates in `.tasks/PROJECT_COMPLETION.md` are met.

## Intent not recorded

- None.

## Change log

- 2026-10-02 — Added GLS-R15, GLS-R16, GLS-R17 under the default integration rule (ideas that fit the platform rules become requirements).
- 2026-10-01 — Created as an as-built spec from `src/tools/shader/`, the shared design section and the tool's tests.

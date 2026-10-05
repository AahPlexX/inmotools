---
tool: convolution-room-profiler
folder: src/tools/audio
doc: spec
basis: as-built
status: done
spec: docs/superpowers/specs/2026-10-01-convolution-room-profiler-design.md
tracker: src/tools/audio/TRACKER.md
updated: 2026-10-01
---

# Room Profiler — spec

As built at `6d38cd60` (last change under `src/tools/audio/`). Requirement prefix: `CRP`. Status of each requirement: [TRACKER.md](../../../src/tools/audio/TRACKER.md). Original design: "Tool 16" in [2026-08-29-next-ten-local-tools-design.md](2026-08-29-next-ten-local-tools-design.md#tool-16--convolution-room-profiler).

## Purpose

Hear a dry recording placed in a room by convolving it with an impulse response, adjust the mix live, and render a 24-bit WAV, all in the browser, for audio producers and sound designers.

## Scope

In scope:
- One dry audio file and one impulse-response (IR) file; live Web Audio graph with wet/dry, output gain, pre-delay, low and high cut and bypass; live spectrum; offline 24-bit WAV render.

Out of scope:
- Recording or measuring an impulse response in a real room.

## Constraints

- Platform rules: no accounts, no server or database, everything runs in the browser ([DOCUMENTATION_STANDARD.md](../../DOCUMENTATION_STANDARD.md#platform-rules-apply-to-every-tool-and-every-spec)).
- Web Audio `ConvolverNode` accepts IRs with 1, 2 or 4 channels only.

## Requirements

| ID | Requirement | Acceptance test |
| --- | --- | --- |
| CRP-R01 | Load a dry audio file and an IR file; each is decoded and reported | Status reports both decoded |
| CRP-R02 | IRs with channel counts `ConvolverNode` cannot use are refused before assignment | Unsupported channel count refused |
| CRP-R03 | Wet/dry uses a bounded equal-power crossfade | Crossfade test passes |
| CRP-R04 | Output gain with a warning that values above unity can clip | Warning shown |
| CRP-R05 | Pre-delay, low cut and high cut; filter frequencies are capped at the current Nyquist limit | Caps test passes |
| CRP-R06 | Bypass switches the convolution out of the live path | Bypass toggles the wet path |
| CRP-R07 | Play, pause and stop with explicit state; stopping disconnects the graph; cleanup waits for the convolution tail including pre-delay | Extending pre-delay postpones cleanup |
| CRP-R08 | Live controls update the running graph without rebuilding it | Changing a control while playing keeps playback |
| CRP-R09 | A live spectrum display, with an idle state before playback | Idle spectrum image shown |
| CRP-R10 | Offline render uses the same settings and a channel count compatible with the graph | Offline channel test passes |
| CRP-R11 | The render is a little-endian 24-bit PCM WAV with clamped samples and correct header | WAV encoder tests pass |
| CRP-R12 | A render can be cancelled; a cancelled render cannot finish or reset a newer one | Cancelled render never downloads |
| CRP-R13 | Stereo routing of the convolution (design) | Stereo source and stereo IR render in stereo |
| CRP-R14 | No serious or critical axe violations | Catalog-wide accessibility spec for this route |
| CRP-R15 | No horizontal overflow and controls usable from 320 px to 2560 px | Viewport check at the standard widths |
| CRP-R16 | Workspace follows the site-wide theme (light, dark, system) from TASK-028 | Workspace switches with the site theme; axe passes in both themes |
| CRP-R17 | A small built-in set of impulse responses whose licences allow redistribution, so the tool works without the person finding one | Choosing a built-in IR renders without a file |

## Definition of done

The tool is complete when every requirement is `verified` or `prohibited`, and the completion gates in `.tasks/PROJECT_COMPLETION.md` are met.

## Intent not recorded

- The design says "stereo routing" without detail; CRP-R13 records the plain reading. Unknown: whether a stereo-width or pan control was intended.

## Change log

- 2026-10-02 — Added CRP-R17 under the default integration rule (ideas that fit the platform rules become requirements).
- 2026-10-01 — Created as an as-built spec from `src/tools/audio/`, the shared design section, the `.tasks/NEXT.md` 2026-09-11 reconciliation and the tool's tests.

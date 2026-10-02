---
tool: video-keyframe-slicer
folder: src/tools/video
doc: spec
basis: as-built
status: active
spec: docs/superpowers/specs/2026-10-01-video-keyframe-slicer-design.md
tracker: src/tools/video/TRACKER.md
updated: 2026-10-01
---

# Keyframe Video Slicer — spec

As built at `f07816fd` (last change under `src/tools/video/`). Requirement prefix: `VKS`. Status of each requirement: [TRACKER.md](../../../src/tools/video/TRACKER.md). Original design: "Tool 12" in [2026-08-29-next-ten-local-tools-design.md](2026-08-29-next-ten-local-tools-design.md#tool-12--lossless-video-keyframe-slicer).

## Purpose

Cut a section out of a local video without re-encoding it, so quality is untouched, by snapping the cut to keyframes and copying the encoded packets into a new container, for video editors, creators and media engineers.

## Scope

In scope:
- Local MP4, MOV and WebM with a supported encoded video track; track choice; keyframe-snapped trim; packet-copy export.

Out of scope:
- Frame-accurate cuts between keyframes: they need re-encoding, which the tool exists to avoid (the snapped range is shown before export instead).

## Constraints

- Platform rules: no accounts, no server or database, everything runs in the browser ([DOCUMENTATION_STANDARD.md](../../DOCUMENTATION_STANDARD.md#platform-rules-apply-to-every-tool-and-every-spec)).
- Container reading and packet copying use the pinned Mediabunny; WebCodecs is not used as a muxer or demuxer (design).

## Requirements

| ID | Requirement | Acceptance test |
| --- | --- | --- |
| VKS-R01 | Choose a local MP4, MOV or WebM; inspection reads tracks and enumerates verified keyframes, with progress and Cancel inspection | Inspection lists keyframes; Cancel stops it |
| VKS-R02 | Choose the video track and the audio track to keep | Track selects change the export |
| VKS-R03 | Requested start and end snap outward to keyframes (start back, end forward) so whole GOPs are kept; requests are clamped to the media, a full-duration range is accepted, inverted ranges and media without a keyframe are refused | Snapping and refusal tests pass |
| VKS-R04 | The snapped range is shown before export | Snapped In/Out shown next to the request |
| VKS-R05 | Previous/next keyframe navigation, Set In/Out at the playhead, and Preview snapped In/Out | Buttons move the playhead and set the range |
| VKS-R06 | A paged list (100 per page) of verified keyframes with Seek | Seek moves the playhead |
| VKS-R07 | Source preview and a selected-track preview, with the preview policy explained | Both previews and the policy are shown |
| VKS-R08 | Export copies encoded packets into a compatible MP4, MOV or WebM without decoding or re-encoding, with progress | Exported file plays with identical packets |
| VKS-R09 | Audio packets starting before the exclusive end are all kept; rotation metadata is carried over | Audit regression tests pass |
| VKS-R10 | A visual timeline with duration, current time, selected range and keyframe markers (design) | Timeline shows markers and the range |
| VKS-R11 | Optional thumbnails along the timeline that never block trim or export (design) | Thumbnails appear without delaying export |
| VKS-R12 | No serious or critical axe violations | Catalog-wide accessibility spec and the tool's own axe check |
| VKS-R13 | No horizontal overflow at the target viewports | Reflow check across viewports |
| VKS-R14 | Workspace follows the site-wide theme (light, dark, system) from TASK-028 | Workspace switches with the site theme; axe passes in both themes |

## Definition of done

The tool is complete when every requirement is `verified` or `not planned`, and the completion gates in `.tasks/PROJECT_COMPLETION.md` are met.

## Intent not recorded

- None beyond the design section.

## Change log

- 2026-10-01 — Created as an as-built spec from `src/tools/video/`, the shared design section and the tool's tests.

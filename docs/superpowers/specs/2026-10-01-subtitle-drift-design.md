---
tool: subtitle-drift
folder: src/tools/subtitles
doc: spec
basis: as-built
status: active
spec: docs/superpowers/specs/2026-10-01-subtitle-drift-design.md
tracker: src/tools/subtitles/TRACKER.md
updated: 2026-10-01
---

# Subtitle Drift — spec

As built at `1ce3cf75` (last change under `src/tools/subtitles/`). Requirement prefix: `SUB`. Status of each requirement: [TRACKER.md](../../../src/tools/subtitles/TRACKER.md).

## Purpose

Fix subtitles that start at the wrong time and drift further out of sync (for example after a frame-rate change), using two trusted points in the video, for video editors, translators and creators.

## Scope

In scope:
- SRT and WebVTT input from a file or pasted text.
- One linear correction (offset and slope) from two anchors, applied to every cue and WebVTT inline timestamp.
- Preview, apply, undo and download of a corrected copy.

Out of scope:
- Editing cue text or splitting/merging cues: the tool changes timing only.
- Uploading media or subtitles: everything stays on the device (platform rules).

## Constraints

- Platform rules: no accounts, no server or database, everything runs in the browser ([DOCUMENTATION_STANDARD.md](../../DOCUMENTATION_STANDARD.md#platform-rules-apply-to-every-tool-and-every-spec)).
- The original source text is never changed; corrections are made on a copy.
- No network requests.

## Requirements

| ID | Requirement | Acceptance test |
| --- | --- | --- |
| SUB-R01 | Load an SRT or WebVTT file, or paste or type subtitle text | File or pasted text is parsed and the cue count shown |
| SUB-R02 | SRT parsing keeps cue text exactly, and a malformed block is reported by number instead of being dropped | Malformed block reports its number; nothing discarded |
| SUB-R03 | WebVTT parsing accepts `.` millisecond separators and omitted hours, and keeps cue identifiers, cue settings, STYLE, REGION and NOTE blocks through a round trip | Round trip keeps those blocks unchanged |
| SUB-R04 | Cues that end at or before they start are rejected on import | Reversed cue reports an error |
| SUB-R05 | Timing diagnostics report out-of-order cue starts and adjacent overlaps without reordering cues | Diagnostics count them; order unchanged |
| SUB-R06 | Anchors accept milliseconds or `HH:MM:SS.mmm`; negative, non-finite or reversed anchors are refused with a message | Reversed anchors are refused |
| SUB-R07 | A two-anchor linear correction is applied to every cue start and end | Mapped times match the slope and offset |
| SUB-R08 | WebVTT inline timestamp tags are retimed with the same mapping; inline timestamps that become invalid after rounding are refused | Inline tags retimed; collapsing tags refused |
| SUB-R09 | Cue starts mapped below zero are clipped to zero and counted; cues ending at or below zero are refused; the policy is shown on screen | Below-zero cues reported; policy notice visible |
| SUB-R10 | Preview shows the corrected copy and leaves the source unchanged; Apply and Undo apply switch between preview and applied output | Source text unchanged after preview and apply |
| SUB-R11 | Any change to the source or an anchor clears the old preview and asks for a new one | Editing an anchor clears the output |
| SUB-R12 | A newer file or editor change wins over an older file read that finishes later | Late read does not overwrite the newer text |
| SUB-R13 | A before/after table lists each cue's original and corrected times with its text, 100 rows per page | Table shows both timings |
| SUB-R14 | Download the corrected copy in the input's format as `<name>-corrected.srt` or `.vtt` | `subtitle-corrected.vtt` downloads |
| SUB-R15 | Waveform re-alignment: show the audio waveform of a local video or audio file under the cues so anchors can be placed by sight, as the catalog title promises | Loading a local media file shows its waveform with cue markers; choosing a point sets an anchor |
| SUB-R16 | No serious or critical axe violations | Catalog-wide accessibility spec for this route |
| SUB-R17 | No horizontal overflow and controls usable from 320 px to 2560 px | Viewport check at the standard widths |
| SUB-R18 | Workspace follows the site-wide theme (light, dark, system) from TASK-028 | Workspace switches with the site theme; axe passes in both themes |
| SUB-R19 | Download the corrected copy in the other format (SRT to WebVTT and back) | SRT input exports a valid WebVTT |

## Definition of done

The tool is complete when every requirement is `verified` or `prohibited`, and the completion gates in `.tasks/PROJECT_COMPLETION.md` are met.

## Intent not recorded

- SUB-R15 comes from the catalog title ("Waveform Re-Aligner"); under the default integration rule it is built, since Web Audio can decode a local file in the browser.

## Change log

- 2026-10-02 — Added SUB-R19 under the default integration rule (ideas that fit the platform rules become requirements).
- 2026-10-01 — Created as an as-built spec from `src/tools/subtitles/`, the catalog entry and the tool's tests.

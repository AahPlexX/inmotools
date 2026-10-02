---
tool: hardware-packet-inspector
folder: src/tools/hardware
doc: spec
basis: as-built
status: active
spec: docs/superpowers/specs/2026-10-01-hardware-packet-inspector-design.md
tracker: src/tools/hardware/TRACKER.md
updated: 2026-10-01
---

# Packet Inspector — spec

As built at `4980c7d2` (last change under `src/tools/hardware/`). Requirement prefix: `HPI`. Status of each requirement: [TRACKER.md](../../../src/tools/hardware/TRACKER.md).

## Purpose

Let IoT developers, embedded engineers and robotics makers watch a device's byte stream, read it as text and hex, label it with parsing rules and send packets back, from the browser, without installing a desktop serial terminal.

## Scope

In scope:
- Web Serial connection with baud rate and framing choice, and a simulator for browsers or setups without hardware.
- Capture, display, filtering, rule labelling, sending and CSV export.

Out of scope:
- Browsers without the device APIs: they get the simulator only, because the APIs do not exist there (browser limit).
- Uploading or sharing captures: everything stays on the device (platform rules).

## Constraints

- Platform rules: no accounts, no server or database, everything runs in the browser ([DOCUMENTATION_STANDARD.md](../../DOCUMENTATION_STANDARD.md#platform-rules-apply-to-every-tool-and-every-spec)).
- Web Serial needs a secure context and a Chromium-based browser; the device is chosen by the person in the browser's own picker.
- Parsing-rule regular expressions run in a Web Worker with a time limit, so a slow pattern cannot freeze the page.

## Requirements

| ID | Requirement | Acceptance test |
| --- | --- | --- |
| HPI-R01 | Connect a serial device through the browser picker at a chosen baud rate (9,600 to 921,600) | Connecting opens the chosen port at the chosen rate |
| HPI-R02 | A pending connection can be cancelled, and a late picker result is never opened | Cancel during the picker; the late port stays closed |
| HPI-R03 | Disconnect releases the reader and writer locks and closes the port | After Disconnect the port can be opened again |
| HPI-R04 | A device without a readable stream, or a read failure, is reported in the status and the port is closed | Status names the problem |
| HPI-R05 | Framing by newline or by read chunk; newline frames reassemble across reads and keep multibyte UTF-8 characters intact | Split `€` and split lines arrive whole |
| HPI-R06 | Newline frames have a selectable size limit (1 KiB to 1 MiB); an oversized frame is rejected and frames before it are kept | Oversized frame rejected; earlier frames kept |
| HPI-R07 | A simulator runs selectable scenarios without hardware | Simulator scenario fills the stream |
| HPI-R08 | Each entry shows direction, text and hex together on one line | Stream line holds direction and bytes together |
| HPI-R09 | Capture keeps the newest 5,000 entries and reports how many were evicted | Summary shows captured and evicted counts |
| HPI-R10 | Pause display freezes the visible log while capture continues, and Resume shows what arrived meanwhile | Paused log unchanged; summary counts entries captured while paused |
| HPI-R11 | The log is paged (200 entries) with Older and Newer controls | Older/Newer move through pages |
| HPI-R12 | Search and direction filter narrow the displayed entries | Filtering hides non-matching lines |
| HPI-R13 | Parsing rules (pattern and label) can be added, edited and removed; invalid patterns are reported; matching entries show the rule's label | Rule labels matching lines; invalid pattern reported |
| HPI-R14 | Rule matching runs in a worker with a time limit; a catastrophic pattern is stopped and the page recovers after the rule is edited | Catastrophic pattern reported; editing the rule recovers |
| HPI-R15 | Send hex bytes to the device; malformed hex is refused rather than truncated; further sends are disabled while a write is in flight | Malformed hex refused; Send disabled during write |
| HPI-R16 | A locked or failed writer is reported and sending becomes possible again | Status reports the write failure; Send re-enabled |
| HPI-R17 | Export the retained capture as CSV with rule labels; Clear capture empties it | `packet-capture.csv` downloads; Clear empties the log |
| HPI-R18 | Web Bluetooth connection, as the catalog title promises (GATT notifications in, characteristic writes out) | Connecting a Bluetooth device streams its notifications into the log |
| HPI-R19 | No serious or critical axe violations | Catalog-wide accessibility spec for this route |
| HPI-R20 | No horizontal overflow and controls usable from 320 px to 2560 px | Viewport check at the standard widths |
| HPI-R21 | Workspace follows the site-wide theme (light, dark, system) from TASK-028 | Workspace switches with the site theme; axe passes in both themes |

## Definition of done

The tool is complete when every requirement is `verified` or `not planned`, and the completion gates in `.tasks/PROJECT_COMPLETION.md` are met.

## Intent not recorded

- HPI-R18 comes from the catalog title ("Web Serial / Web Bluetooth"); no design exists. Web Bluetooth works only in Chromium-based browsers. Unknown: whether to build it or remove it from the title.
- Serial settings other than baud rate (data bits, parity, stop bits, flow control) are not offered; the Web Serial API supports them. Unknown: whether they are wanted.

## Change log

- 2026-10-01 — Created as an as-built spec from `src/tools/hardware/`, the catalog entry, `.tasks/DONE.md` TASK-018 and the tool's tests.

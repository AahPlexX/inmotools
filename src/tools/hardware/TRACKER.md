---
tool: hardware-packet-inspector
folder: src/tools/hardware
doc: tracker
basis: as-built
status: active
spec: docs/superpowers/specs/2026-10-01-hardware-packet-inspector-design.md
tracker: src/tools/hardware/TRACKER.md
updated: 2026-10-04
---

# Packet Inspector — tracker

## Resume here

22 requirements: 17 verified, 2 partial awaiting physical testing by human (HPI-R01, R03), 3 missing (HPI-R18, R21, R22). The catalog title promises Web Bluetooth (HPI-R18), which the tool does not have. Next action: build HPI-R18.

## Documents

- Spec: [2026-10-01-hardware-packet-inspector-design.md](../../../docs/superpowers/specs/2026-10-01-hardware-packet-inspector-design.md)
- Code: `packet-engine.ts` (hex, framing, rule validation), `rule-runner.ts` + `rules.worker.ts` (time-limited rule matching), `HardwareWorkspace.tsx` (UI, serial lifecycle, simulator)
- Task history: `.tasks/DONE.md` TASK-018 (disconnect control); `.tasks/NEXT.md` reconciliation note on the disconnect lifecycle
- Index row: [TOOL_INDEX.md](../../../docs/TOOL_INDEX.md)
- Unit tests: `tests/unit/packets.test.ts`, `tests/unit/packet-rules.test.ts`; browser tests: `tests/e2e/hardware.spec.ts`, plus `tests/e2e/app.spec.ts` "hardware suite offers simulator mode…"

## Requirement status

`packets` = `tests/unit/packets.test.ts`; `rules` = `tests/unit/packet-rules.test.ts`; `e2e` = `tests/e2e/hardware.spec.ts`; `e2e-sim` = its test "simulator exercises framing, pause-display capture, rules, filtering, counters, pagination, and retained export".

| ID | Status | Evidence | Notes |
| --- | --- | --- | --- |
| HPI-R01 | partial | e2e "HPI-R01 opens the picked serial port at the chosen baud rate" | [awaiting physical testing by human] USB serial device (for example a USB-UART adapter or microcontroller) set to 921,600 baud, Chrome or Edge on desktop: choose 921600, Connect serial device, pick the port in the browser picker, have the device print a line. Expected: status "Serial port connected at 921600 baud using newline framing." and the line appears as an RX entry with the correct text. |
| HPI-R02 | verified | e2e "cancels a pending connection attempt so a late picker result is never opened" | |
| HPI-R03 | partial | e2e "HPI-R03 Disconnect releases the stream locks and closes the port so it can be opened again" | [awaiting physical testing by human] Any USB serial device, Chrome or Edge on desktop: connect, receive a line, Disconnect, then Connect serial device and pick the same port. Expected: "Serial port closed and its stream locks released.", then the second connection opens without an "already open" or locked-stream error and new lines arrive. |
| HPI-R04 | verified | e2e ("connected … did not expose a readable stream") | |
| HPI-R05 | verified | packets "preserves UTF-8 code points split across browser read chunks", "reassembles newline frames and multibyte characters…" | |
| HPI-R06 | verified | packets "bounds an unterminated newline frame…", "preserves complete frames that precede an oversized frame…" | |
| HPI-R07 | verified | e2e-sim; `app.spec.ts` "hardware suite offers simulator mode…" | |
| HPI-R08 | verified | e2e "HPI-R08 shows direction, hex and text together on one stream line" | |
| HPI-R09 | verified | e2e-sim ("0 evicted"); e2e "HPI-R09 keeps the newest 5,000 entries and reports how many were evicted" | |
| HPI-R10 | verified | e2e-sim ("2 captured while display paused") | |
| HPI-R11 | verified | e2e "HPI-R11 pages the log 200 entries at a time with Older and Newer" | |
| HPI-R12 | verified | e2e-sim (search hides `price=10€`) | |
| HPI-R13 | verified | packets "applies and validates regex highlight rules safely"; e2e-sim (rule labels) | |
| HPI-R14 | verified | rules "terminates an unresponsive matcher…" and 7 more; e2e "contains catastrophic rule matching and recovers after the rule is edited" | |
| HPI-R15 | verified | packets "rejects malformed hex instead of truncating it"; e2e "disables additional sends while a serial write is in flight" | |
| HPI-R16 | verified | e2e "catches a locked Web Serial writer instead of escaping send error handling" | |
| HPI-R17 | verified | e2e "HPI-R17 exports the retained capture as CSV with rule labels and Clear capture empties it" | |
| HPI-R18 | missing | — | Promised by the catalog title; not built |
| HPI-R19 | verified | `tests/e2e/accessibility.spec.ts` route `hardware-packet-inspector` | |
| HPI-R20 | verified | e2e "HPI-R20 lays out without horizontal overflow at <width> px" (320, 375, 768, 1024, 1440, 1920, 2560) | |
| HPI-R21 | missing | — | Delivered through TASK-028 |
| HPI-R22 | missing | — | Added 2026-10-02 |

## Open work

0. Build the requirements added 2026-10-02: HPI-R22.
1. Build HPI-R18 (Web Bluetooth); the owner chose building over changing the title (2026-10-02).
2. Physical checks for HPI-R01 and HPI-R03 with a real serial device (steps in their Notes).
3. HPI-R21 with TASK-028.

## Known limitations

- Web Serial exists only in Chromium-based browsers in a secure context; elsewhere only the simulator works.
- Capture keeps the newest 5,000 entries.

## Verification evidence

- 2026-10-04, `expand/hardware-packet-inspector` from `main` @ `32c0ce32`: `pnpm build` passed; `PW_PORT=4203 pnpm exec playwright test tests/e2e/hardware.spec.ts --repeat-each=3` 87 passed, 21 skipped (HPI-R20 width matrix runs on the desktop project only). New tests use the simulator and a Web Serial fake that rejects `open()` on an open port and `close()` while a stream is locked. `pnpm tool:check hardware-packet-inspector --base origin/main` 17/22, no errors, flagged HPI-R01, R03; `tsc` clean; `pnpm test:unit` 3,705 passed, 1 timed out at 5 s in `mastering-loudness.test.ts` under sandbox CPU load (13 passed with `--testTimeout=120000`); `docs:sync` and `docs:check` passed.
- 2026-10-01, `main` @ `817373f5`: `packets` + `packet-rules` units 15/15; `tests/e2e/hardware.spec.ts` 10 passed (desktop and mobile); accessibility spec for the route 2 passed.

## Change log

- 2026-10-04 — Tests added for HPI-R01, R03, R08, R09 (eviction), R11, R17, R20. R08, R11, R17, R20 now `verified`; R01 and R03 `partial`, flagged for a physical check with a real serial device.
- 2026-10-02 — Added HPI-R22 (default integration rule).
- 2026-10-01 — Created per `docs/DOCUMENTATION_STANDARD.md`.

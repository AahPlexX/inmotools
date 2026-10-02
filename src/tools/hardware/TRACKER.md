---
tool: hardware-packet-inspector
folder: src/tools/hardware
doc: tracker
basis: as-built
status: active
spec: docs/superpowers/specs/2026-10-01-hardware-packet-inspector-design.md
tracker: src/tools/hardware/TRACKER.md
updated: 2026-10-01
---

# Packet Inspector — tracker

## Resume here

On `origin/main`. 22 requirements: 13 verified, 6 implemented without a covering test, 3 missing. The catalog title promises Web Bluetooth (HPI-R18), which the tool does not have. Next action: build HPI-R18.

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
| HPI-R01 | implemented | e2e (mocked port connects) | Baud-rate choice itself not asserted |
| HPI-R02 | verified | e2e "cancels a pending connection attempt so a late picker result is never opened" | |
| HPI-R03 | implemented | e2e clicks Disconnect in a mocked-port test | Lock release and reopening are not asserted |
| HPI-R04 | verified | e2e ("connected … did not expose a readable stream") | |
| HPI-R05 | verified | packets "preserves UTF-8 code points split across browser read chunks", "reassembles newline frames and multibyte characters…" | |
| HPI-R06 | verified | packets "bounds an unterminated newline frame…", "preserves complete frames that precede an oversized frame…" | |
| HPI-R07 | verified | e2e-sim; `app.spec.ts` "hardware suite offers simulator mode…" | |
| HPI-R08 | implemented | — | Fixed in `4980c7d2` without a regression test |
| HPI-R09 | verified | e2e-sim ("0 evicted") | Eviction above 5,000 has no test |
| HPI-R10 | verified | e2e-sim ("2 captured while display paused") | |
| HPI-R11 | implemented | e2e-sim checks Older is disabled on one page | Moving between pages has no test |
| HPI-R12 | verified | e2e-sim (search hides `price=10€`) | |
| HPI-R13 | verified | packets "applies and validates regex highlight rules safely"; e2e-sim (rule labels) | |
| HPI-R14 | verified | rules "terminates an unresponsive matcher…" and 7 more; e2e "contains catastrophic rule matching and recovers after the rule is edited" | |
| HPI-R15 | verified | packets "rejects malformed hex instead of truncating it"; e2e "disables additional sends while a serial write is in flight" | |
| HPI-R16 | verified | e2e "catches a locked Web Serial writer instead of escaping send error handling" | |
| HPI-R17 | implemented | e2e-sim (CSV download) | Clear capture has no test |
| HPI-R18 | missing | — | Promised by the catalog title; not built |
| HPI-R19 | verified | `tests/e2e/accessibility.spec.ts` route `hardware-packet-inspector` | |
| HPI-R20 | implemented | — | No viewport test for this route |
| HPI-R21 | missing | — | Delivered through TASK-028 |
| HPI-R22 | missing | — | Added 2026-10-02 |

## Open work

0. Build the requirements added 2026-10-02: HPI-R22.
1. Build HPI-R18 (Web Bluetooth); the owner chose building over changing the title (2026-10-02).
2. Add tests for HPI-R01 (baud rate), R03 (reopen after disconnect), R08 (direction and bytes on one line), R11 (paging), R17 (Clear capture), R20.
3. HPI-R21 with TASK-028.

## Known limitations

- Web Serial exists only in Chromium-based browsers in a secure context; elsewhere only the simulator works.
- Capture keeps the newest 5,000 entries.

## Verification evidence

- 2026-10-01, `main` @ `817373f5`: `packets` + `packet-rules` units 15/15; `tests/e2e/hardware.spec.ts` 10 passed (desktop and mobile); accessibility spec for the route 2 passed.

## Change log

- 2026-10-02 — Added HPI-R22 (default integration rule).
- 2026-10-01 — Created per `docs/DOCUMENTATION_STANDARD.md`.

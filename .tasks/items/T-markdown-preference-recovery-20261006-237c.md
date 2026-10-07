---
task: T-markdown-preference-recovery-20261006-237c
tool: markdown-workbench
doc: task
kind: fix
state: done
branch: fix/markdown-workbench
created: 2026-10-06
updated: 2026-10-07
---

# Recover usable settings from malformed stored preferences

## Request
Associated MDW-R12 defect found during ordered verification: invalid view, wrong-type booleans and negative font sizes were accepted from local storage.

## Resume here
Completed. Preference acceptance passed on desktop/touch; canonical full validation run 37538813696 passed on integrated revision bcdd08ea4f42067c50f2c54870cf69d13a9902ef, including unit, build and browser checks. Pages run 37537306543 succeeded. The owning ordered task holds the next requirement cursor.

## Log
- 2026-10-06: browser baseline reproduced invalid Split selection on desktop and phone with malformed stored values. A separate valid-settings test initially had an innerText/textContent assertion mismatch; that test assertion was corrected. No valid-settings runtime failure was established from that mismatch.
- 2026-10-06: `loadEditorPrefs` now whitelists the3 supported views, actual booleans and integer font sizes11–20, preserving defaults for invalid values. Accepted behavior added to MDW-R12 in the current spec. Type check passed; final browser verification pending.

- 2026-10-07 00:23 UTC: final regression and deployed integration verified through GitHub MCP; marked done with the source/run evidence above.

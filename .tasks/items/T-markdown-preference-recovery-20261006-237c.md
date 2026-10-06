---
task: T-markdown-preference-recovery-20261006-237c
tool: markdown-workbench
doc: task
kind: fix
state: active
branch: fix/markdown-workbench
created: 2026-10-06
updated: 2026-10-06
---

# Recover usable settings from malformed stored preferences

## Request
Associated MDW-R12 defect found during ordered verification: invalid view, wrong-type booleans and negative font sizes were accepted from local storage.

## Resume here
Validation implemented; final regression and integration/deployment evidence pending. The owning ordered task holds the current cursor. Do not label done before integration.

## Log
- 2026-10-06: browser baseline reproduced invalid Split selection on desktop and phone with malformed stored values. A separate valid-settings test initially had an innerText/textContent assertion mismatch; that test assertion was corrected. No valid-settings runtime failure was established from that mismatch.
- 2026-10-06: `loadEditorPrefs` now whitelists the3 supported views, actual booleans and integer font sizes11–20, preserving defaults for invalid values. Accepted behavior added to MDW-R12 in the current spec. Type check passed; final browser verification pending.

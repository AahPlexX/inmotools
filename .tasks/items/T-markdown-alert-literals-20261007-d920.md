---
task: T-markdown-alert-literals-20261007-d920
tool: markdown-workbench
doc: task
kind: fix
state: active
branch: fix/markdown-workbench
created: 2026-10-07
updated: 2026-10-07
---

# Preserve literal alert markers and exported warning styling

## Request
Associated MDW-R31 checks found escaped standard alert markers are transformed instead of remaining literal. Preserve the original source syntax and alert presentation across detached HTML/EPUB exports.

## Resume here
DANGER and source-aware literal matching are implemented. Shared alert styles enter preview, standalone HTML and EPUB. Baseline 12-case units: 10 failed, 2 passed; both existing warning export styles were absent. Corrected alert/render/export unit checks passed 54/54; TypeScript and clean build passed. Next: production browser acceptance and Markdown regression. Current ordered cursor is in T-markdown-workbench-20261006-ea9f. No R31 release is claimed.

## Log
- 2026-10-07 00:24 UTC: 10-case alert baseline: 8 failed, 2 passed. Failures cover absent DANGER rendering and escaped NOTE/TIP/IMPORTANT/WARNING/CAUTION conversion; literal code and escaped missing DANGER remain unchanged. Sources refreshed from official GitHub syntax, unified API and CommonMark 0.31.2 at 00:24 UTC.

- 2026-10-07 00:29 UTC: both remaining unit failures came from the default unit runner replacing CSS imports with empty strings, confirmed in official Vitest CSS documentation. The owned test now supplies the tracked stylesheet to verify export logic; production browser checks will verify actual Vite inline CSS. Corrected unit rerun is pending. Clean R31 production build is running.

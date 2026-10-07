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
DANGER/source-aware marker handling and shared alert styles passed 54 unit cases, TypeScript, clean build and 10 production browser cases (30.8s), including existing alert and guide regression. Source 8787c1150604e182a5524b4ad7a43282f31d7f4e is published. Integration run 37552440278 and frozen all-Markdown regression are in progress. Record integration/deployment and full regression outcomes before marking done; owning ordered cursor is MDW-R33.

## Log
- 2026-10-07 00:24 UTC: 10-case alert baseline: 8 failed, 2 passed. Failures cover absent DANGER rendering and escaped NOTE/TIP/IMPORTANT/WARNING/CAUTION conversion; literal code and escaped missing DANGER remain unchanged. Sources refreshed from official GitHub syntax, unified API and CommonMark 0.31.2 at 00:24 UTC.

- 2026-10-07 00:29 UTC: both remaining unit failures came from the default unit runner replacing CSS imports with empty strings, confirmed in official Vitest CSS documentation. The owned test now supplies the tracked stylesheet to verify export logic; production browser checks will verify actual Vite inline CSS. Corrected unit rerun is pending. Clean R31 production build is running.

- 2026-10-07 00:32 UTC: scoped production checks passed 10/10 (30.8s); unit checks 54/54, TypeScript/build passed. Awaiting remaining release/regression evidence.

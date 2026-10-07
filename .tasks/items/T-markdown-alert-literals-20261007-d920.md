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

Scoped fix verified and integrated/deployed as 1e85224354e3513485ccf583c38d4fb1b93c3a01. Integration 37552674213 and Pages 37553380467 succeeded. Frozen all-Markdown regression on source 8787c115 passed 190/190 (13.9m), plus 54 units, TypeScript/build and 10/10 scoped production cases. Earlier integration 37552440278 was superseded and cancelled. This task remains active pending canonical cross-tool validation on a revision containing R31; the successful R29 full run 37551755268 precedes this fix. Next: inspect the latest fix/markdown-workbench integration/full checks and close this task only after success on source containing the fix. Ordered work continues at the owning tracker cursor; read its current Resume here.

## Log
- 2026-10-07 00:24 UTC: 10-case alert baseline: 8 failed, 2 passed. Failures cover absent DANGER rendering and escaped NOTE/TIP/IMPORTANT/WARNING/CAUTION conversion; literal code and escaped missing DANGER remain unchanged. Sources refreshed from official GitHub syntax, unified API and CommonMark 0.31.2 at 00:24 UTC.

- 2026-10-07 00:29 UTC: both remaining unit failures came from the default unit runner replacing CSS imports with empty strings, confirmed in official Vitest CSS documentation. The owned test now supplies the tracked stylesheet to verify export logic; production browser checks will verify actual Vite inline CSS. Corrected unit rerun is pending. Clean R31 production build is running.

- 2026-10-07 00:32 UTC: scoped production checks passed 10/10 (30.8s); unit checks 54/54, TypeScript/build passed. Awaiting remaining release/regression evidence.

- 2026-10-07 01:17 UTC: reconciled current resume with actual integrated/deployed R31 revision and 190/190 frozen Markdown regression. Canonical validation remains pending; no completion claim.

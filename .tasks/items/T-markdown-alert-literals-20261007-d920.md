---
task: T-markdown-alert-literals-20261007-d920
tool: markdown-workbench
doc: task
kind: fix
state: done
branch: fix/markdown-workbench
created: 2026-10-07
updated: 2026-10-07
---

# Preserve literal alert markers and exported warning styling

## Request
Associated MDW-R31 checks found escaped standard alert markers are transformed instead of remaining literal. Preserve the original source syntax and alert presentation across detached HTML/EPUB exports.

## Resume here

Scoped fix integrated/deployed as 1e85224354e3513485ccf583c38d4fb1b93c3a01 and included in main f644133f28f1ff306283bd71dd61fd693561e1c2. Canonical cross-tool integration 37560176754 passed on source containing this fix (3821 unit passes/14 skips; 1676 browser passes/1 unrelated flaky/171 skips). Pages 37564223040 passed. Existing scoped production 10/10 and frozen Markdown 190/190 evidence remain valid. Closed after official GitHub MCP/log verification on 2026-10-07 03:17 UTC. Ordered continuation is at the current owning tracker cursor.

## Log
- 2026-10-07 00:24 UTC: 10-case alert baseline: 8 failed, 2 passed. Failures cover absent DANGER rendering and escaped NOTE/TIP/IMPORTANT/WARNING/CAUTION conversion; literal code and escaped missing DANGER remain unchanged. Sources refreshed from official GitHub syntax, unified API and CommonMark 0.31.2 at 00:24 UTC.

- 2026-10-07 00:29 UTC: both remaining unit failures came from the default unit runner replacing CSS imports with empty strings, confirmed in official Vitest CSS documentation. The owned test now supplies the tracked stylesheet to verify export logic; production browser checks will verify actual Vite inline CSS. Corrected unit rerun is pending. Clean R31 production build is running.

- 2026-10-07 00:32 UTC: scoped production checks passed 10/10 (30.8s); unit checks 54/54, TypeScript/build passed. Awaiting remaining release/regression evidence.

- 2026-10-07 01:17 UTC: reconciled current resume with actual integrated/deployed R31 revision and 190/190 frozen Markdown regression. Canonical validation remains pending; no completion claim.

- 2026-10-07 03:17 UTC: closed after canonical full validation and deployment on main f644133; source contains the original R31 fix.

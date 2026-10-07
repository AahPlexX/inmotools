---
task: T-markdown-metadata-citations-20261007-291b
tool: markdown-workbench
doc: task
kind: fix
state: active
branch: fix/markdown-workbench
created: 2026-10-07
updated: 2026-10-07
---

# Preserve metadata citation exclusions across native line endings

## Request

Associated R51 defect: valid metadata must remain metadata with LF, CRLF and lone-CR source; its citation keys must not enter References. Preserve all authored source bytes and native body positions. Valid JSON strings containing braces/escaped quotes must not terminate the metadata block.

## Resume here

At 2026-10-07 14:25:51 UTC, final R51 metadata-repaired runtime passed all 34 R36/R38/R51 production cases (4.2m), desktop/touch, no retries or skips; all 391 Markdown/shared recovery units passed (23.29s), TypeScript/build passed. The strengthened export fixture and YAML/TOML/JSON × LF/CRLF/CR browser cycles exclude metadata/uncited keys and preserve exact original download bytes. Native metadata payload parsing and original body slicing handle mixed line endings and braces/escaped quotes in JSON strings. Earlier baseline failed 8 units/49 passes and both actual export cases, recorded in task 291b. R51 is implemented, associated tasks stay active until fresh full/main/Pages receipts. Published 46a147c + record 8bbca5f/full 37632859293 validate only prior runtime; publish this real repair now, superseding that run with required fresh full integration. Shared recovery guard reason remains in task a67d. Next: publish through GitHub MCP, inspect latest exact integration head/full receipt, verify main tree and Pages, then mark R51 verified and advance to R55. R55 preparatory task 12d4 has current official sources and reproducible metrics baselines, no runtime change. R15 cause unresolved.

## Evidence and reproduction

Run `pnpm exec vitest run tests/unit/markdown-frontmatter.test.ts tests/unit/markdown-citation.test.ts`; frozen failing baseline source is published 46a147c with the new committed regression assertions. Eight failures: native lone-CR YAML/TOML/JSON; TOML CRLF; citation metadata keys leaked with CRLF/CR; both JSON title brace fixtures. Unit suite retains all prior assertions. The corrected production browser fixture is in tests/e2e/markdown-references.spec.ts, first export case. It checks original Windows Markdown download, excludes metadata/uncited entries, and retains code/summary literals through every rendered export.

CommonMark 0.31.2 defines LF, CRLF and CR line endings and native source nodes follow the body string parsed. Current primary CommonMark retrieved HTTP 200 at 2026-10-07 13:53:15 UTC. [RFC 8259 JSON grammar](https://www.rfc-editor.org/rfc/rfc8259) retrieved HTTP 200 at 14:13:28 UTC corroborates quoted strings/escape grammar; braces within a string are text. Installed YAML and TOML parser evaluation reproduces quoted values with a trailing standalone CR being rejected; unquoted YAML instead retains that CR in its scalar. Canonical payload lines avoid both errors while the body remains an original source slice. No dependency/shared-runtime changes are needed beyond the already recorded R51 recovery guard.

## Log

- 2026-10-07 14:15:46 UTC: Regression baseline 8 failed/49 passed. Repair specification and next action recorded before runtime edits; browser baseline pending.

- 2026-10-07 14:19:40 UTC: Metadata first repair passed 384 Markdown/recovery units, TypeScript/build; final expanded metadata/native-line-ending tests are pending. Corrected unchanged production metadata fixture failed 2/2 due to the extra References entry.

- 2026-10-07 14:21:04 UTC: Expanded final Markdown/shared recovery units passed 391/391 (23.29s), TypeScript/build pass. Production 34-case R36/R38/R51 acceptance is running with one worker and no retries. No associated repair/full/main/Pages success claim yet.

- 2026-10-07 14:25:51 UTC: Final metadata-repaired R51 source passes 34/34 owned R36/R38/R51 production cases (4.2m), no retries/skips, and 391 units (23.29s), TypeScript/build. Real repair publication/fresh full/main/Pages pending.

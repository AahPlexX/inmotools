---
task: T-crystal-substitution-retry-20261009-d7a8
tool: crystal-lattice-studio
doc: task
kind: fix
state: backlog
branch: fix/crystal-lattice-studio
created: 2026-10-09
updated: 2026-10-09
---

# Investigate mobile substitution that passed on retry

## Request

Investigate the newly observed substitution failure during full regression, retaining the original assertion and timeout. Preserve the frozen tool order. No Crystal code or test changed for this observation.

## Resume here

2026-10-09 16:29 UTC: required Markdown R96 full [37953387063](https://github.com/AahPlexX/inmotools/actions/runs/37953387063), validate job113897656914, succeeded on81fc788074dee56cf768112e356f7e40cd2129ce. Browser summary1810passed/1flaky/171skipped (45.3m). Sole flaky mobile tests/e2e/crystal-lattice-studio.spec.ts:396, builds vacancy, substitution and interstitial defects with undo, failed its first substitution assertion and passed retry. Expected Na1 element Fe after filling Defect element Fe and clicking Create substitution; received Na throughout5000ms,13locator resolutions. Cause unknown. Crystal runtime and this test are unchanged between68757745fd98ff46ea12ebd8b251e97fb6867285 and81fc788. Investigate during the ordered Crystal pass; do not advance the current frozen PDF-R02 cursor for this backlog. This is separate from c492 scalar-field and older symmetry-break retries.

## Evidence and reproduction

Completed official job logs retrieved2026-10-09 16:28–29UTC. Original assertion at test line408, failure emitted16:09:06UTC; retry marker16:08:54UTC; final summary16:26:46UTC. Reproduce the existing mobile case on the unchanged source before attributing a cause. Preserve click, fixture, Undo cycle, value expectation and default5000ms; no timeout/retry weakening. Runner screenshot/trace paths appear in the log, but the successful job skipped upload-failure-evidence and those artifacts were not downloaded. Optional external full log: /workspace/inmotools-implementation-evidence/r96-full-complete.log. The public completed job and committed test are the portable evidence. Capture selected-site/defect/update state only if reproduction requires it. A subsequent pass alone does not establish a cause or repair.

## Log

- 2026-10-09 16:29 UTC: newly observed sole full-suite retry recorded separately; no Crystal implementation or claimed fix.

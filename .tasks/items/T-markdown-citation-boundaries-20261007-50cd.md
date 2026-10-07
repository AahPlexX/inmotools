---
task: T-markdown-citation-boundaries-20261007-50cd
tool: markdown-workbench
doc: task
kind: fix
state: active
branch: fix/markdown-workbench
created: 2026-10-07
updated: 2026-10-07
---

# Preserve citation code boundaries while generating References

## Request

Associated bug discovered while researching the next ordered requirement MDW-R51: citation processing must preserve native code literals and append only document citations to a generated References section, without changing original source.

## Resume here

At 2026-10-07 04:53 UTC, a read-only actual-browser baseline against unchanged R38 repair artifact confirms three citation-boundary defects: indented code, a two-backtick inline span containing a single backtick, and a four-backtick fence containing a triple-backtick line all changed [@fixture] into (Fixture, 2026). The fixture is synthetic. The real prose citation resolved, the bibliography side panel contained the fixture entry, and the preview had zero References headings. The current regex protection handles only simple fences/single-backtick spans. No citation runtime has changed. R38 scoped main/Pages release is verified at 58be2be; parent cursor is now R51 and this task is active. Next: specify native literal/metadata/escape guards and bibliography preview/export parity before implementation; reproduce these failures with tracked unit/browser tests, repair native source boundaries, and verify every export/style/reset/loading cycle before publication. Shared-path reason: owned evidence is under tests/unit and tests/e2e; full suite required. Do not weaken valid literal boundaries or fabricate references for unresolved keys.

## Log

- 2026-10-07 04:53 UTC: Reachable actual baseline source: # Fixture citations, prose See [@fixture], indented [@fixture], inline ``[@fixture] ` example``, and a four-backtick md fence containing a triple-backtick line followed by [@fixture]. Synthetic CSL-JSON entry id fixture/type book/title Synthetic bibliography fixture/author Test Fixture/year 2026. Preview code texts were (Fixture, 2026), (Fixture, 2026) ` example, and triple-backtick + (Fixture, 2026). Zero References headings despite a populated bibliography panel. The earlier exact-select-label locator timeout is excluded as setup evidence; corrected documented label selection produced this baseline. Optional local receipt citation-boundaries-baseline.json is not needed for reproduction.
- 2026-10-07 04:53 UTC: Official CSL specification source and CommonMark 0.31.2 retrieved HTTP 200 at 04:48:59–04:49:00 UTC. Hosted CSL and citeproc documentation returned HTTP 403, so no content from those blocked pages was used. Primary citeproc repository's historical attic manual retrieved HTTP 200 at 04:50:59 UTC; validate API details against installed citeproc 2.4.63 and current upstream implementation before using it. No dependency/runtime changes yet.

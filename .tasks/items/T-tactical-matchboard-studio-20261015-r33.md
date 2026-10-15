---
task: T-tactical-matchboard-studio-20261015-r33
tool: tactical-matchboard-studio
doc: task
kind: fix
state: done
branch: fix/tactical-matchboard-studio
created: 2026-10-15
updated: 2026-10-15
---

# Author timed Matchboard substitutions

## Request

Owner, 2026-10-14: continue `AahPlexX/inmotools` from the previous agent's stopping point and keep all associated internal documentation current enough for any model/provider to resume without stale state. After verified TMS-R82, continue the tracker sequence with TMS-R33.

## Scope

- Implement TMS-R33: author one atomic timed substitution so an outgoing player leaves the board and an incoming off-field roster player appears at the authored integer-millisecond time.
- Reuse the existing canonical timeline and player-token visibility model; do not add a parallel clock or second playback state machine.
- Preserve existing imported/rich-CSV keyframe event text, immutable project editing, scene reorder/join behavior, persistence, undo/redo integration through the existing workspace edit path, and prior visibility/possession behavior.
- Expose the authoring control inside the existing Timing panel using native labeled form controls.
- Add focused unit evidence first (RED then GREEN) and focused desktop/mobile browser acceptance. No dependency changes.

## Resume here

DONE. TMS-R33 is verified and integrated. Runtime implementation is `0e60a3aecca4eef01327d31d950cbcffcabe8ecc`; the browser-locator-only correction is `7313bf00bbb4ca3642da859d42935fb0c2495ced`. GREEN workflow `38672289731`, job `116217961540`, completed successfully. The branch integrated to `main` as `ef68da5206c1fe6b9ef627caf4ed141bf7babcb4`, and generated documentation/index sync advanced `main` to `af4fed70446dccc2ff4b1ab25188f5f845af6570`. Continue with TMS-R07; see `src/tools/tactics/CURRENT_HANDOFF.md` and `TRACKER.md`.

## Design notes

- A substitution uses the canonical timeline only. The outgoing target gets `visible: false` and the incoming target gets `visible: true` at the same integer millisecond; `sampleTacticalProjectAtTime` applies that state to the board.
- Semantic pairing is persisted inside the two existing keyframes as additive `[substitution:<encoded-id>:outgoing]` / `[substitution:<encoded-id>:incoming]` tags. Existing keyframe `event` text is retained and the substitution tag is appended, avoiding a new schema field and avoiding data loss for imported/rich-CSV events.
- Authoring validates player-token identity, same team, same scene, and actual visibility immediately before the authored time. This supports later sequential substitutions without incorrectly treating the roster's static `active`/`substitute` category as a second timeline state.
- `addSquadParticipant` and status editing already make initial substitutes hidden, so no duplicate player/token model is required.
- Scene reordering/joining and persistence already move/merge/round-trip timeline keyframes and their event text; using those same keyframes preserves those semantics without special-case migration code.
- The Timing panel lists only active/substitute roster players (not coaches or neutral participants) and explains that actual on/off-field eligibility is checked at the chosen time.
- The browser correction follows current official Playwright locator guidance: the ambiguous `getByLabel('Status')` was replaced by the exact interactive role/name. Production code was not changed by that correction.

## Verification

- Unit: `authors one timed substitution event that swaps outgoing and incoming player visibility`.
- Browser: `authors a timed substitution and swaps the two player tokens at the authored millisecond` on the Tactical Matchboard focused desktop/mobile Playwright contract.
- GREEN workflow: `38672289731`; job: `116217961540`; conclusion: success.
- Integration merge: `ef68da5206c1fe6b9ef627caf4ed141bf7babcb4`.
- Post-integration generated sync: `af4fed70446dccc2ff4b1ab25188f5f845af6570`.

## Log

- 2026-10-15: TMS-R82 GREEN integration confirmed at workflow `38664068636`; baseline `main` was `539bf012171ecc9caeaddbffe0fd1579d5854c00` after generated documentation sync.
- 2026-10-15: reviewed current W3C WAI form labeling/instruction guidance plus MDN `<label>`/`<select>` references before changing the client-side Timing panel. Visible associated labels remain the baseline; no custom widget was justified.
- 2026-10-15: RED commit `1056fb6ffb53a1764d4c58be01607e6a75b145a4`; workflow `38670429054`, job `116212029288`. All prior unit coverage passed; only the newly introduced timed-substitution contract failed with `TypeError: addTimelineSubstitutionEvent is not a function`.
- 2026-10-15: implementation design was narrowed after checking `TacticalKeyframe.event` persistence/export behavior. The helper appends a structured substitution tag instead of overwriting existing event text and does not introduce a new timeline schema or clock.
- 2026-10-15: implementation commit `0e60a3aecca4eef01327d31d950cbcffcabe8ecc` added the atomic substitution engine, labeled Timing-panel authoring controls, unit contract, focused desktop/mobile browser contract, and E2E selector mapping.
- 2026-10-15: first GREEN workflow `38671314945`, job `116214857092`, failed in the new browser test only. Artifact `11944378830` shows Playwright strict mode: `getByLabel('Status')` resolved to three elements (`Local processing status`, `Privacy status`, and the intended `select[name="status"]`). Both desktop and mobile failed before Save token or substitution authoring. No runtime defect was demonstrated by this run.
- 2026-10-15: verified current official Playwright docs after the failure. Role locators are recommended for interactive controls, and label matching defaults to non-exact. Commit `7313bf00bbb4ca3642da859d42935fb0c2495ced` scoped the test to the exact combobox named `Status`; production runtime remained unchanged.
- 2026-10-15: corrective GREEN workflow `38672289731`, job `116217961540`, completed successfully. Integration merge `ef68da5206c1fe6b9ef627caf4ed141bf7babcb4`; generated docs/index sync `af4fed70446dccc2ff4b1ab25188f5f845af6570`.

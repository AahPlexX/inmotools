---
task: T-tactical-matchboard-studio-20261015-r33
tool: tactical-matchboard-studio
doc: task
kind: fix
state: active
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
- Expose the authoring control inside the existing Timing panel using native labeled form controls. Current W3C WAI and MDN guidance confirms form controls, including selects, need descriptive associated labels; the existing Timing panel's visible label/control pattern remains the baseline.
- Add focused unit evidence first (RED then GREEN) and focused desktop/mobile browser acceptance. No dependency changes.

## Resume here

RED is established and the runtime implementation is present at `0e60a3aecca4eef01327d31d950cbcffcabe8ecc`. The first GREEN attempt, workflow `38671314945` / job `116214857092`, failed only in the new Playwright substitution contract before substitution behavior was exercised: `getByLabel('Status')` matched the token editor `Status` select plus the page's `Local processing status` and `Privacy status` regions, so strict mode rejected the locator on desktop and mobile. The uploaded failure artifact is `11944378830`. The corrective work unit changes only that locator to the exact interactive role/name (`getByRole('combobox', { name: 'Status', exact: true })`) and records the evidence here. Runtime implementation remains unchanged. Next: rerun the same governed integration gate; close TMS-R33 only if focused desktop/mobile substitution acceptance and all repository gates pass.

## Design notes

- A substitution uses the canonical timeline only. The outgoing target gets `visible: false` and the incoming target gets `visible: true` at the same integer millisecond; `sampleTacticalProjectAtTime` already applies that state to the board.
- Semantic pairing is persisted inside the two existing keyframes as additive `[substitution:<encoded-id>:outgoing]` / `[substitution:<encoded-id>:incoming]` tags. Existing keyframe `event` text is retained and the substitution tag is appended, avoiding a new schema field and avoiding data loss for imported/rich-CSV events.
- Authoring validates player-token identity, same team, same scene, and actual visibility immediately before the authored time. This supports later sequential substitutions without incorrectly treating the roster's static `active`/`substitute` category as a second timeline state.
- `addSquadParticipant` and status editing already make initial substitutes hidden, so no duplicate player/token model is required.
- Scene reordering/joining and persistence already move/merge/round-trip timeline keyframes and their event text; using the same keyframes therefore preserves those semantics without special-case migration code.
- The Timing panel lists only active/substitute roster players (not coaches or neutral participants) and explains that actual on/off-field eligibility is checked at the chosen time.
- The browser correction follows current official Playwright locator guidance: use role locators for interactive controls; `getByLabel` text matching is non-exact by default unless `exact: true` is supplied. The failure was test ambiguity, not a product accessibility defect.

## Log

- 2026-10-15: TMS-R82 GREEN integration confirmed at workflow `38664068636`; current baseline `main` is `539bf012171ecc9caeaddbffe0fd1579d5854c00` after generated documentation sync.
- 2026-10-15: reviewed current W3C WAI form labeling/instruction guidance plus MDN `<label>`/`<select>` references before changing the client-side Timing panel. Visible associated labels remain the required pattern; no custom widget is justified.
- 2026-10-15: RED commit `1056fb6ffb53a1764d4c58be01607e6a75b145a4`; workflow `38670429054`, job `116212029288`. All prior unit coverage passed; only the newly introduced timed-substitution contract failed with `TypeError: addTimelineSubstitutionEvent is not a function`.
- 2026-10-15: implementation design was narrowed after checking `TacticalKeyframe.event` persistence/export behavior. The helper appends a structured substitution tag instead of overwriting existing event text and does not introduce a new timeline schema or clock.
- 2026-10-15: implementation commit `0e60a3aecca4eef01327d31d950cbcffcabe8ecc` added the atomic substitution engine, labeled Timing-panel authoring controls, unit contract, focused desktop/mobile browser contract, and E2E selector mapping.
- 2026-10-15: first GREEN workflow `38671314945`, job `116214857092`, failed in the new browser test only. Artifact `11944378830` shows Playwright strict mode: `getByLabel('Status')` resolved to three elements (`Local processing status`, `Privacy status`, and the intended `select[name="status"]`). Both desktop and mobile failed at that same locator before Save token or substitution authoring. No runtime defect was demonstrated by this run.
- 2026-10-15: verified current official Playwright docs after the failure. Role locators are recommended for interactive controls, and label matching defaults to non-exact. The correction scopes the test to the exact combobox named `Status`; production code is not changed.

# Typing Workstation UX/UI elevation — plan (TASK-026)

Source of findings: `docs/typing-ux-audit-2026-09-30.md` (UX-01 … UX-14). This plan changes presentation and interaction only. The engine, corpora, storage schema, export formats, shortcuts (Esc, F2, Tab) and every existing accessible name stay as they are; the `tw-stat`, `tw-char`, `tw-caret`, `tw-summary` and `tw-root` hooks the e2e spec depends on are preserved.

## Design principle

A typing test has one job: put the passage under the user's fingers and keep the three numbers that matter (time, speed, accuracy) in view while they type. Everything else — configuration, analytics, history, settings, export — is real and stays, but it must never sit between the user and the first keystroke, and it must not be on screen competing with the test while one is running.

## Phases and acceptance criteria

### P0 — Foundation: stop the layout blow-out (UX-01, UX-12) — implemented in the audit commit
- Spaces render as normal breakable spaces; `.tw-root` has a pinned `minmax(0, 1fr)` track.
- Accept: at 1440, 768, 390 and 320 px the workspace has no descendant wider than its own right edge, all five live stats are visible, and the passage wraps onto multiple lines.
- Regression test measures *workspace geometry*, not just `document.scrollWidth`, and fails against the pre-fix code (the pre-fix toolbar was 20,953 px wide).

### P1 — Test first (UX-02)
- Add an optional, opt-in `workspaceFirst` flag to a tool's catalog entry. `ToolLayout` honours it by rendering a compact title block, then the workspace, then the "How to use" guide below. No other tool sets the flag, so no other tool changes. Title, privacy note, favourites control and all `data-testid`s remain.
- Accept: at 1440×900 the passage is fully inside the first viewport; at 390×844 the Start control and the first line of the passage are inside the first viewport.

### P2 — A passage you can type (UX-03, UX-11)
- Show a three-line window onto the passage and scroll it as the caret moves to keep the active line in the middle line. Pure function for the offset, unit tested. Respect `prefers-reduced-motion` (no animated scroll).
- Idle / unfocused state shows a clear "Click here or start typing" cue on the passage; a mid-test blur shows "Click to continue".
- Accept: passage height is bounded to three lines at any viewport (target ≤ 240 px at 22 px font); the active line never leaves the window during a full test; the cue appears only when the passage does not have focus.

### P3 — Live numbers and one obvious action (UX-04, UX-06, UX-13)
- A compact live bar attached to the passage: Time, Net WPM, Accuracy always; Consistency and Raw CPM kept in the same strip but visually secondary. Plain-language subtitles for CPM and consistency.
- One primary action (Start) next to the passage; New text, Abort, Weak-key drill and Export grouped as secondary actions; guarded/disabled actions are not shown as dead buttons while there is nothing to guard.
- Accept: while a test runs on a 390×844 phone, time, WPM and accuracy are in the viewport together with the active line, with no scrolling.

### P4 — A result, then a form (UX-05)
- Lead with the result: Net WPM large, accuracy, errors, consistency, and a personal-best comparison when one exists. **Save** is the primary action and visible without scrolling; exports are a grouped secondary row; typist/organisation/proctor/tags/notes move under an "Add details (optional)" disclosure.
- Focus lands on the dialog heading, not a form field, and input is ignored for a short guard window after a test completes so trailing keystrokes cannot enter a field. Keyboard trap, Escape, and labelled fields stay.
- Accept: a test finished by typing continues to type after the last character without any text appearing in any dialog field; Save is reachable in one Tab from the heading.

### P5 — Settings, analytics, history (UX-07 … UX-10, UX-14)
- Settings (theme, font, size, caret, audio, accessibility checkboxes) become a tidy grouped form near the test, with proper label/control rows (no run-together text).
- Keyboard heatmap fits its container at every width instead of clipping.
- Analytics shows one concise empty state before the first saved test instead of five empty tiles; charts render only with data.
- History gets a real empty state, a separated danger zone for "Reset … scores", and button-styled import controls without inline styles. Inline layout styles and hard-coded greys are replaced with classes using the existing theme tokens.
- Accept: no element in the workspace overflows at 320 px; the settings form passes an Axe sweep; empty states appear exactly when there is no data.

### P6 — Verification gates (all must pass before merge)
- `tsc --noEmit -p tsconfig.app.json` clean; full `tests/unit` Typing files green; new unit tests for the window-offset function and any new pure logic.
- `tests/e2e/typing.spec.ts` green on desktop and mobile Chromium, extended with: geometry assertions at 320/390/768/1440, windowed passage and caret-follow, live bar in viewport on phone, result dialog focus and keystroke-bleed guard, empty states.
- Axe (serious/critical) on the resting page and the result dialog; high-contrast and two dark themes spot-checked for the new classes.
- `pnpm build` clean. The repository's own validation workflow green on the PR.

### P7 — Close-out
- Update this plan's status, the audit's resolution column, the catalog hint/steps if behaviour they describe changed, `.tasks/IN_PROGRESS.md` → `DONE.md` + `WORK_LOG.md`, and `config.json` `nextId`.

## Risks

- `ToolLayout` and `catalog.ts` are shared and other branches edit them. The change is one optional field plus one conditional render; conflicts, if any, are mechanical.
- The existing e2e spec has 167 role/label/text queries. Moving controls must not rename them. Where a control genuinely moves (e.g. configuration into a disclosure), the test is updated in the same commit and the reason is stated in the commit message.
- Windowing the passage changes what is visible, not what is typed or scored; the engine still receives the full text. Unit and e2e tests assert scoring is unchanged.

# Typing Workstation — UX/UI audit (2026-09-30)

Scope: `src/tools/typing/` as shipped on `origin/main` at `dd12e943`, inspected in a real browser (Chromium via Playwright) at 1440×900, 768×1024 and 390×844, through three states — resting, mid-test, and the result dialog — plus a full read of `TypingWorkspace.tsx` (1,804 lines) and `typing-styles.css` (734 lines). Every finding below was measured or read, not assumed. Work is tracked as TASK-026; the implementation plan is `docs/superpowers/plans/2026-09-30-typing-ux-elevation.md`.

Not yet audited (listed so the gap is explicit rather than silent): the export-history, add-typist and custom-text dialogs beyond their shared shell; the ten non-light themes beyond spot checks; real screen-reader output; 320 px reflow after the redesign. These are verification gates in the plan, not claims.

## Summary

The tool's engine is sound (metrics, corpora, storage, exports all have focused tests). The experience around it is not. One rendering decision made the entire workspace roughly 21,000 px wide and clipped it to the page, which is why a tester meets cut-off controls, a single stat card and half a line of text — and why the list of problems felt too long to enumerate. Once that is fixed, a second layer of real design problems is visible: the test is below the fold, the passage is an unbroken wall, nothing important stays in view while typing, and the result dialog is a form.

## Findings

| ID | Severity | Finding | Evidence |
|---|---|---|---|
| UX-01 | Critical | The workspace is stretched to ~21,000 px and clipped at every viewport. | `renderCells` rendered every space as U+00A0 (non-breaking) in per-character spans, so the pre-wrap passage had **no line-break opportunity** and measured ~1,600 characters × 13 px on one line. `.tw-root` is `display: grid` with a single implicit `auto` track, which sized itself to that width. Measured: toolbar 20,953 px wide, each stat card 4,181 px, 1,681–1,741 descendants overhanging the workspace; only "Net WPM" visible of five stats; the passage ended mid-word ("…agree hu"); charts and history cut at the right edge. |
| UX-02 | Critical | The test is below the fold. | At 1440×900 the workspace starts ~1,100 px down: a five-line 68 px title, a summary, a privacy note and a "How to use" block come first. On a phone the controls alone are ~900 px tall before any passage. |
| UX-03 | Critical | The passage is an unbroken wall of text. | The whole 200-word sample is shown: canvas 798 px tall on desktop (89% of the viewport) and **2,801 px on a phone (3.3 screens)**. There is no line windowing, so the line being typed scrolls out of view and the sheer volume reads as pressure. |
| UX-04 | High | Nothing important stays visible while typing. | The five live-stat cards sit above the passage. During a phone test the page had scrolled 2,662 px, so timer, WPM and accuracy were off screen. |
| UX-05 | High | The result dialog is a form, not a result, and it can swallow keystrokes. | Focus jumps to the first form field (`autoFocus` on "Typist name") the instant the test ends, so a typist's trailing keystrokes land in it (reproduced: the passage text appeared in the name field). The result is four equal-weight numbers followed by six fields and six buttons; the primary **Save** is the last, lowest button; the "Save raw keystroke log" checkbox is mis-aligned over its label. |
| UX-06 | High | Two competing primary buttons in two separate control clusters. | **Start** (session bar) and **New text** (toolbar) are both filled primary buttons, ~600 px apart on a phone, with greyed-out Pause / Stop / Abort & discard alongside. Configuration selects, test actions and export share one wrapping row. |
| UX-07 | High | The settings panels are visibly broken forms, and buried. | "Comfort & accessibility" renders the slider and its label run together ("22pxCaret"); five checkboxes are jammed into running text ("…(zen)Hide stats while typing"). Theme, font, caret and audio live below nine analytics panels, nowhere near the test. |
| UX-08 | High | The keyboard heatmap clips its own keys. | Keys are cut at the panel edge on desktop (3-up grid) and overhang by up to 171 px on tablet (`.tw-keyboard-row`, `.tw-key.space { min-width: 240px }`). |
| UX-09 | Medium | Thirteen sections and 25 controls on one page with no hierarchy, and empty placeholders in the way. | Before the first test the page shows two empty charts with 0–1.0 axes, three "Finish a test to see analytics" tiles and "No data yet" — more empty chrome than content. Desktop page height 2,865 px; phone 4,708 px. |
| UX-10 | Medium | History is cluttered and its destructive action is unguarded visually. | Empty table header with no empty-state message; "Reset … scores…" sits beside Refresh and Import with no separation or danger styling; import controls are `<label>`s dressed as buttons with inline styles. (The reset itself does confirm.) |
| UX-11 | Medium | No idle or blurred affordance on the passage. | The only cue is a small paragraph above the canvas. A visitor sees grey text and no sign that typing will begin. |
| UX-12 | Medium | The responsive regression test cannot catch UX-01. | `tests/e2e/typing.spec.ts` ("reflows without page-level horizontal overflow") checks only `document.documentElement.scrollWidth`; the page clips the workspace, so a 21,000 px workspace passed. |
| UX-13 | Low | Unexplained jargon. | "Raw CPM" and "Consistency — Higher is smoother" have no explanation; the audience in the catalog entry includes kids. |
| UX-14 | Low | Layout and colour set inline. | `style={{…}}` for layout and a hard-coded grey in `TypingWorkspace.tsx` (e.g. the personal-best block, history footer, import labels), bypassing the theme tokens. |

## Resolution (TASK-026, verified 2026-09-30)

Every finding is closed on `fix/typing-ux-audit`. "Verified by" names the e2e test in `tests/e2e/typing.spec.ts` (or unit test) that fails if it regresses; all run on desktop and phone Chromium.

| ID | Resolution | Verified by |
|---|---|---|
| UX-01 | Spaces render as real spaces; `.tw-root` grid track is `minmax(0, 1fr)`. Page height went from ~21,000 px to ~2,900 px at 1440 px wide. | "keeps every workspace element inside its own bounds…" (320/390/768/1440 px, geometry not `scrollWidth`) |
| UX-02 | Opt-in `workspaceFirst` shell: workspace precedes the guide, intro compacted. On phones the session bar, passage and metrics precede the settings. | "puts Start and the first line of the passage in the first viewport" (iPhone 13, 664 px tall) |
| UX-03 | 3-line passage window that keeps the active line on the middle row; pure helper `passageWindowStartLine`. | `tests/unit/typing-window.test.ts` (8) and "shows a bounded 3-line passage window that follows the typist" |
| UX-04 | With a bounded passage the metrics sit directly below it, in one row on phones; measured mid-test, the page had scrolled 56 px on desktop and 0 px on a phone (it was 2,662 px before). | geometry and first-viewport tests above |
| UX-05 | Focus moves to the dialog panel, not a field, so trailing keystrokes are not typed into "Typist name"; stats are a tabular row; exports are grouped apart from Discard / Save. | "result dialog keeps stray keystrokes out of its fields…" |
| UX-06 | New text is a secondary button; Start is the single filled action. | "cues where to type, has one primary action…" |
| UX-07 | Settings panels are one row per setting (label left, control right); checkboxes are their own rows. | same test (label and control share a row) |
| UX-08 | Keys flex and shrink inside a container query; no clipping at any width. | geometry test |
| UX-09 | Empty history and per-key panels explain what will appear; averages show "—" until a test exists; the empty chart is hidden. Section count is unchanged by choice (see below). | "history and analytics explain themselves…" |
| UX-10 | Empty-state message, reset moved to its own zone with a scope note, import controls styled as buttons. | same test |
| UX-11 | "Click here and start typing" cue over the idle passage; it never blocks clicks. | "cues where to type…" |
| UX-12 | Geometry-based test replaces the toothless `scrollWidth` check. | UX-01 test |
| UX-13 | Plain-language hints on Net WPM, Consistency and Raw CPM. | visible text; manual |
| UX-14 | Layout and colour inline styles replaced by theme-aware classes (`tw-muted`, `tw-empty`, `tw-danger-zone`, `tw-file-button`, `tw-personal-best`). Remaining inline styles are the computed font size, window offset and dialog helper copy. | review |
| UX-15 (found during verification) | Dark themes rendered stat tiles and panel headings at 1.0–1.9:1 contrast and pending passage text at 2.4–3.1:1. All ten themes now meet 4.5:1. | "every theme keeps text at WCAG AA contrast" (Axe across all ten themes) |

Decisions, so the gap is explicit rather than silent: the thirteen sections were not collapsed into tabs, because that would change keyboard and screen-reader navigation for every panel and the 3-line window already removes the length problem; real screen-reader output (NVDA/VoiceOver) was not tested, only Axe and accessible-name assertions; the export-history, add-typist and custom-text dialogs received no layout changes beyond shared shell styles.

## Root-cause note on UX-01

The fix is two parts and both are required. Rendering spaces as ordinary spaces restores the passage's line-break opportunities; `grid-template-columns: minmax(0, 1fr)` on `.tw-root` stops any future child with a large max-content width from widening the only track. Fixing only the glyph would leave the same trap for the next wide child.

## What was deliberately not changed

The metrics engine, corpora, storage schema, export formats and keyboard shortcuts (Esc, F2, Tab). All existing accessible names and the `tw-stat`, `tw-char`, `tw-caret`, `tw-summary` hooks used by the e2e spec are kept stable so behaviour coverage is preserved.

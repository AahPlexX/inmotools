# Sightline Velocity Studio — Implementation Plan

**As of:** 2026-09-15
**Design:** `docs/superpowers/specs/2026-09-15-sightline-velocity-design.md`
**Catalog slug:** `sightline-velocity`

## Status

In progress. Milestones M1–M4 are implemented on the dedicated `feat/sightline-velocity` branch; M5 verification is active. The ledger in the design document stays authoritative and no item may be dropped without an explicit recorded rejection. Implementation presence is not acceptance: the workstream remains open until the deterministic completion goal below has fresh evidence.

## Deterministic completion goal

This workstream is complete only when all of the following are simultaneously true, verified from fresh evidence:

1. Every item F1–F35 in the design ledger is implemented, reachable through the interface, and does real work — no control is decorative or inert.
2. Focused unit suites cover every engine, and the production TypeScript build passes with no new failure relative to the recorded pre-write baseline (`tests/unit/vector-engine-path-motion.test.ts` was already failing before this workstream began).
3. `tests/e2e/sightline.spec.ts` passes on desktop and mobile Chromium, including routing, ingestion of locally generated fixtures, reader controls, drill scoring, persistence, and download-content assertions for every export.
4. An accessibility sweep of the new route reports no serious or critical violations, and keyboard-only operation covers the reader, the drills, and the exports.
5. Responsive behavior is verified at narrow, medium, and wide viewports with no horizontal overflow and no clipped controls.
6. Exported artifacts are validated by parsing them back: EPUB archive structure, DOCX package, PDF header/page count, HTML metadata tags, CSV/JSON parse.
7. `.tasks` state matches the implementation at every milestone boundary.

Until item 1–7 hold, the workstream stays open in `IN_PROGRESS.md`.

## Slices

1. **Dependency pinning.** `pdfjs-dist@6.3.289`, `rehype-parse@9.0.1`, and `hast-util-to-text@4.0.2` added at exact versions; every other capability is built on packages already present (`jszip`, `fast-xml-parser`, `pdf-lib`, `docx`, `papaparse`, `remark-*`, `unified`, `double-metaphone`, `culori`).
2. **Ingestion engines.** Encoding detection, segmentation, plain text, Markdown, HTML, RTF, DOCX, EPUB, and PDF readers behind one router with a uniform result envelope and per-source diagnostics.
3. **Reading engines.** ORP and RSVP framing, pacing/compensation/ramp controls, typography and gradient generators, palettes, syllabification and readability, session accounting, drills, speech, and metronome.
4. **Persistence.** IndexedDB store for documents, progress, sessions, vocabulary, annotations, and settings with an in-memory fallback and quota reporting.
5. **Export.** HTML, PDF, EPUB, DOCX, Markdown, CSV, and JSON writers plus the metadata/OpenGraph studio.
6. **Workspace UI.** One React workspace with an ingestion panel, library/TOC navigator, reader stage (RSVP, page pacer, anchor-weight, gradient), drill panel, metronome, speech controls, analytics, vocabulary, annotations, settings, and export panels.
7. **Registration.** Catalog entry and `ToolSlug` union, lazy loader entry, e2e spec selection mapping, PWA precache policy for the PDF worker.
8. **Validation.** Unit suites per engine, production build, browser spec on desktop and mobile, accessibility sweep, and export round-trip assertions.
9. **Task state.** `IN_PROGRESS.md` entry at start; `DONE.md` and `WORK_LOG.md` entries only after the completion goal above is satisfied.

## Milestones

- **M1 — Ingestion core.** Slices 1, 2, 7 partially, plus unit suites for every ingestion engine.
- **M2 — Reading engines.** Slice 3 with unit suites for ORP, RSVP, pacing, typography, gradient, palette, syllable, session, drills, and analytics engines.
- **M3 — Workspace.** Slices 4, 6 with persistence tests and a working reader in the browser.
- **M4 — Export.** Slice 5 with export round-trip tests.
- **M5 — Verification.** Slice 8 acceptance sweep, `.tasks` reconciliation, and hand-off report.

## Risks and mitigations

| Risk | Mitigation |
| --- | --- |
| PDF worker and bundled reading fonts increase the PWA precache | Keep the PDF runtime dynamically imported so it stays out of the main application bundle, but precache the emitted module worker and six local WOFF2 reading typefaces so F35 works on a first offline use after installation. Keep heavy unrelated runtimes under the repository's existing `globIgnores` policy and monitor the generated precache size during production builds. |
| Word-boundary speech events are not universally implemented | Detect at runtime; fall back to estimated timing derived from utterance rate and word length; state which path is active in the interface. |
| Large documents stall the main thread | Segmentation and model building are chunked with an explicit document size guard; the reader consumes the prepared model rather than re-segmenting per frame. |
| Export libraries diverge from the reader's model | Every writer consumes the same prepared document model and the same metadata record; round-trip tests parse exported artifacts back. |
| Trademark exposure from commercial technique names | Techniques are implemented and named descriptively; the design document records the marks that were deliberately not used. |

## Verification log

- Pre-write baseline captured 2026-09-15: 97 unit files, 736 passing assertions, 3 pre-existing failures in `tests/unit/vector-engine-path-motion.test.ts`; production build green.
- Dependency verification 2026-09-15: `pdfjs-dist@6.3.289`, `rehype-parse@9.0.1`, `hast-util-to-text@4.0.2`, and all six `@fontsource/*@5.3.0` packages match the current latest registry releases; the dependency vulnerability scan reported no known vulnerabilities in the scanned package set.
- PR #34 validation run `35017105988` at `ec37bf3ff825bdbad5dd65d9e05f5d59f93d5ef8`: frozen install passed and all 407 Sightline unit assertions across 16 Sightline unit files passed inside the repository-wide unit run. The job then stopped on the three pre-existing Vector path-motion failures, so production build and browser validation did not execute in that run.
- M5 now uses `.github/workflows/sightline.yml` on the dedicated `feat/sightline-velocity` branch to run one bounded loop: frozen install, Sightline-only unit suites, production build, and the Sightline desktop/mobile browser spec. The repository-wide Pages gate remains unchanged and is still required before integration.

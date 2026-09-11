# In Progress

- **Vector Studio** — standards-native local vector illustration workspace with 30+ functional creation/editing capabilities, professional export/metadata workflows, responsive accessibility, focused validation, and Pages verification.
  - Design: `docs/superpowers/specs/2026-09-11-vector-studio-design.md`
  - Plan: `docs/superpowers/plans/2026-09-11-vector-studio.md`
  - Current milestone: F — browser validation, adversarial review, integration, and Pages verification
  - Current gate: the focused SVG browser suite is green except for the pan interaction contract; the failure has been narrowed to viewport/scroll coordinate handling and remains open until a fresh browser run passes on desktop and mobile Chromium.
  - Integration gate: dependency-policy updates for exact `@playwright/test@1.63.0` and `pnpm@12.3.4` remain isolated on `chore/vector-deps-pins` until Vector Studio browser validation is green and the branch can be integrated without disturbing parallel work.

- **Photo Studio** — local-first non-destructive photo editor with 30+ functional editing capabilities, professional export/metadata workflow, responsive accessibility, focused validation, and Pages verification.
  - Design: `docs/superpowers/specs/2026-09-11-photo-studio-design.md`
  - Plan: `docs/superpowers/plans/2026-09-11-photo-studio.md`
  - Current milestone: A — foundation and global editor

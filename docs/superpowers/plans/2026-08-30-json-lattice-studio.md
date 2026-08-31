# JSON Lattice Studio — Implementation Plan

## Slice 0 — prerequisite gate
- PlanCraft must be fully green, linked from catalog, and deployed before any JSON Lattice production implementation. **Satisfied by CI run 33351325621.**

## Slice 1 — pure data engines
1. RED tests for JSON/YAML/TOML/XML/CSV normalization and serializers.
2. RED tests for RFC 6902 pointer escaping and add/remove/replace/move/copy/test.
3. RED tests for graph flattening, collapse, ancestor closure, FK links, and cycle guard.
4. Implement only enough to reach GREEN.

## Slice 2 — diff/privacy/schema/query models
1. RED structural diff tests including key-order independence and subtree move detection.
2. RED privacy tests for email/JWT/Bearer/UUID/IP/card masking and non-mutation.
3. RED schema generator tests for TS/Zod/Go/Rust/JSON Schema and optionality from heterogeneous arrays.
4. RED query-row + JSONPath ancestor slicing tests.
5. Implement to GREEN.

## Slice 3 — layout/export/state
1. RED tests for ELK graph request direction mapping, deterministic viewport model, SVG/CSV export, and 100-step history.
2. Add dependencies and worker layout implementation.
3. Implement raster export using local SVG-to-canvas conversion.
4. Full unit + typecheck gate.

## Slice 4 — React workspace
1. RED Playwright contract for catalog link and `#/json-lattice` alias.
2. RED browser workflow: edit canonical JSON, inline graph edit, search, collapse, privacy shield, diff, schema output, JSONPath slice, export controls.
3. Build CodeMirror editor, worker client, dual-layer viewport, minimap, inspector, responsive drawers, keyboard shortcuts, autosave/session state.
4. Integrate optional DuckDB SQL panel using existing local DuckDB client.
5. Axe severe/critical gate and mobile no-overflow gate.

## Slice 5 — verification/release
- Unit suite.
- TypeScript/Vite production build.
- Playwright desktop + mobile suite.
- GitHub Pages artifact + deploy.
- Explicit homepage catalog link assertion for JSON Lattice.
- Final code/spec review; no completion claim until all gates are green.

---
tool: json-lattice
folder: src/tools/lattice
doc: tracker
basis: as-built
status: active
spec: docs/superpowers/specs/2026-10-05-json-lattice-design.md
tracker: src/tools/lattice/TRACKER.md
updated: 2026-10-05
---

# JSON Lattice Studio — tracker

## Resume here

71 requirements: 39 verified, 20 implemented, 8 partial, 4 missing, 0 prohibited. Next action: build the missing rows in the Open work order, starting with JLS-R49 (diff drawn on the graph). No blocker.

## Documents

- Spec: [2026-10-05-json-lattice-design.md](../../../docs/superpowers/specs/2026-10-05-json-lattice-design.md)
- Older design and plans (history): [2026-08-30-json-lattice-studio-design.md](../../../docs/superpowers/specs/2026-08-30-json-lattice-studio-design.md), [2026-08-30-json-lattice-studio.md](../../../docs/superpowers/plans/2026-08-30-json-lattice-studio.md), [2026-10-01-json-lattice-studio-audit.md](../../../docs/superpowers/plans/2026-10-01-json-lattice-studio-audit.md)
- Task history: TASK-002 in [.tasks/DONE.md](../../../.tasks/DONE.md)
- Dark-theme contrast task: [T-repository-dark-contrast-20261004-b7d2](../../../.tasks/items/T-repository-dark-contrast-20261004-b7d2.md)
- Index row: [TOOL_INDEX.md](../../../docs/TOOL_INDEX.md)
- Unit tests: `tests/unit/lattice-*.test.ts`; browser tests: `tests/e2e/lattice.spec.ts`, `tests/e2e/audit-hardening.spec.ts`, `tests/e2e/accessibility.spec.ts`

## Requirement status

`unit` = `tests/unit/lattice-*.test.ts`; `e2e` = `tests/e2e/lattice.spec.ts` unless another file is named.

| ID | Status | Evidence | Notes |
| --- | --- | --- | --- |
| JLS-R01 | verified | unit "normalizes JSON, YAML, TOML, XML, and CSV into JSON-compatible values" | |
| JLS-R02 | implemented | `changeFormat` in `LatticeWorkspace.tsx` | No test switches the input format |
| JLS-R03 | partial | e2e (`tests/e2e/audit-hardening.spec.ts`) "re-importing an edited file with the same name is picked up" | Only a `.json` file is opened in a test; format detection for `.yaml`, `.toml`, `.xml`, `.csv` has no test |
| JLS-R04 | verified | e2e (`tests/e2e/audit-hardening.spec.ts`) "re-importing an edited file with the same name is picked up" | |
| JLS-R05 | verified | unit "preserves lexically significant identifiers while retaining lossless scalar inference" | |
| JLS-R06 | verified | unit "rejects malformed XML instead of normalizing mismatched element tags" | |
| JLS-R07 | verified | unit "rejects JSON numbers that JavaScript cannot preserve exactly" | |
| JLS-R08 | verified | e2e "blocks exports while source edits are pending or invalid instead of exporting the last valid revision" | |
| JLS-R09 | implemented | `LatticeEditor.tsx` (line numbers, `jsonParseLinter`, `lintGutter`, `searchKeymap`) | |
| JLS-R10 | missing | — | `LatticeEditor.tsx` replaces the whole document on external updates |
| JLS-R11 | verified | unit "builds stable RFC 6901 paths and foreign-key cross-links" | |
| JLS-R12 | verified | unit "builds stable RFC 6901 paths and foreign-key cross-links" | |
| JLS-R13 | verified | unit "terminates safely when a cyclic JavaScript object reaches the traversal seam" | |
| JLS-R14 | verified | unit "executes a graph with the empty root JSON Pointer through ELK and restores the root path", "normalizes worker layout geometry into a viewport-friendly model" | |
| JLS-R15 | verified | unit "maps all four public directions to ELK layered directions", "builds an ELK layered request without losing stable graph paths" | |
| JLS-R16 | verified | unit "sizes graph nodes from label length instead of swapping one fixed box for another", "reserves wrapped height for long keys after node width reaches its cap" | |
| JLS-R17 | implemented | `title` on `.lattice-node` and `.lattice-node-value` in `LatticeViewport.tsx` | |
| JLS-R18 | verified | e2e "edits bidirectionally, searches, collapses subtrees, and supports undo/redo"; unit "keeps collapsed parents while omitting their descendants" | |
| JLS-R19 | implemented | `collapseAll`, `expandAll` in `LatticeWorkspace.tsx` | |
| JLS-R20 | partial | e2e "edits bidirectionally, searches, collapses subtrees, and supports undo/redo" | Visible count is tested; Loaded and Rendered counts are not |
| JLS-R21 | verified | unit "virtualizes layout nodes to the visible world rectangle while preserving an active node" | |
| JLS-R22 | verified | e2e "touch users can pan the graph and zoom it with the on-screen controls" | |
| JLS-R23 | verified | e2e "touch users can pan the graph and zoom it with the on-screen controls" | |
| JLS-R24 | verified | unit "normalizes mouse-wheel and trackpad deltas, and pinches faster" | |
| JLS-R25 | implemented | Two-pointer pinch in `LatticeViewport.tsx` (`pinchRef`) | No test pinches |
| JLS-R26 | verified | unit "fits graph bounds into the available viewport with padding", "does not fit past the interactive zoom cap"; e2e "touch users can pan the graph and zoom it with the on-screen controls" | |
| JLS-R27 | partial | unit "reports the world rectangle currently on screen" | View rectangle is tested; panning by minimap click or drag has no test |
| JLS-R28 | verified | e2e "edits bidirectionally, searches, collapses subtrees, and supports undo/redo" | |
| JLS-R29 | partial | unit "centers a node without changing the current zoom" | Centring is tested; previous / next buttons and Enter / Shift+Enter have no test |
| JLS-R30 | verified | e2e "edits bidirectionally, searches, collapses subtrees, and supports undo/redo" | |
| JLS-R31 | implemented | `.lattice-edit` button in `LatticeViewport.tsx` | |
| JLS-R32 | verified | e2e "edits bidirectionally, searches, collapses subtrees, and supports undo/redo" | |
| JLS-R33 | implemented | `renameSelected` in `LatticeWorkspace.tsx` | |
| JLS-R34 | missing | — | Keys are renamed only from the inspector (JLS-R33) |
| JLS-R35 | implemented | `removeSelected` in `LatticeWorkspace.tsx` | |
| JLS-R36 | implemented | `addChild` in `LatticeWorkspace.tsx` | |
| JLS-R37 | verified | unit "applies add, remove, replace, copy, move, and test sequentially without mutating source", "rejects a failed test operation instead of partially accepting the patch sequence", "escapes and resolves RFC 6901 pointer segments exactly" | |
| JLS-R38 | verified | unit "caps undo history at 100 committed states and supports undo/redo", "clears redo history after a new branch commit"; e2e "edits bidirectionally, searches, collapses subtrees, and supports undo/redo" | |
| JLS-R39 | implemented | `keydown` handler in `LatticeWorkspace.tsx` | |
| JLS-R40 | implemented | `editPrimitive` guard in `LatticeWorkspace.tsx` | |
| JLS-R41 | implemented | `.lattice-inspector-list` in `LatticeWorkspace.tsx` | |
| JLS-R42 | implemented | `copyText` in `LatticeWorkspace.tsx` | |
| JLS-R43 | verified | unit "masks supported secret/PII classes without mutating source"; e2e "provides privacy, diff, schema, JSONPath, and local DuckDB query workflows" | |
| JLS-R44 | verified | unit "can produce deterministic presentation-safe mock values" | |
| JLS-R45 | implemented | `exportProtectedJson` in `LatticeWorkspace.tsx` | e2e checks only that the button follows the revision state |
| JLS-R46 | implemented | `displayValue` feeds the graph and SVG/raster exports in `LatticeWorkspace.tsx` | |
| JLS-R47 | verified | unit "ignores object key order and reports insert/delete/modify deterministically"; e2e "provides privacy, diff, schema, JSONPath, and local DuckDB query workflows" | |
| JLS-R48 | verified | unit "reconciles a unique equivalent subtree as a move instead of delete plus insert" | |
| JLS-R49 | missing | — | Diff is reported as counts only (`diff-summary`) |
| JLS-R50 | verified | unit "generates TypeScript, Zod, Go, and Rust targets from one inferred shape" | |
| JLS-R51 | verified | unit "generates Draft-07 and 2020-12 schemas with sample-derived required fields" | |
| JLS-R52 | implemented | Copy schema button in `LatticeWorkspace.tsx` | |
| JLS-R53 | verified | unit "returns JSONPath matches and their full ancestor closure"; e2e "provides privacy, diff, schema, JSONPath, and local DuckDB query workflows" | |
| JLS-R54 | partial | unit "returns matches plus every structural ancestor for subgraph isolation" | The ancestor closure is tested; the slice checkbox in the workspace has no test |
| JLS-R55 | verified | unit "creates deterministic relational json_tree rows"; e2e "provides privacy, diff, schema, JSONPath, and local DuckDB query workflows" | |
| JLS-R56 | verified | e2e "pages a large local SQL result instead of mounting every row" | |
| JLS-R57 | implemented | `.lattice-sql-error` alert in `LatticeWorkspace.tsx` | |
| JLS-R58 | missing | — | Only JSONPath results slice the graph |
| JLS-R59 | verified | unit "exports a self-contained semantic SVG without script content", "keeps full node labels in SVG metadata instead of silently truncating them", "wraps long SVG keys while retaining the complete key in metadata"; e2e "exposes local vector/raster/data exports without serious accessibility or overflow defects" | |
| JLS-R60 | partial | unit "rejects unsafe raster dimensions before creating a browser canvas" | The size limit is tested; no test downloads a PNG or JPEG |
| JLS-R61 | verified | unit "exports deterministic relational CSV rows for the canonical document" | |
| JLS-R62 | verified | unit "serializes canonical data without mutating it" | |
| JLS-R63 | implemented | `exportXml` in `LatticeWorkspace.tsx` | No test serializes XML |
| JLS-R64 | verified | e2e "blocks exports while source edits are pending or invalid instead of exporting the last valid revision" | |
| JLS-R65 | verified | e2e "blocks exports while source edits are pending or invalid instead of exporting the last valid revision" | |
| JLS-R66 | implemented | `STORAGE_KEY` save and `loadInitial` in `LatticeWorkspace.tsx` | No reload test |
| JLS-R67 | implemented | Clear saved session button in `LatticeWorkspace.tsx` | |
| JLS-R68 | verified | e2e "JSON Lattice catalog link, exact alias, and generic route open the same local workspace" | |
| JLS-R69 | partial | `.tasks/items/T-repository-dark-contrast-20261004-b7d2.md` | The 2026-10-04 `E2E_THEME=dark` axe run found no violation on this route; the workspace uses its own fixed dark palette (`.lattice-studio` in `src/styles.css`) and does not switch to the light theme |
| JLS-R70 | partial | e2e "reflows after real content load in phone portrait, phone landscape, and tablet viewports", "exposes local vector/raster/data exports without serious accessibility or overflow defects" | Tested at 390, 844, 768 and 1440 px; 320, 1920 and 2560 px have no test |
| JLS-R71 | verified | e2e "exposes local vector/raster/data exports without serious accessibility or overflow defects"; e2e (`tests/e2e/accessibility.spec.ts`) "has no serious or critical axe violations at <route>" | |

## Open work

1. JLS-R49 diff drawn on the graph; JLS-R58 SQL results slice the graph.
2. JLS-R34 key editing on the graph node; JLS-R10 editor keeps selections on external updates.
3. JLS-R69 workspace follows the light site theme.
4. Tests for the `partial` and `implemented` rows: JLS-R70 (320, 1920, 2560 px), R27, R29, R54, R60, R03, R20, then the inspector, export and session rows.

## Known limitations

- Privacy Shield and the dashed id links are heuristics; the workspace says so.
- DuckDB-Wasm and very large documents are bounded by browser memory; raster exports are capped at 4096 × 4096 px.
- The minimap draws at most 1,200 nodes.

## Verification evidence

- 2026-10-05, `expand/json-lattice` from `main` @ `5fb22493`: `pnpm tool:check json-lattice --base origin/main` 39/71, no errors; `pnpm docs:sync` and `pnpm docs:check` passed; `pnpm exec vitest run tests/unit/cad-progress.test.ts tests/unit/sheets-wave-b.test.ts tests/unit/deployment-config.test.ts` 23 passed.

## Change log

- 2026-10-05 — Created per `docs/DOCUMENTATION_STANDARD.md`.

# JSON Lattice Studio — Design Specification

> **Historical record (banner added 2026-10-05).** Written before the current workflow. Branches, pull requests, PR numbers and registration steps mentioned here (`src/catalog.ts` entries, `workspaces.tsx` loaders, `ToolSlug`, `.tasks/IN_PROGRESS.md`, `.tasks/config.json` IDs) are no longer used: tools register through `src/tools/<folder>/<slug>.meta.ts`, work starts with `pnpm task:start`, and pushes merge without pull requests ([AGENTS.md](../../../AGENTS.md)). Feature facts and evidence below stay valid as a record; current status is in the tool's tracker or task file.

**Date:** 2026-08-30
**Route:** `#/json-lattice` with canonical catalog route `#/tools/json-lattice`
**Execution:** 100% browser-local, static GitHub Pages, no authentication or backend

## Integration

JSON Lattice is a new registry-driven InmoTools workspace. `json-lattice` is added to `ToolSlug`, `TOOLS`, the lazy workspace loader, and the hash alias resolver. The normal catalog row remains the durable homepage link.

## Canonical data pipeline

All supported text formats normalize into a JSON-compatible canonical value before graph work. Parsers are isolated behind `parseStructuredText()` and serializers behind `serializeStructuredData()`. Supported ingestion: JSON, YAML, TOML, XML, CSV. Exports: JSON, YAML, TOML, flattened CSV, SVG, PNG, JPEG.

Current package choices verified on 2026-08-30:
- `elkjs@0.12.0` — layered graph layout, executed inside our module Web Worker.
- `@codemirror/lang-json@6.0.2`, `@codemirror/lint@6.9.7`, `@codemirror/search@6.7.1` — JSON language/lint/search on the existing CodeMirror 6 stack.
- `yaml@2.9.0` — browser-capable YAML parser/stringifier.
- `smol-toml@1.8.0` — TOML parser/stringifier.
- `fast-xml-parser@5.11.1` — ESM/browser XML parser.
- `papaparse@5.7.0` + `@types/papaparse@5.5.2` — browser CSV parsing/unparsing.
- `jsonpath-plus@10.4.0` — JSONPath execution.
- Existing `@duckdb/duckdb-wasm` infrastructure is reused; it remains worker-backed and local.
- Existing `svgo` and download helpers are reused.

RFC 6902 operations are implemented locally against JSON Pointer paths (`add`, `remove`, `replace`, `move`, `copy`, `test`) rather than adding a stale patch dependency. Graph edits produce atomic patch records and snapshot history is capped at 100 states.

## Public engine seams

- `format-engine.ts`: parse/serialize and JSON-safe normalization.
- `patch-engine.ts`: JSON Pointer + RFC 6902 operation application.
- `graph-engine.ts`: tree flattening, collapse filtering, ancestor closure, FK cross-links, cycle guard.
- `diff-engine.ts`: structural insert/delete/modify/move classification.
- `privacy-engine.ts`: local secret/PII detection and masking/mock substitution.
- `schema-engine.ts`: TypeScript, Zod, Go, Rust Serde, JSON Schema Draft-07/2020-12 generation.
- `query-engine.ts`: JSONPath slicing plus DuckDB `json_tree` row conversion.
- `export-engine.ts`: SVG model export, rasterization helpers, flattened CSV.
- `layout-worker.ts`: ELK layered layout only; no React state inside worker.

## Graph model

Each graph node has a stable RFC 6901 pointer path, parent pointer, display key, value type, primitive preview, depth, child count, and optional diff/privacy/FK metadata. Parent-child edges remain separate from cross-link edges. Object/array nodes are collapsible. A WeakMap/WeakSet traversal guard prevents runaway traversal if a non-JSON cyclic object reaches the engine.

## Viewport

The graph viewport uses a base Canvas for visible edge/node rendering and a DOM overlay for only on-screen interactive nodes. An `OffscreenCanvas` buffer is used when available before compositing into the visible base canvas; a regular in-memory canvas is the fallback. Panning/zooming is matrix-based and high-DPI aware. The minimap renders the full layout bounds at reduced scale. DOM virtualization is capped to a bounded number of interactive overlays while Canvas rendering uses viewport culling.

## Bidirectional editing

Primitive values and property keys are editable from graph overlays. Value edits emit `replace`; key renames emit `move` to the renamed pointer. Inspector actions expose `add` and `remove`. Every accepted patch updates canonical data, formatted editor text, graph state, and 100-step undo/redo history. CodeMirror applies external text updates via a minimal changed range so selections outside the changed range remain stable.

## Diff

Diff mode parses a second payload into the same canonical model. Structural comparison is key-order independent for objects. Insertions, deletions, and mutations are path-aware. Move detection pairs equivalent subtree fingerprints at different paths and emits dashed move connectors. Deleted nodes are retained as tombstone visual nodes only in diff view.

## Privacy shield

Detection categories: email, JWT, Bearer token, UUID, IPv4, IPv6, payment-card-like digit sequences (with Luhn confirmation), and key-name secret hints. Shielding never mutates the source document unless the user explicitly chooses an export-safe redacted copy; graph presentation and image/vector exports use a derived protected model.

## Query slicing

`json_tree` is a deterministic flattened row set (`path`, `parent_path`, `key`, `type`, `value_text`, `value_json`, `depth`). DuckDB-Wasm queries run against a registered local JSON representation of these rows. Query results carrying `path` are converted into a subgraph containing matches and all ancestors. JSONPath uses the same ancestor-closure seam.

## Schema generation

Schema inference recursively merges object shapes across array members so properties absent from some samples become optional. Generators derive from one inferred type tree to avoid target drift. JSON Schema supports selectable Draft-07 and 2020-12 `$schema` identifiers. Generated code is a local convenience artifact and should still be reviewed for domain semantics.

## Safety and truthfulness

- “50,000+ nodes” is treated as an architecture target, not an unmeasured performance claim. The implementation uses worker layout and viewport virtualization, and UI reports actual loaded/rendered node counts.
- Privacy Shield is a heuristic detector, not a guarantee that all sensitive information is found.
- FK cross-links are convention-based suggestions and remain visually distinct from structural parent/child edges.
- DuckDB memory remains subject to browser/Wasm memory limits.

## Audit addendum — 2026-10-01

This addendum records production-audit resolutions. It does not replace the sections above.

- Search jumps to the previous or next match and centers that node. Enter / Shift+Enter do the same.
- The minimap shows the current view rectangle and pans on click or drag.
- Wheel zoom uses a non-passive listener, normalizes line/page/pixel deltas, and treats ctrl/meta+wheel as pinch. Two-finger pinch zooms on touch.
- Fit runs when the layout changes, not on every resize, so a pan is not thrown away when mobile browser chrome shows or hides.
- Node values keep their full text in a tooltip instead of a silent 88-character cut.
- Inspector can copy the JSON Pointer and the JSON value. Schema output can be copied. XML export sits beside the existing JSON/YAML/TOML/CSV exports.
- Collapse all / Expand all, an on-node Edit control for touch, and title tooltips on primary controls are part of the workspace.
- Status, revision, and disclaimer copy names what the user can do. Revision text still contains `current`, `pending`, and `invalid` for the existing checks.
- Direct competitors for this surface are JSON Crack (graph, fold, search, image export), JSON Hero (path copy, inferred types), and JSON Editor Online (tree edit, format convert). Lattice already covers multi-format parse, privacy substitution, structural diff, schema targets, and local SQL. The items above close the graph-navigation and path-copy gaps those tools have, without a server or an account.

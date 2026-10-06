---
tool: json-lattice
folder: src/tools/lattice
doc: spec
basis: as-built
status: active
spec: docs/superpowers/specs/2026-10-05-json-lattice-design.md
tracker: src/tools/lattice/TRACKER.md
updated: 2026-10-05
---

# JSON Lattice Studio — spec

As built at `origin/main` `5fb22493`. Requirement prefix: `JLS`. Status of each requirement: [TRACKER.md](../../../src/tools/lattice/TRACKER.md). History: [2026-08-30-json-lattice-studio-design.md](2026-08-30-json-lattice-studio-design.md) (with its 2026-10-01 audit addendum), plans [2026-08-30-json-lattice-studio.md](../plans/2026-08-30-json-lattice-studio.md) and [2026-10-01-json-lattice-studio-audit.md](../plans/2026-10-01-json-lattice-studio-audit.md).

## Purpose

Load structured data (JSON, YAML, TOML, XML, CSV) into one local document, explore and edit it as a graph, compare it with another payload, hide sensitive values, generate schemas, query it with JSONPath or SQL and export data or the graph, for developers, data engineers and security reviewers, without uploading anything.

## Scope

In scope:
- Parsing and converting the five text formats; a source editor kept in sync with the graph.
- Graph layout, navigation, search, collapse, inline editing and patch-based history.
- Privacy Shield, structural diff, schema generation, JSONPath and local DuckDB SQL.
- Data exports (JSON, YAML, TOML, XML, CSV, raw source, protected JSON) and graph exports (SVG, PNG, JPEG); autosave in this browser.

Out of scope: nothing is excluded beyond the platform rules.

## Constraints

- Platform rules: no accounts or authentication; no server or server-side database (static files on GitHub Pages); everything runs in the browser and data stays in this browser (localStorage key `inmotools:json-lattice:v1`); network use only for the site's own files ([DOCUMENTATION_STANDARD.md](../../DOCUMENTATION_STANDARD.md#platform-rules-apply-to-every-tool-and-every-spec)).
- No large language models; other ML only on the device under the ML ruleset.
- WebAssembly runs single-threaded: GitHub Pages cannot send COOP/COEP headers. DuckDB-Wasm and large documents are bounded by browser memory.
- Libraries as pinned in `package.json`: `elkjs` 0.12.0 (layered layout in a Web Worker), CodeMirror 6 (`@codemirror/lang-json` 6.0.2), `yaml` 2.9.0, `smol-toml` 1.8.0, `fast-xml-parser` 5.11.1, `papaparse` 5.7.0, `jsonpath-plus` 10.4.0, `@duckdb/duckdb-wasm` 1.32.0 through the shared DuckDB client.
- Paths are RFC 6901 JSON Pointers; edits are RFC 6902 operations. The storage key, file names (`json-lattice.*`) and accessible names are not changed.

## Architecture and engine

- Engines and libraries: `yaml@2.9.0`, `smol-toml@1.9.0`, `fast-xml-parser@5.11.1` and `papaparse@5.7.0` parse and write YAML, TOML, XML and CSV; `jsonpath-plus@10.4.0` runs JSONPath queries; `elkjs@0.12.0` lays out the graph; `@duckdb/duckdb-wasm@1.32.0` runs the local SQL panel (through the shared `src/tools/duckdb/duckdb-client.ts`); `@codemirror/state@6.7.1`, `@codemirror/view@6.43.9`, `@codemirror/commands@6.11.1`, `@codemirror/search@6.7.1`, `@codemirror/lint@6.9.7` and `@codemirror/lang-json@6.0.2` provide the editor.
- Workers: `layout-worker.ts` wraps the ELK layered layout in a Web Worker created from `elkjs/lib/elk-worker.min.js`; the SQL panel starts the DuckDB-Wasm worker on first use, in an in-memory database.
- Storage: localStorage key `inmotools:json-lattice:v1` holds the autosaved source, format, collapsed paths and layout direction; a button clears it.
- Browser APIs: Web Workers run the layout and SQL engine; if the layout worker cannot start, the graph shows the error and the editor keeps working. Canvas 2D measures text and rasterises PNG and JPEG graph exports; the Clipboard API copies values; Blob downloads save exports.

## Requirements

### Input and parsing

| ID | Requirement | Acceptance test |
| --- | --- | --- |
| JLS-R01 | JSON, YAML, TOML, XML (attributes as `@name`) and CSV (header row) are parsed into one JSON-compatible document | The same order in each format yields the same document |
| JLS-R02 | Changing the input format rewrites the editor text in the chosen format; a document the format cannot hold leaves the text and names the reason | Switching JSON to YAML shows YAML; an array root to TOML reports the error |
| JLS-R03 | Opening a local file loads it and picks the format from its extension (`.json`, `.yaml`/`.yml`, `.toml`, `.xml`, `.csv`) | Opening `data.yaml` sets Input format to YAML |
| JLS-R04 | Re-opening an edited file with the same name loads the new content | A second `payload.json` replaces the first in the editor |
| JLS-R05 | XML and CSV scalars become numbers or booleans only when their text survives the conversion exactly; identifiers such as `00123` stay text | `00123` stays a string, `7` becomes a number |
| JLS-R06 | Malformed XML is rejected with an error instead of being normalised | Mismatched tags give an "XML parse failed" error |
| JLS-R07 | JSON numbers that JavaScript cannot hold exactly are rejected with a message asking to quote them | `12345678901234567890` is refused |
| JLS-R08 | Source text is parsed after a short pause (140 ms); a revision badge shows current, pending or invalid, and a parse error is shown as an alert | Typing `{` shows "invalid" and an error |
| JLS-R09 | The source editor shows line numbers, an active-line highlight, editor search, and JSON syntax with a lint gutter when the format is JSON | A JSON syntax error is marked in the gutter |
| JLS-R10 | Updates pushed into the editor from the graph change only the edited range, so a selection elsewhere in the text is kept | After a graph edit, a selection on another line is unchanged |

### Graph

| ID | Requirement | Acceptance test |
| --- | --- | --- |
| JLS-R11 | Every value becomes a graph node with a stable RFC 6901 path, key, type, depth and child count, joined to its parent by an edge | `/order/status` is a child of `/order` |
| JLS-R12 | Fields named `*_id` or `*Id` whose value matches an `id` elsewhere are drawn as dashed possible links, separate from structural edges | `owner_id: "team-1"` links to the node with `id: "team-1"` |
| JLS-R13 | A cyclic object reaching the graph builder is shown once and marked as a cycle instead of looping | A self-referencing object terminates with a cycle node |
| JLS-R14 | The graph is laid out off the main thread (ELK layered layout in a Web Worker); a layout failure is shown as "Layout failed" with the error | The root path survives a worker layout run |
| JLS-R15 | Layout direction can be left → right, top → bottom, right → left or bottom → top | Each choice maps to the matching ELK direction |
| JLS-R16 | Node boxes are sized from their label length up to a cap; long keys wrap and get the height they need | A long key gives a taller node at the width cap |
| JLS-R17 | A node's full key and value are available in its tooltip; nothing is cut silently | Hovering a long value shows the whole text |
| JLS-R18 | Each object or array node can be collapsed and expanded, hiding its descendants | Collapsing `/items` lowers the visible count from 11 to 5 |
| JLS-R19 | Collapse all folds every container; Expand all shows every node | Collapse all leaves only the root visible |
| JLS-R20 | The workspace shows loaded, visible and rendered node counts | Collapsing a subtree lowers Visible but not Loaded |
| JLS-R21 | Only nodes inside the visible area (plus a margin and the selected node) are mounted | Panning away unmounts off-screen nodes |

### Navigation and search

| ID | Requirement | Acceptance test |
| --- | --- | --- |
| JLS-R22 | Dragging empty canvas with a mouse or one finger pans the graph; the canvas takes touch gestures instead of scrolling the page | A one-finger drag changes the graph transform |
| JLS-R23 | − and + buttons zoom around the centre between 12% and 300%, with the zoom percentage shown | Zoom in raises the percentage; the buttons disable at the limits |
| JLS-R24 | Wheel zoom normalises line, page and pixel deltas; Ctrl/Cmd + wheel (trackpad pinch) zooms faster | A line-mode wheel step and a pixel step zoom by comparable factors |
| JLS-R25 | Two-finger pinch on a touch screen zooms the graph | Spreading two fingers zooms in |
| JLS-R26 | Fit graph fits the whole layout in view, capped at 300%; fitting happens once per new layout, not on every resize | Fit graph restores the starting zoom |
| JLS-R27 | A minimap shows the layout (first 1,200 nodes, cap named in its tooltip) with the current view rectangle; clicking or dragging it moves the view | Clicking the minimap's far corner moves the view there |
| JLS-R28 | Search matches key, value, type or path, highlights matching nodes and shows the match count | Searching `paid` shows 1 match |
| JLS-R29 | Previous / next match buttons, Enter and Shift+Enter select the next or previous match and centre it without changing zoom | Enter moves to match 2 of 2 and centres it |

### Editing and history

| ID | Requirement | Acceptance test |
| --- | --- | --- |
| JLS-R30 | Double-clicking a primitive node edits it in place; numbers must be finite and booleans `true` / `false`; Enter commits, Escape cancels | Editing `/status` to `refunded` updates the node |
| JLS-R31 | The selected primitive node shows an Edit button for touch users | Tapping Edit opens the inline editor |
| JLS-R32 | Graph edits rewrite the source text in the current format | After an inline edit the editor contains the new value |
| JLS-R33 | The inspector renames the selected property and refuses a name that already exists | Renaming to an existing key reports "already exists" |
| JLS-R34 | A property key can be edited directly on its graph node | Double-clicking a key on the graph opens a key editor |
| JLS-R35 | The inspector removes the selected node; the root cannot be removed | Remove node deletes `/email` |
| JLS-R36 | The inspector adds a child to the selected object (with a key) or array (appended), parsing the value as JSON or keeping it as text | Adding `{"a":1}` to an array appends an object |
| JLS-R37 | Edits are RFC 6902 operations (add, remove, replace, move, copy, test) applied in order; a failed test rejects the whole patch and the source is never mutated | A failing `test` leaves the document unchanged |
| JLS-R38 | Undo and Redo step through up to 100 committed states; a new edit after undo clears redo | Undo restores `paid`; Redo restores `refunded` |
| JLS-R39 | Ctrl/Cmd+Z undoes and Ctrl/Cmd+Y or Ctrl/Cmd+Shift+Z redoes when focus is outside text fields | Ctrl+Z on the graph undoes the last edit |
| JLS-R40 | While Privacy Shield is on, graph edits are refused with a message and the source is unchanged | Editing a node with the shield on shows the message |

### Inspector

| ID | Requirement | Acceptance test |
| --- | --- | --- |
| JLS-R41 | The inspector shows the selected node's path, type, key, depth, child count and value | Selecting `/status` shows key `status`, type string |
| JLS-R42 | Copy path copies the JSON Pointer and Copy value copies the value as JSON; a blocked clipboard is reported | Copy path puts `/status` on the clipboard |

### Privacy Shield

| ID | Requirement | Acceptance test |
| --- | --- | --- |
| JLS-R43 | Privacy Shield detects emails, JWTs, Bearer tokens, UUIDs, IPv4, IPv6, Luhn-valid card numbers and secret-named keys (password, secret, api key, token) and masks them in the graph, without changing the source | `buyer@example.com` shows as `[REDACTED_EMAIL]`; the editor still has the address |
| JLS-R44 | Protection mode Mock replaces findings with stable stand-in values (the same input gives the same stand-in) | Two runs give identical mock values |
| JLS-R45 | Export protected JSON downloads a copy with protected values substituted | The file has no original email |
| JLS-R46 | With the shield on, graph search and SVG, PNG and JPEG exports use the protected values | An SVG exported with the shield on has no original email |

### Diff

| ID | Requirement | Acceptance test |
| --- | --- | --- |
| JLS-R47 | Diff mode compares the document with a pasted comparison JSON, ignoring object key order, and reports modified, deleted, inserted and moved counts | Changing `status` and emptying `items` reports modified and deleted |
| JLS-R48 | A unique equal subtree found at a different path is reported as a move, not a delete plus an insert | A moved object counts as 1 moved |
| JLS-R49 | Diff results are drawn on the graph: changed nodes marked, deleted nodes kept as tombstones and moves drawn as dashed connectors | A deleted key appears as a tombstone in diff mode |

### Schema generation

| ID | Requirement | Acceptance test |
| --- | --- | --- |
| JLS-R50 | Generates TypeScript, Zod, Go and Rust Serde types from one inferred shape; properties missing from some array members are optional | A key present in one of two rows is optional in every target |
| JLS-R51 | Generates JSON Schema Draft-07 and 2020-12 with `required` lists from the sample | The 2020-12 output has the 2020-12 `$schema` |
| JLS-R52 | Copy schema copies the selected target's output | The clipboard holds the TypeScript interface |

### Query

| ID | Requirement | Acceptance test |
| --- | --- | --- |
| JLS-R53 | A JSONPath query reports its match count and the number of nodes including ancestors | `$.items[*].sku` gives 2 matches |
| JLS-R54 | "Slice graph to matches + ancestors" limits the graph to the JSONPath matches and their ancestors | With slicing on, only matched paths and ancestors are visible |
| JLS-R55 | SQL runs in local DuckDB-Wasm against a `json_tree` table (path, parent_path, key, type, value_text, value_json, depth) of the current document | `SELECT path, value_text FROM json_tree WHERE key = 'status'` returns `/status`, `paid` |
| JLS-R56 | SQL results are shown 100 rows per page with paging controls | `range(1000)` shows rows 1–100 of 1000; Last shows 901–1000 |
| JLS-R57 | A failed SQL query shows its error inline beside Run SQL | `SELECT nope` shows an alert |
| JLS-R58 | SQL results that include a `path` column can slice the graph to those paths and their ancestors | Slicing from a SQL result shows only the returned paths |

### Export

| ID | Requirement | Acceptance test |
| --- | --- | --- |
| JLS-R59 | Export SVG downloads a self-contained SVG (no script) with full node keys and values kept in metadata | `json-lattice.svg` has no `<script>` and keeps a long key whole |
| JLS-R60 | Export PNG and Export JPEG render the graph at 2× and refuse sizes above 4096 × 4096 px with a message to export SVG | An oversized graph reports the canvas limit |
| JLS-R61 | Export CSV downloads the flattened table (path, parent_path, key, type, value_text, value_json, depth) | The header row matches the column list |
| JLS-R62 | Export JSON, YAML and TOML download the parsed document in that format; TOML needs an object root | Each export parses back to the same document |
| JLS-R63 | Export XML downloads the parsed document as XML | `json-lattice.xml` is well-formed |
| JLS-R64 | Export raw source saves the editor text exactly as typed, with the extension of the current format, even when it does not parse | Invalid text exports as `json-lattice-source.json` |
| JLS-R65 | Parsed and graph exports are disabled while the source is pending or invalid, so the last valid revision is never exported by mistake | Typing `{` disables Export JSON |

### Session and routes

| ID | Requirement | Acceptance test |
| --- | --- | --- |
| JLS-R66 | Source text, format, collapsed nodes and layout direction are saved in this browser and restored on the next visit | Reloading keeps the edited source |
| JLS-R67 | Clear saved session forgets the autosaved session | After clearing and reloading, the sample document returns |
| JLS-R68 | The catalog link, `#/json-lattice` and `#/tools/json-lattice` open the same workspace, which states that data stays in the browser | All three routes show the workspace |

## Non-functional requirements

| ID | Requirement | Acceptance test |
| --- | --- | --- |
| JLS-R69 | Workspace follows the site-wide theme chosen in the site header (light, dark, system) and passes the colour-contrast check in dark | With each theme stored, the workspace uses it; `E2E_THEME=dark` axe has no `color-contrast` violation |
| JLS-R70 | No horizontal page overflow at any width from 320 to 2560 px | Overflow ≤ 1 px at 320, 390, 768, 844, 1440, 1920 and 2560 px |
| JLS-R71 | No serious or critical axe violations on the workspace | axe on `#/tools/json-lattice` reports none |

## Definition of done

The tool is complete when every requirement is `verified` or `prohibited`, and the completion gates in `.tasks/PROJECT_COMPLETION.md` are met.

## Technique decisions

None: no function was compared between an ML and a non-ML method.

## Intent not recorded

None.

## Change log

- 2026-10-05 — Created.

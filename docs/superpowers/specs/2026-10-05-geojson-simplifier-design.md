---
tool: geojson-simplifier
folder: src/tools/geo
doc: spec
basis: as-built
status: active
spec: docs/superpowers/specs/2026-10-05-geojson-simplifier-design.md
tracker: src/tools/geo/TRACKER.md
updated: 2026-10-05
---

# GeoJSON Simplifier — spec

As built at `origin/main` `c371f847`. Requirement prefix: `GJS`. Status of each requirement: [TRACKER.md](../../../src/tools/geo/TRACKER.md). History: the Tool 14 section of [2026-08-29-next-ten-local-tools-design.md](2026-08-29-next-ten-local-tools-design.md), plan [2026-08-29-next-ten-local-tools.md](../plans/2026-08-29-next-ten-local-tools.md) and [README.md](../../../src/tools/geo/README.md).

## Purpose

Reduce the coordinate precision and detail of GeoJSON while keeping shared borders aligned, compare the original and the result in linked previews and download GeoJSON or TopoJSON, for GIS developers, map designers and data visualization teams, without uploading the data.

## Scope

In scope:
- Loading GeoJSON (Feature, FeatureCollection, bare geometry) with an RFC 7946 structural check and interoperability warnings.
- Coordinate rounding and topology-aware simplification with GeoJSON or TopoJSON output, in a stoppable Web Worker.
- Linked original and result previews, position and byte metrics, feature inspection.
- Downloads of the result and of a statistics file.
- TopoJSON input and reprojection of legacy coordinate systems, as requirements not yet built.

Out of scope: nothing is excluded beyond the platform rules.

## Constraints

- Platform rules: no accounts or authentication; no server or server-side database (static files on GitHub Pages); everything runs in the browser and data stays in this browser; network use only for the site's own files ([DOCUMENTATION_STANDARD.md](../../DOCUMENTATION_STANDARD.md#platform-rules-apply-to-every-tool-and-every-spec)).
- No large language models; other ML only on the device under the ML ruleset.
- Coordinates are WGS 84 longitude, latitude and optional altitude under RFC 7946; the tool does not reproject.
- Libraries as pinned in `package.json`: `topojson-client`, `topojson-server`, `topojson-simplify`.
- The preview is a local vector sketch, not a projection or basemap; at most 5,000 positions are drawn per preview. Exports keep every resulting position.
- The application uses hash routes on static hosting; fragment-based views are not reliably indexed as separate pages.
- The slug, route, element ids, file names (`.simplified.geojson`, `.simplified.topojson`, `.simplification-stats.json`) and accessible names are not changed.

## Requirements

### Loading

| ID | Requirement | Acceptance test |
| --- | --- | --- |
| GJS-R01 | A `.geojson` or `.json` file is chosen with the file input (Choose GeoJSON file); the status reports the number of coordinate positions loaded and the number of interoperability warnings | Choose a four-position line; the status reads "4 coordinate positions loaded" |
| GJS-R02 | Feature, FeatureCollection and bare geometry roots are accepted | A FeatureCollection, a MultiPoint and a Point each load |
| GJS-R03 | Choosing another file immediately discards the previous result and its downloads | With a result shown, choose a second file; the download buttons disappear |
| GJS-R04 | A slower read of an earlier selection never replaces a newer selection | Select a file whose read is delayed, then a second file; the second stays loaded |
| GJS-R05 | A file that is not valid JSON or fails the structural check shows "GeoJSON load failed" with the first error and no workspace | Choose a text file; the failure status is shown |

### Validation and inspection

| ID | Requirement | Acceptance test |
| --- | --- | --- |
| GJS-R06 | An RFC 7946 structural check reports passes or fails with the file name, feature count, position count and bounds | Load a route; the notice reads "RFC 7946 structural check: passes" with the counts |
| GJS-R07 | Unknown GeoJSON types and non-finite coordinates are rejected | `{ type: "Thing" }` and a NaN coordinate are invalid |
| GJS-R08 | FeatureCollection members must be Features and Feature properties must be an object or null | A bare Point inside `features` and `properties: "bad"` are invalid |
| GJS-R09 | Polygon rings need at least four positions and must be closed | A three-position ring and an unclosed ring are invalid |
| GJS-R10 | LineStrings need at least two positions | A one-position LineString is invalid |
| GJS-R11 | GeometryCollection children must be geometry objects, not null | `geometries: [null]` is invalid and names `geometries[0]` |
| GJS-R12 | Feature ids must be a string or finite number and bbox members must be finite numeric arrays of at least four values with an even length | An object id and a three-value bbox are invalid; a four-value bbox is valid |
| GJS-R13 | Positions with more than three elements and longitude or latitude outside the WGS 84 range produce warnings | A point `[10, 95, 3, 4]` warns about the element count and latitude |
| GJS-R14 | A legacy `crs` member and projected-looking longitudes produce warnings that the tool does not reproject | A point with an EPSG:3857 `crs` warns about `crs` and longitude |
| GJS-R15 | Warnings are listed in a paginated table (20 per page) so every warning stays reachable | Load 25 positions that warn; page 1 shows rows 1–20 and page 2 rows 21–25 |
| GJS-R16 | Inspect feature lists each feature (labelled by name, label, title, id or its number) and shows the selected feature's id, properties and geometry type | Load a route named "route one"; the inspector shows it |

### Settings

| ID | Requirement | Acceptance test |
| --- | --- | --- |
| GJS-R17 | Coordinate decimals (0–12, default 5) sets the rounding precision; changing it discards the result and asks for a new run | Change decimals; the status reads "Coordinate precision changed" and the download is disabled |
| GJS-R18 | Geometry detail target (0.05–1 in steps of 0.05, default 0.65) sets the fraction of removable line detail kept; changing it discards the result; points are unchanged | Change the detail; the status reads "Geometry detail changed" and the download is disabled |
| GJS-R19 | Export format offers GeoJSON and TopoJSON; changing it discards the result and disables the download until the next run | Select TopoJSON; the "Generated settings" notice disappears and Download generated GeoJSON is disabled |

### Simplification

| ID | Requirement | Acceptance test |
| --- | --- | --- |
| GJS-R20 | Coordinates are rounded to the chosen decimals and feature properties are left as they are | Rounding to five decimals changes `0.123456789` to `0.12346` and keeps properties equal |
| GJS-R21 | Existing `bbox` members are removed because rounding makes them stale | A rounded collection, feature and geometry have no `bbox` |
| GJS-R22 | Shared borders between features stay aligned while removable intermediate vertices are dropped (TopoJSON topology, presimplify, simplify by weight) | Two polygons sharing an edge keep the shared vertices and the output has no more positions than the input |
| GJS-R23 | One run produces the GeoJSON preview and, when selected, the TopoJSON export | With TopoJSON selected, the result holds both and they have the same position count |
| GJS-R24 | Altitude and other extra dimensions are restored on every retained position, in GeoJSON and in TopoJSON arcs, at any detail level | A 3D line keeps three elements per position and its first and last positions |
| GJS-R25 | Topology-based output is refused with an explanation when one horizontal position has conflicting extra dimensions | Two lines sharing `[0,0]` with altitudes 10 and 99 throw an error naming the dimensions |
| GJS-R26 | A bare geometry stays a bare geometry in GeoJSON output and the root shape change is reported | A LineString input gives a LineString and "LineString → LineString" |
| GJS-R27 | The result is validated again; the notice reads "Post-simplification check: passes" or fails, and invalid output is refused | Simplify a route; the post-simplification notice reads passes |
| GJS-R28 | The post-simplification notice reports the root shape, the number of feature geometries collapsed to empty or null, and the validated output positions | Simplify a route; the notice shows the three values |
| GJS-R29 | Simplification runs in a background Web Worker so the page stays responsive, and the status reads "Simplified locally to N coordinate positions" | Simplify a 4,000-vertex ring; the status reports the result and the output positions are fewer than the input |
| GJS-R30 | Without Web Worker support, simplification runs on the page thread with the same result | Delete `window.Worker`; Simplify geometry still produces a result |
| GJS-R31 | Simplify geometry is disabled and reads "Simplifying…" while a run is active | Press Simplify geometry; the button is disabled during the run |
| GJS-R32 | Stop terminates the worker, publishes no partial result, disables the downloads and the next run starts a new worker | Press Stop during a run; the status reads "Simplification stopped" and Download generated GeoJSON is disabled |
| GJS-R33 | A simplification error or a worker that cannot start shows "Simplification failed" with the reason and no result | A conflicting-dimension file shows the failure status |

### Comparison

| ID | Requirement | Acceptance test |
| --- | --- | --- |
| GJS-R34 | Metrics show input positions, output positions, input bytes and output bytes | After a run the four metrics show values |
| GJS-R35 | A "Generated settings" notice states the decimals, detail target and format of the shown result and that changing a setting invalidates it | After a run the notice is shown; after a setting change it is gone |
| GJS-R36 | The Original preview draws the input as a local vector sketch in the shared bounds | Load a file; the Original preview is drawn |
| GJS-R37 | The Simplified preview draws the result in the same bounds; before a run it reads "Run the simplifier to compare geometry." | Run the simplifier; the Simplified preview appears |
| GJS-R38 | Point and MultiPoint geometry is drawn as separate points, not joined lines | A three-point MultiPoint gives three circles and no path |
| GJS-R39 | Each preview draws at most 5,000 positions sampled across the whole input, keeps line endpoints and standalone points while the budget permits, and says it is sampled; exports keep every position | A 10,000-position line plus a point shows both and the sampling note |
| GJS-R40 | Zoom in, Zoom out, Pan left/right/up/down and Reset linked view move both previews together | Press Pan right; the points move right in the Original preview; Reset linked view restores them |
| GJS-R41 | Dragging a preview pans it and scrolling over it zooms between 0.5× and 20×, for both previews | Drag the Original preview; both move. Scroll up; both zoom in |
| GJS-R42 | A geometry with no plottable coordinates shows "No plottable coordinates found." | Load a feature with a null geometry; the notice appears in place of the drawing |

### Export

| ID | Requirement | Acceptance test |
| --- | --- | --- |
| GJS-R43 | Download generated GeoJSON saves `<source name>.simplified.geojson` (`application/geo+json`) with the shown result | Download after a run; the file parses as a FeatureCollection and is named `ring.simplified.geojson` |
| GJS-R44 | Download generated TopoJSON saves `<source name>.simplified.topojson` with a Topology whose `objects.data` is a GeometryCollection | Select TopoJSON, run, download; the file is a Topology |
| GJS-R45 | Download processing stats saves `<source name>.simplification-stats.json` with the source file, settings, root shape, collapsed count, and input and output positions, bytes and validation; the byte counts equal the real files | The stats input bytes equal the chosen file size and output bytes equal the downloaded file size |
| GJS-R46 | The downloads are enabled only while a current result exists and no run is active | With no result or during a run both download buttons are disabled |
| GJS-R47 | A result that belongs to an older file is never saved; the status asks for a new run | Attempt to save after the source changed; the status reads "belongs to an older file" |

### Site and catalog

| ID | Requirement | Acceptance test |
| --- | --- | --- |
| GJS-R48 | The route `#/tools/geojson-simplifier` opens the workspace with guidance and the privacy statement | Open the catalog link and the route |
| GJS-R49 | Parsing, simplification, previews and downloads run in this browser; no map service or upload is used | Simplify a file with the network blocked |
| GJS-R50 | Status changes are announced in a live status region | The status line has role status and shows load, run, stop and download messages |

### Additional input and coordinate systems

| ID | Requirement | Acceptance test |
| --- | --- | --- |
| GJS-R51 | A TopoJSON file is opened as input and simplified or converted to GeoJSON | Choose a `.topojson` file exported by the tool; it loads and simplifies |
| GJS-R52 | Legacy coordinate systems named by a `crs` member (for example EPSG:3857) are reprojected to WGS 84 in the browser before simplification | Load an EPSG:3857 file; the coordinates become longitude and latitude |

## Non-functional requirements

| ID | Requirement | Acceptance test |
| --- | --- | --- |
| GJS-R53 | Workspace follows the site-wide theme chosen in the site header (light, dark, system) and passes the colour-contrast check in dark | With each theme stored, the workspace uses it; `E2E_THEME=dark` axe on `#/tools/geojson-simplifier` has no `color-contrast` violation |
| GJS-R54 | No horizontal page overflow at any width from 320 to 2560 px | Overflow ≤ 1 px at 320, 390, 768, 844, 1440, 1920 and 2560 px with a file loaded |
| GJS-R55 | No serious or critical axe violations on the workspace | axe on `#/tools/geojson-simplifier` with a file loaded reports none |

## Definition of done

The tool is complete when every requirement is `verified` or `prohibited`, and the completion gates in `.tasks/PROJECT_COMPLETION.md` are met.

## Technique decisions

None: no function was compared between an ML and a non-ML method.

## Intent not recorded

None.

## Change log

- 2026-10-05 — Created: 55 requirements as built at `c371f847`.

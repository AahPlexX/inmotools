# CAD Studio Design

**Date:** 2026-09-11

## Product intent

CAD Studio is a local-first browser workspace for exact 3D CAD, parametric solid modeling, lightweight assemblies, manufacturing inspection, and technical export. It must be approachable enough for a first-time user to make a real part without knowing CAD terminology while preserving the precision, feature history, topology, constraints, and interchange expected by mechanical engineers and product designers.

The authoritative model is exact boundary-representation geometry plus a serializable parametric feature graph. Three.js is a presentation layer only; rendered triangle meshes are never the source of truth for editable solid geometry. Mesh processing is a secondary manufacturing/interchange path, not the primary CAD kernel.

The tool remains consistent with INMOTOOLS: backend-free, route-lazy, privacy-preserving, responsive, keyboard operable, touch usable, and deployable as static assets on GitHub Pages.

## Definition of done

A production release is complete only when all of the following are true:

1. CAD Studio is reachable through the existing registry-driven catalog and lazy workspace loader without adding a route-specific special case.
2. The exact-geometry kernel is loaded only when CAD Studio opens and performs expensive modeling outside the React main thread.
3. A user can create, edit, reorder where valid, suppress, rebuild, undo, redo, save, reopen, inspect, and export a real parametric part.
4. At least 50 modeling/workflow capabilities listed in this design are functional operations, not decorative controls.
5. Sketches support geometric and dimensional constraints with under/fully/over-constrained feedback and deterministic conflict reporting.
6. Upstream parameter edits cannot silently retarget a downstream feature to the wrong face, edge, or vertex.
7. Exact B-Rep operations include primitives, extrude, revolve, sweep, loft, booleans, fillet, chamfer, shell, offset, draft, split, pattern, mirror, and healing workflows.
8. The viewport supports precise selection, snapping, orthographic/perspective navigation, sectioning, isolation, visibility controls, measurements, and fit/interference inspection.
9. The native project format restores the editable feature model, parameters, configurations, assemblies, metadata, and view state without embedding remote dependencies.
10. Export provides STEP, 3MF, GLB/glTF, STL, OBJ, SVG/DXF projection, PNG snapshot, and the native CAD project where each format is technically supportable by the selected local libraries.
11. Export includes editable title, creator, organization, description, revision, part number, project number, material, units, rights, license terms, tags/keywords, dates, and custom key/value metadata with an explicit per-format embedded/mapped/sidecar policy.
12. Geometry failures preserve the last valid model and explain the failed feature instead of replacing the viewport with corrupt or stale output.
13. CAD Studio remains usable on phone portrait/landscape, tablets, narrow split-screen windows, desktop, browser zoom, and enlarged text without hiding essential functionality or shrinking text into unreadability.
14. Drag-based interactions have precise numeric and single-pointer alternatives where required; core workflows remain keyboard operable.
15. Focused unit/browser coverage verifies solver behavior, feature rebuilds, topology-reference survival, worker cancellation, persistence, export round-trips, metadata mapping, accessibility, responsive reflow, and critical CAD flows.
16. Existing repository validation and GitHub Pages deployment complete without a regression attributable to CAD Studio.

## Architecture decision

### Primary exact-geometry stack

The selected architecture is:

- **brepjs** as the high-level TypeScript B-Rep modeling API and topology/reference façade.
- **occt-wasm** as the Open CASCADE Technology WebAssembly kernel.
- **Three.js** as the viewport/rendering/selection presentation layer.
- **manifold-3d** as the secondary watertight triangle-mesh path for repair, mesh booleans, additive-manufacturing validation, and mesh-specific interchange work where it adds value.
- **ml-matrix** for the numerical linear algebra used by the in-project sketch constraint solver.

Exact dependency versions are pinned only during implementation after re-verifying the package registry and repository compatibility. Runtime dependencies using strong network-copyleft terms are excluded from the initial production architecture. The OCCT WebAssembly artifact remains a separately loadable/replaceable asset and third-party notices/source obligations must be preserved in the shipped application.

### Why this architecture

A mesh-only engine cannot honestly satisfy professional parametric-solid requirements because STEP/B-Rep topology, exact analytic surfaces, engineering measurements, feature selection, fillets, shells, and topology-aware rebuild semantics would be approximations. Conversely, using raw OpenCascade bindings throughout the UI would spread kernel-specific ownership and memory details across the application.

CAD Studio therefore owns a small kernel adapter boundary. Feature evaluators operate against a stable internal interface implemented by brepjs/occt-wasm. React never owns kernel objects. If the kernel adapter changes later, the project schema, feature graph, sketch model, viewport contract, persistence, and UI remain stable.

## Domain boundary

CAD Studio represents:

- exact mechanical and product-design parts;
- multi-body parametric solids;
- constrained 2D sketches used to create 3D geometry;
- selected exact/freeform NURBS-style curve and surface operations needed for product design;
- lightweight component assemblies and fit/motion inspection;
- additive-manufacturing and fabrication preflight;
- technical geometry exchange and metadata-aware export.

CAD Studio deliberately does not represent in the initial production scope:

- full finite-element analysis;
- CAM toolpath generation or machine post-processing;
- PCB/electrical design;
- architectural BIM authoring;
- cloud PDM/PLM or simultaneous network collaboration;
- organic sculpting comparable to voxel/subdivision sculptors;
- photorealistic offline rendering;
- arbitrary macro/plugin execution from untrusted project files.

Those domains may consume exported geometry later without weakening this tool's part-modeling boundary.

## Experience architecture

The wide-screen workspace uses six cooperating zones:

- **Command bar:** New/Open/Save, undo/redo, rebuild state, view controls, command search, Export.
- **Mode rail:** Sketch, Create, Modify, Pattern, Inspect, Components, Export.
- **Model tree:** origin planes, parameters, sketches, feature history, bodies, components, configurations, warnings.
- **Viewport:** exact-model tessellation, snapping, selection, manipulators, sketches, dimensions, sections, overlays, navigation cube.
- **Inspector:** contextual parameters, constraints, selections, metadata, material, feature diagnostics.
- **Status strip:** units, selection filter, solver state, rebuild state, cursor coordinates, snap state, geometry statistics.

On narrow screens the viewport remains the primary surface. The model tree and inspector become mutually exclusive drawers/bottom sheets. The command bar condenses into groups plus command search; no capability is removed merely because the viewport is narrow.

### Progressive interaction model

The same model supports different experience depths without forking project data:

- **Guided:** selection-first contextual actions and short plain-language explanations.
- **Standard:** feature toolbar + model tree + inspector.
- **Precision:** dense measurement/constraint data, explicit reference diagnostics, tolerance controls, and keyboard-first command access.

A user may switch depth at any time. Features created in one depth are ordinary features in the same project model.

## Functional capability set

The initial production target contains the following functional capabilities.

### Sketch creation and inference

1. Line, polyline, polygon, centerline, and construction line.
2. Corner, center, and three-point rectangles.
3. Center-point and three-point circles.
4. Three-point, center-point, and tangent arcs.
5. Ellipse and elliptical arc.
6. Center-to-center and overall slots.
7. Interpolated spline with editable control/tangent behavior.
8. Point entities and reference points.
9. Trim and extend sketch entities.
10. Break/split, join, and close sketch contours.
11. Offset selected sketch chains.
12. Mirror and linear/circular sketch patterns.
13. Project existing edges/vertices into a sketch with linked reference semantics.
14. Intersection geometry from a sketch plane and existing body.
15. Endpoint, midpoint, center, quadrant, tangent, perpendicular, parallel, intersection, projected, and grid inference snapping.
16. Sketch directly on origin planes, datum planes, or resolved planar faces.

### Sketch constraints and dimensions

17. Coincident constraint.
18. Horizontal and vertical constraints.
19. Parallel and perpendicular constraints.
20. Tangent constraint.
21. Concentric constraint.
22. Equal length/radius constraint.
23. Midpoint and point-on-object constraints.
24. Symmetry constraint.
25. Fix/lock constraint.
26. Distance, horizontal distance, and vertical distance dimensions.
27. Length, radius, diameter, and angle dimensions.
28. Driven/reference dimensions that report without controlling.
29. Live remaining-degrees-of-freedom indication with under/fully constrained states.
30. Over-constraint/conflict isolation that identifies the conflicting constraint set instead of merely failing the solve.
31. Drag-to-explore with the solver maintaining active constraints.
32. Numeric dimension entry and named-parameter/formula binding.

### Exact 3D construction

33. Box, cylinder, sphere, cone/frustum, torus, tube, and ellipsoid primitives.
34. Extrude with new/add/cut/intersect body operation.
35. Symmetric, two-sided, through-all, up-to-face, and up-to-next extrusion extents where geometrically valid.
36. Extrusion draft/taper and controlled twist where supported by exact geometry.
37. Revolve with new/add/cut/intersect operation and partial/full angles.
38. Path sweep/pipe with orientation modes.
39. Multi-section loft with guide/alignment controls where supported.
40. Boolean union/fuse, cut/subtract, common/intersection, and section result.
41. Hole wizard supporting simple, counterbore, countersink, clearance/tapped descriptive presets, termination options, and patterned placement.
42. Constant-radius fillet.
43. Variable-radius fillet where kernel support and edge topology permit it.
44. Symmetric/asymmetric chamfer.
45. Shell/hollow by removing selected faces and specifying wall thickness.
46. Thicken selected surfaces.
47. Draft selected faces around a neutral plane/edge direction.
48. Offset selected faces/surfaces.
49. Split body by datum plane, face, surface, or sketch-derived cutting tool.
50. Rib/web creation from an open or closed sketch profile.
51. Mirror bodies/features across origin/datum/planar references.
52. Linear, circular, and grid patterns with per-instance suppression.
53. Helix/coil generation for springs and swept thread-like forms.
54. Modeled thread workflow using profile + helix with guarded complexity limits.
55. Text emboss/deboss using the existing OpenType stack and exact outline conversion.
56. Move, rotate, and uniform/non-uniform scale with manipulator and exact numeric entry where the underlying operation is valid.
57. Datum planes using offset, angle, mid-plane, three-point, tangent, and face-derived definitions.
58. Datum axes and coordinate systems for reusable references.

### Surface and repair tools

59. Ruled and lofted exact surfaces.
60. Sew/join surfaces into shells and solids when closed.
61. Cap compatible planar openings.
62. Surface trim/split using exact intersection boundaries where supported.
63. Shape healing/fix operation with a report of what was changed.
64. Unify same-domain faces/edges after booleans where safe.
65. Remove degenerate geometry and fix orientation on imported/problem shapes.

### Parametric workflow

66. Ordered feature history with dependency-aware rebuild.
67. Feature reorder only when dependency analysis proves the move valid.
68. Suppress/unsuppress individual features.
69. Rollback marker to inspect/edit an earlier model state without deleting later features.
70. Named user parameters with units and formula expressions.
71. Feature parameters may bind to user parameters or formulas while retaining explicit units.
72. Configurations/variants override selected parameters, suppression states, materials, or component placement without cloning the entire project.
73. Parameter-range preview renders several non-committed candidates for a selected parameter using coarse tessellation and cancels stale candidates.
74. Named snapshots/bookmarks preserve a project revision + view/configuration reference without duplicating geometry state.
75. Undo/redo records semantic project commands rather than opaque viewport snapshots.

### Selection, inspection, and viewport

76. Vertex/edge/face/body/component selection filters.
77. Box/lasso selection for visible items where appropriate.
78. Contextual actions derived from the current selection: sketch, extrude, hole, push/pull, shell, fillet, chamfer, measure, hide/isolate.
79. Feature Lens: selecting geometry reveals its producing feature, owning body, bound parameters, and downstream dependents.
80. Orthographic and perspective camera modes.
81. Front/back/top/bottom/left/right/isometric standard views and a navigation cube.
82. Fit all, fit selection, zoom region, pan, orbit, and touch gestures with non-gesture controls.
83. Shaded, shaded-with-edges, wireframe, hidden-line, ghost/X-ray, and section views.
84. Hide/show/isolate bodies, components, sketches, datums, and feature results.
85. Exact point-to-point/edge/face distance, angle, radius/diameter, edge length, face area, body volume, center of mass, and bounding dimensions.
86. Material-density mass calculation using project material assignment.
87. Section/clipping planes with draggable and numeric position.
88. Body/component interference detection and minimum-clearance inspection.
89. Approximate wall-thickness inspection with clearly labeled analysis limits.
90. Draft/overhang inspection for molding/additive preparation.
91. Print-bed/bounding-box fit check.
92. Mesh manifold/open-edge/degenerate-triangle diagnostics for mesh export paths.

### Lightweight components

93. Insert another native CAD project or imported STEP part as a component definition.
94. Create multiple component instances without duplicating source geometry.
95. Ground/fix a component.
96. Fixed, revolute, slider, cylindrical, planar, and ball-style placement relationships where the selected geometry provides sufficient references.
97. Exploded-view offsets stored as presentation state rather than modifying canonical component placement.
98. Motion-range preview for simple revolute/slider relationships with collision/clearance feedback.
99. Component visibility/isolation and per-instance color override for inspection.
100. Assembly STEP/glTF export through the exact-document/XCAF path where supported.

## Parametric project model

The native project is serializable, versioned, and independent of in-memory kernel handles.

Conceptually:

```text
CadProject
  schemaVersion
  id
  metadata
  units
  parameters[]
  sketches[]
  features[]
  bodies[]
  materials[]
  configurations[]
  components[]
  assemblyRelations[]
  namedViews[]
  snapshots[]
  viewport
  exportDefaults
```

### Stable identity

Every project entity receives a permanent UUID at creation. IDs survive rename, reorder, configuration switching, save/reload, and rebuild. User-visible names are mutable labels and are never used as primary references.

### Units

Internal canonical length is millimeters and angle is radians. User inputs carry explicit unit semantics. Display may switch among mm, cm, m, in, ft, or mixed architectural-style displays where relevant without rewriting stored canonical values. Formula evaluation rejects incompatible dimensional operations.

## Sketch solver

The sketch solver is owned by CAD Studio rather than the geometry kernel because user-facing constraint semantics, conflict reporting, drag behavior, and deterministic project replay are product state.

### Solver model

- Each sketch entity expands to a compact parameter vector.
- Each active constraint produces one or more residual equations.
- The solver minimizes residual error with damped iterative least-squares/trust-region behavior using `ml-matrix` primitives.
- Analytic Jacobians are preferred for simple constraints; well-bounded numeric differentiation is acceptable for complex constraints when tested.
- A tolerance policy distinguishes solved, approximately solved, and unsolved states.
- Drag operations temporarily add a soft target rather than violating hard geometric constraints.
- The committed project stores the resolved geometry parameters plus declarative constraints so replay remains deterministic.

### Conflict detection

When the solve is over-constrained, CAD Studio identifies a minimal or near-minimal conflicting subset by disabling candidate constraints around the failing solve rather than returning an undifferentiated error. The UI highlights conflicting constraints and offers explicit suppress/delete actions; it never silently drops a user's constraint.

## Feature graph and rebuild semantics

`features[]` preserves user-visible order. A derived dependency graph determines legal evaluation order and rebuild scope.

Each feature contains:

- permanent ID and label;
- type;
- owner body/body-operation mode;
- parameter payload;
- referenced sketches/features/topology;
- suppression state;
- configuration overrides;
- evaluation status and last diagnostic;
- optional generated-reference role table.

A parameter or sketch change invalidates only the affected downstream dependency closure. Independent bodies/features remain valid.

### Rebuild states

A feature is one of:

- `clean` — result corresponds to current inputs;
- `dirty` — queued for rebuild;
- `building` — currently evaluating in the geometry worker;
- `failed` — current inputs could not produce valid geometry;
- `blocked` — an upstream dependency/reference is unresolved;
- `suppressed` — intentionally excluded.

The viewport keeps the last valid complete body result while a new rebuild is pending or fails. Failed/blocked geometry is never presented as if it represented the current parameters.

## Persistent topology references

Saving a raw kernel sub-shape index such as `face 7` is prohibited.

CAD Studio uses lineage-aware semantic references. The initial resolver builds on the stable-reference primitives exposed by brepjs and augments them with project-level provenance.

A reference records, as applicable:

- producer feature ID;
- topology kind: face/edge/vertex;
- stable role/adjacent-role identities;
- geometric type: plane, cylinder, cone, sphere, torus, spline, line, circle, etc.;
- approximate normal/axis/direction;
- centroid/bounding-box/area/length/radius fingerprint;
- adjacency fingerprint;
- original picked point in model coordinates;
- intended side/orientation when meaningful.

On rebuild, kernel evolution history is consumed first when available. Lineage/role resolution is next. Geometric scoring is the final recovery path.

If exactly one candidate meets the confidence threshold, the reference reconnects. If resolution is ambiguous or fails, the dependent feature becomes `blocked` and the UI asks the user to repair the reference. CAD Studio must never silently choose a weak match merely to keep the tree green.

## Geometry worker

All exact modeling executes in a dedicated module worker.

The worker owns:

- brepjs initialization;
- the occt-wasm kernel instance;
- kernel shape handles;
- exact feature evaluation;
- tessellation;
- exact measurements;
- STEP/BREP/XCAF operations;
- exact topology/evolution maps;
- long-running geometry cancellation by worker restart when necessary.

The main thread owns only serializable project state and render-ready buffers.

### Worker messages

Every request carries:

- `projectRevision`;
- `requestId`;
- operation kind;
- minimal affected project slice or command;
- requested preview quality.

Every response echoes `projectRevision` and `requestId`. A stale response is discarded without mutating UI state.

Triangle positions, normals, indices, edge polylines, and other large binary payloads use transferable `ArrayBuffer`s. Shared memory is not required for the initial architecture.

If kernel work cannot be cooperatively interrupted, Cancel terminates and recreates the worker, reloads the last serialized project checkpoint, and resumes from the last valid revision.

## Viewport rendering

Three.js receives tessellation grouped by persistent body/face selection keys. The renderer never alters canonical geometry.

### Tessellation quality

- During active dragging/parameter scrubbing, request coarse adaptive tessellation.
- After interaction settles, request normal tessellation for visible bodies.
- Export tessellation is independently configured and never reuses a low-quality interaction mesh by accident.
- Hidden bodies do not retessellate unless their exact geometry is required by another operation.
- Large assemblies may use simplified viewport tessellation while exact body geometry remains available in the worker.

### Selection

Raycasting resolves a rendered primitive to the semantic topology key returned with the mesh. Highlight overlays are separate Three.js objects/material state and cannot modify the exact model.

## Native persistence

### Native format

The native extension is `.inmocad`.

The format is a ZIP package containing deterministic UTF-8 JSON plus optional local binary assets:

```text
project.json
metadata.json
thumbnail.png
assets/
  imported-part-<id>.step
  referenced-font-<id>.*   (only when embedding is legally and technically allowed)
```

The project manifest carries `schemaVersion` and import migrations are explicit. Unknown future fields are preserved where safe; unsupported future schema versions open read-only rather than being partially rewritten.

### Autosave

Autosave uses IndexedDB because project state and imported local geometry can exceed responsible `localStorage` limits. Autosave stores serialized project revisions and required binary assets, not live kernel objects or duplicate tessellation caches.

- Writes are transactional.
- A crash/reload recovery prompt distinguishes autosave from the last explicit file save.
- Autosave retention is bounded by revision count/estimated bytes.
- Users can clear CAD Studio recovery data without clearing unrelated INMOTOOLS state.

## Import

Initial imports:

- native `.inmocad` project;
- STEP/STP as exact imported body/component geometry;
- BREP where the kernel path provides deterministic import coverage;
- STL and OBJ as mesh/reference geometry, not falsely promoted to editable analytic B-Rep;
- GLB/glTF as mesh/reference geometry and presentation material where supported.

Imported mesh geometry can be repaired/inspected and used for reference/alignment. A mesh-to-parametric reconstruction command is explicitly outside the initial scope because silently inferring design intent would be unreliable.

## Export Workbench

Export is a dedicated reviewed workflow rather than isolated download buttons.

### Common export fields

The user can edit:

- filename;
- title;
- designer/creator;
- organization;
- description;
- revision;
- part number;
- project number;
- material name/specification;
- units;
- copyright notice;
- license/usage terms;
- keywords/tags;
- created/modified dates;
- arbitrary custom key/value properties.

The workbench labels each metadata field for the selected format as `Embedded`, `Mapped`, `Sidecar`, or `Not supported`. It never silently promises metadata persistence that the format cannot provide.

### Format behavior

#### Native `.inmocad`

Contains the complete editable parametric project, configurations, bodies/components, materials, metadata, tags, view state, and thumbnail.

#### STEP/STP

Exports exact B-Rep bodies/components. Assembly/name/color/layer metadata uses the kernel's XCAF/document path where supported and verified. Units are explicit. Additional project metadata is embedded only when round-trip verification proves the writer retains it; otherwise it is included in the optional JSON sidecar.

#### 3MF

Preferred additive-manufacturing mesh export. Includes explicit units, object names, material/color data where supported, document metadata, and extensible custom metadata through the 3MF package writer. Output is validated as a ZIP/XML package before download.

#### GLB/glTF

Exports tessellated presentation geometry, names, hierarchy, materials, asset copyright/generator data where applicable, and project custom properties through structured extras where safe. This format is never presented as the native editable CAD model.

#### STL

Offers binary and ASCII STL with explicit tessellation tolerances. The UI states that STL does not reliably carry project units/materials/tags; metadata remains sidecar-only. The export dialog requires an explicit unit interpretation.

#### OBJ/MTL

Exports tessellated geometry, object/group names, and supported materials. Extended project metadata is represented in a separate sidecar rather than relying on non-portable comments.

#### SVG/DXF technical projection

Uses exact hidden-line/projection geometry where available. Supports view selection, scale, visible/hidden edge layers, line weights, units, title/project labels, and sheet bounds. SVG is generated locally. DXF targets a deliberately documented interoperable entity subset rather than claiming complete DXF coverage.

#### PNG viewport snapshot

Exports the current visual inspection state with optional transparent background, dimensions, and view label. It is documentation output, not a geometry interchange format.

### Export verification

Where a parser exists locally, important geometry formats are re-opened before enabling the final download:

- STEP: exported bytes re-import and produce expected body count/bounds/volume tolerance.
- 3MF: ZIP/XML structure and declared units/object count validate.
- native project: serialize -> reopen -> schema/identity/parameter round-trip.
- GLB: parser validates hierarchy and mesh/accessor structure.

Verification failure blocks the affected file but does not destroy the project or other export options.

## Manufacturing and fit inspection

Inspection features never modify geometry unless the user explicitly chooses a repair operation.

- Exact interference checks operate on B-Rep bodies/components.
- Clearance reports provide measured minimum distances and involved entities.
- Wall-thickness/draft/overhang tools disclose whether the result is exact, sampled, or tessellation-derived.
- Mesh manifold diagnostics use the mesh path and identify open/non-manifold edges/degenerate triangles where recoverable.
- Repair produces a separate reviewed result and report before replacement/export.

## Materials

A compact built-in material table provides display label, category, density, and optional notes. User materials can be added per project. Density drives calculated mass only; CAD Studio does not imply structural or process certification from a selected material label.

## Searchable command system

All meaningful commands register an ID, label, category, shortcut when appropriate, enabled predicate, and execute handler. The command palette is available from keyboard and touch UI.

This same registry drives toolbar/context actions, preventing duplicate command implementations whose behavior drifts over time.

## Error handling and recovery

- Kernel initialization failure leaves the rest of INMOTOOLS usable and provides a retry path.
- A failed feature preserves the last valid geometry and exposes the kernel/user-level diagnostic at that feature.
- Downstream features depending on a failed feature become blocked, not independently failed.
- Ambiguous topology references require user repair.
- Invalid formulas identify the parameter and reason before rebuild.
- Solver non-convergence retains the previous committed sketch solution.
- Worker crashes restart from serialized project state and discard incomplete results.
- Out-of-memory/oversized-model conditions stop new heavy work before intentionally multiplying memory where estimates are available.
- Import failure never destroys the currently open project.
- Export failure is format-local and cannot invalidate project state.
- Stale worker responses cannot overwrite newer revisions.

## Performance boundaries

- The CAD kernel is route-lazy and absent from the landing-page critical path.
- One exact kernel instance is reused per geometry worker.
- Interactive drag/parameter edits coalesce worker requests and may use coarse tessellation while interaction is active.
- Persistent project state stores parameters/features, not copies of exact kernel objects per history step.
- Undo/redo stores command/state deltas or structurally shared revisions, not tessellation snapshots.
- Body-level dependency invalidation avoids rebuilding independent geometry.
- Imported mesh data and exact B-Rep source data are not duplicated unless a conversion explicitly requires both.
- Object URLs, Three.js geometries/materials, transferred buffers, and worker instances are disposed/released when superseded.
- Expensive parameter-range previews have bounded candidate count and are cancellable.
- Large component sets use viewport simplification/visibility culling without changing exact export geometry.

## Accessibility and responsive behavior

- Every command has a visible text label somewhere in the interface; icon-only shortcuts have accessible names.
- Sliders and draggable manipulators pair with numeric fields or buttons so precision never requires dragging.
- Reordering features/components by drag has move-up/move-down or equivalent single-pointer/keyboard controls.
- Navigation gestures have buttons/keyboard alternatives for standard views, fit, zoom, pan/orbit modes, and section controls.
- Sketch dimensions and constraints are mirrored in DOM inspector/list surfaces so essential information is not canvas-only.
- The model tree supports keyboard focus, expansion, selection, rename, visibility, and context actions.
- Visible focus is never intentionally removed.
- Progress/rebuild/export messages use appropriate polite live regions; blocking errors are discoverable without relying solely on color.
- Selection states and constraint status use text/icon/shape distinctions in addition to color.
- At 320 CSS px width, primary controls and inspector content reflow without horizontal page scrolling.
- At browser zoom/text enlargement, labels wrap instead of overlapping controls.
- Touch targets meet the project's WCAG 2.2 AA target-size baseline or have equivalent compliant controls.
- Reduced-motion preference disables nonessential animated transitions and damped camera motion.

## Security and privacy

- No CAD file, project, metadata, thumbnail, or export payload is uploaded.
- Imported project files are parsed as data; no embedded scripts/macros are executed.
- Custom metadata is escaped/serialized according to the target format and cannot inject application markup.
- Native project ZIP paths are normalized and cannot escape the package namespace.
- Decompression and import apply bounded file-count/size safeguards to reduce archive-bomb risk.
- Object URLs are local and revoked after use.
- No analytics/telemetry or remote geometry conversion path is added.

## Testing strategy

### Unit: project/model

Cover:

- project schema validation and migrations;
- unit conversion and dimensional formula rules;
- parameter dependency evaluation and cycle detection;
- feature dependency closure and legal/illegal reorder behavior;
- suppression/configuration semantics;
- undo/redo and snapshot identity;
- native-project serialization and deterministic reopen.

### Unit: sketch solver

Cover known analytic fixtures for each constraint type, under-constrained degrees of freedom, fully constrained models, redundant constraints, conflicting constraints, drag soft targets, near-singular geometry, solver tolerance, and deterministic replay.

### Unit: topology references

Cover face/edge/vertex lineage across translations, parameter changes, extrudes, cuts, mirrors, fillets/chamfers, shell/offset, feature suppression, and cases intentionally forced into ambiguous/broken reference states. Tests must assert that ambiguity blocks rather than retargets incorrectly.

### Geometry integration

Run against the actual WASM kernel for a focused fixture matrix:

- primitives with known volume/area/bounds;
- extrude/revolve/sweep/loft;
- fuse/cut/common;
- fillet/chamfer/shell/draft/offset;
- patterns and mirrors;
- split/heal/unify;
- STEP export/re-import with geometry tolerances;
- assembly/document naming/color where used;
- invalid/degenerate inputs that must fail safely.

### Export

Cover metadata mapping per format, safe filenames, unit declarations, native project round-trip, STEP round-trip, 3MF package structure, GLB parser validation, STL tolerance/settings, SVG/DXF projection output, and sidecar behavior for unsupported metadata fields.

### Browser

Critical flows:

1. create sketch -> constrain -> extrude -> hole -> fillet -> parameter edit -> undo/redo -> save/export;
2. upstream dimension edit with downstream topology reference survival;
3. intentionally broken/ambiguous reference -> repair flow;
4. open STEP -> inspect/measure -> component use -> export;
5. configuration switching and parameter-range preview cancellation;
6. component placement + interference/clearance inspection;
7. export metadata editing and format-policy disclosure;
8. worker cancel/restart without stale geometry;
9. keyboard-only model-tree/command/inspector flow;
10. phone portrait/landscape, tablet/narrow split, and wide desktop reflow.

### Accessibility

Use axe as a regression tool plus manual/Playwright behavior checks for keyboard reachability, focus visibility, semantic labels, drag alternatives, status announcements, zoom/reflow, target sizing, and reduced-motion behavior. Automated scanning is not treated as full accessibility proof.

### Deployment

Register the CAD tool folder in the focused-E2E selector after a dedicated CAD browser spec exists. Changes to catalog/router/package/lock/global styling remain cross-cutting and receive the repository's broader validation. Production Pages validation must prove the worker and WASM assets resolve from the deployed base path rather than only in local Vite development.

## Release decomposition

### Milestone A — Kernel, project model, and viewport

- dependency integration and licensing notices;
- CAD project schema/history;
- geometry worker and kernel adapter;
- Three.js viewport, camera, selection, highlighting, visibility;
- primitives, measurements, native save/reopen;
- catalog/lazy workspace integration.

### Milestone B — Sketcher and parametric core

- sketch canvas/overlay and entity tools;
- inference snapping;
- constraint solver and dimensions;
- parameters/formulas;
- feature graph and rebuild states;
- extrude/revolve/booleans;
- persistent topology references.

### Milestone C — Professional feature modeling

- sweep/loft;
- hole wizard;
- fillet/chamfer/shell/draft/offset/thicken;
- ribs, split, datums;
- patterns/mirror;
- helix/thread/text;
- surface/sew/heal workflows;
- configurations and suppression/reorder/rollback.

### Milestone D — Inspection and components

- section/hidden-line/inspection views;
- clearance/interference/mass/bounds;
- thickness/draft/overhang/print-bed diagnostics;
- component definitions/instances;
- placement relationships and motion preview;
- exploded presentation state.

### Milestone E — Export Workbench and hardening

- STEP/XCAF, 3MF, GLB/glTF, STL, OBJ, SVG/DXF, PNG, native export;
- metadata editor and per-format mapping/sidecars;
- round-trip validation where available;
- command palette and guided contextual actions;
- performance/memory/cancellation hardening;
- responsive/accessibility hardening;
- focused + full repository validation and deployed Pages verification.

## Implementation invariants

These conditions must remain true throughout implementation:

1. Exact B-Rep/project state is authoritative; Three.js meshes never become canonical model geometry.
2. React state never owns live OCCT shape handles.
3. Project files contain no executable code.
4. A stale worker response can never replace newer project state.
5. A failed feature can never silently keep presenting old geometry as current geometry.
6. A weak topology match can never silently retarget a dependent feature.
7. Mesh imports are never mislabeled as editable exact solids without an explicit verified conversion.
8. Export metadata is never silently dropped while the UI claims it is embedded.
9. Configuration changes cannot overwrite canonical base parameters; they are explicit overrides.
10. Assemblies instance part definitions rather than duplicating editable source state per occurrence.
11. Undo/redo preserves semantic project identity and never depends on disposed kernel handles.
12. All heavy CAD runtime dependencies remain route-lazy.
13. No remote upload/conversion path is introduced.
14. Unsupported or unverified behavior is rejected or clearly disclosed rather than approximated invisibly.

## Non-goals for first production release

- FEM/FEA;
- CAM/G-code;
- cloud collaboration;
- version-control server/PDM;
- photoreal ray-traced rendering;
- organic sculpting;
- topology optimization/generative engineering;
- direct native proprietary CAD formats that require licensed SDKs;
- inference of parametric feature history from arbitrary imported meshes/STEP files;
- user-loaded executable plugins/macros.

These exclusions preserve a deep, coherent CAD/solid-modeling workspace instead of a shallow collection of unrelated engineering modules.

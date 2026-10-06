---
tool: cad-studio
folder: src/tools/cad
doc: spec
basis: as-built
status: active
spec: docs/superpowers/specs/2026-10-05-cad-studio-design.md
tracker: src/tools/cad/TRACKER.md
updated: 2026-10-05
---

# CAD Studio — spec

As built at `origin/main` `5fb22493`. Requirement prefix: `CAD`. Status of each requirement: [TRACKER.md](../../../src/tools/cad/TRACKER.md). History: [2026-09-11-cad-studio-design.md](2026-09-11-cad-studio-design.md) (architecture, worker protocol, capabilities 1–100), [2026-09-11-cad-studio-capability-expansion.md](2026-09-11-cad-studio-capability-expansion.md) (capabilities 101–195 and exclusions), [2026-09-11-cad-studio-dependency-decision.md](2026-09-11-cad-studio-dependency-decision.md), completion ledger [.tasks/CAD_STUDIO.md](../../../.tasks/CAD_STUDIO.md) (16 gates). Former capability numbers 1–195 are given as "(formerly N)"; CAD-R001 to CAD-R195 carry capabilities 1 to 195 in order.

## Purpose

Sketch with geometric and dimensional constraints, build parametric exact solid features on a local OpenCascade kernel, inspect the result, and keep and export the model, all in the browser, for makers, engineers and students who want parametric CAD without an account or an upload.

## Scope

In scope:
- Constrained 2D sketches, named parameters with units and formulas, an ordered parametric feature history with suppression, reorder and undo/redo.
- Exact B-Rep modelling in a module worker (OpenCascade WebAssembly): primitives, extrude, revolve, sweep, loft, Booleans, hole, fillet, chamfer, shell, draft, offset, split, rib, mirror, pattern, datums, repair.
- Viewport, selection, measurement and inspection; lightweight components; sheet metal; technical drawings and model-based definition; persistence and export (STEP, BREP, STL, 3MF, GLB/glTF, OBJ, SVG/DXF, PNG); engineering content and command access.

Out of scope:
- IGES import and export: the kernel build omits the IGES module; STEP is the exact interchange format.
- Reconstructing clean parametric B-Rep from arbitrary triangle meshes: the browser stack cannot promise it; meshes stay reference bodies.
- Embedding semantic STEP PMI: not promised until the adapter exposes and validates it.
- Full finite-element analysis, CAM toolpaths and post-processing, PCB and electrical authoring, BIM, cloud PDM/PLM and simultaneous collaboration, organic sculpting, photorealistic offline rendering: different product categories.

## Constraints

- Platform rules: no accounts or authentication; no server or server-side database (static files on GitHub Pages); everything runs in the browser and projects stay in this browser; network use only for the site's own files ([DOCUMENTATION_STANDARD.md](../../DOCUMENTATION_STANDARD.md#platform-rules-apply-to-every-tool-and-every-spec)).
- No large language models; other ML only on the device under the ML ruleset.
- Exact dependency pins as in `package.json` (`occt-wasm`, `manifold-3d`, `ml-matrix`, `wasm-feature-detect`); the kernel runs in a dedicated module worker and loads only when the CAD route opens; multi-threaded WebAssembly is not used.
- Canonical storage in millimeters and radians; project `schemaVersion` 1. These formats and names are not changed.

## Architecture and engine

- Engines and libraries: `occt-wasm@5.0.0` is the exact B-Rep kernel (OpenCascade compiled to WebAssembly), loaded lazily inside the worker; `three@0.185.1` renders the meshes and provides `OrbitControls`; `ml-matrix@6.15.0` solves the sketch constraints (SVD-backed Gauss-Newton step); `wasm-feature-detect@1.9.0` probes SIMD, tail calls and exception handling.
- Workers: `cad.worker.ts` is the module Web Worker named `inmotools-cad-kernel` that hosts the kernel, started from `cad-worker-factory.ts`; `kernel-worker-client.ts` discards messages from any earlier worker generation.
- Browser APIs: Web Workers and WebAssembly run the kernel, which does not start when WebAssembly, SIMD, tail calls or exception handling is missing, and an "unsupported browser" error names the missing features; WebGL (`THREE.WebGLRenderer`) draws the viewport.

## Requirements

### Sketch creation and inference

| ID | Requirement | Acceptance test |
| --- | --- | --- |
| CAD-R001 | Lines, including construction lines, can be drawn in a sketch; polylines, polygons and centerlines are drawn as connected lines (formerly 1) | Draw three connected lines; marking one construction excludes it from profile regions |
| CAD-R002 | Corner, center and three-point rectangles can be drawn (formerly 2) | Each rectangle type yields four connected lines with the expected corners |
| CAD-R003 | Center-point and three-point circles can be drawn (formerly 3) | Both circle types give a circle through the picked points |
| CAD-R004 | Three-point, center-point and tangent arcs can be drawn (formerly 4) | Each arc type yields an arc with the expected center, start and end |
| CAD-R005 | Ellipses and elliptical arcs can be drawn (formerly 5) | An ellipse and an elliptical arc keep their major and minor radii and span |
| CAD-R006 | Center-to-center and overall slots can be drawn (formerly 6) | Each slot yields two arcs and two lines of the requested size |
| CAD-R007 | Interpolated splines pass through their fit points with editable end tangents (formerly 7) | A spline through three fit points interpolates each; end tangent vectors change the end direction |
| CAD-R008 | Point and reference-point entities can be placed in a sketch (formerly 8) | A point entity appears in the sketch view at its coordinates |
| CAD-R009 | Sketch entities can be trimmed and extended (formerly 9) | Trimming a crossing line removes the chosen span |
| CAD-R010 | Sketch entities can be split, joined and closed (formerly 10) | Splitting a line at a point gives two lines; closing an open chain adds the closing segment |
| CAD-R011 | Selected sketch chains can be offset (formerly 11) | Offsetting a rectangle by 2 mm gives a rectangle 4 mm larger in each dimension |
| CAD-R012 | Sketch geometry can be mirrored and repeated in linear and circular patterns (formerly 12) | A mirrored line appears on the far side of the axis |
| CAD-R013 | Existing edges and vertices can be projected into a sketch with a link to their source (formerly 13) | A projected edge follows the source when it moves |
| CAD-R014 | The intersection of a sketch plane and a body can be added as sketch geometry (formerly 14) | A plane through a box yields its rectangular section outline |
| CAD-R015 | Sketch inference proposes constraints and snap targets while drawing (formerly 15) | Drawing a nearly horizontal line proposes a horizontal constraint; endpoint, midpoint, center, quadrant and grid snapping are offered |
| CAD-R016 | A sketch is placed on an origin plane, a datum plane or a resolved planar face (formerly 16) | A sketch on an offset datum plane extrudes from that plane |

### Sketch constraints and dimensions

| ID | Requirement | Acceptance test |
| --- | --- | --- |
| CAD-R017 | A coincident constraint joins two points (formerly 17) | Two points constrained coincident solve to the same position |
| CAD-R018 | Horizontal and vertical constraints align a line (formerly 18) | A line constrained horizontal has equal end y; a vertical line has equal end x |
| CAD-R019 | Parallel and perpendicular constraints relate two lines (formerly 19) | Two lines constrained perpendicular meet at 90° |
| CAD-R020 | A tangent constraint joins a line to a circle, arc, ellipse or elliptical arc only where the contact lies on the curve span (formerly 20) | A line tangent to a circle keeps distance equal to the radius; contact on the excluded half of an arc is rejected |
| CAD-R021 | A concentric constraint gives circles, arcs and ellipses one center (formerly 21) | Two concentric circles share a center |
| CAD-R022 | Equal-length and equal-radius constraints match lines and circular curves (formerly 22) | Two lines constrained equal have equal length; two circles equal radius |
| CAD-R023 | Midpoint and point-on-object constraints place a point on a line, circle, arc, ellipse or spline (formerly 23) | A point constrained to the midpoint of a fixed line solves to its center |
| CAD-R024 | A symmetry constraint mirrors one point across an axis line (formerly 24) | A point symmetric to a fixed point about a construction axis solves to the mirror position |
| CAD-R025 | A fix/lock constraint holds a point, line, circle, arc, ellipse, elliptical arc or spline in place (formerly 25) | A locked line keeps both endpoint coordinates while other geometry solves |
| CAD-R026 | Distance, horizontal-distance and vertical-distance dimensions size the gap between points (formerly 26) | A horizontal distance of 30 mm separates two points by 30 in x only |
| CAD-R027 | Length, radius, diameter and angle dimensions size lines, circles, arcs and the angle between lines (formerly 27) | A diameter of 20 mm gives a circle of radius 10 mm; an angle dimension uses radians internally |
| CAD-R028 | Reference dimensions report a measurement without constraining geometry (formerly 28) | A reference length reports the line length and leaves the line free |
| CAD-R029 | The sketch reports remaining degrees of freedom and an under, fully or over constrained state (formerly 29) | An unconstrained line reports its free degrees; adding constraints reaches fully constrained |
| CAD-R030 | An over-constrained sketch names the conflicting constraints instead of only failing (formerly 30) | Two contradictory distances report their constraint ids |
| CAD-R031 | Dragging a point lets the solver follow while hard constraints hold (formerly 31) | A soft drag target moves a free point and leaves constrained geometry satisfied |
| CAD-R032 | A dimension value is entered as a number or bound to a named parameter or formula (formerly 32) | A length dimension bound to `width/2` solves to half of `width` in millimeters |

### Exact 3D construction

| ID | Requirement | Acceptance test |
| --- | --- | --- |
| CAD-R033 | Primitives are added from the toolbar: box, cylinder, sphere, cone or frustum, torus and tube; an ellipsoid is also offered (formerly 33) | Choosing Box and pressing Add box tessellates a box; each other kind adds its body |
| CAD-R034 | Extrude builds a solid from a solved sketch profile along the sketch normal and combines it as a new, added, cut or intersected body (formerly 34) | A rectangle sketch extrudes 10 mm to an exact prism; a cut removes volume from the dependency body |
| CAD-R035 | Extrusions can be symmetric, two-sided, through-all, up-to-face or up-to-next (formerly 35) | A symmetric 10 mm extrude spans 5 mm on each side of the sketch plane |
| CAD-R036 | Extrusions accept a draft/taper angle and a controlled twist (formerly 36) | A 5° taper narrows the top face by the expected amount |
| CAD-R037 | Revolve turns a solved profile about a sketch construction line or datum axis through a partial or full angle (formerly 37) | A rectangle revolved 2π about an axis gives the analytic cylinder volume; more than 2π is rejected |
| CAD-R038 | Sweep moves a profile along a sketch path or an inline helix (formerly 38) | A circle swept along a straight path gives a cylinder; a circle swept along a helix gives a coil |
| CAD-R039 | Loft blends two or more sketch sections into a solid or surface (formerly 39) | Two circles of radius 2 and 4 loft into a frustum |
| CAD-R040 | Boolean features fuse, cut, intersect (common) and section bodies in feature order (formerly 40) | Cutting a cylinder from a box reduces its volume by the overlap; a second Boolean can use the first result |
| CAD-R041 | The hole feature makes blind, through-all, counterbore and countersink holes, reversible in direction, from a circle in a sketch (formerly 41) | A counterbore hole removes the bore plus the wider shallow recess; a hole with neither depth nor through-all is rejected |
| CAD-R042 | A constant-radius fillet rounds selected edges resolved by semantic reference (formerly 42) | Filleting one edge of a 20×10×5 box adds a seventh face |
| CAD-R043 | A variable-radius fillet changes radius along an edge (formerly 43) | A fillet with 1 mm and 3 mm end radii has different widths at its ends |
| CAD-R044 | Chamfer cuts selected edges by a distance; symmetric and asymmetric distances are offered (formerly 44) | A chamfer of 1 mm removes the expected volume from a box edge |
| CAD-R045 | Shell hollows a body by removing selected faces and leaving a wall thickness (formerly 45) | A 1 mm open-top shell of a 20×10×5 box has 424 mm³ |
| CAD-R046 | Thicken grows a face or shell into a solid by a signed distance (formerly 46) | Thickening a 10×10 face by 2 mm gives 200 mm³ |
| CAD-R047 | Draft tilts selected faces by an angle in a pull direction, in any face order (formerly 47) | Drafting two faces in either order gives the same volume, different from the undrafted body |
| CAD-R048 | Offset moves a body's faces by a signed distance (formerly 48) | Offsetting by a non-zero distance changes the body; zero distance is rejected |
| CAD-R049 | Split cuts a body with one or more tool shapes into fragments (formerly 49) | Splitting a box with a mid plane keeps the total volume and bounds |
| CAD-R050 | Rib fuses a wall of a given thickness onto a body from a sketch centerline (formerly 50) | A straight centerline with thickness 2 mm and depth 5 mm fuses a wall onto the body |
| CAD-R051 | Mirror reflects a body across a sketch plane, datum plane or origin plane (formerly 51) | Mirroring a box across the YZ plane keeps 1000 mm³ and reflects the bounds |
| CAD-R052 | Linear and circular patterns repeat a shape; grid patterns and per-instance suppression are offered (formerly 52) | A linear pattern of 3 boxes has three times the volume; a circular pattern rotates each copy by the angle step |
| CAD-R053 | Helix generation builds a coil wire of given radius, pitch, height and hand for swept forms (formerly 53) | A helix of radius 5 and height 20 spans exactly those extents |
| CAD-R054 | A modeled thread is built from a profile and a helix within complexity limits (formerly 54) | A threaded cylinder shows the thread form and stays below the complexity limit |
| CAD-R055 | Text can be embossed or debossed from outlines of the OpenType stack (formerly 55) | Text "A" embossed 1 mm adds the glyph outline volume |
| CAD-R056 | Bodies can be moved, rotated and scaled uniformly or non-uniformly with numeric entry (formerly 56) | A 10 mm move shifts the bounds by 10 mm; a 2× scale doubles each dimension |
| CAD-R057 | Datum planes are defined by offset, angle, mid-plane, three points, tangent or face (formerly 57) | An offset datum plane sits at the given distance from its base plane; a mid-plane sits halfway between two parallel planes |
| CAD-R058 | Datum axes are defined by two points or two planes; coordinate systems are offered (formerly 58) | A two-plane axis lies on the intersection line of the planes; parallel planes are rejected |

### Surface and repair

| ID | Requirement | Acceptance test |
| --- | --- | --- |
| CAD-R059 | Ruled and lofted exact surfaces can be made (formerly 59) | A loft with `solid` false yields a surface between two sections |
| CAD-R060 | Sew joins faces into a shell or solid and orients a closed result correctly (formerly 60) | Six faces of a 20×10×5 box sew into one solid of 1000 mm³ |
| CAD-R061 | Compatible planar openings can be capped (formerly 61) | Capping the open top of a shell closes it into a solid |
| CAD-R062 | Surfaces can be trimmed and split at exact intersection boundaries (formerly 62) | Trimming a plane surface with a cylinder leaves the outside region |
| CAD-R063 | Heal fixes a shape and warns with the feature id when the result is still invalid (formerly 63) | Healing a valid box keeps its volume; a still-invalid result adds a warning |
| CAD-R064 | Unify merges same-domain faces and edges after Booleans (formerly 64) | Unifying a fused box pair keeps its volume and reduces its faces |
| CAD-R065 | Degenerate geometry is removed and orientation fixed on problem shapes (formerly 65) | Healing a shape with inverted orientation gives a positive volume |

### Parametric workflow

| ID | Requirement | Acceptance test |
| --- | --- | --- |
| CAD-R066 | Features form an ordered history; editing one marks it and its dependants dirty and the model rebuilds (formerly 66) | Changing a parameter marks the feature and its downstream features dirty and leaves others clean |
| CAD-R067 | Features can be reordered only where their dependencies stay in order (formerly 67) | Moving a feature before its dependency is refused; moving an independent feature succeeds |
| CAD-R068 | Features can be suppressed and unsuppressed from the model tree (formerly 68) | Ticking Suppressed removes the feature's body from the viewport; Undo restores it |
| CAD-R069 | A rollback marker shows an earlier model state without deleting later features (formerly 69) | Moving the marker above the second feature hides it and later features; moving it back restores them |
| CAD-R070 | Named parameters with units evaluate formulas, report cycles and reject mixed dimensions (formerly 70) | `a = 10 mm`, `b = a * 2` gives 20 mm; `a + 1 deg` is rejected |
| CAD-R071 | Feature parameters can bind to user parameters or formulas with explicit units (formerly 71) | Changing a named parameter changes the feature that uses it |
| CAD-R072 | Configurations override parameters, suppression states, materials or component placement (formerly 72) | Activating a configuration suppresses the chosen feature without copying the project |
| CAD-R073 | Parameter-range preview renders several uncommitted candidates and cancels stale ones (formerly 73) | Previewing a width over 10–30 mm shows coarse candidates and commits none |
| CAD-R074 | Named snapshots store a project revision with view and configuration references (formerly 74) | Saving a snapshot and restoring it returns the same features and view |
| CAD-R075 | Undo and redo replay named project commands and clear redo after a new edit (formerly 75) | Add a box, Undo removes it, Redo restores it; a new edit after Undo disables Redo |

### Selection, inspection and viewport

| ID | Requirement | Acceptance test |
| --- | --- | --- |
| CAD-R076 | Vertex, edge, face, body and component selection filters narrow what a click selects (formerly 76) | With the Face filter, a click selects a face, not the body |
| CAD-R077 | Box and lasso selection pick visible items (formerly 77) | Dragging a box around two edges selects both |
| CAD-R078 | Contextual actions follow the current selection (formerly 78) | Selecting a face offers sketch, extrude, hole, shell, fillet, chamfer, measure, hide and isolate |
| CAD-R079 | Feature Lens shows the producing feature, owning body, bound parameters and dependants of selected geometry (formerly 79) | Selecting a filleted face names the fillet feature and its dependants |
| CAD-R080 | The camera switches between orthographic and perspective modes (formerly 80) | Switching to orthographic removes perspective foreshortening |
| CAD-R081 | Standard views (front, back, top, bottom, left, right, isometric) and a navigation cube set the camera (formerly 81) | Choosing Top looks down the Z axis |
| CAD-R082 | The camera orbits by drag or touch and frames the bodies; fit selection, zoom region, pan and non-gesture controls are offered (formerly 82) | Dragging orbits the view; bodies are framed on first display |
| CAD-R083 | Display modes: shaded, shaded with edges, wireframe, hidden line, ghost and section (formerly 83) | Switching to wireframe draws only edges |
| CAD-R084 | Bodies can be shown and hidden from the model tree; sketches, components, datums and feature results can be isolated (formerly 84) | Unticking a body's visibility checkbox removes it from the viewport; Undo restores it |
| CAD-R085 | Exact distance, angle, radius, diameter, edge length, face area, volume, center of mass and bounds are measured on picked geometry (formerly 85) | Measuring a 20×10×5 box reports 1000 mm³ and 700 mm² |
| CAD-R086 | Mass is computed from the project's material density (formerly 86) | A 1000 mm³ body of a 7.85 g/cm³ material reports 7.85 g |
| CAD-R087 | Section planes clip the view at a dragged or numeric position (formerly 87) | Setting the plane to 10 mm hides the body beyond 10 mm |
| CAD-R088 | Body and component interference and minimum clearance are detected (formerly 88) | Two overlapping boxes report their overlap volume |
| CAD-R089 | Approximate wall thickness is inspected, labelled with its limits (formerly 89) | A 1 mm shell is shown as 1 mm thick |
| CAD-R090 | Draft and overhang are inspected for molding and additive preparation (formerly 90) | Faces beyond the chosen angle are highlighted |
| CAD-R091 | A print-bed check compares bounding dimensions with a chosen bed size (formerly 91) | A 300 mm body on a 200 mm bed is flagged |
| CAD-R092 | Mesh manifold, open-edge and degenerate-triangle diagnostics run on export meshes (formerly 92) | A mesh with a hole reports open edges |

### Lightweight components

| ID | Requirement | Acceptance test |
| --- | --- | --- |
| CAD-R093 | Another CAD project or STEP part can be inserted as a component definition (formerly 93) | Inserting a saved project adds one component |
| CAD-R094 | Several instances of one component definition share its geometry (formerly 94) | Two instances reference one definition |
| CAD-R095 | A component can be grounded (fixed) (formerly 95) | A grounded component does not move when another is dragged |
| CAD-R096 | Fixed, revolute, slider, cylindrical, planar and ball placement relations position components (formerly 96) | A revolute relation leaves one rotation free |
| CAD-R097 | Exploded-view offsets are kept as presentation state (formerly 97) | Exploding moves components in view and leaves their placement unchanged |
| CAD-R098 | Motion-range preview runs simple revolute and slider relations with clearance feedback (formerly 98) | Sweeping a slider shows a collision at its limit |
| CAD-R099 | Component visibility, isolation and per-instance colour override are available (formerly 99) | Changing one instance's colour leaves the others |
| CAD-R100 | Assembly STEP and glTF export use the exact-document path (formerly 100) | An exported assembly reopens with its hierarchy and names |

### Import, reference, direct editing and reusable engineering data

| ID | Requirement | Acceptance test |
| --- | --- | --- |
| CAD-R101 | STEP parts and assemblies import as exact bodies with hierarchy, names, colours and transforms where available (formerly 101) | Importing a STEP box returns a body with a tessellated mesh |
| CAD-R102 | Exact BREP imports and exports without tessellation loss (formerly 102) | A BREP exported and re-imported keeps its volume |
| CAD-R103 | STL imports as a faceted reference body (formerly 103) | Importing an STL adds a mesh body marked as mesh |
| CAD-R104 | OBJ/MTL imports with material assignments as reference bodies (formerly 104) | Importing an OBJ with two materials keeps both |
| CAD-R105 | glTF/GLB imports as mesh and component reference content (formerly 105) | Importing a GLB adds its nodes as components |
| CAD-R106 | 3MF imports meshes, components and materials (formerly 106) | Importing a 3MF with two objects adds both |
| CAD-R107 | SVG profiles import into a sketch with explicit scale and units (formerly 107) | A 10 mm square path imports as four lines of 10 mm |
| CAD-R108 | DXF profiles import into a sketch with unit and layer handling (formerly 108) | A DXF circle on layer A imports as a circle |
| CAD-R109 | A raster underlay is placed on a sketch plane, calibrated by a known distance and traced (formerly 109) | Calibrating two points to 50 mm scales the image to match |
| CAD-R110 | Exact 3D curves (line, arc, circle, ellipse, Bézier, B-spline, helix) can be made for sweep, loft and reference use (formerly 110) | A helix curve is reusable by several sweeps |
| CAD-R111 | Defeature removes selected detail faces and heals the body, reporting failure (formerly 111) | Defeaturing a fillet face returns the box to 1000 mm³ |
| CAD-R112 | Named selection sets save groups of faces, edges, bodies or components (formerly 112) | A saved set re-selects the same faces after a rebuild |
| CAD-R113 | A material and appearance library stores density, description, colour and finish (formerly 113) | Assigning steel sets density 7.85 g/cm³ and a colour |

### Advanced exact inspection and model quality

| ID | Requirement | Acceptance test |
| --- | --- | --- |
| CAD-R114 | Curve and surface parameters (type, range, tangent, UV bounds, position, normal) are inspected at a location (formerly 114) | Picking a cylinder face reports surface type cylinder and its normal |
| CAD-R115 | Curvature and continuity are evaluated with combs or sampled overlays (formerly 115) | A circle edge shows constant curvature 1/r |
| CAD-R116 | Inertia tensor, principal moments and principal axes are reported (formerly 116) | A cube reports equal principal moments |
| CAD-R117 | Points are classified as inside, outside or on an exact solid (formerly 117) | The center of a box is inside; a point 1 mm outside its face is outside |
| CAD-R118 | Inspection annotations pinned to semantic references survive valid rebuilds (formerly 118) | A pinned distance stays attached after a width change |
| CAD-R119 | Two design states are compared by features, parameters, volume, mass, bounds and component counts (formerly 119) | Comparing two widths shows the volume difference |
| CAD-R120 | A geometry validity report flags open, degenerate, invalid or tolerance-sensitive conditions (formerly 120) | A valid box reports valid; an invalid shape reports a problem |
| CAD-R121 | Planar section area, centroid, principal orientation and area moments are computed (formerly 121) | A rectangular section reports area width × height |

### Sheet-metal design and fabrication

| ID | Requirement | Acceptance test |
| --- | --- | --- |
| CAD-R122 | A constant-thickness sheet-metal base flange is made from a planar profile (formerly 122) | A 100×50 profile with 2 mm thickness gives a 2 mm plate |
| CAD-R123 | Suitable thin-walled solids or faces convert to sheet metal after eligibility checks (formerly 123) | A uniform-thickness tray converts; a solid block is refused with the reason |
| CAD-R124 | Edge flanges have length, angle, alignment, end condition and bend radius (formerly 124) | A 90° flange of 20 mm adds a bent wall |
| CAD-R125 | Bends, rips and joints can be added and converted between bend and rip states (formerly 125) | Converting a joint to a rip leaves a manufacturable gap |
| CAD-R126 | Hems (straight, flattened, rolled) have radius, angle, length and gap (formerly 126) | A flattened hem folds the edge back |
| CAD-R127 | A jog forms an offset step with two coordinated bends (formerly 127) | A jog of 10 mm offsets the sheet by 10 mm |
| CAD-R128 | Corner and bend reliefs, corner breaks and gaps are controlled (formerly 128) | A relief removes the corner overlap |
| CAD-R129 | Sheet-metal tabs, cutouts and reusable formed-detail imprints can be added (formerly 129) | A louver imprint adds the formed detail to the flat pattern |
| CAD-R130 | Lofted sheet metal transitions between profiles with a flattenability check (formerly 130) | A square-to-round transition unfolds flat |
| CAD-R131 | Bend rules hold thickness, inside radius, K-factor, allowance, deduction, minimum gap and per-bend overrides (formerly 131) | Changing K-factor changes the flat length |
| CAD-R132 | A folded model and its flat pattern stay linked and inspectable together (formerly 132) | Editing a flange length updates the flat pattern |
| CAD-R133 | An editable bend table lists angle, radius, direction, allowance and bend order (formerly 133) | Reordering bends changes the sequence list |
| CAD-R134 | Flat patterns export as DXF or SVG with optional bend lines, tangent lines, forms and sketches (formerly 134) | The exported DXF has the flat outline at zero Z |

### Technical drawings and model-based definition

| ID | Requirement | Acceptance test |
| --- | --- | --- |
| CAD-R135 | Multi-sheet drawings link to parts, components, configurations, flat patterns and named views (formerly 135) | Adding a second sheet keeps the first |
| CAD-R136 | Hidden-line-removed base, projected and isometric views use first- or third-angle projection (formerly 136) | A projected right view of a box shows a rectangle |
| CAD-R137 | Auxiliary views are normal to a selected edge, axis or direction (formerly 137) | An auxiliary view of an inclined face shows its true shape |
| CAD-R138 | Section, aligned-section and broken-out views show cut geometry, indicators and hatching (formerly 138) | A section through a hole shows hatching either side |
| CAD-R139 | Detail, crop and break views enlarge, bound or shorten geometry without changing the model (formerly 139) | A 2× detail view shows the chosen area enlarged |
| CAD-R140 | Flat-pattern views show bends and forms with presentation controls (formerly 140) | A flat-pattern view shows bend lines |
| CAD-R141 | Linear, angular, radial, diameter, chamfer, coordinate and feature-linked dimensions are placed on drawing geometry (formerly 141) | A diameter dimension on a hole reads its model diameter |
| CAD-R142 | Dimension schemes and tolerances: ordinate, baseline, chain, min/max, dual-unit, precision, fit, limit, symmetric, deviation, basic (formerly 142) | A limit tolerance shows upper and lower values |
| CAD-R143 | Center marks, centerlines and hatching are generated and editable (formerly 143) | A hole gets a center mark |
| CAD-R144 | Hole, thread and bend callouts derive from model metadata with override (formerly 144) | A counterbore hole shows its diameters and depth |
| CAD-R145 | Datum identifiers and targets are placed and linked to references (formerly 145) | A datum A is attached to a face |
| CAD-R146 | GD&T feature-control frames are authored and linked to dimensions, datums and references (formerly 146) | A flatness frame attaches to a face |
| CAD-R147 | Surface-finish symbols are placed with configurable parameters (formerly 147) | A Ra 1.6 symbol attaches to an edge |
| CAD-R148 | Weld symbols and leaders are placed (formerly 148) | A fillet weld symbol attaches to a joint |
| CAD-R149 | Notes, leaders, revision clouds and markup are added without changing geometry (formerly 149) | A note with a leader attaches to a view |
| CAD-R150 | Custom drawing tables have editable, styled rows and columns (formerly 150) | Adding a row to an inspection table keeps the styling |
| CAD-R151 | BOM, cut-list and hole tables are generated with item balloons (formerly 151) | A two-part assembly lists two items with balloons |
| CAD-R152 | Title blocks, borders, zones and templates use project property placeholders (formerly 152) | A template fills the title from the project title |
| CAD-R153 | Revision tables and callouts are managed locally (formerly 153) | A new revision adds a row and a callout |
| CAD-R154 | Drawing standards set projection, units, precision, scales, line types and weights, annotation sizes and layers (formerly 154) | Switching to ISO changes the projection symbol |
| CAD-R155 | Drawings regenerate after model edits and show broken references instead of retargeting (formerly 155) | Deleting a referenced edge flags its dimension |
| CAD-R156 | Sheets export to PDF, SVG, DXF and PNG at deterministic scale (formerly 156) | An A3 sheet exports at 1:1 page size |
| CAD-R157 | Native model annotations (dimensions, tolerances, datums, notes) show in 3D and drawing views (formerly 157) | A model dimension appears in both views |

### Expanded lightweight assembly workflow

| ID | Requirement | Acceptance test |
| --- | --- | --- |
| CAD-R158 | Component patterns repeat instances linearly and circularly without copying geometry (formerly 158) | A circular pattern of 6 bolts shares one definition |
| CAD-R159 | Relations hold exact offsets and bounded travel or angle ranges (formerly 159) | A slider limited to 20 mm stops at 20 mm |
| CAD-R160 | A component definition can be replaced while compatible relations are kept and others flagged (formerly 160) | Replacing a bolt keeps its mate and flags an unmapped one |
| CAD-R161 | Component occurrences can be suppressed independently of visibility (formerly 161) | A suppressed occurrence is left out of mass and BOM |
| CAD-R162 | Sequenced exploded steps with trails play back locally (formerly 162) | Playing steps moves parts in order with trails |
| CAD-R163 | An assembly BOM workspace edits item number, part number, description, material, quantity, mass and custom properties (formerly 163) | Editing a part number updates the BOM row |

### Persistence and professional export

| ID | Requirement | Acceptance test |
| --- | --- | --- |
| CAD-R164 | The project autosaves to IndexedDB and offers recovery after an interruption (formerly 164) | Reloading after an edit offers to restore it |
| CAD-R165 | The project saves and opens as a portable `.inmocad` file (formerly 165) | Saving and reopening gives the same features and metadata |
| CAD-R166 | Older project schemas migrate deterministically and future ones are refused with a message (formerly 166) | Opening a schema-2 file shows a version message and changes nothing |
| CAD-R167 | Exact STEP export writes part and assembly geometry with hierarchy, names and colours where representable (formerly 167) | Exporting a box to STEP and importing it back keeps 1000 mm³ |
| CAD-R168 | 3MF export writes meshes with units and component and material metadata (formerly 168) | A 3MF opens with millimeter units |
| CAD-R169 | GLB and glTF export writes meshes with names, hierarchy, transforms, colours and metadata (formerly 169) | A GLB reopens with one node per body |
| CAD-R170 | STL export writes binary or ASCII with units and tessellation controls and a metadata sidecar (formerly 170) | A binary STL of a box has 12 triangles |
| CAD-R171 | OBJ/MTL export writes meshes and materials with a metadata sidecar (formerly 171) | An OBJ lists the box faces and its MTL |
| CAD-R172 | SVG and DXF export writes sketch, profile, projection or drawing geometry with units and layers (formerly 172) | A sketch exports as a DXF with its layer |
| CAD-R173 | PNG snapshot export sets size, background or transparency and view state (formerly 173) | A 1920×1080 transparent snapshot downloads |
| CAD-R174 | An export metadata editor sets filename, title, creator, organization, description, revision, part and project numbers, material, units, rights, licence and dates (formerly 174) | Editing the title changes it in the next export |
| CAD-R175 | Export tags and keywords are an ordered list separate from the file name (formerly 175) | Adding two tags keeps their order |
| CAD-R176 | Custom key/value export metadata is added and removed with validation and per-format disposition (formerly 176) | Adding key `supplier` lists it in the preview |
| CAD-R177 | A per-format metadata preview labels each field embedded, mapped or sidecar-only (formerly 177) | Choosing STL shows every field as sidecar-only |
| CAD-R178 | Per-format geometry controls (tessellation, tolerances, binary or text, units, precision, normals, edges, hierarchy) show only what the format supports (formerly 178) | STL offers binary/text; STEP offers none of them |
| CAD-R179 | Export preflight reports shape validity, mesh health, empty output, unsupported metadata, unit ambiguity and format limits (formerly 179) | Exporting an empty model is flagged before writing |
| CAD-R180 | Batch export names files from collision-safe templates and zips multiple files (formerly 180) | Exporting three bodies yields a ZIP of three uniquely named files |
| CAD-R181 | An export manifest lists file names, settings, metadata, checksums, units, revision and warnings (formerly 181) | The manifest has a SHA-256 for each file |

### Sketch intelligence and tolerance engineering

| ID | Requirement | Acceptance test |
| --- | --- | --- |
| CAD-R182 | Constraint proposals appear while drawing and apply only after the user accepts them (formerly 182) | Accepting a proposal adds the constraint; a stale or duplicate proposal is refused |
| CAD-R183 | Sketch diagnostics identify closed regions, open endpoints and micro-gaps before 3D features (formerly 183) | A rectangle with a 0.001 mm gap reports a micro-gap at its endpoints |
| CAD-R184 | Duplicate, overlapping and self-intersecting sketch geometry is detected and navigable (formerly 184) | Two lines crossing in their interiors report a self-intersection; shared endpoints do not |
| CAD-R185 | Tolerance and precision semantics attach to sketch and feature dimensions (formerly 185) | A ±0.1 mm tolerance on a width is stored with the dimension |
| CAD-R186 | A hole/shaft fit calculator gives ISO-style clearance or interference from nominal size and fit class (formerly 186) | H7/g6 at 20 mm gives the standard clearance range |
| CAD-R187 | A one-dimensional tolerance stack gives worst-case and RSS results from signed contributors (formerly 187) | Three contributors of ±0.1 mm give worst case 0.3 mm and RSS 0.173 mm |

### Mechanical content and mesh workflows

| ID | Requirement | Acceptance test |
| --- | --- | --- |
| CAD-R188 | A standard-hardware library generates bolts, screws, nuts, washers, pins, keys and spacers from local tables (formerly 188) | An M6 hex nut has the tabulated across-flats size |
| CAD-R189 | An involute gear and rack generator takes module or DP, pressure angle, teeth, backlash, thickness and bore (formerly 189) | A 20-tooth module-2 gear has a 40 mm pitch diameter |
| CAD-R190 | Mesh bodies support union, cut, intersection and watertight repair, kept separate from exact bodies (formerly 190) | Cutting two meshes gives a watertight mesh |
| CAD-R191 | Imported and export meshes can be refined or simplified with triangle counts reported (formerly 191) | Simplifying halves the triangle count and reports both |

### Command access and guidance

| ID | Requirement | Acceptance test |
| --- | --- | --- |
| CAD-R192 | A searchable command palette finds CAD commands, tools, views, inspection and export actions by name or alias (formerly 192) | Typing "fill" lists the fillet command |
| CAD-R193 | The model tree filters by name, type, status, suppression, visibility, warning state and feature family (formerly 193) | Typing "box" leaves only matching rows; the suppression selector shows only suppressed features |
| CAD-R194 | Favorite and recent commands are pinned and non-reserved shortcuts are remapped locally (formerly 194) | Pinning a command keeps it after reload |
| CAD-R195 | Guided, standard and precision modes change density and explanations without changing the project (formerly 195) | Switching to Guided adds explanations and leaves the features unchanged |

### Model tree, inspector and viewport

| ID | Requirement | Acceptance test |
| --- | --- | --- |
| CAD-R196 | The model tree lists sketches, bodies and features; selecting a row selects it in the inspector and viewport | Selecting a feature shows its parameters in the inspector |
| CAD-R197 | The inspector edits a selected feature's numeric parameters and keeps its kind read-only | Changing a box width updates the body; the kind field cannot be edited |
| CAD-R198 | Selecting a sketch in the model tree shows it in the sketch view instead of the 3D viewport | Selecting a sketch replaces the viewport with the sketch drawing |
| CAD-R199 | The sketch view draws points, lines, circles, arcs, ellipses, elliptical arcs and splines with construction styling and selects an entity by click or keyboard | A selected arc is highlighted; construction lines are drawn dashed |
| CAD-R200 | Clicking a body in the viewport selects and highlights it; dragging to orbit does not select | Clicking a box highlights it; a drag leaves the selection |
| CAD-R201 | The viewport announces how many tessellated bodies it shows | With one box the viewport is labelled "CAD viewport showing 1 tessellated body" |
| CAD-R202 | A rebuild that fails names the failing feature | A cylinder with an invalid radius fails with that feature's id |
| CAD-R203 | After a failed rebuild the viewport keeps the last valid bodies and shows the message in an alert | After an invalid edit, the previous bodies remain and an alert shows the message |

### Kernel and worker

| ID | Requirement | Acceptance test |
| --- | --- | --- |
| CAD-R204 | The exact kernel loads only when CAD Studio opens and runs in a dedicated module worker | Opening the CAD route starts one worker; other routes start none |
| CAD-R205 | An unsupported browser gets one message listing every missing WebAssembly feature and the kernel is not started | A browser without SIMD shows the missing feature and no kernel starts |
| CAD-R206 | Results from superseded or restarted requests are discarded | After a restart, a late response from the old worker is ignored |
| CAD-R207 | Mesh buffers move between worker and page without copying and malformed requests are refused | A tessellation buffer is transferred once; a request with a bad revision is rejected |
| CAD-R208 | Topology references resolve to a face, edge or vertex by provenance and geometry, and report ambiguity or absence instead of guessing | Two equally plausible edges report ambiguous |
| CAD-R209 | Lengths and angles convert between supported units through millimeters and radians, and non-finite values are refused | 1 in converts to 25.4 mm and back |

## Non-functional requirements

| ID | Requirement | Acceptance test |
| --- | --- | --- |
| CAD-R210 | The workspace follows the site-wide theme chosen in the site header (light, dark, system) and passes the colour-contrast check in dark | `E2E_THEME=dark` accessibility run passes for this route |
| CAD-R211 | The layout has no horizontal overflow from 320 px to 2560 px | Page scroll width equals client width at 320, 375, 768, 1024, 1440, 1920 and 2560 px |
| CAD-R212 | The workspace has no serious or critical axe violations | Axe sweep of the route |

## Definition of done

The tool is complete when every requirement is `verified` or `prohibited`, and the completion gates in `.tasks/PROJECT_COMPLETION.md` are met.

## Technique decisions

None: no function was compared between an ML and a non-ML method.

## Intent not recorded

- CAD-R080 and CAD-R083: whether the orthographic camera and display modes replace or extend the current single shaded perspective view is not recorded.
- CAD-R210: how the CAD workspace combines with the site-wide theme is not recorded.

## Change log

- 2026-10-05 — Created: 212 requirements as built at 5fb22493.

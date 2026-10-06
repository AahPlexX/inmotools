---
tool: cad-studio
folder: src/tools/cad
doc: tracker
basis: as-built
status: active
spec: docs/superpowers/specs/2026-10-05-cad-studio-design.md
tracker: src/tools/cad/TRACKER.md
updated: 2026-10-05
---

# CAD Studio — tracker

## Resume here

212 requirements: 14 verified, 4 implemented, 74 partial, 120 missing, 0 prohibited. Next action: expose the engine in the workspace: sketch creation and editing (CAD-R001–CAD-R032), then the feature dialogs (CAD-R034–CAD-R058).

## Documents

- Spec: [2026-10-05-cad-studio-design.md](../../../docs/superpowers/specs/2026-10-05-cad-studio-design.md)
- Older design (history): [2026-09-11-cad-studio-design.md](../../../docs/superpowers/specs/2026-09-11-cad-studio-design.md), [2026-09-11-cad-studio-capability-expansion.md](../../../docs/superpowers/specs/2026-09-11-cad-studio-capability-expansion.md), [2026-09-11-cad-studio-dependency-decision.md](../../../docs/superpowers/specs/2026-09-11-cad-studio-dependency-decision.md)
- Plans (history): [2026-09-11-cad-studio.md](../../../docs/superpowers/plans/2026-09-11-cad-studio.md), [2026-09-11-cad-studio-capability-expansion.md](../../../docs/superpowers/plans/2026-09-11-cad-studio-capability-expansion.md), [2026-09-15-cad-studio-main-reconciliation.md](../../../docs/superpowers/plans/2026-09-15-cad-studio-main-reconciliation.md)
- Completion ledger (history, 16 gates): [.tasks/CAD_STUDIO.md](../../../.tasks/CAD_STUDIO.md)
- Task: [T-cad-studio-20261005-2c4b](../../../.tasks/items/T-cad-studio-20261005-2c4b.md)
- Index row: [TOOL_INDEX.md](../../../docs/TOOL_INDEX.md)
- Unit tests: `tests/unit/cad-*.test.ts(x)`; browser tests: `tests/e2e/cad-studio.spec.ts`

## Requirement status

`unit` = `tests/unit/cad-*.test.ts(x)`; `e2e` = `tests/e2e/cad-studio.spec.ts` unless named. Rows marked `partial` with "no workspace control" have an engine function in `src/tools/cad/` that the workspace does not yet expose.

| ID | Status | Evidence | Notes |
| --- | --- | --- | --- |
| CAD-R001 | partial | unit "identifies a closed line region without mutating the sketch", "treats full ellipses and closed splines as intrinsic closed regions while ignoring construction curves" | Line entity with a construction flag exists in the sketch model; no sketch editor in the workspace; no polyline, polygon or centerline tool |
| CAD-R002 | missing | — | No rectangle entity or tool |
| CAD-R003 | partial | unit "accepts well-formed arc, ellipse, elliptical arc, and spline geometry" | Circle entity (center and radius) exists; no three-point circle; no sketch editor |
| CAD-R004 | partial | unit "models circular arcs using semantic center/start/end point references" | Center/start/end arc entity exists; no three-point or tangent arc; no sketch editor |
| CAD-R005 | partial | unit "models full ellipses separately from elliptical arcs", "rejects malformed advanced geometry instead of passing invalid curves downstream" | Entities, solver locking and viewer rendering exist; no sketch editor |
| CAD-R006 | missing | — | No slot entity or tool |
| CAD-R007 | partial | unit "interpolates every fit point for a degree-three spline with only three fit points", "honors explicit open-spline endpoint tangent vectors as normalized-parameter derivatives", "builds a periodic closed spline that interpolates its fit points and closes position and derivative" | Evaluator and model exist; no sketch editor; the sketch viewer draws fit points as a polyline |
| CAD-R008 | partial | unit "collects only point entities, keyed by id" | Point entity exists; no sketch editor |
| CAD-R009 | missing | — | Not in the code |
| CAD-R010 | missing | — | Open endpoints and gaps are reported (see the sketch diagnostics rows) but not repaired |
| CAD-R011 | missing | — | Not in the code |
| CAD-R012 | missing | — | Point mirror exists only as a constraint (see the symmetry row) |
| CAD-R013 | missing | — | Not in the code |
| CAD-R014 | missing | — | Not in the code |
| CAD-R015 | partial | unit "proposes horizontal and vertical constraints without mutating geometry", "proposes coincidence for distinct near points but not a point with itself", "proposes line-circle tangency when distance-to-line matches radius within tolerance" | Constraint proposals exist; no snapping to endpoints, midpoints, quadrants, intersections, projected geometry or grid; no sketch editor |
| CAD-R016 | partial | unit "extrudes a sketch placed on a resolved offset datum plane", "rejects unresolved datum and face planes instead of silently placing them on an origin plane" | Origin and datum planes work; face planes are rejected; no workspace control to choose a plane |
| CAD-R017 | partial | unit "proposes coincidence for distinct near points but not a point with itself" | Solver handles the constraint; no test solves it; no sketch editor |
| CAD-R018 | partial | unit "solves a fully constrained line without violating hard constraints" | The solver tests use horizontal; vertical is only proposed in a test; no sketch editor |
| CAD-R019 | partial | unit "solves perpendicular line geometry without requiring a vertical constraint", "solves parallel line geometry while retaining independent line placement" | No sketch editor |
| CAD-R020 | partial | unit "solves line-circle tangency while preserving fixed line and center geometry", "solves a free line tangent to an axis-aligned ellipse in normalized ellipse space", "rejects tangency whose contact lies on the excluded half of a circular arc", "accepts a fixed line that is exactly tangent to a degree-one spline" | No sketch editor |
| CAD-R021 | partial | unit "solves concentric circles by sharing the same solved center", "shares a solved center between an arc and a concentric elliptical arc" | No sketch editor |
| CAD-R022 | partial | unit "solves equal line lengths without duplicating a driving dimension", "solves equal circle radii while preserving independently fixed centers" | No sketch editor |
| CAD-R023 | partial | unit "solves a point to the exact midpoint of a fixed line", "constrains a point to a line while preserving one along-line degree of freedom", "keeps a point on the finite directed span of a circular arc", "solves the contact parameter for a fixed point constrained to an interpolating spline" | No sketch editor |
| CAD-R024 | partial | unit "mirrors one point across a fixed construction axis" | No sketch editor |
| CAD-R025 | partial | unit "locks a line by preserving both endpoint coordinates", "locks a circle by preserving center and radius", "locks a spline in place through a fixed-entity constraint" | No sketch editor |
| CAD-R026 | partial | unit "solves horizontal and vertical point distances independently" | No sketch editor |
| CAD-R027 | partial | unit "uses an explicit line-length constraint without exposing endpoint IDs to the caller", "solves a circle from a diameter dimension", "solves the angle between two lines using canonical radians", "solves an arc radius dimension by adjusting the shared radius from its center" | No sketch editor |
| CAD-R028 | partial | unit "measures reference dimensions without mutating or constraining geometry" | No sketch editor |
| CAD-R029 | partial | unit "reports solver state and remaining degrees of freedom without mutating the sketch", "reports remaining degrees of freedom for an under-constrained sketch" | Analysis function exists; no live indicator in the workspace |
| CAD-R030 | partial | unit "isolates conflicting constraints instead of silently dropping them", "returns deterministic conflict ids for an over-constrained sketch", "keeps disabled constraints out of solving and conflict analysis" | No conflict display in the workspace |
| CAD-R031 | partial | unit "supports a soft drag target while hard constraints remain satisfied" | Solver option only; no drag interaction |
| CAD-R032 | partial | unit "binds a driving length formula to canonical millimeters before solving", "binds an angle parameter using canonical radians", "rejects formula dimensions that do not match the constraint dimension" | Binding function exists; no numeric-entry dialog in the workspace |
| CAD-R033 | partial | e2e "starts empty, then tessellates an added box and cylinder in the worker kernel"; unit "creates independent editable primitive bodies without mutating the original project", "evaluates exact primitive parameters into the owning body", "builds a tube by cutting coaxial cylinders and releases both temporary shapes", "evaluates an exact straight tube with analytic volume and expected bounds" | Box, cylinder, sphere, cone, torus and tube exist; no ellipsoid |
| CAD-R034 | partial | unit "builds a solved sketch profile once and extrudes it along the sketch normal", "evaluates an extrude -> fillet -> datum-plane -> hole part end to end against the real kernel", "evaluates boolean dependencies in feature order and releases intermediate native shapes" | Extrude and the Boolean feature exist; no extrude dialog; no single new/add/cut/intersect option on the extrude feature |
| CAD-R035 | partial | unit "cuts a through-all hole exactly through the body regardless of the oversized cut tool" | Distance with a reverse flag and through-all holes exist; no symmetric, two-sided, up-to-face or up-to-next extent |
| CAD-R036 | missing | — | Not in the code |
| CAD-R037 | partial | unit "revolves the same exact profile around a sketch construction line", "revolves around a reusable two-point datum axis", "revolves an exact rectangular profile through one full turn" | No revolve dialog; new/add/cut through separate Boolean features |
| CAD-R038 | partial | unit "evaluates a sweep from a closed sketch wire and a separate open sketch path", "sweeps an exact circular wire along a straight exact spine", "sweeps a small circle along a real exact helix into a coil solid" | No orientation modes; no sweep dialog |
| CAD-R039 | partial | unit "builds loft sections as exact wires and releases every temporary section", "lofts two exact circular wires into a solid frustum" | No guide curves or alignment controls; no loft dialog |
| CAD-R040 | partial | unit "performs a real OCCT cylindrical cut that reduces exact volume", "chains a Boolean result into a second Boolean operation as its own tool body" | No Boolean control in the workspace |
| CAD-R041 | partial | unit "cuts a blind hole by extruding its circular profile opposite the sketch normal", "sizes a through-all hole from the dependency body bounds instead of a fixed depth", "fuses a wider shallow counterbore tool with the full-depth bore before cutting", "fuses a conical frustum with the full-depth bore for a countersink" | No clearance or tapped presets; placement patterns through the pattern feature only; no hole dialog |
| CAD-R042 | partial | unit "feeds only ephemeral resolved edge ids into a real exact fillet", "resolves a fillet edge from persisted fingerprints before invoking the exact kernel" | No edge picking or fillet dialog |
| CAD-R043 | missing | — | Not in the code |
| CAD-R044 | partial | unit "uses the same semantic edge resolver for chamfer rather than persisting edge ordinals" | Single distance only; no asymmetric chamfer; test uses a mocked kernel; no dialog |
| CAD-R045 | partial | unit "enumerates serializable face fingerprints and feeds resolved ids into a real exact shell", "resolves a shell face from persisted fingerprints before invoking the exact kernel" | No face picking or shell dialog |
| CAD-R046 | partial | unit "thickens a planar exact face into a solid of the expected volume", "thickens a dependency shape by a signed distance" | No thicken dialog |
| CAD-R047 | partial | unit "feeds a resolved face id into a real exact draft and changes the solid volume", "drafts two faces of the same body regardless of which order the topology references are given in", "drafts multiple faces sequentially, resolving each against the shape the previous draft produced" | Pull direction is a parameter, not a neutral plane or edge pick; no draft dialog |
| CAD-R048 | partial | unit "offsets one earlier exact feature by a signed non-zero distance", "rejects missing dependencies and zero-distance no-op offsets with feature attribution" | Whole-shape offset only; no selected-face offset; no dialog |
| CAD-R049 | partial | unit "splits a solid into one compound of fragments that preserves total volume and bounds", "splits a shape by one or more tool dependencies into a single compound" | Tool shapes are earlier features; no datum-plane, face, surface or sketch-derived picker; no dialog |
| CAD-R050 | partial | unit "extrudes a thickened wall along a straight centerline and fuses it onto the body", "adds a rib wall onto a body by fusing an extruded, thickened centerline", "reverses a rib to extrude opposite the sketch normal when requested" | Single straight line centerline only; closed profiles and curved or multi-segment centerlines rejected; no dialog |
| CAD-R051 | partial | unit "mirrors an exact box across a plane while preserving its volume", "mirrors a body across a sketch-referenced plane", "rejects a mirror plane with a zero-length normal" | Feature mirror only; no dialog |
| CAD-R052 | partial | unit "translates the seed shape by an increasing multiple of the step vector for a linear pattern", "rotates the seed shape by an increasing multiple of the angle step for a circular pattern", "builds a linear pattern as one compound whose volume is exactly the sum of its non-overlapping instances", "uses a reusable datum axis for a circular pattern" | No grid pattern; no per-instance suppression; result is one compound; no dialog |
| CAD-R053 | partial | unit "builds a real exact helix wire spanning exactly its declared radius and height", "rejects a helix with a non-positive radius", "sweeps along an inline helix path instead of a sketch when a helix parameter is given" | Available only inside the sweep feature; no standalone helix feature; no dialog |
| CAD-R054 | missing | — | `thread` is a feature type; the evaluator reports it as not implemented |
| CAD-R055 | missing | — | `text` is a feature type; the evaluator reports it as not implemented |
| CAD-R056 | missing | — | `transform` is a feature type; the evaluator reports it as not implemented; translate and rotate exist only inside pattern |
| CAD-R057 | partial | unit "resolves an offset datum plane parallel to its base origin plane", "resolves the midplane halfway between two parallel plane frames", "resolves a three-point datum plane with the first point as origin and a right-handed in-plane frame", "resolves a plane rotated around a reusable datum axis", "rejects an unsupported datum plane kind instead of guessing an orientation" | Offset, angle, mid-plane and three-point exist; no tangent or face-derived plane; no datum control in the workspace |
| CAD-R058 | partial | unit "resolves a datum axis through two distinct 3D points", "resolves the intersection axis of two nonparallel planes", "rejects parallel planes for a two-plane datum axis", "rejects coincident two-point datum-axis inputs" | No axes tied to edges or cylindrical faces; no coordinate systems; no datum control in the workspace |
| CAD-R059 | partial | unit "lofts two exact circular wires into a solid frustum" | Loft accepts a `solid` flag; no ruled surface; the test covers the solid case; `surface` is a feature type the evaluator reports as not implemented |
| CAD-R060 | partial | unit "sews six individually built exact faces into one closed 1000 mm^3 solid", "sews three or more dependency shapes into one solid", "rejects a sew feature with fewer than two dependencies" | No dialog |
| CAD-R061 | missing | — | Not in the code |
| CAD-R062 | missing | — | Not in the code |
| CAD-R063 | partial | unit "heals an already-valid solid without changing its volume", "warns with the feature id when a healed shape is still invalid afterward, without failing evaluation", "does not warn when a healed shape is valid afterward" | No report of what changed; no dialog |
| CAD-R064 | partial | unit "unifies same-domain faces on a solid without changing its volume", "unifies same-domain faces on a dependency shape" | No dialog |
| CAD-R065 | partial | unit "heals an already-valid solid without changing its volume", "sews six individually built exact faces into one closed 1000 mm^3 solid" | Sew corrects an inverted solid; heal is the general fix; no imported-shape repair workflow |
| CAD-R066 | verified | e2e "suppressing a feature removes its body, and undo and redo restore each state"; unit "invalidates only the selected feature and its downstream dependency closure", "updates a feature parameter and marks it plus its dependency closure dirty", "clears a stale diagnostic on the feature whose parameter changed" | The workspace requests a full rebuild on each change |
| CAD-R067 | partial | unit "rejects a reorder that would move a feature before one of its dependencies", "allows a dependency-safe reorder of independent features and keeps body feature order aligned" | No reorder control in the workspace |
| CAD-R068 | verified | e2e "suppressing a feature removes its body, and undo and redo restore each state"; unit "skips suppressed features without constructing native geometry", "does not treat suppressed dependents as rebuilt geometry while preserving their dependency identity" |  |
| CAD-R069 | missing | — | Not in the code |
| CAD-R070 | partial | unit "evaluates unit literals into canonical millimeters and radians", "resolves named dependencies without changing their dimensional meaning", "rejects dimensionally invalid addition instead of coercing units silently", "detects parameter dependency cycles with the involved names" | Engine only; the project's parameter list is not editable in the workspace |
| CAD-R071 | partial | unit "binds a driving length formula to canonical millimeters before solving" | Binding exists for sketch dimensions only; feature parameters hold plain values |
| CAD-R072 | missing | — | The project record has a `configurations` list; nothing reads it |
| CAD-R073 | missing | — | Not in the code |
| CAD-R074 | missing | — | The project record has a `snapshots` list; nothing reads it |
| CAD-R075 | verified | e2e "starts empty, then tessellates an added box and cylinder in the worker kernel", "suppressing a feature removes its body, and undo and redo restore each state"; unit "preserves undo/redo semantics and clears redo after a divergent commit", "caps retained undo history at the configured limit", "does not add an undo step when an unchanged parameter loses focus" |  |
| CAD-R076 | partial | unit "is true only for a matching body selection", "returns the first defined body id (nearest raycast hit)" | Body selection only; no vertex, edge, face or component picking; no filters |
| CAD-R077 | missing | — | Not in the code |
| CAD-R078 | missing | — | Not in the code |
| CAD-R079 | missing | — | The inspector shows the selected feature's parameters only |
| CAD-R080 | partial | — | Perspective camera only (`CadViewport.tsx`); no switch |
| CAD-R081 | missing | — | Not in the code |
| CAD-R082 | partial | unit "computes the center and radius of a bounds box", "floors the radius so a degenerate (flat/point) body still frames sensibly", "unions bounds across multiple bodies without recomputing from geometry" | Orbit controls and fit-to-bounds exist in `CadViewport.tsx`; no fit-selection, zoom-region or button alternatives |
| CAD-R083 | missing | — | Shaded mode only |
| CAD-R084 | partial | unit "renders a body visibility checkbox with its current visibility state", "toggles body visibility immutably and leaves unknown bodies untouched" | Bodies only; no isolate; no sketch, component or datum visibility |
| CAD-R085 | partial | unit "creates an analytic 20 × 10 × 5 box with exact engineering queries" | Kernel queries exist; the worker measure request returns an evaluation-failed error; no measure tool |
| CAD-R086 | missing | — | Not in the code |
| CAD-R087 | missing | — | Not in the code |
| CAD-R088 | missing | — | Not in the code |
| CAD-R089 | missing | — | Not in the code |
| CAD-R090 | missing | — | Not in the code |
| CAD-R091 | missing | — | Not in the code |
| CAD-R092 | missing | — | Not in the code |
| CAD-R093 | missing | — | The project record has a `components` list; nothing reads it |
| CAD-R094 | missing | — | Not in the code |
| CAD-R095 | missing | — | Not in the code |
| CAD-R096 | missing | — | The project record has an `assemblyRelations` list; nothing reads it |
| CAD-R097 | missing | — | Not in the code |
| CAD-R098 | missing | — | Not in the code |
| CAD-R099 | missing | — | Not in the code |
| CAD-R100 | missing | — | Not in the code |
| CAD-R101 | partial | unit "imports exact BREP into worker-owned state and returns a final-quality mesh" | Worker import accepts STEP; the test covers BREP; the adapter wraps the result as a single body, so hierarchy, names, colours and transforms are dropped; no import control |
| CAD-R102 | partial | unit "exports the worker-owned exact body back to BREP through the protocol executor", "round-trips exact geometry through binary BREP without losing box volume", "replaces prior imported worker state instead of accumulating export bodies" | Worker and adapter support it; no file control in the workspace |
| CAD-R103 | missing | — | Not in the code |
| CAD-R104 | missing | — | Not in the code |
| CAD-R105 | missing | — | Not in the code |
| CAD-R106 | missing | — | Not in the code |
| CAD-R107 | missing | — | Not in the code |
| CAD-R108 | missing | — | Not in the code |
| CAD-R109 | missing | — | Not in the code |
| CAD-R110 | partial | unit "builds a real exact helix wire spanning exactly its declared radius and height" | Helix wire inside sweep only; no other 3D curves; no reusable curve feature |
| CAD-R111 | partial | unit "removes a real fillet feature and heals the surrounding faces back toward the plain box", "resolves defeature faces from persisted fingerprints before invoking the exact kernel" | No face picking or dialog |
| CAD-R112 | missing | — | Not in the code |
| CAD-R113 | missing | — | The project record has a `materials` list; nothing reads it |
| CAD-R114 | missing | — | Topology fingerprints record surface and curve type internally; no inspector |
| CAD-R115 | missing | — | Not in the code |
| CAD-R116 | missing | — | Not in the code |
| CAD-R117 | missing | — | Not in the code |
| CAD-R118 | missing | — | Not in the code |
| CAD-R119 | missing | — | Not in the code |
| CAD-R120 | partial | unit "reports a well-formed solid as valid", "warns with the feature id when a healed shape is still invalid afterward, without failing evaluation" | Pass/fail validity after heal only; no shell, wire or tolerance report; no report view |
| CAD-R121 | missing | — | Not in the code |
| CAD-R122 | missing | — | Not in the code |
| CAD-R123 | missing | — | Not in the code |
| CAD-R124 | missing | — | Not in the code |
| CAD-R125 | missing | — | Not in the code |
| CAD-R126 | missing | — | Not in the code |
| CAD-R127 | missing | — | Not in the code |
| CAD-R128 | missing | — | Not in the code |
| CAD-R129 | missing | — | Not in the code |
| CAD-R130 | missing | — | Not in the code |
| CAD-R131 | missing | — | Not in the code |
| CAD-R132 | missing | — | Not in the code |
| CAD-R133 | missing | — | Not in the code |
| CAD-R134 | missing | — | Not in the code |
| CAD-R135 | missing | — | Not in the code |
| CAD-R136 | missing | — | Not in the code |
| CAD-R137 | missing | — | Not in the code |
| CAD-R138 | missing | — | Not in the code |
| CAD-R139 | missing | — | Not in the code |
| CAD-R140 | missing | — | Not in the code |
| CAD-R141 | missing | — | Not in the code |
| CAD-R142 | missing | — | Not in the code |
| CAD-R143 | missing | — | Not in the code |
| CAD-R144 | missing | — | Not in the code |
| CAD-R145 | missing | — | Not in the code |
| CAD-R146 | missing | — | Not in the code |
| CAD-R147 | missing | — | Not in the code |
| CAD-R148 | missing | — | Not in the code |
| CAD-R149 | missing | — | Not in the code |
| CAD-R150 | missing | — | Not in the code |
| CAD-R151 | missing | — | Not in the code |
| CAD-R152 | missing | — | Not in the code |
| CAD-R153 | missing | — | Not in the code |
| CAD-R154 | missing | — | Not in the code |
| CAD-R155 | missing | — | Not in the code |
| CAD-R156 | missing | — | Not in the code |
| CAD-R157 | missing | — | Not in the code |
| CAD-R158 | missing | — | Not in the code |
| CAD-R159 | missing | — | Not in the code |
| CAD-R160 | missing | — | Not in the code |
| CAD-R161 | missing | — | Not in the code |
| CAD-R162 | missing | — | Not in the code |
| CAD-R163 | missing | — | Not in the code |
| CAD-R164 | missing | — | The workspace keeps history in memory only |
| CAD-R165 | missing | — | Not in the code |
| CAD-R166 | missing | — | The project record carries `schemaVersion: 1`; no reader |
| CAD-R167 | partial | unit "round-trips exact geometry through STEP without losing box volume" | Geometry only; no hierarchy, names or colours; worker export exists; no export control |
| CAD-R168 | missing | — | Not in the code |
| CAD-R169 | missing | — | The adapter's glTF export throws by design until the export layer exists |
| CAD-R170 | partial | — | Worker export writes ASCII or binary STL of the first body; no test covers STL; no units, tessellation controls, sidecar or export control |
| CAD-R171 | missing | — | Not in the code |
| CAD-R172 | missing | — | Not in the code |
| CAD-R173 | missing | — | Not in the code |
| CAD-R174 | partial | unit "creates a serializable project with stable canonical defaults" | Project metadata record holds the fields; no editor and no exporter reads it |
| CAD-R175 | partial | unit "creates a serializable project with stable canonical defaults" | Project metadata holds a tags list; no editor |
| CAD-R176 | partial | unit "creates a serializable project with stable canonical defaults" | Project metadata holds a custom map; no editor or validation |
| CAD-R177 | missing | — | Not in the code |
| CAD-R178 | missing | — | The worker takes a quality option only |
| CAD-R179 | missing | — | The worker refuses to export with no bodies; no preflight report |
| CAD-R180 | missing | — | Not in the code |
| CAD-R181 | missing | — | Not in the code |
| CAD-R182 | partial | unit "explicitly accepts a current proposal and returns solved geometry without mutating the source sketch", "rejects a semantically duplicate relationship even when the existing constraint has a different id", "rejects a stale proposal when the current sketch can no longer satisfy it", "orders proposals deterministically and exposes bounded confidence plus a user-facing reason" | Engine only; no proposal display in the workspace |
| CAD-R183 | partial | unit "identifies a closed line region without mutating the sketch", "reports a micro-gap between otherwise connectable open endpoints", "uses arc and line endpoints together to recognize mixed closed profiles", "includes open spline and elliptical-arc endpoints in open-endpoint and micro-gap diagnostics" | Nesting ambiguity is not reported; no diagnostics display |
| CAD-R184 | partial | unit "reports duplicate and partially overlapping line geometry deterministically", "reports interior line crossings as self-intersections but ignores shared endpoints" | Lines only; no navigation to the finding |
| CAD-R185 | missing | — | Not in the code |
| CAD-R186 | missing | — | Not in the code |
| CAD-R187 | missing | — | Not in the code |
| CAD-R188 | missing | — | Not in the code |
| CAD-R189 | missing | — | Not in the code |
| CAD-R190 | missing | — | `manifold-3d` is a project dependency; no CAD code uses it |
| CAD-R191 | missing | — | Not in the code |
| CAD-R192 | missing | — | Not in the code |
| CAD-R193 | partial | unit "matches tree labels and types case-insensitively and leaves empty queries unfiltered", "filters feature suppression state independently of name and type search", "renders a labeled search field for a non-empty tree", "renders an accessible suppression filter with all features shown by default" | Name, type and suppression filters exist; no body, status, visibility, warning or family filter |
| CAD-R194 | missing | — | Not in the code |
| CAD-R195 | missing | — | Not in the code |
| CAD-R196 | verified | e2e "starts empty, then tessellates an added box and cylinder in the worker kernel"; unit "resolves the selected feature by id when the selection kind is feature", "returns null when the selected feature id no longer exists" |  |
| CAD-R197 | verified | unit "shows primitive kind as read-only while keeping dimensions editable", "updates a feature parameter and marks it plus its dependency closure dirty" |  |
| CAD-R198 | implemented | — | `CadWorkspace.tsx`; selection lookup is unit tested ("resolves the selected sketch by id when the selection kind is sketch") but the swap is not; no workspace control creates a sketch |
| CAD-R199 | implemented | unit "a short (90 degree) counterclockwise sweep is a small, negative-direction (sweepFlag 0) arc", "the flags this module computes always reconstruct the sketch arc's own (view-mapped) center", "adds a proportional margin and flips y for display", "describes an empty sketch" | Geometry helpers are unit tested; the component is not rendered in a test |
| CAD-R200 | implemented | unit "assigns the highlight material only to the selected body and the base material to the rest", "exceeds the threshold once movement crosses it (an orbit drag, not a click)", "returns null for no hits at all (clicked empty space)" | Helpers are unit tested; the raycast handler in `CadViewport.tsx` is not run in a test |
| CAD-R201 | verified | e2e "starts empty, then tessellates an added box and cylinder in the worker kernel"; unit "describes an empty, idle viewport" |  |
| CAD-R202 | verified | unit "attributes invalid rebuild parameters to the failing feature", "surfaces invalid feature parameters with the failing feature id and releases prior geometry", "attributes an open-profile rejection to the feature being rebuilt" |  |
| CAD-R203 | implemented | — | `CadWorkspace.tsx` keeps bodies and sets the error; the worker runtime keeps prior state on failure; no test fails a rebuild through the workspace |
| CAD-R204 | verified | unit "uses a dedicated module worker with a stable diagnostic name", "lazily initializes one executor and forwards later requests through the same worker lifetime", "initializes its executor once and echoes each valid request revision" |  |
| CAD-R205 | verified | unit "reports every missing capability in one non-recoverable unsupported-browser error", "runs the capability probe before kernel initialization and skips initialization when unsupported", "reports unsupported browsers without initializing the exact kernel executor" |  |
| CAD-R206 | verified | unit "issues strictly increasing request revisions and accepts only the latest response", "hard restart terminates the old worker and rejects every late response from that generation", "disposal terminates the worker and prevents further requests" |  |
| CAD-R207 | verified | unit "collects each tessellation ArrayBuffer exactly once for zero-copy worker transfer", "posts tessellation buffers as transferables exactly once", "rejects malformed requests before lazy kernel initialization" |  |
| CAD-R208 | verified | unit "resolves the uniquely best semantic candidate without relying on a raw sub-shape ordinal", "reports ambiguity instead of silently choosing between equally plausible candidates", "reports missing when provenance and topology kind do not match", "stops an ambiguous topology reference instead of guessing a raw subshape index" |  |
| CAD-R209 | verified | unit "round-trips supported length units through canonical millimeters", "round-trips degrees and radians through canonical radians", "rejects non-finite values instead of polluting the project model" |  |
| CAD-R210 | partial | — | Site theme selector exists; the CAD workspace has no stylesheet of its own; no dark-theme run for this route is recorded |
| CAD-R211 | partial | — | No CAD stylesheet and no overflow test for this route |
| CAD-R212 | verified | e2e (`tests/e2e/accessibility.spec.ts`) "has no serious or critical axe violations at <route>" |  |

## Open work

1. CAD-R001–CAD-R016, CAD-R017–CAD-R032: sketch editor in the workspace (drawing tools, constraints, dimensions, inference, diagnostics display); missing sketch tools CAD-R002, CAD-R006, CAD-R009–CAD-R014.
2. CAD-R034–CAD-R058: feature dialogs and picking for the implemented exact features; missing CAD-R036, CAD-R043, CAD-R054–CAD-R056; gaps in CAD-R033, CAD-R035, CAD-R044, CAD-R052, CAD-R057, CAD-R058.
3. CAD-R059–CAD-R075: surfaces, repair, rollback, configurations, range preview, snapshots, reorder and parameter controls.
4. CAD-R076–CAD-R092: selection filters, views, display modes, measurement tool, section and inspection checks.
5. CAD-R093–CAD-R100, CAD-R158–CAD-R163: components and assemblies.
6. CAD-R101–CAD-R121: import workflows, reusable engineering data and advanced inspection.
7. CAD-R122–CAD-R157: sheet metal, technical drawings and model-based definition.
8. CAD-R164–CAD-R181: autosave, native project file, migration and export formats.
9. CAD-R182–CAD-R195: sketch-intelligence display, tolerance tools, engineering content, mesh workflows, command palette and guidance modes.
10. CAD-R198, CAD-R199, CAD-R200, CAD-R203: component-level tests; CAD-R210, CAD-R211: workspace stylesheet, overflow test and dark-theme run.

## Known limitations

- The workspace creates primitives only; sketches, features other than primitives, import, export and the inspection tools are reachable through the engine and tests, not the workspace.
- Each change requests a full rebuild in the worker.
- Spline sketch curves are drawn as fit-point polylines in the sketch view.
- The CAD route has no stylesheet of its own.

## Verification evidence

- 2026-10-05, `expand/cad-studio` from `main` @ `5fb22493`: `pnpm tool:check cad-studio --base origin/main` 14/212, no errors; `pnpm docs:sync` and `pnpm docs:check` passed; `pnpm exec vitest run tests/unit/cad-progress.test.ts tests/unit/sheets-wave-b.test.ts tests/unit/deployment-config.test.ts` passed.

## Change log

- 2026-10-05 — Created: 212 requirements as built at 5fb22493.

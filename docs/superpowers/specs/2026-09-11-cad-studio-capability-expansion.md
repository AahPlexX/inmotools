# CAD Studio Capability Expansion

**Date:** 2026-09-11
**Status:** Approved scope expansion
**Supplements:** `docs/superpowers/specs/2026-09-11-cad-studio-design.md`
**Current capability floor:** 195 user-facing capabilities

## Governing rule

The capability count is a floor, not a ceiling. CAD Studio must include a function when it is materially useful to general CAD, mechanical/product design, fabrication, technical communication, or the tool's any-user usability **and** it can be implemented credibly in the repository's local-first browser/GitHub Pages architecture.

A capability may be excluded only when one of these is true:

1. **Environment limitation:** the browser/static-hosting/kernel/runtime architecture cannot support it with acceptable correctness, reliability, performance, licensing, or security.
2. **Unrelated domain:** it belongs to a different product category rather than CAD Studio's mechanical/product-design boundary.
3. **Superseded:** an existing or planned capability already provides the same user outcome at equal or greater power without forcing duplicate UI or maintenance.
4. **Other:** only with an explicit written rationale in this document and the completion ledger. No capability may silently disappear under this category.

No `other` exclusions are identified by this audit.

## Evidence behind the expansion

The selected exact kernel exposes substantially more capability than the original 100-item list accounted for: exact BREP import/export, STEP/STL I/O, XCAF assemblies with names/colors, HLR and multiview SVG projection, curvature and inertia queries, point-in-solid classification, defeaturing, surface/curve interrogation, healing, worker execution, and shape-evolution tracking. These are directly compatible with a static browser application.

Modern browser CAD products also demonstrate that advanced sheet-metal and technical-drawing workflows are viable in a browser: folded/flat sheet-metal modeling with K-factor/bend rules and DXF flat-pattern export; projected/auxiliary/section/detail drawing views; dimensions/tolerances; GD&T; BOMs; balloons; revision tables; and manufacturing annotations.

The expansion therefore adds the following capabilities to the original authoritative 1–100 list.

## 101–113 — Import, reference, direct editing, and reusable engineering data

101. **Structured STEP/XCAF import** — import STEP assemblies/parts while preserving available hierarchy, names, colors, transforms, and exact geometry.
102. **Exact BREP import/export** — open and write OCCT BREP as a direct exact-geometry interchange/debug path without tessellation loss.
103. **STL import as a mesh/faceted reference body** — preserve mesh semantics rather than pretending arbitrary STL is editable exact B-Rep.
104. **OBJ/MTL import** — load local mesh geometry and material assignments as secondary/reference bodies.
105. **glTF/GLB import** — load local mesh/component structure and presentation properties as reference/mesh content.
106. **3MF import** — load additive-manufacturing meshes/components/material information where present.
107. **SVG profile import to sketch** — convert supported vector path primitives into editable sketch geometry with explicit scale/unit handling.
108. **DXF profile import to sketch** — import supported 2D drafting entities into editable sketches with unit and layer handling.
109. **Calibrated raster underlay** — place PNG/JPEG/WebP reference imagery on a sketch plane, calibrate known distance, transform/opacity-lock it, and trace without embedding a network dependency.
110. **Exact 3D curve workbench** — create reusable line, arc, circle, ellipse, Bézier, interpolated/B-spline/NURBS-style, and helix curves for sweep/loft/reference workflows.
111. **Defeature/remove-faces workflow** — remove selected detail faces/features where the kernel can heal the surrounding exact body, with explicit failure diagnostics.
112. **Named selection sets** — save semantic groups of faces/edges/bodies/components for repeated feature, inspection, visibility, export, and drawing operations.
113. **Material and appearance library** — built-in and user-defined local materials with density, description, appearance/color, finish notes, and export metadata mappings.

## 114–121 — Advanced exact inspection and model quality

114. **Curve/surface parameter inspector** — inspect curve type, parameter range, tangent, surface type, UV bounds, position, and normal at a selected location.
115. **Curvature and continuity inspection** — evaluate radius/curvature and visualize curve/surface continuity using combs or sampled overlays with clearly stated numerical limits.
116. **Inertia and principal-axis properties** — report inertia tensor, principal moments, and principal axes for eligible exact bodies/selected groups.
117. **Point-in-solid classification** — classify picked or numerically entered points as inside, outside, or on an exact solid boundary.
118. **Persistent inspection annotations** — pin measurements, notes, coordinates, and inspection results to semantic references so they survive valid rebuilds.
119. **Model/configuration/snapshot compare** — compare feature/parameter state plus geometric metrics such as volume, mass, bounds, and component counts between two local design states.
120. **Geometry validity and quality report** — validate body/shell/wire integrity and surface actionable open, degenerate, invalid, or tolerance-sensitive conditions before downstream work/export.
121. **Planar section properties** — compute section area, centroid, principal orientation, and second-area moments where the exact section geometry permits a trustworthy result.

## 122–134 — Sheet-metal design and fabrication

122. **Sheet metal from sketch/base flange** — create a constant-thickness sheet-metal model from a planar profile.
123. **Convert suitable solid/surface to sheet metal** — establish sheet thickness and bend semantics from eligible thin-walled or face-based geometry with explicit eligibility checks.
124. **Edge flange** — create one or more flanges with length, angle, alignment, end-condition, and bend-radius controls.
125. **Bend, rip, and joint editing** — add bends, convert eligible joints between bend/rip states, and preserve manufacturable gaps.
126. **Hem** — create straight/flattened/rolled hems with radius, angle, length, gap, and alignment controls.
127. **Jog** — form an offset sheet-metal step using two coordinated bends with offset, angle, alignment, and orientation controls.
128. **Corner and bend relief** — control corner relief, bend relief, corner breaks, gaps, and safe relief geometry.
129. **Tabs, cutouts, and reusable forming-tool imprints** — add sheet-metal tabs/cuts and a bounded library of exact reusable formed details where geometry remains manufacturable.
130. **Lofted sheet metal** — create eligible constant-thickness transitions between profiles with flattenability checks.
131. **Bend-rule system** — support thickness, inside radius, K-factor, bend allowance, bend deduction, minimum gap, and per-bend overrides.
132. **Simultaneous folded and flat pattern** — maintain linked folded geometry and an inspectable manufacturing flat pattern without destructively replacing either representation.
133. **Editable bend/joint table and bend sequence** — expose bend angle/radius/direction/allowance plus ordered bend planning metadata.
134. **Flat-pattern fabrication export** — export DXF/SVG flat patterns with optional bend centerlines, tangent lines, formed-feature outlines, sketches, and zero-Z normalization.

## 135–157 — Technical drawings and model-based definition

135. **Multi-sheet technical drawing workspace** — create local drawing documents linked to project parts, components, configurations, flat patterns, and named views.
136. **HLR base/projected/isometric views** — generate associative hidden-line-removed orthographic and isometric views with first- or third-angle projection.
137. **Auxiliary views** — generate views normal to selected eligible edges/axes/reference directions.
138. **Section, aligned-section, and broken-out section views** — produce associative cut geometry, section indicators, and hatching.
139. **Detail, crop, and break views** — create scaled details, bounded crops, and shortened long-part presentations without modifying the model.
140. **Flat-pattern drawing views** — place associative sheet-metal flat patterns with bend/form presentation controls.
141. **Associative dimensions** — place linear, angular, radial, diameter, chamfer, coordinate, and eligible feature-linked dimensions on drawing geometry.
142. **Advanced dimension schemes and tolerances** — ordinate, baseline, chain, min/max, dual-unit, precision, fit, limit, symmetric, deviation, basic, minimum, and maximum display modes.
143. **Center marks, centerlines, and hatching** — generate/edit conventional drawing center and section graphics.
144. **Hole/thread callouts and bend notes** — derive callouts from modeled hole/thread/sheet-metal metadata where available while allowing explicit override.
145. **Datums and datum targets** — place manufacturing datum identifiers and targets linked to drawing/model references.
146. **GD&T feature-control frames** — author standard geometric-tolerance frames and associate them with dimensions/datums/model references in the native project/drawing representation.
147. **Surface-finish symbols** — place configurable manufacturing surface-texture annotations.
148. **Weld symbols** — place configurable weld annotations and leaders for technical communication.
149. **Notes, leaders, revision clouds, and markup** — add editable non-geometric communication without modifying canonical geometry.
150. **Custom drawing tables** — create/style editable rows/columns for inspection, manufacturing, or project-specific data.
151. **BOM, cut-list, and hole tables with balloons** — generate structured/flattened component and manufacturing tables and associative item balloons.
152. **Title blocks, borders, zones, and templates** — create reusable local drawing formats with project/property placeholders.
153. **Revision tables and revision callouts** — manage local revision metadata and linked drawing revision marks without requiring a cloud release system.
154. **Drawing standards and styling** — configure ANSI/ISO-style projection, units, precision, scales, line types/weights, annotation sizes, and drawing layers.
155. **Associative drawing regeneration** — update linked views/tables/annotations after model/configuration edits while surfacing broken references instead of silently retargeting them.
156. **Drawing export** — export sheets to PDF, SVG, DXF, and PNG with deterministic page/sheet scaling.
157. **Model-based annotations** — store native model dimensions/tolerances/datums/notes as semantic project annotations and surface them in eligible 3D and drawing views; STEP PMI embedding remains conditional on verified adapter support.

## 158–163 — Expanded lightweight assembly workflow

158. **Component patterns** — create linear/circular patterns of component instances without duplicating source geometry.
159. **Relation offsets and motion limits** — add exact offsets and bounded travel/angle ranges to supported placement relationships.
160. **Replace/relink component** — swap a component definition while preserving compatible placement relations and explicitly flagging references that cannot be mapped.
161. **Component suppression** — suppress/unsuppress assembly occurrences independently of visibility and allow configuration overrides.
162. **Sequenced exploded steps and trails** — create ordered explosion steps, connector trails, and local playback for assembly/service communication.
163. **Assembly BOM/properties workspace** — inspect/edit item number, part number, description, material, quantity, mass, custom properties, and hierarchy independently of a drawing sheet.

## 164–181 — Persistence and professional export

164. **IndexedDB autosave and crash recovery** — continuously preserve versioned serializable project state locally and offer explicit recovery after interruption.
165. **Portable native `.inmocad` save/open** — package editable project state, metadata, configurations, drawing data, component definitions/references, local assets, and compatibility metadata.
166. **Schema migration and compatibility handling** — open supported older project schemas deterministically and refuse unsupported future/incompatible schemas with a clear diagnostic rather than corrupting state.
167. **Exact STEP export** — export exact part/assembly geometry with verified XCAF-supported hierarchy/name/color metadata where technically representable.
168. **3MF export** — export additive-manufacturing meshes with units and supported component/material metadata.
169. **GLB/glTF export** — export presentation/component mesh data with supported names, hierarchy, transforms, colors/materials, and metadata mapping.
170. **STL export** — binary and ASCII output with explicit units/tessellation controls and metadata sidecar behavior.
171. **OBJ/MTL export** — mesh plus material output with metadata sidecar behavior.
172. **SVG/DXF projected-geometry export** — export selected sketch/profile/projection/drawing geometry with unit and layer semantics.
173. **PNG snapshot export** — export viewport or drawing imagery with size, background/transparency, and view-state controls.
174. **Professional export metadata editor** — edit filename, title, creator/designer, organization, description, revision, part/project numbers, material, units, rights/copyright, license, and relevant dates before export.
175. **Editable export tags and keywords** — manage ordered searchable tags/keywords independently from the file name.
176. **Custom key/value export metadata** — add/remove arbitrary project-approved metadata keys with validation and per-format disposition.
177. **Per-format metadata policy preview** — label every metadata field as embedded, mapped, or sidecar-only for the chosen format before writing files.
178. **Per-format geometry controls** — expose applicable tessellation, chord/angle tolerance, binary/text mode, units, precision, normals, edge, and hierarchy settings without pretending unsupported controls are meaningful.
179. **Export preflight and validation** — report exact-shape validity, mesh health, empty output, unsupported metadata, unit ambiguity, print-bed/manufacturing concerns, and format-specific limitations before export.
180. **Batch export with naming templates** — export selected bodies/components/configurations/drawing sheets in one operation using collision-safe filename tokens and a ZIP when multiple files are produced.
181. **Export manifest/checksum report** — optionally produce a human-readable/machine-readable manifest containing generated file names, format settings, mapped/sidecar metadata, checksums, units, revision, and warnings.

## 182–187 — Sketch intelligence and tolerance engineering

182. **Automatic constraint proposals** — propose inferred geometric constraints while drawing and require visible user acceptance/feedback rather than silently over-constraining a sketch.
183. **Profile-region and open-gap diagnostics** — identify closed usable regions, open endpoints, micro-gaps, and ambiguous contour nesting before 3D feature creation.
184. **Duplicate/overlap/self-intersection sketch diagnostics** — detect and navigate overlapping or self-intersecting sketch geometry that would make profiles ambiguous or invalid.
185. **Model-level tolerance metadata** — attach tolerance/precision semantics to eligible sketch and feature dimensions independently of drawing formatting.
186. **Hole/shaft fit calculator and fit metadata** — calculate common ISO-style fit/clearance/interference information from nominal size and fit classes, with the result optionally bound to dimensions/callouts.
187. **One-dimensional tolerance stack analysis** — compose signed dimensional contributors and tolerance ranges into a transparent worst-case/RSS stack report without presenting it as FEA or probabilistic certification.

## 188–191 — Mechanical content and mesh workflows

188. **Parametric standard-hardware library** — generate common bolts, screws, nuts, washers, pins, keys, and simple spacers from local standards-oriented parameter tables without remote content dependencies.
189. **Involute gear and rack generator** — generate parameter-driven spur gears/racks with module/DP, pressure angle, tooth count, backlash, thickness, and bore controls using exact profile geometry where practical.
190. **Mesh-body boolean/repair workflow** — use the secondary manifold mesh path for mesh union/cut/intersection and watertight repair without confusing mesh results with exact B-Rep bodies.
191. **Mesh refinement/simplification controls** — refine or reduce imported/export meshes where supported while reporting triangle count and preserving the exact model as a separate source of truth.

## 192–195 — Any-user command and guidance workflow

192. **Searchable command palette** — fuzzy-search CAD commands, tools, views, inspection actions, and export operations with aliases and keyboard access.
193. **Model-tree search and filtering** — filter by name, type, body/component, status, suppression, visibility, warning state, or feature family.
194. **Favorites/recent commands and customizable shortcuts** — let users pin common operations and remap non-reserved tool shortcuts locally.
195. **Guided/standard/precision experience depth** — switch presentation density and explanations without changing the underlying project model or removing capabilities from the project.

## Explicit exclusions after this audit

### Environment / current-kernel limitations

- **IGES import/export:** excluded while `occt-wasm` omits TKDEIGES; STEP is the exact interchange path.
- **Automatic arbitrary mesh-to-clean-parametric-B-Rep reverse engineering:** excluded because the selected browser stack cannot promise professional topology/feature reconstruction from arbitrary triangle soups. Imported meshes remain explicit mesh/reference bodies.
- **Guaranteed semantic STEP PMI embedding:** model/drawing annotations are included natively, but STEP PMI embedding is not promised until the adapter exposes and validates the required XCAF PMI operations end-to-end.

### Unrelated domains

The original exclusions remain: full FEA, CAM toolpath/post-processing, PCB/electrical authoring, BIM, cloud PDM/PLM/simultaneous collaboration, organic voxel/subdivision sculpting, and photorealistic offline rendering.

### Superseded rather than duplicated

- A separate generic push/pull tool is not counted in addition to selection-driven direct face offset/edit behavior already planned through contextual actions and exact face-offset operations.
- Separate one-off primitive generators are not multiplied into dozens of capabilities when the exact primitive/feature system already provides the same general modeling result; only high-frequency reusable engineering generators such as standard hardware and involute gears are elevated to first-class tools.
- Drawing-only metadata editors are not duplicated when the project/export metadata system can serve the same property with drawing-specific presentation.

### Other

None at this time. Any future use of the `other` exclusion category must be written here with the specific capability and reason before implementation scope is reduced.

## Completion implication

The current deterministic completion target is therefore **195 / 195 user-facing capabilities**, not 100 / 100. The count may increase if later research uncovers another materially useful, non-redundant, realistically implementable CAD capability. It may not decrease unless the capability is explicitly reclassified under one of the four allowed exclusion rules above and the rationale is committed before the change.
# Crystal Lattice Studio — Design

**As of:** 2026-09-11

## Purpose

Crystal Lattice Studio is a local-first crystallography, crystal-lattice, symmetry, reciprocal-space, diffraction, morphology, volumetric-data, and structure-analysis workstation for InMo Tools. It must remain useful to a first-time learner while providing scientifically meaningful workflows for materials scientists, mineralogists, chemists, crystallographers, educators, and technical illustrators.

The tool is intentionally browser-native and backend-free. User files, structures, diffraction patterns, reflection data, metadata, and saved projects are processed locally. The public interface must not expose internal implementation language, development rationale, or private project discussion.

## Product identity

- **Tool name:** Crystal Lattice Studio
- **Route:** `#/tools/crystal-lattice-studio`
- **Catalog title:** Crystal Lattice Studio — Crystallography, Symmetry & Diffraction Workbench
- **Primary workspace:** persistent interactive 3D structure viewport plus progressively disclosed scientific work areas
- **Audience:** learners · educators · mineralogists · chemists · materials scientists · crystallographers · solid-state researchers

## Scope policy

The completion scope is intentionally broad. A crystallography capability may be excluded only when it is:

1. infeasible in the repository's static browser/GitHub Pages environment;
2. unrelated to crystallography or crystal-lattice analysis;
3. superseded by a stronger integrated capability; or
4. excluded for another explicitly documented reason reviewed with the project owner.

The implementation must not silently omit difficult but browser-feasible scientific functions merely because they are advanced.

## Standards and scientific basis

The design is anchored to current IUCr CIF specifications and published dictionaries, including Core CIF, powder, symmetry, twinning, magnetic, modulated/composite, electron-density, topology, image, and macromolecular definitions where applicable. CIF 1.1 and CIF 2.0 syntax must be handled deliberately rather than treated as interchangeable text formats.

Reference scientific data bundled into the tool must record provenance in maintainable source comments/data manifests. This includes elemental properties, atomic masses, covalent/van der Waals radii, X-ray scattering coefficients, neutron scattering lengths, and bond-valence parameters.

## Repository fit

The tool follows the existing InMo Tools architecture:

- React + TypeScript + Vite;
- isolated tool module under `src/tools/crystal/`;
- lazy loading through the central workspace loader;
- one catalog entry in the central tool registry;
- existing shared design tokens and accessible controls;
- Three.js for the interactive 3D scene;
- Web Workers for expensive calculations;
- exact dependency versions only;
- local persistence only;
- focused Vitest engine tests plus focused Playwright interaction/accessibility coverage.

Existing Three.js lifecycle patterns should be reused where sound: bounded pixel ratio, `ResizeObserver`, orbit controls, explicit geometry/material/texture disposal, camera-fit support, and no leaked animation frames.

## Candidate numerical dependencies

Dependency versions must be re-verified against current stable releases immediately before installation and pinned exactly.

As of 2026-09-11, the preferred candidates are:

- `@spglib/moyo-wasm` `0.16.0` for browser-local space-group analysis, symmetry operations, Wyckoff positions, Hall information, and Pearson information;
- `ml-matrix` `6.15.0` for bounded least-squares, matrix decompositions, and refinement helpers if the internal math layer does not already cover the required operation safely;
- `fft.js` `4.0.4` for FFT-backed Fourier-map/reflection workflows if benchmarks show it is preferable to a small internal implementation;
- the repository's existing `three` dependency for all WebGL rendering.

No dependency is added solely for convenience when a smaller, clearer implementation already exists in the repository.

## Source-of-truth data model

A single framework-independent `CrystalDocument` is the scientific source of truth. React owns presentation only.

`CrystalDocument` contains:

- original imported document representation and source format;
- all source data blocks/frames needed for loss-aware export;
- unit-cell parameters and lattice/reciprocal matrices;
- atom/site records with stable identifiers;
- fractional coordinates as canonical periodic coordinates;
- optional Cartesian coordinates derived from the active lattice;
- labels, elements, isotopes, charges/oxidation states, occupancies, disorder groups;
- isotropic and anisotropic displacement data;
- symmetry source, detected symmetry, operations, tolerances, Wyckoff assignments;
- magnetic moments/propagation vectors when present;
- bonds, contacts, measurements, annotations, selections;
- imported reflections and powder traces;
- optional volumetric grids;
- morphology/facet data;
- analysis settings and deterministic derived-result cache keys;
- user metadata edits and export policy;
- transformation/provenance history sufficient to explain generated structures;
- undo/redo snapshots or reversible commands.

Unknown CIF tags and loops must survive import/edit/export unless the user explicitly removes them or chooses a lossy target format.

## Architecture boundaries

### 1. Document and format layer

Parsers and serializers are framework-free. They produce explicit diagnostics with line/column or record location when possible. Parsing must not silently normalize away unknown metadata.

Planned modules include:

- `crystal-types.ts`
- `cif-engine.ts`
- `structure-import-engine.ts`
- `structure-export-engine.ts`
- `metadata-engine.ts`
- `reflection-import-engine.ts`
- `project-engine.ts`

### 2. Crystallographic math layer

Pure deterministic engines own cell, coordinate, periodic, symmetry-adjacent, geometry, reciprocal, diffraction, refinement, morphology, and structure-validation calculations. Rendering code may consume results but may not duplicate the formulas.

### 3. Worker layer

Potentially expensive operations run in cancellable workers with operation IDs so stale work can never overwrite newer edits. Worker candidates include reflection enumeration/diffraction, void grids, volumetric isosurfaces, Fourier maps, powder refinement, and large supercell analyses.

### 4. Visualization layer

The viewport is state-driven and uses instancing for atoms/bonds/periodic repetitions wherever practical. View state is independent from scientific document state so camera changes do not invalidate calculations.

### 5. Workspace layer

The main workspace exposes task-oriented areas rather than a flat wall of controls:

- Explore
- Build
- Symmetry
- Geometry
- Reciprocal space
- Diffraction
- Morphology & fields
- Refinement
- Data & metadata
- Export

Advanced controls are progressively disclosed and retain keyboard accessibility.

## Functional completion contract

The deterministic completion target is the following capability set. A feature is complete only when its underlying calculation/behavior, user interaction, error handling, and applicable export path are implemented and covered by focused verification.

### A. Import, project, and structure creation

1. Import CIF 1.1 while preserving data blocks, scalar tags, loops, quoted values, multiline fields, and unknown content.
2. Import CIF 2.0 with deliberate handling of syntax differences rather than treating it as CIF 1.1.
3. Import structural mmCIF/PDBx coordinate content needed for viewing and measurement.
4. Import PDB coordinate models with crystallographic cell/symmetry records when present.
5. Import VASP POSCAR/CONTCAR structures.
6. Import XYZ and extended XYZ structures, preserving supported lattice/property fields.
7. Import SHELX-style reflection `.hkl` text for observed-reflection workflows where the record layout is supported and validated.
8. Import CIF reflection loops and powder-data loops when present.
9. Import generic XY/XYE powder traces with explicit column mapping.
10. Support multiple CIF data blocks and let the user choose or compare blocks without discarding the others.
11. Provide built-in starter structures/lattices: simple cubic, BCC, FCC, diamond, NaCl, CsCl, zinc blende, graphite, perovskite, rutile, fluorite, wurtzite, and a molecular-crystal example.
12. Allow creation of an empty crystal from cell parameters plus sites.
13. Save/load a versioned local project JSON containing scientific state, viewport state, imported comparison data, annotations, and export metadata policy.
14. Maintain undo/redo across scientific edits with bounded history.
15. Provide a non-destructive reset-to-imported-state action.

### B. Cell and atomic model editing

16. Edit `a`, `b`, `c`, alpha, beta, gamma with immediate validity checks.
17. Offer crystal-system-aware constraints so users can lock symmetry-required relationships while editing.
18. Display cell volume, metric tensor, reciprocal metric tensor, and lattice/reciprocal basis vectors.
19. Edit fractional and Cartesian coordinates with bidirectional conversion.
20. Add, duplicate, delete, and relabel sites.
21. Edit element, isotope, occupancy, formal charge/oxidation state, disorder assembly/group, and custom notes.
22. Edit isotropic displacement parameters.
23. Edit/import anisotropic displacement tensors with validity checks.
24. Wrap sites into the reference cell and unwrap/reconstruct periodic molecules.
25. Generate supercells with independent integer repeats and explicit atom-count preview/limits.
26. Generate translated periodic-image shells around the reference cell.
27. Generate primitive/conventional standardized cells when supported by symmetry analysis.
28. Apply explicit basis/origin transformation matrices with before/after previews and reversible provenance.
29. Apply homogeneous strain/deformation tensors with preserved pre-transform state.
30. Build point defects: vacancy, substitution, and interstitial.
31. Report defect concentration for the selected supercell.
32. Build crystallographic slabs from a selected `(hkl)` plane with thickness, vacuum, and termination offset controls.
33. Apply/import twin/domain transformation matrices and show domain overlays.
34. Duplicate a structure into a comparison layer and compute cell/site deltas when atom mapping is unambiguous.

### C. Core visualization

35. Render atoms with instanced geometry and periodic-cell awareness.
36. Support ball-and-stick, sticks, space-fill, points, wireframe/network, polyhedral, and thermal-ellipsoid representations.
37. Support orthographic and perspective cameras, orbit, pan, zoom, reset, fit, axis views, and keyboard-operable view presets.
38. Draw unit-cell edges, lattice vectors, reciprocal vectors, origin, axes, and configurable labels.
39. Offer scientifically conventional element colors/radii with user overrides.
40. Allow site/element selection, multi-select, hide, isolate, invert selection, and selection-by-property.
41. Provide clipping planes and a bounded slab/slice viewer.
42. Show periodic bonds crossing cell boundaries correctly.
43. Render coordination polyhedra with adjustable criteria and per-polyhedron visibility.
44. Render anisotropic displacement ellipsoids at selectable probability levels when valid ADPs exist.
45. Render imported magnetic moment vectors and propagation-vector information when magCIF-compatible data is present.
46. Provide high-resolution viewport PNG export with transparent/solid background options.
47. Provide vector SVG structural diagram export for supported line/symbol representations rather than raster-wrapping the WebGL canvas.
48. Provide GLB export of the visible structure/geometry where semantics can be represented without ambiguity.

### D. Symmetry and asymmetric-unit analysis

49. Detect crystallographic symmetry locally from the active periodic structure.
50. Report space-group number, Hermann–Mauguin symbol, Hall information, crystal system, point-group information, Pearson symbol, and operation count when available from the engine.
51. Assign and display Wyckoff letters/site multiplicities.
52. Generate symmetry-equivalent sites from the asymmetric unit.
53. Extract an asymmetric-unit candidate from a complete periodic structure when the detected symmetry allows a deterministic reduction.
54. Provide a symmetry-operation browser with matrix/translation display.
55. Preview the transformed coordinates produced by any selected symmetry operation.
56. Provide a symmetry-tolerance stability sweep showing where the detected group/assignments change.
57. Provide a symmetry-break inspector identifying which operations stop matching after an edit and which sites contribute to the mismatch.
58. Show systematic reflection conditions/extinctions derived from the active symmetry operations.
59. Validate imported symmetry operations against the active cell/sites and flag inconsistencies rather than silently replacing them.
60. Preserve source symmetry tags separately from detected symmetry so exports can explicitly choose source, detected, or P1-expanded output.

### E. Geometry, bonding, local environment, and validation

61. Measure periodic nearest-image distances.
62. Measure bond angles.
63. Measure torsion/dihedral angles.
64. Measure plane-plane and direction-direction angles.
65. Detect bonds from configurable covalent-radius criteria with periodic boundaries.
66. Detect short contacts with explicit threshold controls.
67. Detect likely hydrogen bonds from configurable donor/acceptor and angular/distance criteria.
68. Compute coordination numbers and neighbor shells.
69. Compute/display coordination polyhedra and polyhedral distortion metrics where meaningful.
70. Compute radial distribution / pair-distance histograms over a user-selected range and broadening.
71. Compute element-pair partial radial distributions.
72. Compute bond-valence sums when suitable oxidation-state/parameter data exists, and explain when no parameter is available.
73. Report formula, reduced formula, formula mass, number of formula units when determinable, cell mass, cell density, and composition fractions.
74. Validate occupancies, element labels, coincident/near-coincident sites, invalid ADPs, nonphysical cell metrics, and anomalously short contacts.
75. Produce a structure-health panel separating errors, warnings, and informational observations without claiming a structure is experimentally correct.

### F. Real/reciprocal lattice and crystallographic planes

76. Render the reciprocal lattice interactively.
77. Create/display arbitrary Miller planes `(hkl)` in the real-space structure.
78. Create/display crystal directions `[uvw]` and zone axes.
79. Calculate d-spacings from the metric tensor.
80. Calculate reciprocal-vector magnitude and angles between reciprocal vectors/planes.
81. Link a selected reciprocal-lattice point/reflection to the corresponding real-space plane family.
82. Provide stereographic projection/pole plotting for selected plane normals and directions.
83. Provide a Wulff-net-style educational overlay for angular relationships.
84. Render an Ewald sphere with adjustable wavelength/orientation and reflection intersection highlighting.
85. Construct/display the Wigner–Seitz cell when numerically well-conditioned.
86. Construct/display the first Brillouin zone when the reciprocal-point neighborhood is sufficient and numerically well-conditioned.
87. Provide reciprocal-space slicing/section planes with indexed points.

### G. Diffraction and scattering

88. Enumerate bounded reflection sets by d-spacing, reciprocal radius, or Miller-index limits.
89. Calculate structure factors and intensities using wavelength-appropriate X-ray atomic scattering factors.
90. Calculate nuclear neutron intensities using bundled coherent scattering-length reference data, including isotope overrides when available.
91. Simulate powder X-ray diffraction with common wavelength presets and custom wavelength.
92. Simulate powder neutron diffraction.
93. Simulate kinematic electron-diffraction spot geometry/intensity approximations with assumptions stated in-product.
94. Simulate single-crystal reciprocal/diffraction spot patterns for arbitrary orientation.
95. Simulate Laue-style white-beam spot geometry over a bounded wavelength band.
96. Provide a reflection table containing hkl, multiplicity, d-spacing, reciprocal magnitude, 2theta where applicable, F/F²/intensity, and extinction state.
97. Label/inspect peaks and reflections interactively from chart or table.
98. Support linear, square-root, and log-like display transforms without altering exported underlying intensity values.
99. Apply configurable pseudo-Voigt peak broadening.
100. Model instrumental U/V/W-style width terms where applicable.
101. Model crystallite-size broadening with transparent assumptions.
102. Model microstrain broadening with transparent assumptions.
103. Apply common preferred-orientation correction models such as March–Dollase where applicable.
104. Overlay imported observed XY/XYE/pdCIF data with scale, offset, and region controls.
105. Pick observed peaks manually and by deterministic local-maximum criteria.
106. Compare observed versus simulated traces with residual curves and explicit numeric fit measures.
107. Simulate multiple structural phases in one powder pattern with adjustable phase scales.
108. Estimate phase fractions from fitted scale parameters only when the required assumptions/data are satisfied; otherwise label scales as relative intensities.

### H. Powder/reflection refinement and Fourier analysis

109. Provide a bounded least-squares powder fitting core for scale, zero shift, lattice parameters, simple background, profile width parameters, phase scales, and supported preferred-orientation parameters.
110. Allow parameters to be fixed/free and bounded, with the active parameter set visible before a run.
111. Report convergence, parameter changes, residual metrics, iteration count, and termination reason; never report a non-converged result as converged.
112. Provide an observed-reflection workspace for CIF/SHELX-style reflection data with Fc/Fo comparison where required inputs exist.
113. Compute common residual summaries such as R1-style and weighted residual metrics with the exact formula displayed in help/documentation.
114. Calculate difference-Fourier-style scalar grids from suitable observed/calculated reflection data.
115. Find/rank local maxima/minima in generated difference maps as candidate residual-density peaks.
116. Provide a constrained experimental coordinate/occupancy/ADP least-squares refinement mode only after numerical validation demonstrates stable Jacobian/constraint behavior; the UI must clearly enumerate refined parameters and restraints.
117. Provide an optional charge-flipping exploration mode for suitable complete intensity datasets only after deterministic fixtures demonstrate the implementation; it is not required to masquerade as a universal structure-solution engine.

### I. Volumetric fields, voids, porosity, and surfaces

118. Import Gaussian CUBE scalar fields.
119. Import XSF scalar grids.
120. Import simple MRC/CCP4 scalar maps if the parser can be implemented/verified without introducing an unmaintainable binary dependency path.
121. Render positive/negative isosurfaces with independent levels/opacities.
122. Render orthogonal scalar-field slices.
123. Render an arbitrary plane-aligned scalar-field slice.
124. Provide bounded grid resampling/downsampling for browser performance while preserving the original data.
125. Estimate void/cavity regions from a periodic probe-radius grid.
126. Report approximate occupied/void/accessible fractions with grid resolution and probe assumptions visible.
127. Visualize cavity components and permit component selection/isolation.

### J. Morphology, facets, and twinning

128. Generate BFDH-style morphology from crystallographic face geometry/d-spacing.
129. Generate Wulff morphology from user-supplied facet energies.
130. Show facet Miller indices, relative area, normal, d-spacing, and supplied/derived weighting.
131. Permit direct facet inclusion/exclusion and weight editing.
132. Overlay twin/domain morphology transforms when a twin matrix is supplied.
133. Export morphology as SVG/PNG and GLB where geometry is representable.

### K. Metadata, dictionary-aware inspection, and export

134. Provide a searchable raw metadata/tag inspector for all imported blocks.
135. Provide loop-aware editing rather than flattening loop data into unrelated scalar fields.
136. Allow users to add/remove/edit eligible scalar tags and loop rows/columns with syntax-safe serialization.
137. Preserve unknown tags and loops by default.
138. Offer dictionary-aware descriptions, known aliases, type/value guidance, and validation where bundled dictionary metadata supports it.
139. Show a pre-export metadata/structure diff: preserved, changed, generated, omitted.
140. Let the user choose whether derived/generated values are written into supported export tags.
141. Export CIF 1.1.
142. Export CIF 2.0.
143. Export P1-expanded CIF.
144. Export structural mmCIF where the model maps cleanly to the supported subset.
145. Export PDB where the target format can represent the selected data; warn about unavoidable loss before export.
146. Export POSCAR.
147. Export XYZ/extended XYZ.
148. Export reflection tables to CSV/TSV.
149. Export powder traces to XY/XYE-style text and supported pdCIF data blocks.
150. Export measurements/coordination/site tables to CSV.
151. Export reciprocal-space/reflection diagrams to SVG/PNG.
152. Export structure/morphology scenes to GLB where applicable.
153. Export a self-contained local analysis report suitable for browser print/PDF containing chosen figures, structure summary, calculations, assumptions, warnings, and user-selected metadata.
154. Provide editable export metadata including title, description, author/creator fields where the target format supports them, source/provenance notes, generated timestamp opt-in, and custom CIF tags.
155. Never add metadata silently; generated fields are previewable before export.

### L. Learnability and accessibility

156. Provide progressive disclosure so the default workspace is understandable without crystallography training.
157. Provide an in-tool crystallography guide modal/glossary for cell parameters, fractional coordinates, symmetry, Wyckoff positions, Miller indices, reciprocal lattice, Ewald construction, diffraction, occupancy, ADPs, and refinement terms.
158. Link guide entries contextually from advanced controls without permanently occupying the workspace.
159. Provide beginner-friendly starter workflows such as “Explore a unit cell,” “See a Miller plane,” “Why diffraction peaks appear,” and “Compare primitive/FCC/BCC.”
160. Preserve full professional controls; beginner guidance must not replace or hide scientific values permanently.
161. Provide textual equivalents for color-only scientific states and legends.
162. Maintain keyboard navigation, visible focus, semantic forms/tables, reduced-motion behavior, reflow, and WCAG 2.2 AA-oriented interaction patterns.
163. Provide accessible tabular alternatives for charts/3D-selected scientific values.

## Performance and numerical-safety requirements

- Do not create one Three.js mesh per atom for large structures when instancing is appropriate.
- Bound default supercell expansion and show atom count before applying large expansions.
- Heavy workers must be cancellable and ignore stale results.
- Long-running operations expose progress when meaningful and a cancel action.
- Volumetric grids use explicit resolution/memory estimates before expensive work.
- No computation may silently substitute a lower-fidelity algorithm because the input is large; the tool must ask the user to reduce scope or use an explicitly disclosed approximation.
- Derived caches are keyed by all scientific inputs that affect the result.
- Floating-point comparisons use explicit tolerances tied to the relevant crystallographic operation rather than global epsilon folklore.
- Invalid/singular cell matrices fail visibly and preserve the previous valid document.

## User experience

The viewport stays visible for the workflows that benefit from spatial context. Each work area contains a compact summary first and advanced controls behind explicit disclosure. Tables use bounded/paginated or virtualized rendering where row counts can grow large.

Every scientific action follows the same feedback contract:

1. show what will change/calculated;
2. validate prerequisites;
3. execute locally;
4. show result plus assumptions/warnings;
5. allow undo/reset/export where relevant.

No operation may overwrite the imported source file.

## Error handling

Errors are classified as:

- file/syntax errors;
- unsupported-but-preserved data;
- invalid scientific state;
- numerical failure/non-convergence;
- browser capability/resource limitation;
- export representability/loss warning.

The UI must distinguish errors from scientific warnings. A warning never silently blocks export, while an error that would make an export structurally invalid must block that specific export.

## Testing strategy

### Unit tests

Framework-free engines receive deterministic fixtures for:

- lattice/cartesian/fractional transforms;
- volume and reciprocal metrics;
- periodic minimum-image distances;
- Miller-plane/d-spacing math;
- symmetry adapter input/output mapping;
- CIF tokenization/parsing/writing and round-trip preservation;
- symmetry-operation application;
- bond/coordination/valence calculations;
- reflection enumeration/extinctions;
- structure-factor/intensity fixtures;
- powder peak positions/profile functions;
- least-squares/refinement convergence and failure cases;
- Fourier-grid transforms where implemented;
- morphology geometry;
- metadata diff/export policy.

### Browser tests

Focused Playwright coverage verifies:

- catalog/route lazy loading;
- starter structure loads without network access;
- file import and visible structure summary;
- 3D viewport mount/dispose/reload without WebGL lifecycle leaks;
- editing cell/site state updates calculations;
- symmetry workflow;
- Miller plane/reciprocal link;
- diffraction workflow;
- metadata editor and at least one lossless CIF round trip;
- export downloads and filenames;
- narrow viewport/reflow;
- keyboard/focus behavior;
- serious/critical axe violations remain zero in covered surfaces.

Tests target changed scientific surfaces. Unrelated whole-repository browser tests are not required for each small implementation step unless the shared registry/layout/dependency layer changed.

## Implementation decomposition

The tool is large enough that implementation must be tracked as five bounded subprojects sharing this master design:

### Phase 1 — Document core and interactive structure workstation

Import/export core, `CrystalDocument`, starter structures, cell/site editing, periodic geometry, undo/redo/project persistence, Three.js viewport, selection, representations, measurements, and initial metadata preservation.

### Phase 2 — Symmetry, local environments, validation, and model building

Moyo adapter, space-group/Wyckoff workflows, symmetry stability/break inspection, conventional/primitive transforms, polyhedra, bond-valence, defects, slabs, twin/domain transforms, and structure-health analysis.

### Phase 3 — Reciprocal space and diffraction

Reciprocal lattice, planes/directions, stereographic projection, Ewald sphere, Wigner–Seitz/Brillouin geometry, reflection enumeration, X-ray/neutron/electron/single-crystal/Laue simulation, observed overlays, and reflection tables.

### Phase 4 — Refinement, fields, voids, and morphology

Powder fitting, observed-reflection residuals, difference maps, optional validated coordinate refinement/charge flipping, volumetric imports/isosurfaces/slices, cavity analysis, BFDH/Wulff morphology, and domain morphology overlays.

### Phase 5 — Export/metadata completeness, learnability, performance, and release QA

Dictionary-aware metadata inspection, all output formats, export metadata editor/diff, reports/publication graphics, accessibility/reflow, resource guards, large-structure performance, end-to-end scientific fixtures, and completion audit.

Each phase must reach a usable integrated state on `main`; no phase may leave its completed work stranded on another branch.

## Explicit exclusions and conditional items

These exclusions are narrow; they do not reduce the rest of the completion contract.

### Full macromolecular model building/refinement

Full protein/nucleic-acid model building, restrained macromolecular refinement, map interpretation comparable to Coot/REFMAC/Phenix, and deposition workflows are excluded from first-release completion. They require specialist native refinement/model-building stacks and large domain-specific restraint systems that are not realistically reproduced as a trustworthy static-browser subsystem under the repository's current local-only architecture. PDB/mmCIF import, viewing, symmetry-aware measurement, and supported export remain in scope.

### Direct proprietary database integration

Direct CSD/ICSD retrieval is excluded because those databases have separate licensing/authentication constraints and the repository's tool engines are local-first. Files lawfully obtained by the user can still be imported locally. Open database download integration is not required because the same analysis is available through local import and would otherwise introduce a network data path.

### Proprietary native refinement executables

Running SHELXL/SHELXT or other redistributable-restricted/native desktop executables inside the hosted application is excluded. This is an **other** exclusion reason: third-party licensing/redistribution and executable-delivery constraints, not a lack of scientific relevance. Compatible text/reflection formats may still be imported/exported where documented.

### Magnetic-space-group solving

magCIF data preservation, magnetic moment/propagation-vector display, and metadata editing are in scope. Automatic magnetic-space-group solving is conditional until an exact, browser-safe dependency or maintainable WASM adapter with adequate deterministic validation is verified. This is an **other** reason if it remains excluded at release: scientific-engine availability/verification, not lack of relevance.

## Deterministic definition of done

Crystal Lattice Studio is complete only when:

1. every numbered capability in this design is implemented and verified, **or** has an explicit project-owner-approved exclusion satisfying the scope policy;
2. each of the five implementation phases has its acceptance tests passing on the integrated `main` state;
3. supported imports fail safely on malformed data and preserve unknown supported-format metadata where promised;
4. supported exports round-trip the scientific values they claim to preserve;
5. scientific approximations/assumptions are surfaced to users wherever they materially affect interpretation;
6. the tool remains local-first and backend-free;
7. the tool route is lazy loaded and the landing-page registry is the single navigation source;
8. the primary workspace reflows across supported phone/tablet/desktop widths and passes the focused accessibility gate;
9. expensive operations are bounded/cancellable and stale work cannot overwrite current state;
10. final release verification includes representative structures from all seven crystal systems plus molecular/inorganic, disordered/partial-occupancy, diffraction, volumetric, and malformed-data fixtures;
11. public copy contains only user-facing product/scientific guidance and no internal project discussion;
12. a final completion audit enumerates implemented, superseded, excluded, and conditionally unsupported capabilities with evidence.

This definition prevents the tool from becoming an open-ended feature backlog while still requiring every realistically achievable crystallography capability identified in the approved scope to be accounted for.
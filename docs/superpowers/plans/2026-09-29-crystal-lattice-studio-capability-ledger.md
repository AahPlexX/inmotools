# Crystal Lattice Studio — Capability Ledger

**Updated:** 2026-09-29  
**Design:** `docs/superpowers/specs/2026-09-11-crystal-lattice-studio-design.md` (163 numbered capabilities)  
**Tally:** 75 done · 39 partial · 49 missing (of 163)

Status is judged from code and tests on `main`. **Done** means engine plus a reachable surface (UI or export) with tests. **Partial** names the exact gap. **Missing** means no implementation. The design exclusions (macromolecular building, CSD/ICSD, SHELX executables, magnetic-space-group solving) need owner-approved wording before they count as excluded; none is recorded as excluded here.

Update the status of an item here whenever its implementation changes; keep this file and `.tasks/IN_PROGRESS.md` in step.

| # | Capability | Status | Evidence / gap |
|---|---|---|---|
| 1 | Import CIF 1.1 while preserving data blocks, scalar tags, loops, quoted values, multi... | Done | cif-engine / structure-import-engine; crystal-cif, crystal-import tests |
| 2 | Import CIF 2.0 with deliberate handling of syntax differences rather than treating it... | Done | cif-engine / structure-import-engine; crystal-cif, crystal-import tests |
| 3 | Import structural mmCIF/PDBx coordinate content needed for viewing and measurement. | Done | cif-engine / structure-import-engine; crystal-cif, crystal-import tests |
| 4 | Import PDB coordinate models with crystallographic cell/symmetry records when present. | Done | cif-engine / structure-import-engine; crystal-cif, crystal-import tests |
| 5 | Import VASP POSCAR/CONTCAR structures. | Done | cif-engine / structure-import-engine; crystal-cif, crystal-import tests |
| 6 | Import XYZ and extended XYZ structures, preserving supported lattice/property fields. | Done | cif-engine / structure-import-engine; crystal-cif, crystal-import tests |
| 7 | Import SHELX-style reflection `.hkl` text for observed-reflection workflows where the... | Missing | No SHELX .hkl import (only .hkl export) |
| 8 | Import CIF reflection loops and powder-data loops when present. | Missing | No CIF reflection/powder loop import |
| 9 | Import generic XY/XYE powder traces with explicit column mapping. | Partial | observed-pattern-engine parses two-column position/intensity peaks; no XYE column mapping |
| 10 | Support multiple CIF data blocks and let the user choose or compare blocks without di... | Partial | Document keeps all blocks; no block chooser/compare UI |
| 11 | Provide built-in starter structures/lattices: simple cubic, BCC, FCC, diamond, NaCl,... | Done | starter-structures.ts |
| 12 | Allow creation of an empty crystal from cell parameters plus sites. | Partial | createEmptyCrystal engine only; no creation workflow UI |
| 13 | Save/load a versioned local project JSON containing scientific state, viewport state,... | Done | project-engine / history-engine; crystal-project, crystal-document tests |
| 14 | Maintain undo/redo across scientific edits with bounded history. | Done | project-engine / history-engine; crystal-project, crystal-document tests |
| 15 | Provide a non-destructive reset-to-imported-state action. | Done | project-engine / history-engine; crystal-project, crystal-document tests |
| 16 | Edit `a`, `b`, `c`, alpha, beta, gamma with immediate validity checks. | Done | cell-engine / document-engine constrainCell; crystal-cell, crystal-document tests |
| 17 | Offer crystal-system-aware constraints so users can lock symmetry-required relationsh... | Done | cell-engine / document-engine constrainCell; crystal-cell, crystal-document tests |
| 18 | Display cell volume, metric tensor, reciprocal metric tensor, and lattice/reciprocal... | Partial | Metric/reciprocal maths exist; full display surface not verified |
| 19 | Edit fractional and Cartesian coordinates with bidirectional conversion. | Done | document-engine / periodic-engine / model-building-engine; crystal-document, crystal-model-building tests |
| 20 | Add, duplicate, delete, and relabel sites. | Done | document-engine / periodic-engine / model-building-engine; crystal-document, crystal-model-building tests |
| 21 | Edit element, isotope, occupancy, formal charge/oxidation state, disorder assembly/gr... | Done | document-engine / periodic-engine / model-building-engine; crystal-document, crystal-model-building tests |
| 22 | Edit isotropic displacement parameters. | Done | document-engine / periodic-engine / model-building-engine; crystal-document, crystal-model-building tests |
| 23 | Edit/import anisotropic displacement tensors with validity checks. | Done | document-engine / periodic-engine / model-building-engine; crystal-document, crystal-model-building tests |
| 24 | Wrap sites into the reference cell and unwrap/reconstruct periodic molecules. | Done | document-engine / periodic-engine / model-building-engine; crystal-document, crystal-model-building tests |
| 25 | Generate supercells with independent integer repeats and explicit atom-count preview/... | Done | document-engine / periodic-engine / model-building-engine; crystal-document, crystal-model-building tests |
| 26 | Generate translated periodic-image shells around the reference cell. | Partial | generatePeriodicImages engine only; no UI |
| 27 | Generate primitive/conventional standardized cells when supported by symmetry analysis. | Done | model-building-engine / symmetry-engine standardizeCrystal; crystal-model-building tests |
| 28 | Apply explicit basis/origin transformation matrices with before/after previews and re... | Done | model-building-engine / symmetry-engine standardizeCrystal; crystal-model-building tests |
| 29 | Apply homogeneous strain/deformation tensors with preserved pre-transform state. | Done | model-building-engine / symmetry-engine standardizeCrystal; crystal-model-building tests |
| 30 | Build point defects: vacancy, substitution, and interstitial. | Done | model-building-engine / symmetry-engine standardizeCrystal; crystal-model-building tests |
| 31 | Report defect concentration for the selected supercell. | Done | model-building-engine / symmetry-engine standardizeCrystal; crystal-model-building tests |
| 32 | Build crystallographic slabs from a selected `(hkl)` plane with thickness, vacuum, an... | Done | model-building-engine / symmetry-engine standardizeCrystal; crystal-model-building tests |
| 33 | Apply/import twin/domain transformation matrices and show domain overlays. | Done | model-building-engine / symmetry-engine standardizeCrystal; crystal-model-building tests |
| 34 | Duplicate a structure into a comparison layer and compute cell/site deltas when atom... | Done | model-building-engine / symmetry-engine standardizeCrystal; crystal-model-building tests |
| 35 | Render atoms with instanced geometry and periodic-cell awareness. | Done | viewport-model / CrystalViewport; crystal-viewport-model test, phase1/2 e2e |
| 36 | Support ball-and-stick, sticks, space-fill, points, wireframe/network, polyhedral, an... | Done | viewport-model / CrystalViewport; crystal-viewport-model test, phase1/2 e2e |
| 37 | Support orthographic and perspective cameras, orbit, pan, zoom, reset, fit, axis view... | Done | viewport-model / CrystalViewport; crystal-viewport-model test, phase1/2 e2e |
| 38 | Draw unit-cell edges, lattice vectors, reciprocal vectors, origin, axes, and configur... | Partial | Cell edges only; vectors/origin/labels overlay incomplete |
| 39 | Offer scientifically conventional element colors/radii with user overrides. | Partial | Render-model options exist; no user controls for overrides, hide/isolate/invert |
| 40 | Allow site/element selection, multi-select, hide, isolate, invert selection, and sele... | Partial | Render-model options exist; no user controls for overrides, hide/isolate/invert |
| 41 | Provide clipping planes and a bounded slab/slice viewer. | Done | viewport-model / CrystalViewport; crystal-viewport-model test, phase1/2 e2e |
| 42 | Show periodic bonds crossing cell boundaries correctly. | Done | viewport-model / CrystalViewport; crystal-viewport-model test, phase1/2 e2e |
| 43 | Render coordination polyhedra with adjustable criteria and per-polyhedron visibility. | Done | viewport-model / CrystalViewport; crystal-viewport-model test, phase1/2 e2e |
| 44 | Render anisotropic displacement ellipsoids at selectable probability levels when vali... | Done | viewport-model / CrystalViewport; crystal-viewport-model test, phase1/2 e2e |
| 45 | Render imported magnetic moment vectors and propagation-vector information when magCI... | Partial | Renders supplied vectors; no magCIF import |
| 46 | Provide high-resolution viewport PNG export with transparent/solid background options. | Done | crystal-graphics-export.ts |
| 47 | Provide vector SVG structural diagram export for supported line/symbol representation... | Done | crystal-graphics-export.ts |
| 48 | Provide GLB export of the visible structure/geometry where semantics can be represent... | Missing | No GLB export |
| 49 | Detect crystallographic symmetry locally from the active periodic structure. | Done | symmetry-engine / CrystalSymmetryPanel; crystal-symmetry test |
| 50 | Report space-group number, Hermann–Mauguin symbol, Hall information, crystal system,... | Done | symmetry-engine / CrystalSymmetryPanel; crystal-symmetry test |
| 51 | Assign and display Wyckoff letters/site multiplicities. | Done | symmetry-engine / CrystalSymmetryPanel; crystal-symmetry test |
| 52 | Generate symmetry-equivalent sites from the asymmetric unit. | Done | symmetry-engine / CrystalSymmetryPanel; crystal-symmetry test |
| 53 | Extract an asymmetric-unit candidate from a complete periodic structure when the dete... | Partial | No asymmetric-unit extraction |
| 54 | Provide a symmetry-operation browser with matrix/translation display. | Done | symmetry-engine / CrystalSymmetryPanel; crystal-symmetry test |
| 55 | Preview the transformed coordinates produced by any selected symmetry operation. | Partial | applySymmetryOperation engine only; no preview UI |
| 56 | Provide a symmetry-tolerance stability sweep showing where the detected group/assignm... | Done | symmetry-engine / CrystalSymmetryPanel; crystal-symmetry test |
| 57 | Provide a symmetry-break inspector identifying which operations stop matching after a... | Done | symmetry-engine / CrystalSymmetryPanel; crystal-symmetry test |
| 58 | Show systematic reflection conditions/extinctions derived from the active symmetry op... | Done | symmetry-engine / CrystalSymmetryPanel; crystal-symmetry test |
| 59 | Validate imported symmetry operations against the active cell/sites and flag inconsis... | Done | symmetry-engine / CrystalSymmetryPanel; crystal-symmetry test |
| 60 | Preserve source symmetry tags separately from detected symmetry so exports can explic... | Partial | No separate source-symmetry store or export policy |
| 61 | Measure periodic nearest-image distances. | Done | measurement-engine; crystal-geometry test |
| 62 | Measure bond angles. | Done | measurement-engine; crystal-geometry test |
| 63 | Measure torsion/dihedral angles. | Done | measurement-engine; crystal-geometry test |
| 64 | Measure plane-plane and direction-direction angles. | Partial | measurePlaneAngle/measureDirectionAngle engine + test (crystal-geometry); no UI control yet |
| 65 | Detect bonds from configurable covalent-radius criteria with periodic boundaries. | Done | periodic / local-environment / structure-health engines and panels; crystal-environment, crystal-health tests |
| 66 | Detect short contacts with explicit threshold controls. | Done | periodic / local-environment / structure-health engines and panels; crystal-environment, crystal-health tests |
| 67 | Detect likely hydrogen bonds from configurable donor/acceptor and angular/distance cr... | Done | periodic / local-environment / structure-health engines and panels; crystal-environment, crystal-health tests |
| 68 | Compute coordination numbers and neighbor shells. | Done | periodic / local-environment / structure-health engines and panels; crystal-environment, crystal-health tests |
| 69 | Compute/display coordination polyhedra and polyhedral distortion metrics where meanin... | Done | periodic / local-environment / structure-health engines and panels; crystal-environment, crystal-health tests |
| 70 | Compute radial distribution / pair-distance histograms over a user-selected range and... | Done | periodic / local-environment / structure-health engines and panels; crystal-environment, crystal-health tests |
| 71 | Compute element-pair partial radial distributions. | Done | periodic / local-environment / structure-health engines and panels; crystal-environment, crystal-health tests |
| 72 | Compute bond-valence sums when suitable oxidation-state/parameter data exists, and ex... | Done | periodic / local-environment / structure-health engines and panels; crystal-environment, crystal-health tests |
| 73 | Report formula, reduced formula, formula mass, number of formula units when determina... | Done | periodic / local-environment / structure-health engines and panels; crystal-environment, crystal-health tests |
| 74 | Validate occupancies, element labels, coincident/near-coincident sites, invalid ADPs,... | Done | periodic / local-environment / structure-health engines and panels; crystal-environment, crystal-health tests |
| 75 | Produce a structure-health panel separating errors, warnings, and informational obser... | Done | periodic / local-environment / structure-health engines and panels; crystal-environment, crystal-health tests |
| 76 | Render the reciprocal lattice interactively. | Partial | Stereographic and Brillouin views only; no interactive reciprocal-lattice view |
| 77 | Create/display arbitrary Miller planes `(hkl)` in the real-space structure. | Partial | planeNormal/millerToCartesian engine only; no real-space plane/direction display |
| 78 | Create/display crystal directions `[uvw]` and zone axes. | Partial | planeNormal/millerToCartesian engine only; no real-space plane/direction display |
| 79 | Calculate d-spacings from the metric tensor. | Done | reciprocal-engine dSpacing; crystal-reciprocal test |
| 80 | Calculate reciprocal-vector magnitude and angles between reciprocal vectors/planes. | Partial | reciprocalLatticeParameters; angles between planes not surfaced |
| 81 | Link a selected reciprocal-lattice point/reflection to the corresponding real-space p... | Missing | No reciprocal point to real-space plane link |
| 82 | Provide stereographic projection/pole plotting for selected plane normals and directi... | Done | stereographic-engine + reciprocal panel |
| 83 | Provide a Wulff-net-style educational overlay for angular relationships. | Missing | No Wulff-net overlay |
| 84 | Render an Ewald sphere with adjustable wavelength/orientation and reflection intersec... | Partial | ewald-engine only; no Ewald view in panel |
| 85 | Construct/display the Wigner–Seitz cell when numerically well-conditioned. | Partial | Wigner-Seitz cell not separately surfaced |
| 86 | Construct/display the first Brillouin zone when the reciprocal-point neighborhood is... | Done | brillouin-engine + reciprocal panel; crystal-brillouin test |
| 87 | Provide reciprocal-space slicing/section planes with indexed points. | Missing | No reciprocal-space section planes |
| 88 | Enumerate bounded reflection sets by d-spacing, reciprocal radius, or Miller-index li... | Done | diffraction-engine enumerateReflections |
| 89 | Calculate structure factors and intensities using wavelength-appropriate X-ray atomic... | Partial | Z-based amplitude (Cromer-Mann follow-up) |
| 90 | Calculate nuclear neutron intensities using bundled coherent scattering-length refere... | Partial | NIST b for 83 elements; B/Cd/In/Sm/Gd unsupported; no isotope override |
| 91 | Simulate powder X-ray diffraction with common wavelength presets and custom wavelength. | Done | simulatePowderPattern + panel; crystal-diffraction test |
| 92 | Simulate powder neutron diffraction. | Done | simulatePowderPattern + panel; crystal-diffraction test |
| 93 | Simulate kinematic electron-diffraction spot geometry/intensity approximations with a... | Partial | Electron mode uses X-ray Z model; in-product assumption text unverified |
| 94 | Simulate single-crystal reciprocal/diffraction spot patterns for arbitrary orientation. | Partial | Orientation-agnostic superset only |
| 95 | Simulate Laue-style white-beam spot geometry over a bounded wavelength band. | Partial | simulateLaueBackReflection engine; panel exposure unverified |
| 96 | Provide a reflection table containing hkl, multiplicity, d-spacing, reciprocal magnit... | Partial | Table lacks reciprocal magnitude, F/F2, extinction state |
| 97 | Label/inspect peaks and reflections interactively from chart or table. | Partial | Table view; no chart-to-table linked inspection |
| 98 | Support linear, square-root, and log-like display transforms without altering exporte... | Missing | No display transforms |
| 99 | Apply configurable pseudo-Voigt peak broadening. | Done | broadenPowderPattern; crystal-powder-profile test |
| 100 | Model instrumental U/V/W-style width terms where applicable. | Missing | No U/V/W, size, strain or March-Dollase models |
| 101 | Model crystallite-size broadening with transparent assumptions. | Missing | No U/V/W, size, strain or March-Dollase models |
| 102 | Model microstrain broadening with transparent assumptions. | Missing | No U/V/W, size, strain or March-Dollase models |
| 103 | Apply common preferred-orientation correction models such as March–Dollase where appl... | Missing | No U/V/W, size, strain or March-Dollase models |
| 104 | Overlay imported observed XY/XYE/pdCIF data with scale, offset, and region controls. | Partial | Overlay exists; scale/offset/region controls not verified |
| 105 | Pick observed peaks manually and by deterministic local-maximum criteria. | Missing | No peak picking |
| 106 | Compare observed versus simulated traces with residual curves and explicit numeric fi... | Partial | overlayResiduals peak deltas; no residual curve or R-metrics |
| 107 | Simulate multiple structural phases in one powder pattern with adjustable phase scales. | Missing | No multi-phase patterns |
| 108 | Estimate phase fractions from fitted scale parameters only when the required assumpti... | Missing | No multi-phase patterns |
| 109 | Provide a bounded least-squares powder fitting core for scale, zero shift, lattice pa... | Missing | Phase 4 not started |
| 110 | Allow parameters to be fixed/free and bounded, with the active parameter set visible... | Missing | Phase 4 not started |
| 111 | Report convergence, parameter changes, residual metrics, iteration count, and termina... | Missing | Phase 4 not started |
| 112 | Provide an observed-reflection workspace for CIF/SHELX-style reflection data with Fc/... | Missing | Phase 4 not started |
| 113 | Compute common residual summaries such as R1-style and weighted residual metrics with... | Missing | Phase 4 not started |
| 114 | Calculate difference-Fourier-style scalar grids from suitable observed/calculated ref... | Missing | Phase 4 not started |
| 115 | Find/rank local maxima/minima in generated difference maps as candidate residual-dens... | Missing | Phase 4 not started |
| 116 | Provide a constrained experimental coordinate/occupancy/ADP least-squares refinement... | Missing | Phase 4 not started |
| 117 | Provide an optional charge-flipping exploration mode for suitable complete intensity... | Missing | Phase 4 not started |
| 118 | Import Gaussian CUBE scalar fields. | Missing | Phase 4 not started |
| 119 | Import XSF scalar grids. | Missing | Phase 4 not started |
| 120 | Import simple MRC/CCP4 scalar maps if the parser can be implemented/verified without... | Missing | Phase 4 not started |
| 121 | Render positive/negative isosurfaces with independent levels/opacities. | Missing | Phase 4 not started |
| 122 | Render orthogonal scalar-field slices. | Missing | Phase 4 not started |
| 123 | Render an arbitrary plane-aligned scalar-field slice. | Missing | Phase 4 not started |
| 124 | Provide bounded grid resampling/downsampling for browser performance while preserving... | Missing | Phase 4 not started |
| 125 | Estimate void/cavity regions from a periodic probe-radius grid. | Missing | Phase 4 not started |
| 126 | Report approximate occupied/void/accessible fractions with grid resolution and probe... | Missing | Phase 4 not started |
| 127 | Visualize cavity components and permit component selection/isolation. | Missing | Phase 4 not started |
| 128 | Generate BFDH-style morphology from crystallographic face geometry/d-spacing. | Missing | Phase 4 not started |
| 129 | Generate Wulff morphology from user-supplied facet energies. | Missing | Phase 4 not started |
| 130 | Show facet Miller indices, relative area, normal, d-spacing, and supplied/derived wei... | Missing | Phase 4 not started |
| 131 | Permit direct facet inclusion/exclusion and weight editing. | Missing | Phase 4 not started |
| 132 | Overlay twin/domain morphology transforms when a twin matrix is supplied. | Missing | Phase 4 not started |
| 133 | Export morphology as SVG/PNG and GLB where geometry is representable. | Missing | Phase 4 not started |
| 134 | Provide a searchable raw metadata/tag inspector for all imported blocks. | Partial | metadata-engine primitives + CrystalMetadataDialog; not dictionary-complete or loop-row/column editor |
| 135 | Provide loop-aware editing rather than flattening loop data into unrelated scalar fie... | Partial | metadata-engine primitives + CrystalMetadataDialog; not dictionary-complete or loop-row/column editor |
| 136 | Allow users to add/remove/edit eligible scalar tags and loop rows/columns with syntax... | Partial | metadata-engine primitives + CrystalMetadataDialog; not dictionary-complete or loop-row/column editor |
| 137 | Preserve unknown tags and loops by default. | Done | cif-engine preservation; crystal-cif test |
| 138 | Offer dictionary-aware descriptions, known aliases, type/value guidance, and validati... | Missing | No bundled dictionary metadata |
| 139 | Show a pre-export metadata/structure diff: preserved, changed, generated, omitted. | Done | metadata-engine computeMetadataDiff |
| 140 | Let the user choose whether derived/generated values are written into supported expor... | Partial | Metadata dialog; derived-value opt-in unverified |
| 141 | Export CIF 1.1. | Done | structure-export-engine cif1/cif2; crystal-export test |
| 142 | Export CIF 2.0. | Done | structure-export-engine cif1/cif2; crystal-export test |
| 143 | Export P1-expanded CIF. | Missing | No P1-expanded CIF target |
| 144 | Export structural mmCIF where the model maps cleanly to the supported subset. | Missing | No mmCIF or PDB export |
| 145 | Export PDB where the target format can represent the selected data; warn about unavoi... | Missing | No mmCIF or PDB export |
| 146 | Export POSCAR. | Done | structure-export-engine poscar/xyz/extxyz |
| 147 | Export XYZ/extended XYZ. | Done | structure-export-engine poscar/xyz/extxyz |
| 148 | Export reflection tables to CSV/TSV. | Partial | CSV and HKL only; no TSV |
| 149 | Export powder traces to XY/XYE-style text and supported pdCIF data blocks. | Missing | No powder trace or pdCIF export |
| 150 | Export measurements/coordination/site tables to CSV. | Partial | measurements CSV only; coordination/site tables missing |
| 151 | Export reciprocal-space/reflection diagrams to SVG/PNG. | Partial | Structure SVG/PNG only; reciprocal diagrams missing |
| 152 | Export structure/morphology scenes to GLB where applicable. | Missing | No GLB export |
| 153 | Export a self-contained local analysis report suitable for browser print/PDF containi... | Missing | No analysis report export |
| 154 | Provide editable export metadata including title, description, author/creator fields... | Done | structure-export-engine metadata policy; crystal-export test |
| 155 | Never add metadata silently; generated fields are previewable before export. | Done | structure-export-engine metadata policy; crystal-export test |
| 156 | Provide progressive disclosure so the default workspace is understandable without cry... | Done | Task-oriented workspace (phase 1 e2e) |
| 157 | Provide an in-tool crystallography guide modal/glossary for cell parameters, fraction... | Missing | No guide, glossary or starter workflows |
| 158 | Link guide entries contextually from advanced controls without permanently occupying... | Missing | No guide, glossary or starter workflows |
| 159 | Provide beginner-friendly starter workflows such as “Explore a unit cell,” “See a Mil... | Missing | No guide, glossary or starter workflows |
| 160 | Preserve full professional controls; beginner guidance must not replace or hide scien... | Partial | Controls preserved; nothing hidden yet, no guidance layer to verify against |
| 161 | Provide textual equivalents for color-only scientific states and legends. | Partial | Not audited for colour-only states |
| 162 | Maintain keyboard navigation, visible focus, semantic forms/tables, reduced-motion be... | Partial | Keyboard/Axe/reflow gates exist; no prefers-reduced-motion handling |
| 163 | Provide accessible tabular alternatives for charts/3D-selected scientific values. | Partial | Diffraction table exists; other charts/3D values lack table alternatives |

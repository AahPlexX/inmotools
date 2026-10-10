---
tool: crystal-lattice-studio
folder: src/tools/crystal
doc: spec
basis: as-built
status: active
spec: docs/superpowers/specs/2026-10-05-crystal-lattice-studio-design.md
tracker: src/tools/crystal/TRACKER.md
updated: 2026-10-10
---

# Crystal Lattice Studio — spec

As built at `origin/main` `a582f5dc`. Requirement prefix: `CLS`. Status of each requirement: [TRACKER.md](../../../src/tools/crystal/TRACKER.md). History: [2026-09-11-crystal-lattice-studio-design.md](2026-09-11-crystal-lattice-studio-design.md) (master design with the 163 numbered capabilities), ledger [2026-09-29-crystal-lattice-studio-capability-ledger.md](../plans/2026-09-29-crystal-lattice-studio-capability-ledger.md), phase plans listed in the tracker. Former capability numbers 1–163 are given as "(formerly N)"; CLS-R001 to CLS-R163 carry capabilities 1 to 163 in order.

## Purpose

Explore crystal structures in the browser: open and edit a structure, check its symmetry, measure it, and go from lattice geometry through reciprocal space and diffraction to observed-reflection residuals, scalar fields, voids and crystal shape, for learners, educators, mineralogists, chemists, materials scientists and crystallographers.

## Scope

In scope:
- Structure import (CIF 1.1 and 2.0, mmCIF, PDB, POSCAR, XYZ, extended XYZ), starter structures, cell and site editing, supercells, defects, undo/redo and a local project file.
- Symmetry detection (Moyo kernel), Wyckoff positions, periodic geometry, bonding, coordination, validation and composition.
- Reciprocal space, diffraction (X-ray, neutron, electron, single crystal, Laue), powder profiles, observed overlays and refinement.
- Scalar fields, voids, morphology, metadata editing and export (CIF, POSCAR, XYZ, CSV, SVG, PNG, project).

Out of scope:
- Full macromolecular model building and refinement comparable to Coot, REFMAC or Phenix: specialist native stacks that are not reproduced in a static-browser tool; PDB and mmCIF structures still open for viewing and measurement.
- Automatic magnetic-space-group solving: conditional until a browser-safe engine is verified; magCIF moment display is in scope (CLS-R045).

## Constraints

- Platform rules: no accounts or authentication; no server or server-side database (static files on GitHub Pages); everything runs in the browser and structures stay in this browser; network use only for the site's own files ([DOCUMENTATION_STANDARD.md](../../DOCUMENTATION_STANDARD.md#platform-rules-apply-to-every-tool-and-every-spec)).
- No large language models; other ML only on the device under the ML ruleset.
- Libraries as in `package.json`; the Moyo symmetry kernel runs locally. The project file schema `inmotools.crystal-project` version 1 is not changed.
- Operations are bounded and fail visibly; the imported source file is never overwritten.

## Architecture and engine

- Engines and libraries: `@spglib/moyo-wasm@0.19.0` (Moyo, WebAssembly) performs space-group and symmetry analysis, loaded lazily on first use; `three@0.185.1` renders the structure, with `OrbitControls` and `ConvexGeometry` from its addons; the CIF, PDB, VASP and XYZ import and export, diffraction, reciprocal-space, refinement and fitting engines are first-party TypeScript in `src/tools/crystal/`.
- Browser APIs: WebAssembly runs the symmetry kernel; WebGL (`THREE.WebGLRenderer`, `preserveDrawingBuffer`) draws the viewport, and the viewport shows the renderer's error message, or "WebGL is unavailable in this browser.", when it cannot start; Canvas 2D composes the PNG export (`canvas.toBlob`); exports download through `src/lib/download`.

### Stable pointer activation contract — specified 2026-10-10

CLS-R030 point-defect actions must remain reliably activatable after selecting a site, creating a vacancy, undoing it and focusing the element input. While this workspace is mounted, default programmatic viewport scrolling is instant so automatic reveals cannot animate the document under a pending pointer action. Manual scrolling remains available. This scope uses the existing browser CSSOM and React effect lifecycle; it does not change the shared stylesheet, dependencies, structure/history engines or another tool's behavior.

Capture the previous root inline scroll-behavior value and priority. Apply auto with empty priority while mounted, then restore the previous declaration on unmount only when the current declaration still equals the applied auto/empty-priority declaration. Preserve a later changed value or priority. Normal and reduced-motion route transitions, pre-existing smooth!important and later changed declarations must retain their non-Crystal preferences. Native pointer/keyboard activation, selected-site/element semantics and undo remain unchanged. The component's model variable named document must not be mistaken for the browser document.

The unchanged original point-defect case remains the behavior regression; add a meaningful route/preference regression before implementation. Existing captured local failure/prototype is baseline evidence, not repaired-application acceptance. Require actual-source desktop/mobile Chromium and native-engine checks, owned integration, one frozen full gate, main/Pages and qualified live checks. This is a dependency repair for the current PDF gate; the frozen requirement inventory cursor does not advance to Crystal.

## Requirements

### Import, project and structure creation

| ID | Requirement | Acceptance test |
| --- | --- | --- |
| CLS-R001 | CIF 1.1 files open with every data block, scalar tag, loop, quoted and multiline value kept, including unknown content, and malformed loops are reported with their source location (formerly 1) | Open a CIF with an unknown tag and loop, export it, and parse it again: the content is unchanged; a loop with the wrong width names its line |
| CLS-R002 | CIF 2.0 files open with their own syntax (magic header, triple-quoted strings, compound values) handled apart from CIF 1.1 (formerly 2) | A CIF 2.0 file with a triple-quoted string parses without corrupting the value |
| CLS-R003 | Structural mmCIF/PDBx coordinate content opens for viewing and measurement (formerly 3) | An mmCIF with Cartesian `_atom_site` rows opens as a structure |
| CLS-R004 | PDB coordinate files open with their cell and symmetry records when present (formerly 4) | A PDB with CRYST1, ATOM and HETATM records opens with that cell and atoms |
| CLS-R005 | VASP POSCAR and CONTCAR files open in Direct, Cartesian and selective-dynamics forms with scaling (formerly 5) | A POSCAR with a scale factor opens with scaled Cartesian positions |
| CLS-R006 | XYZ and extended XYZ files open, keeping the lattice and properties fields and warning that plain XYZ is nonperiodic (formerly 6) | An extended XYZ with a `Lattice` field opens with that cell; plain XYZ shows a warning |
| CLS-R007 | Observed-reflection `.hkl` text opens for the reflection workspace where its layout is supported and validated (formerly 7) | Opening an h k l Fo file lists the reflections; a line without Fo is rejected naming the line |
| CLS-R008 | Reflection loops and powder-data loops in a CIF open as data (formerly 8) | A CIF with `_refln` rows lists them in the reflection workspace |
| CLS-R009 | Generic XY and XYE powder traces open with explicit column mapping (formerly 9) | An XYE file maps its three columns to position, intensity and error |
| CLS-R010 | A CIF with several data blocks keeps all of them and lets the user choose or compare blocks (formerly 10) | Opening a two-block CIF offers both blocks |
| CLS-R011 | Starter structures are built in: simple cubic, body-centered cubic, face-centered cubic, diamond, rock salt, cesium chloride, zinc blende, graphite, perovskite, rutile, fluorite, wurtzite and a molecular packing example (formerly 11) | Each starter in "Choose a starter structure" opens with a valid cell and sites, offline |
| CLS-R012 | A new empty crystal is created from cell parameters plus sites (formerly 12) | Creating a crystal with a 5 Å cubic cell gives an editable document with that cell |
| CLS-R013 | A versioned project file saves and reopens the structure, view, measurements and CIF preservation state; unsupported versions and hostile files are refused (formerly 13) | Save a project, reopen it: structure, view selections and measurements return; a newer schema version is refused |
| CLS-R014 | Edits can be undone and redone with history bounded at 100 steps (formerly 14) | Edit the cell, Undo and Redo move between states; a new edit clears Redo |
| CLS-R015 | Reset structure returns to the imported state without touching the source file (formerly 15) | After edits, Reset structure restores the imported cell and sites |

### Cell and atomic model editing

| ID | Requirement | Acceptance test |
| --- | --- | --- |
| CLS-R016 | The cell lengths a, b, c and angles alpha, beta, gamma are edited with immediate validity checks, and an invalid edit leaves the document unchanged (formerly 16) | Entering a 0 Å length is refused and the previous cell stays |
| CLS-R017 | A crystal-system constraint keeps symmetry-required cell relations while editing (formerly 17) | With cubic selected, changing a makes b and c equal to it and the angles 90° |
| CLS-R018 | The cell volume, metric tensor, reciprocal metric tensor and lattice and reciprocal basis vectors are displayed (formerly 18) | A cubic 5 Å cell shows 125 Å³ and the metric tensor |
| CLS-R019 | Site coordinates are edited as fractional or Cartesian values with conversion both ways (formerly 19) | Switching to Cartesian shows the converted position; editing it updates the fractional one |
| CLS-R020 | Sites are added, duplicated, deleted and relabelled with stable identities (formerly 20) | Add site, Duplicate and Delete change the site list; a label edit renames the site |
| CLS-R021 | A site's element, isotope, occupancy, oxidation state, disorder assembly and group, and notes are edited, with validation errors shown (formerly 21) | Setting occupancy above 1 shows an error and keeps the site |
| CLS-R022 | Isotropic displacement parameters are edited per site (formerly 22) | Entering Uiso 0.02 stores it on the site |
| CLS-R023 | Anisotropic displacement tensors are edited per site and non-positive-definite tensors give no ellipsoid (formerly 23) | A valid tensor is accepted; an invalid one is flagged |
| CLS-R024 | Sites are wrapped into the reference cell, and periodic molecules split across the boundary are unwrapped and reconstructed (formerly 24) | "Wrap sites into cell" moves a site at x=1.2 to x=0.2; a molecule split across the boundary is made whole |
| CLS-R025 | Supercells use independent integer repeats with an atom-count preview and limit (formerly 25) | Repeats 2×2×2 of a BCC cell show 16 atoms before applying; an over-limit request is refused |
| CLS-R026 | Translated periodic-image shells are generated around the reference cell (formerly 26) | A shell of 1 gives 26 translated copies with stable ids |
| CLS-R027 | Primitive and conventional cells are generated from the detected symmetry with provenance, previewed before applying (formerly 27) | Preview standardized cell then Apply gives the conventional cell |
| CLS-R028 | An explicit basis and origin transformation is applied with before/after preview and reversible provenance (formerly 28) | A unimodular axis exchange keeps fractional geometry in the rebased cell; a non-unimodular matrix is refused |
| CLS-R029 | A homogeneous strain tensor is applied with the pre-transform state preserved (formerly 29) | A zero strain leaves the structure unchanged; a 1% strain scales the cell |
| CLS-R030 | Point defects (vacancy, substitution, interstitial) are built with provenance and undo (formerly 30) | Create vacancy removes the chosen site; Undo restores it |
| CLS-R031 | The defect concentration of the selected supercell is reported (formerly 31) | One vacancy in a 16-atom supercell reports 1/16 |
| CLS-R032 | Slabs are built from a chosen (hkl) plane with thickness, vacuum and termination offset (formerly 32) | A (100) slab of a cubic cell has the requested thickness and vacuum |
| CLS-R033 | Twin or domain transformation matrices are applied and domain overlays shown (formerly 33) | A rotated domain overlay places the second domain in Cartesian space |
| CLS-R034 | A structure is duplicated into a comparison layer and cell and site deltas are computed when atom mapping is unambiguous (formerly 34) | Two structures with the same sites give deltas; an ambiguous mapping is refused |

### Core visualization

| ID | Requirement | Acceptance test |
| --- | --- | --- |
| CLS-R035 | Atoms are drawn as instances with the unit-cell edges, aware of the periodic cell (formerly 35) | A starter shows one instance per visible site and twelve cell edges |
| CLS-R036 | Ball-and-stick, sticks, space-fill, points, wireframe, polyhedral and thermal-ellipsoid representations are offered (formerly 36) | Choosing each representation redraws the structure in that style |
| CLS-R037 | Orthographic and perspective cameras, orbit, pan, zoom, reset, fit, axis views and keyboard-operable view presets are offered (formerly 37) | The projection button switches camera type; Fit structure and Reset view reframe; +X, +Y, +Z look down each axis |
| CLS-R038 | Unit-cell edges, lattice vectors, reciprocal vectors, origin, axes and configurable labels are drawn (formerly 38) | Enabling axes draws the three lattice vectors with labels and the origin |
| CLS-R039 | Conventional element colours and radii are used and can be overridden by the user (formerly 39) | Setting Fe to red recolours every Fe atom |
| CLS-R040 | Sites and elements are selected (single and multiple), hidden, isolated, inverted and selected by property (formerly 40) | Clicking atoms selects them and shows the count; Hide removes them; Isolate shows only them; Invert swaps the selection |
| CLS-R041 | A clipping plane and a bounded slab viewer limit what is drawn (formerly 41) | A clip plane at x=0.5 hides atoms beyond it |
| CLS-R042 | Bonds across cell boundaries are drawn by periodic bond detection with a bounded count (formerly 42) | A BCC starter shows bonds from the corner atom to the body atom in neighbouring cells |
| CLS-R043 | Coordination polyhedra are drawn with adjustable criteria and per-polyhedron visibility (formerly 43) | Choosing a site and ticking "Show coordination polyhedron" draws its polyhedron |
| CLS-R044 | Anisotropic displacement ellipsoids are drawn at a selectable probability level when ADPs are valid (formerly 44) | Choosing the 50% level draws ellipsoids on sites with valid ADPs |
| CLS-R045 | Imported magnetic moment vectors and propagation vectors are drawn when magCIF data is present (formerly 45) | A structure with supplied moments shows arrows |
| CLS-R046 | The viewport exports as a high-resolution PNG with a transparent or solid background (formerly 46) | Choose PNG, Transparent, download: the file has an alpha background; White gives a solid one |
| CLS-R047 | The structure exports as a true vector SVG with crystal primitives and labels (formerly 47) | The SVG contains line and circle elements, not an embedded bitmap |
| CLS-R048 | The visible structure exports as GLB (formerly 48) | The GLB opens with one node per element group |

### Symmetry and asymmetric-unit analysis

| ID | Requirement | Acceptance test |
| --- | --- | --- |
| CLS-R049 | Symmetry is detected locally from the active periodic structure, with an error for unsupported elements, partial occupancy or bad tolerance (formerly 49) | Detect symmetry on the BCC starter reports Im-3m; a site with an unmapped element fails with a message |
| CLS-R050 | The result shows space-group number and Hermann–Mauguin symbol, Hall information, crystal system, point group, Pearson symbol and operation count (formerly 50) | The BCC starter shows Im-3m, 229, cubic, m-3m, cI2 and 96 operations |
| CLS-R051 | Wyckoff letters and site multiplicities are assigned and displayed (formerly 51) | The BCC starter site shows Wyckoff 2a with multiplicity 2 |
| CLS-R052 | Symmetry-equivalent sites are generated from the asymmetric unit (formerly 52) | Expanding NaCl from its asymmetric unit gives 8 sites |
| CLS-R053 | An asymmetric-unit candidate is extracted from a complete periodic structure when symmetry allows (formerly 53) | A NaCl cell reduces to its two independent sites |
| CLS-R054 | A symmetry-operation browser shows each operation's matrix and translation (formerly 54) | The browser lists all operations and selecting one shows its 3×3 matrix and translation |
| CLS-R055 | The coordinates produced by a selected symmetry operation are previewed (formerly 55) | Selecting an operation shows where site 1 moves |
| CLS-R056 | A tolerance sweep shows where the detected group changes (formerly 56) | Run tolerance sweep lists tolerances in ascending order with the group found at each |
| CLS-R057 | After an edit, the symmetry-break inspector lists which operations stop matching and the contributing site (formerly 57) | Moving a site then Inspect symmetry break names the broken operations and that site |
| CLS-R058 | Systematic reflection conditions are shown from the active symmetry operations (formerly 58) | The BCC starter shows the condition h+k+l = 2n |
| CLS-R059 | Imported symmetry operations are validated against the cell and sites and inconsistencies flagged (formerly 59) | A CIF whose operations do not map its sites onto themselves is flagged, not replaced |
| CLS-R060 | Source symmetry tags are kept apart from detected symmetry and an export can choose source, detected or P1-expanded output (formerly 60) | Exporting with "detected" writes the detected group; "source" writes the original tags |

### Geometry, bonding, local environment and validation

| ID | Requirement | Acceptance test |
| --- | --- | --- |
| CLS-R061 | Periodic nearest-image distances are measured between two sites and listed (formerly 61) | Measuring two sites across the cell boundary gives the minimum-image distance |
| CLS-R062 | Bond angles are measured (formerly 62) | Three sites at right angles measure 90° |
| CLS-R063 | Torsion (dihedral) angles are measured with sign (formerly 63) | Four sites measure a signed dihedral |
| CLS-R064 | Plane–plane and direction–direction angles are measured (formerly 64) | (100) and (010) planes measure 90° in a cubic cell |
| CLS-R065 | Bonds are detected from configurable covalent-radius criteria across periodic boundaries (formerly 65) | Setting the tolerance to 1.3 adds longer bonds |
| CLS-R066 | Short contacts are detected with explicit threshold controls (formerly 66) | A radius scale of 0.8 lists periodic contacts below it |
| CLS-R067 | Likely hydrogen bonds are detected from donor/acceptor, distance and angle criteria (formerly 67) | An O–H···O geometry inside the limits is listed; outside it is not |
| CLS-R068 | Coordination numbers and neighbour shells are computed (formerly 68) | A BCC site reports 8 first-shell neighbours |
| CLS-R069 | Coordination polyhedra with distortion metrics are computed and displayed (formerly 69) | A polyhedron shows its distortion index |
| CLS-R070 | Pair-distance histograms are computed over a chosen range with broadening (formerly 70) | A range of 0–6 Å gives bounded bins with no non-finite values |
| CLS-R071 | Element-pair partial radial distributions are computed (formerly 71) | Na–Cl pairs give their own histogram |
| CLS-R072 | Bond-valence sums are computed when parameters exist, and the missing-parameter case is explained (formerly 72) | A pair without parameters gives an explicit diagnostic |
| CLS-R073 | Formula, reduced formula, formula mass, formula units, cell mass, density and composition fractions are reported (formerly 73) | NaCl reports formula NaCl, mass 58.44 and the cell density |
| CLS-R074 | The structure is validated for occupancies, element labels, coincident sites, invalid ADPs, non-physical cells and short contacts (formerly 74) | A site with occupancy 1.5 is listed as an error; a close contact as a warning |
| CLS-R075 | The structure-health panel separates errors, warnings and informational observations without claiming experimental correctness (formerly 75) | Errors, warnings and information appear in separate groups |

### Real and reciprocal lattice, planes

| ID | Requirement | Acceptance test |
| --- | --- | --- |
| CLS-R076 | The reciprocal lattice is rendered interactively (formerly 76) | The reciprocal lattice points can be rotated and selected |
| CLS-R077 | Arbitrary (hkl) planes are drawn in the real-space structure (formerly 77) | Entering (111) draws the plane through the cell |
| CLS-R078 | Crystal directions [uvw] and zone axes are created and displayed (formerly 78) | Entering [111] draws the body diagonal |
| CLS-R079 | D-spacings are calculated from the metric tensor and shown in the reflection table (formerly 79) | (100) of a 5 Å cubic cell gives 5 Å |
| CLS-R080 | Reciprocal-vector magnitudes and angles between reciprocal vectors and planes are calculated (formerly 80) | A triclinic cell reports a*, b*, c* and their angles |
| CLS-R081 | Selecting a reciprocal-lattice point or reflection shows its real-space plane family (formerly 81) | Clicking the (110) reflection draws its planes |
| CLS-R082 | Stereographic projection plots poles for selected plane normals and directions (formerly 82) | (001) plots at the centre and (111) inside the circle |
| CLS-R083 | A Wulff-net overlay shows angular relationships (formerly 83) | The net overlay is drawn under the poles |
| CLS-R084 | The Ewald sphere is rendered with adjustable wavelength and orientation and intersecting reflections are highlighted (formerly 84) | Changing the wavelength changes which reflections are highlighted |
| CLS-R085 | The Wigner–Seitz cell is constructed and displayed (formerly 85) | A cubic cell shows a cube; an fcc cell a rhombic dodecahedron |
| CLS-R086 | The first Brillouin zone is constructed and displayed (formerly 86) | A cubic cell gives a cube of volume |B| |
| CLS-R087 | Reciprocal-space section planes show indexed points (formerly 87) | A (hk0) section lists its indexed points |

### Diffraction and scattering

| ID | Requirement | Acceptance test |
| --- | --- | --- |
| CLS-R088 | Bounded reflection sets are enumerated by d-spacing, reciprocal radius or Miller-index limits (formerly 88) | Minimum d of 1.5 Å lists the reflections above it ordered by d; a non-positive limit is refused |
| CLS-R089 | Structure factors and intensities use wavelength-appropriate X-ray atomic scattering factors (formerly 89) | F(200) of NaCl equals fNa + fCl and intensity is |F|² |
| CLS-R090 | Nuclear neutron intensities use bundled coherent scattering lengths with isotope overrides (formerly 90) | Neutron mode uses signed b values; Ti gives a negative contribution |
| CLS-R091 | Powder X-ray patterns are simulated with wavelength presets and a custom wavelength (formerly 91) | Choosing Cu Kα gives 2θ positions at λ = 1.5406 Å; entering 0.709 Å moves the peaks |
| CLS-R092 | Powder neutron patterns are simulated (formerly 92) | Choosing Neutron recalculates with scattering-length intensities |
| CLS-R093 | Kinematic electron-diffraction spot geometry and intensities are simulated with the assumptions stated in the product (formerly 93) | Choosing Electron shows spots at the electron wavelength and a note on the approximations |
| CLS-R094 | Single-crystal diffraction spot patterns are simulated for an arbitrary orientation (formerly 94) | Rotating the crystal moves the spots |
| CLS-R095 | Laue white-beam spot geometry is simulated over a bounded wavelength band (formerly 95) | A band of 0.5–2 Å lists spots with their solved wavelengths |
| CLS-R096 | The reflection table shows hkl, multiplicity, d-spacing, reciprocal magnitude, 2θ, F, F² or intensity, and extinction state (formerly 96) | The table columns include |1/d|, F and whether the reflection is extinct |
| CLS-R097 | Peaks and reflections are inspected interactively from the chart or the table (formerly 97) | Clicking a peak highlights its table row |
| CLS-R098 | Linear, square-root and log-like display transforms change the chart without changing exported intensities (formerly 98) | Choosing log redraws the chart and leaves exported values unchanged |
| CLS-R099 | Pseudo-Voigt (and Gaussian and Lorentzian) peak broadening is applied (formerly 99) | A pseudo-Voigt profile peaks at the stick positions with heavier tails than Gaussian |
| CLS-R100 | Instrumental U/V/W width terms are modelled (formerly 100) | Caglioti U, V and W give a width that varies with 2θ |
| CLS-R101 | Crystallite-size broadening is modelled with its assumptions stated (formerly 101) | A 50 nm crystallite gives the Scherrer width |
| CLS-R102 | Microstrain broadening is modelled with its assumptions stated (formerly 102) | A strain of 0.1% broadens by the stated formula |
| CLS-R103 | March–Dollase preferred orientation is applied (formerly 103) | A March ratio below 1 changes the intensity of reflections along the chosen axis |
| CLS-R104 | Observed XY, XYE and pdCIF data are overlaid with scale, offset and region controls (formerly 104) | Loading a trace shows it over the simulated pattern; the scale control rescales it |
| CLS-R105 | Observed peaks are picked manually and by deterministic local-maximum criteria (formerly 105) | Picking finds the local maxima above a threshold; clicking adds a peak |
| CLS-R106 | Observed and simulated traces are compared with residual curves and numeric fit measures (formerly 106) | A fit shows the residual curve and Rp and Rwp with their formulas |
| CLS-R107 | Several phases are summed in one powder pattern with adjustable scales (formerly 107) | Two phases at scales 1 and 0.5 give the summed pattern |
| CLS-R108 | Phase fractions are estimated from fitted scales only when the required inputs exist, and otherwise shown as relative intensities (formerly 108) | With Z, M and V for each phase the fractions sum to 1; without them the scales are labelled relative |

### Powder and reflection refinement, Fourier analysis

| ID | Requirement | Acceptance test |
| --- | --- | --- |
| CLS-R109 | A bounded least-squares powder fit refines scale, zero shift, lattice parameters, background, width, phase scales and preferred orientation (formerly 109) | A synthetic trace with shifted zero recovers the shift |
| CLS-R110 | Fit parameters are fixed or free and bounded, with the active set visible before a run (formerly 110) | Fixing the zero shift keeps it unchanged and lists it as fixed |
| CLS-R111 | Fits report convergence, parameter changes, residual metrics, iteration count and termination reason, and never call a non-converged run converged (formerly 111) | A run that hits the iteration limit reports its termination reason, not convergence |
| CLS-R112 | The observed-reflection workspace compares Fo with Fc for reflection data (formerly 112) | Loading an hkl file lists Fo, Fc and the difference for each reflection |
| CLS-R113 | R1-style and weighted residuals are reported with counts, scale and the formulas displayed (formerly 113) | Loading reflections shows R1 and wR2 with their formulas |
| CLS-R114 | Difference-Fourier scalar grids are calculated from observed and calculated amplitudes and labelled model-dependent (formerly 114) | The analysis states that phases come from the current model |
| CLS-R115 | Local maxima and minima of the difference map are ranked as candidate residual-density peaks (formerly 115) | The panel lists ranked Fourier extrema with positions and heights |
| CLS-R116 | Constrained coordinate, occupancy and ADP least-squares refinement enumerates the refined parameters and restraints (formerly 116) | Refining an x coordinate lists it as free with bounds and reports convergence |
| CLS-R117 | Charge-flipping exploration runs on suitable complete intensity data (formerly 117) | A synthetic dataset converges to a map with the expected peaks |

### Volumetric fields, voids and surfaces

| ID | Requirement | Acceptance test |
| --- | --- | --- |
| CLS-R118 | Gaussian CUBE scalar fields open (formerly 118) | Opening a 2×2×2 CUBE file lists its grid and a slice table |
| CLS-R119 | XSF scalar grids open (formerly 119) | Opening an XSF grid lists its size and slices |
| CLS-R120 | MRC/CCP4 scalar maps open as bounded typed binary grids (formerly 120) | Opening a .map file lists its grid |
| CLS-R121 | Positive and negative isosurfaces are drawn with independent levels and opacities (formerly 121) | Setting the positive level to 0.5 and negative to -0.5 shows two surfaces with their own opacity |
| CLS-R122 | Orthogonal slices of the scalar field are drawn and tabulated (formerly 122) | Choosing axis z and index 0 shows that slice's values |
| CLS-R123 | A plane-aligned slice of the scalar field at an arbitrary plane is drawn (formerly 123) | A plane through the cell centre at 45° gives its sampled values |
| CLS-R124 | Grids are resampled to a bounded size while the original is kept (formerly 124) | Downsampling a 64³ grid to 16³ leaves the original unchanged |
| CLS-R125 | Void and cavity regions are estimated from a periodic probe-radius grid (formerly 125) | Analyze voids with spacing 0.5 Å and probe 1.0 Å returns regions for an open structure |
| CLS-R126 | Occupied, void and accessible fractions are reported with the grid spacing, probe radius and radius basis (formerly 126) | The result lists the three fractions beside the inputs used |
| CLS-R127 | Cavity components are listed, selected and isolated (formerly 127) | Selecting component 2 shows only that cavity |

### Morphology, facets and twinning

| ID | Requirement | Acceptance test |
| --- | --- | --- |
| CLS-R128 | BFDH-style morphology is generated from face geometry and d-spacing, labelled a geometry heuristic (formerly 128) | Build morphology with BFDH lists facets ordered by d-spacing |
| CLS-R129 | Wulff morphology is generated from user-supplied facet energies (formerly 129) | Entering energies for (100) and (111) changes the shape |
| CLS-R130 | The facet table shows Miller indices, relative area, normal, d-spacing and the supplied or derived weight (formerly 130) | The table lists each facet with those columns |
| CLS-R131 | Facets are included or excluded and their weights edited directly (formerly 131) | Unticking "Include facet 1 0 0" removes it from the shape |
| CLS-R132 | Twin or domain morphology transforms overlay when a twin matrix is supplied (formerly 132) | A supplied 180° twin matrix draws the twinned shape |
| CLS-R133 | Morphology exports as SVG, PNG and GLB (formerly 133) | Export morphology writes an SVG of the shape |

### Metadata, dictionary-aware inspection and export

| ID | Requirement | Acceptance test |
| --- | --- | --- |
| CLS-R134 | A searchable raw metadata and tag inspector covers all imported blocks (formerly 134) | Typing a tag name in the search box lists matching tags from every block |
| CLS-R135 | Loop data is edited as loops, with rows and columns, not flattened to scalars (formerly 135) | Editing one cell of a loop keeps the loop shape and neighbouring values |
| CLS-R136 | Scalar tags and loop rows and columns are added, removed and edited with syntax-safe serialization (formerly 136) | Adding tag `_custom_note` writes it quoted when it has spaces; removing a loop row keeps the loop valid |
| CLS-R137 | Unknown tags and loops are preserved by default (formerly 137) | Exporting an edited CIF keeps a loop the tool does not use |
| CLS-R138 | Dictionary-aware descriptions, aliases, type and value guidance and validation are offered (formerly 138) | Selecting `_cell_length_a` shows its dictionary description and units |
| CLS-R139 | A pre-export diff shows which metadata is preserved, changed, generated and omitted (formerly 139) | "Metadata impact" lists the four classes before download |
| CLS-R140 | The user chooses whether derived or generated values are written into supported export tags (formerly 140) | Unticking the option leaves generated tags out of the CIF |
| CLS-R141 | CIF 1.1 exports (formerly 141) | Export CIF 1.1 downloads a `.cif` that parses back to the same cell and sites |
| CLS-R142 | CIF 2.0 exports with its magic header (formerly 142) | Export CIF 2.0 starts with the CIF 2.0 magic line |
| CLS-R143 | A P1-expanded CIF exports (formerly 143) | The P1 file lists every symmetry-generated site with the P 1 group |
| CLS-R144 | Structural mmCIF exports where the model maps cleanly (formerly 144) | The mmCIF opens in another viewer with the same atoms |
| CLS-R145 | PDB exports, warning about unavoidable loss before export (formerly 145) | The PDB has CRYST1 and ATOM records; occupancy loss is warned |
| CLS-R146 | POSCAR exports from the canonical coordinates (formerly 146) | Export POSCAR reads back to the same cell and sites |
| CLS-R147 | XYZ and extended XYZ export (formerly 147) | Export Extended XYZ carries the Lattice field |
| CLS-R148 | Reflection tables export as CSV or TSV (formerly 148) | Export reflections CSV lists hkl, d and F² |
| CLS-R149 | Powder traces export as XY or XYE text and supported pdCIF data blocks (formerly 149) | Export writes two or three columns of the simulated trace |
| CLS-R150 | Measurements, coordination and site tables export as CSV (formerly 150) | Export Measurements CSV lists each measurement with units |
| CLS-R151 | Reciprocal-space and reflection diagrams export as SVG or PNG (formerly 151) | The stereographic plot downloads as SVG |
| CLS-R152 | Structure and morphology scenes export as GLB (formerly 152) | The GLB opens with the scene geometry |
| CLS-R153 | A self-contained analysis report for browser print or PDF contains chosen figures, structure summary, calculations, assumptions, warnings and selected metadata (formerly 153) | Print preview shows the chosen sections |
| CLS-R154 | Export metadata is editable: title, description, author or creator, provenance notes and custom CIF tags (formerly 154) | Editing the title in Data & metadata appears in the next CIF export |
| CLS-R155 | No metadata is added silently; generated fields are previewed before export (formerly 155) | The file preview and Metadata impact show every generated field before download |

### Learnability and accessibility

| ID | Requirement | Acceptance test |
| --- | --- | --- |
| CLS-R156 | The default workspace is understandable without crystallography training, with advanced controls behind disclosure (formerly 156) | A first-time visitor can pick a starter and see it with plain-language headings; per-site advanced fields are collapsed |
| CLS-R157 | An in-tool crystallography guide and glossary explains cell parameters, fractional coordinates, symmetry, Wyckoff positions, Miller indices, the reciprocal lattice, Ewald construction, diffraction, occupancy, ADPs and refinement terms (formerly 157) | Opening the guide shows an entry for each term |
| CLS-R158 | Guide entries are linked from advanced controls without permanently occupying the workspace (formerly 158) | A help link beside Wyckoff opens its entry and closes |
| CLS-R159 | Starter workflows guide a beginner: "Explore a unit cell", "See a Miller plane", "Why diffraction peaks appear", "Compare primitive/FCC/BCC" (formerly 159) | Choosing a workflow steps through its actions |
| CLS-R160 | Full professional controls stay available; guidance never replaces or hides scientific values (formerly 160) | Every value shown without guidance is still shown with it |
| CLS-R161 | Colour-only scientific states and legends have textual equivalents (formerly 161) | Each coloured state has a text label and element colours have a legend |
| CLS-R162 | Keyboard navigation, visible focus, semantic forms and tables, reduced-motion behaviour, reflow and WCAG 2.2 AA interaction patterns hold (formerly 162) | Tab reaches every control; reduced-motion disables animation |
| CLS-R163 | Tables give accessible alternatives for charts and 3D-selected values (formerly 163) | The diffraction chart's values are in a table; a selected atom's values are in a table |

### Workspace

| ID | Requirement | Acceptance test |
| --- | --- | --- |
| CLS-R164 | Structure files opened in the workspace stay on this device and are not uploaded | Opening a local CIF makes no network request for it, and the same file can be chosen again |
| CLS-R165 | Selected atoms are counted in the workspace | Clicking two atoms shows "2 selected" |
| CLS-R166 | Measurements are listed with a remove button and saved in the project | Removing a measurement deletes it from the list and the next project file |

### Excluded by licence or platform rule

| ID | Requirement | Acceptance test |
| --- | --- | --- |
| CLS-R167 | Native refinement executables (SHELXL, SHELXT and similar) run inside the page | No control runs an external refinement program |
| CLS-R168 | Structures are fetched directly from CSD or ICSD | No control retrieves a database entry |

## Non-functional requirements

| ID | Requirement | Acceptance test |
| --- | --- | --- |
| CLS-R169 | The workspace follows the site-wide theme chosen in the site header (light, dark, system) and passes the colour-contrast check in dark | `E2E_THEME=dark` accessibility run passes for this route |
| CLS-R170 | No horizontal overflow from 320 px to 2560 px | Page scroll width equals client width at 320, 375, 768, 1024, 1440, 1920 and 2560 px |
| CLS-R171 | No serious or critical axe violations in the workspace | Axe sweep of the route |

## Definition of done

The tool is complete when every requirement is `verified` or `prohibited`, and the completion gates in `.tasks/PROJECT_COMPLETION.md` are met.

## Technique decisions

None: no function was compared between an ML and a non-ML method.

## Intent not recorded

- CLS-R169: how the workspace combines with the site-wide theme is not recorded.
- CLS-R089, CLS-R093: whether electron scattering uses its own factors or the X-ray model is not recorded.

## Change log

- 2026-10-10 — Specified CLS-R030 stable pointer activation and local viewport-scroll preference restoration for the reproduced gate-blocking missed click.
- 2026-10-05 — Created: 171 requirements as built at a582f5dc.

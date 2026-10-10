---
tool: crystal-lattice-studio
folder: src/tools/crystal
doc: tracker
basis: as-built
status: active
spec: docs/superpowers/specs/2026-10-05-crystal-lattice-studio-design.md
tracker: src/tools/crystal/TRACKER.md
updated: 2026-10-10
---

# Crystal Lattice Studio — tracker

## Resume here

2026-10-10 23:39 UTC: actual scoped effect and route regression pass16/16 focused production cases without retries/skips/flaky/global errors: Chromium8 in91.595s (320portrait,844landscape,1440desktop,390touch), Firefox/WebKit8 in82.640s (desktop/compact or touch). TypeScript exit0; production build exit0 in15.18s. Original defect test body/assertion/default5000ms is byte-identical to a25535a. New route baseline had failed2/2 on unchanged production artifact. Frozen runtime/tests are ready for publication; owned integration, one changed-source full, main/Pages/qualified-live gates are next. No full-release acceptance or inventory advance.

PDF-R02/R03 remain partial,7f9e active, R04c061 queued. Canonical narrow dependency evidence and portable recipe are in Crystal VERIFICATION.md. Shared test change proves scope; shared parent/PDF task changes preserve gate status. Other Crystal work remains frozen later.

## Documents

- Current dependency repair evidence: [VERIFICATION.md](VERIFICATION.md)
- Current task: [d7a8](../../../.tasks/items/T-crystal-substitution-retry-20261009-d7a8.md)

- Spec: [2026-10-05-crystal-lattice-studio-design.md](../../../docs/superpowers/specs/2026-10-05-crystal-lattice-studio-design.md)
- Master design (history): [2026-09-11-crystal-lattice-studio-design.md](../../../docs/superpowers/specs/2026-09-11-crystal-lattice-studio-design.md)
- Capability ledger (history): [2026-09-29-crystal-lattice-studio-capability-ledger.md](../../../docs/superpowers/plans/2026-09-29-crystal-lattice-studio-capability-ledger.md)
- Plans (history): [phase 1](../../../docs/superpowers/plans/2026-09-11-crystal-lattice-studio-phase-1.md), [phase 1 completion](../../../docs/superpowers/plans/2026-09-11-crystal-lattice-studio-phase-1-completion.md), [phase 2](../../../docs/superpowers/plans/2026-09-13-crystal-lattice-studio-phase-2.md), [phase 2 completion](../../../docs/superpowers/plans/2026-09-13-crystal-lattice-studio-phase-2-completion.md), [phase 3](../../../docs/superpowers/plans/2026-09-22-crystal-lattice-studio-phase-3.md), [phase 3 completion](../../../docs/superpowers/plans/2026-09-24-crystal-lattice-studio-phase-3-completion.md)
- Older handoff (history): [HANDOFF.md](HANDOFF.md)
- Task: [T-crystal-lattice-studio-20261005-4e6d](../../../.tasks/items/T-crystal-lattice-studio-20261005-4e6d.md)
- Index row: [TOOL_INDEX.md](../../../docs/TOOL_INDEX.md)
- Unit tests: `tests/unit/crystal-*.test.ts`; browser tests: `tests/e2e/crystal-lattice-studio*.spec.ts`

## Requirement status

`unit` = `tests/unit/crystal-*.test.ts`; `e2e` = `tests/e2e/crystal-lattice-studio*.spec.ts` unless named. Rows marked `partial` with "engine function only" have a tested function in `src/tools/crystal/` that no panel exposes yet.

| ID | Status | Evidence | Notes |
| --- | --- | --- | --- |
| CLS-R001 | verified | unit "preserves unknown CIF 1.1 scalars and loops through parse/serialize/parse", "reports malformed loop width with a source location", "parses standard uncertainty notation for structural numeric values"; e2e "opens a local file without uploading it and allows the same file to be selected again" |  |
| CLS-R002 | verified | unit "recognizes CIF 2.0 magic, triple-quoted strings, and compound values without corrupting them" | No browser test imports a CIF 2.0 file |
| CLS-R003 | verified | unit "imports structural PDBx/mmCIF Cartesian atom-site coordinates through the CIF parser" | Cartesian atom-site content only; no browser test |
| CLS-R004 | partial | unit "imports fixed-column PDB CRYST1 plus ATOM and HETATM coordinates" | The CRYST1 cell is used; space-group and SMTRY records are not read; a PDB without CRYST1 gets a nonperiodic display cell |
| CLS-R005 | verified | unit "imports POSCAR Direct, Selective Dynamics and scaled Cartesian coordinates", "supports VASP three-axis scaling and applies it to Cartesian positions" |  |
| CLS-R006 | verified | unit "imports plain XYZ with an explicit nonperiodic-display assumption warning", "imports extXYZ Lattice and Properties metadata without guessing the cell" |  |
| CLS-R007 | partial | unit "parses bounded reflection data, reports exact residual metrics, and ranks a finite difference map"; e2e "loads observed reflections and reports Fo/Fc residuals plus difference-density extrema" | Delimited h k l Fo text is read; fixed-width SHELX columns with abutting numbers are not handled |
| CLS-R008 | missing | — | No `_refln` or `_pd_` loop handling |
| CLS-R009 | partial | unit "parses two-column xy data, skipping comments and blank lines", "accepts comma/semicolon separators", "rejects empty, single-column, non-finite, and unsorted input"; e2e "overlays a local observed pattern onto the simulated stick pattern" | Two columns (position, intensity) in a fixed order; no XYE error column and no column-mapping control |
| CLS-R010 | partial | unit "keeps multiple data blocks selectable instead of discarding later blocks" | Blocks are kept and the metadata dialog counts them; no block chooser or compare control |
| CLS-R011 | verified | unit "creates every starter with a valid cell, nonempty sites, and stable unique ids"; e2e "renders an interactive crystal viewport for the selected starter" |  |
| CLS-R012 | partial | unit "creates an empty editable crystal with a valid default cell" | Engine function only; no control creates an empty crystal |
| CLS-R013 | partial | unit "round-trips document source, CIF preservation state, view state and measurements", "rejects unsupported project schema versions rather than guessing a migration", "rejects prototype-pollution keys recursively before materializing a project", "rejects non-finite and malformed scientific numeric values on parse"; e2e "saves and reopens a project with structure and view selections" | Comparison data, annotations and the export metadata policy are not stored in the project; the saved camera is a fixed default |
| CLS-R014 | verified | unit "undoes, redoes, and resets to the imported snapshot", "caps history at 100 snapshots and clears redo after a new edit"; e2e "edits a valid cell and supports undo, redo and reset" |  |
| CLS-R015 | verified | unit "undoes, redoes, and resets to the imported snapshot"; e2e "edits a valid cell and supports undo, redo and reset" |  |
| CLS-R016 | verified | unit "rejects singular, nonfinite, and nonphysical cells", "rejects invalid cell and site edits without replacing the valid document"; e2e "edits a valid cell and supports undo, redo and reset" |  |
| CLS-R017 | verified | unit "keeps cubic lengths equal and angles orthogonal when a constrained length changes", "enforces hexagonal and conventional unique-b monoclinic metrics without changing unconstrained values", "uses rhombohedral axes for the trigonal constraint and leaves triclinic cells unchanged"; e2e "applies an explicit crystal-system constraint as an undoable cell edit", "applies a cubic cell constraint to subsequent edits" |  |
| CLS-R018 | partial | unit "computes a cubic 125 Å³ cell, metric tensor, and reciprocal basis" | The volume is displayed in the Unit cell card; the metric tensors and basis vectors are not displayed |
| CLS-R019 | verified | unit "round-trips fractional coordinates in a triclinic cell"; e2e "edits sites in fractional and Cartesian coordinates and supports site operations" |  |
| CLS-R020 | verified | unit "adds, duplicates, updates, and deletes sites with immutable stable identities"; e2e "edits sites in fractional and Cartesian coordinates and supports site operations" |  |
| CLS-R021 | verified | e2e "edits advanced crystallographic site properties without hiding validation errors" | No unit test of these fields; isotope mass number is stored and not used by any calculation (see CLS-R090) |
| CLS-R022 | verified | e2e "edits advanced crystallographic site properties without hiding validation errors" | No unit test |
| CLS-R023 | verified | e2e "edits advanced crystallographic site properties without hiding validation errors"; unit "derives finite ellipsoids only for positive-definite ADPs" | Tensors are not read from CIF `_atom_site_aniso` loops |
| CLS-R024 | partial | unit "wraps edited fractional sites into the reference cell without mutating the source", "wraps fractional coordinates and uses the minimum image across a boundary", "reconstructs a periodic molecule split across the reference-cell boundary" | Wrap has a button; molecule reconstruction is an engine function with no control |
| CLS-R025 | verified | unit "expands a BCC cell deterministically, scales the cell and enforces the site limit", "rejects invalid repeat counts and shells explicitly"; e2e "previews and applies a bounded supercell and measures a periodic distance" |  |
| CLS-R026 | partial | unit "generates stable periodic image identities for a requested image shell" | Engine function only; no control |
| CLS-R027 | verified | unit "standardizes to conventional and primitive cells with provenance"; e2e "previews and applies a standardized symmetry cell" |  |
| CLS-R028 | partial | unit "applies the identity basis transform without moving sites or changing the cell", "supports a unimodular axis exchange and preserves fractional geometry in the rebased cell", "applies an explicit origin shift and wraps the resulting fractional coordinates", "rejects singular and non-unimodular basis transforms instead of silently changing multiplicity" | Engine function only; no control and no before/after preview |
| CLS-R029 | partial | unit "treats strain as a homogeneous small-strain tensor and leaves zero strain unchanged" | Engine function only; no control |
| CLS-R030 | verified | unit "creates vacancy, substitution and interstitial models immutably with provenance"; e2e "builds vacancy, substitution and interstitial defects with undo", "CLS-R030 keeps automatic reveals local and restores route preferences" | Scoped repair16/16 local production checks passed; release/full gates pending in d7a8. |
| CLS-R031 | partial | unit "reports defect concentration from deterministic site identity and chemistry changes" | Engine function only; the Point defects card does not show it |
| CLS-R032 | partial | unit "builds a bounded cubic (100) slab with the requested material thickness and vacuum", "rejects invalid slab and domain requests before producing partial output" | Engine function only; the test covers cubic (100); no control |
| CLS-R033 | partial | unit "creates deterministic identity and rotated domain overlays in Cartesian space" | Engine function only; no control or overlay in the viewport |
| CLS-R034 | partial | unit "compares structures only when stable site mapping is unambiguous" | Engine function only; no comparison layer |
| CLS-R035 | verified | unit "builds one atom instance per visible site and twelve unit-cell edges"; e2e "renders an interactive crystal viewport for the selected starter" | Periodic-image atoms outside the cell are not drawn |
| CLS-R036 | partial | unit "includes bounded periodic bonds for bond-based representations and omits them for points/space-fill", "produces deterministic keys and changes the key when structure or representation changes", "derives finite ellipsoids only for positive-definite ADPs" | The Representation select offers ball and stick, sticks, space fill, points and wireframe; polyhedra only through the Environment toggle; no control shows thermal ellipsoids |
| CLS-R037 | partial | e2e "renders an interactive crystal viewport for the selected starter", "Phase 1 controls are keyboard operable and dialogs restore focus" | Projection toggle, Fit, Reset and +X/+Y/+Z buttons exist; no -X/-Y/-Z or named presets; pan not confirmed; no keyboard handler on the canvas; no test of the camera controls |
| CLS-R038 | partial | unit "builds one atom instance per visible site and twelve unit-cell edges" | Cell edges only; the axes flag is saved in the view but draws nothing |
| CLS-R039 | partial | unit "uses element reference colors/radii with a bounded visual fallback for unknown pseudo-elements", "every real element has a positive weight and radius" | Reference colours and radii exist; no override control |
| CLS-R040 | partial | unit "keeps stable site IDs and carries selection into the render model", "filters clipped and hidden primitives deterministically" | Click and multi-select work and the count is shown; hide, isolate and element filter exist in the render model with no control; no invert; no select-by-property |
| CLS-R041 | partial | unit "filters clipped and hidden primitives deterministically" | Render-model option only; no control |
| CLS-R042 | verified | unit "finds radius-based periodic bonds and reports unsupported element radii rather than guessing", "includes bounded periodic bonds for bond-based representations and omits them for points/space-fill" | No browser test of the drawn bonds |
| CLS-R043 | partial | unit "builds a coordination polyhedron for a requested center"; e2e "renders a coordination polyhedron for the selected site" | One centre at a time; no criteria control; no list of polyhedra |
| CLS-R044 | partial | unit "derives finite ellipsoids only for positive-definite ADPs" | Render-model option only; no probability control or toggle |
| CLS-R045 | partial | unit "renders magnetic vectors only when imported vectors are supplied" | Render-model option only; no magCIF import; propagation vectors not handled; the workspace never passes vectors |
| CLS-R046 | verified | e2e "PNG publication export honors transparent and solid backgrounds" | Output size is clamped to 4096 px and 16.7 million pixels with a message; no unit test of the clamp |
| CLS-R047 | verified | unit "builds a true vector SVG with crystal primitives and labels"; e2e "downloads a true vector SVG publication graphic" | Ball-and-stick, sticks, space-fill and wireframe only |
| CLS-R048 | missing | — | No GLB code |
| CLS-R049 | verified | unit "detects Im-3m BCC and returns normalized symmetry metadata", "fails visibly for an element without a verified atomic-number mapping", "does not silently coerce partial occupancy or explicit disorder into an ordered symmetry model", "rejects invalid tolerances before invoking the symmetry kernel"; e2e "detects BCC symmetry and shows one operation and Wyckoff result", "Phase 2 acceptance detects high- and lower-symmetry structures", "Phase 2 acceptance surfaces partial occupancy as a limitation" |  |
| CLS-R050 | partial | unit "detects Im-3m BCC and returns normalized symmetry metadata"; e2e "detects BCC symmetry and shows one operation and Wyckoff result" | The panel shows the Hall number, not the Hall symbol |
| CLS-R051 | partial | e2e "detects BCC symmetry and shows one operation and Wyckoff result" | Letters and site symmetry are shown; multiplicities are not |
| CLS-R052 | partial | unit "generates deduplicated equivalent sites without mutating the source", "expands the asymmetric unit via the source symmetry operations (NaCl, Fm-3m F-centering)", "also expands via the legacy _symmetry_equiv_pos_as_xyz loop tag", "fails visibly on a malformed symmetry-operation string instead of silently dropping it" | Expansion runs on CIF import; the generator for detected operations has no control |
| CLS-R053 | missing | — | No reduction function |
| CLS-R054 | partial | e2e "detects BCC symmetry and shows one operation and Wyckoff result" | The panel lists the first three operations as rotation and translation; no full list or selection |
| CLS-R055 | partial | unit "applies operations in wrapped fractional coordinates" | Engine function only; no operation selection or preview |
| CLS-R056 | verified | unit "sweeps tolerances in ascending deterministic order after rejecting invalid inputs"; e2e "runs a symmetry tolerance sweep" |  |
| CLS-R057 | verified | unit "flags operations that no longer map an edited structure onto itself", "reports surviving and broken operations with the offending site"; e2e "inspects a symmetry break after perturbing a site", "Phase 2 acceptance invalidates a symmetry result after an edit" |  |
| CLS-R058 | partial | unit "reports BCC h+k+l extinction conditions from the operation set", "applies systematic absences for an fcc lattice" | Engine functions; the Diffraction table omits extinct reflections; no panel shows the conditions |
| CLS-R059 | partial | unit "fails visibly on a malformed symmetry-operation string instead of silently dropping it" | Engine validation function exists without a direct test and without a control |
| CLS-R060 | partial | unit "preserves an unknown CIF loop while editing metadata and canonical cell values" | Source tags are preserved and the detected result is separate; the export dialog has only a "preserve CIF metadata" option |
| CLS-R061 | verified | unit "wraps fractional coordinates and uses the minimum image across a boundary"; e2e "previews and applies a bounded supercell and measures a periodic distance" |  |
| CLS-R062 | partial | unit "measures orthogonal angles and a signed dihedral using periodic vectors" | Engine function only; only the distance control exists |
| CLS-R063 | partial | unit "measures orthogonal angles and a signed dihedral using periodic vectors" | Engine function only; no control |
| CLS-R064 | partial | unit "measures plane-plane and direction-direction angles from the cell metric" | Engine function only; no control |
| CLS-R065 | partial | unit "finds radius-based periodic bonds and reports unsupported element radii rather than guessing" | Bonds are detected and drawn with a fixed tolerance; no criteria control |
| CLS-R066 | partial | unit "finds periodic short contacts from an explicit radius scale", "rejects invalid analysis controls instead of silently coercing them" | Engine function only; the health list flags anomalous short contacts with a fixed threshold |
| CLS-R067 | partial | unit "finds an O-H...O candidate only when distance and angle pass" | Engine function only; no control |
| CLS-R068 | partial | unit "reports eight first-shell neighbors for either BCC site"; e2e "inspects a coordination shell for a selected site" | The coordination number is shown; the shell listing is not |
| CLS-R069 | partial | unit "builds a coordination polyhedron for a requested center"; e2e "renders a coordination polyhedron for the selected site" | The polyhedron is drawn; the distortion metric is not displayed |
| CLS-R070 | partial | unit "builds a bounded element-pair histogram without nonfinite bins" | Engine function only; no chart or control; broadening not evidenced |
| CLS-R071 | partial | unit "builds a bounded element-pair histogram without nonfinite bins" | Engine function only; no control |
| CLS-R072 | partial | unit "returns an explicit diagnostic instead of guessing missing bond-valence parameters" | Engine function only; no panel shows the sums |
| CLS-R073 | partial | unit "reports occupancy-weighted NaCl composition, formula mass and density", "weights partial occupancy rather than rounding it to a whole atom", "reports unsupported elements without inventing atomic masses" | Engine function only; the Environment & health panel does not show them |
| CLS-R074 | verified | unit "separates invalid occupancy errors from short-contact warnings"; e2e "lists structure-health findings for the working structure", "Phase 2 acceptance surfaces partial occupancy as a limitation" |  |
| CLS-R075 | partial | e2e "lists structure-health findings for the working structure" | Findings are one list with a severity prefix, not separate groups |
| CLS-R076 | partial | unit "computes reciprocal lattice parameters dual to a triclinic cell" | The Reciprocal space panel has a stereographic plot and a Brillouin-zone wireframe only |
| CLS-R077 | partial | unit "maps a Miller index to a cartesian plane normal" | Normal calculation only; no plane display |
| CLS-R078 | missing | — | No direction display |
| CLS-R079 | verified | unit "computes d-spacing for a cubic cell", "rejects a zero Miller index and a singular cell"; e2e "renders the diffraction panel and a powder pattern for the default structure" | No calculator for an arbitrary (hkl) |
| CLS-R080 | partial | unit "computes reciprocal lattice parameters dual to a triclinic cell" | Engine function only; no display |
| CLS-R081 | missing | — | Reflection rows are not selectable |
| CLS-R082 | partial | unit "projects the (001) pole to the center and (100)/(010) to the primitive circle", "projects (111) inside the primitive circle at the correct angular radius", "projects a batch of reflections and rejects degenerate input"; e2e "renders the reciprocal-space panel with pole figure and Brillouin zone" | The panel plots enumerated reflections; poles and directions cannot be chosen |
| CLS-R083 | missing | — | The plot has a circle and two axes only |
| CLS-R084 | partial | unit "reports which reflections satisfy the Bragg condition for Cu Kα", "marks (100) as intersecting for λ=1.5406 on a 5 Å cubic cell", "reports non-diffraction when wavelength exceeds 2d", "rejects non-positive wavelength and degenerate indices" | The panel shows a count for Cu Kα only; no sphere, no wavelength or orientation control, no highlighting |
| CLS-R085 | missing | — | Only the first Brillouin zone exists |
| CLS-R086 | partial | unit "constructs the first BZ of a cubic cell as a cube with volume |B|", "every vertex satisfies the half-space inequality for all three basis bisectors", "rejects a singular cell"; e2e "renders the reciprocal-space panel with pole figure and Brillouin zone" | Shown as a projection along c*, not a 3D view |
| CLS-R087 | missing | — | Not in the code |
| CLS-R088 | partial | unit "enumerates unique reflections within a d-spacing limit, ordered by d"; e2e "rejects a non-positive minimum d-spacing" | d-spacing limit only |
| CLS-R089 | partial | unit "computes F(200) = fNa + fCl and F(111) = fNa - fCl", "reports |F|^2 as intensity", "respects partial occupancy as a multiplier on the site contribution", "defaults to the X-ray (Z-based) model when radiation is omitted, unchanged from before" | Atomic number is used as the scattering factor at every angle; no wavelength- or angle-dependent tables |
| CLS-R090 | partial | unit "uses coherent neutron scattering lengths (not Z) in neutron mode", "rejects neutron mode for an element with no verified scattering length", "neutron mode uses signed lengths and refuses absorbers with complex values" | Element scattering lengths for 83 elements; absorbers refused; a site's isotope is never read, so there is no isotope override |
| CLS-R091 | partial | unit "produces a bounded powder pattern with intensities for a radiation type", "computes Bragg two-theta from wavelength and d-spacing"; e2e "renders the diffraction panel and a powder pattern for the default structure", "recalculates when radiation changes" | Radiation select with one wavelength per radiation (Cu Kα 1.5406 Å); no other presets and no custom wavelength |
| CLS-R092 | verified | unit "uses coherent neutron scattering lengths (not Z) in neutron mode", "produces a bounded powder pattern with intensities for a radiation type"; e2e "recalculates when radiation changes" | Default wavelength 1.5406 Å |
| CLS-R093 | partial | e2e "recalculates when radiation changes" | Electron is a radiation option (λ 0.0251 Å) that reuses the Z-weighted model; no spot pattern, no assumptions text, no electron-specific test |
| CLS-R094 | partial | unit "lists Bragg-feasible reflections with structure-factor intensities at a fixed wavelength" | Engine function only; no panel |
| CLS-R095 | partial | unit "simulates back-reflection Laue: wavelength solved per reflection from fixed geometry", "rejects invalid wavelength bands and empty geometry" | Engine function only; back-reflection geometry only; no panel |
| CLS-R096 | partial | e2e "renders the diffraction panel and a powder pattern for the default structure" | The table shows h k l, d, 2θ, intensity and multiplicity (first 50 rows); no reciprocal magnitude, F or extinction state |
| CLS-R097 | partial | — | Chart sticks have tooltips only; no click inspection and no chart–table link |
| CLS-R098 | missing | — | The chart is linear only |
| CLS-R099 | partial | unit "convolves sticks into a continuous profile peaking at stick positions", "supports lorentzian and pseudo-voigt shapes with heavier tails than gaussian", "rejects invalid profile parameters and enforces the point cap" | Engine function only; the chart draws sticks |
| CLS-R100 | partial | unit "models instrumental, size, strain and preferred-orientation terms with explicit bounded formulas" | Engine function only; no control |
| CLS-R101 | partial | unit "models instrumental, size, strain and preferred-orientation terms with explicit bounded formulas" | Engine function only; no control |
| CLS-R102 | partial | unit "models instrumental, size, strain and preferred-orientation terms with explicit bounded formulas" | Engine function only; no control |
| CLS-R103 | partial | unit "models instrumental, size, strain and preferred-orientation terms with explicit bounded formulas" | Engine function only; no control |
| CLS-R104 | partial | unit "computes nearest-peak residuals between observed and simulated positions"; e2e "overlays a local observed pattern onto the simulated stick pattern" | Peak ticks of an XY file are overlaid; no XYE, no pdCIF, no scale, offset or region controls |
| CLS-R105 | partial | unit "combines scaled phase profiles, picks peaks and estimates phase fractions only with complete ZMV inputs" | Engine function only; no manual picking and no control |
| CLS-R106 | partial | unit "computes nearest-peak residuals between observed and simulated positions", "recovers scale, zero shift, background and width from a synthetic trace" | Peak position deltas and Rp/Rwp are engine functions; no residual curve or fit measures displayed |
| CLS-R107 | partial | unit "combines scaled phase profiles, picks peaks and estimates phase fractions only with complete ZMV inputs" | Engine function only; no control |
| CLS-R108 | partial | unit "combines scaled phase profiles, picks peaks and estimates phase fractions only with complete ZMV inputs" | Engine function only; no control |
| CLS-R109 | partial | unit "recovers scale, zero shift, background and width from a synthetic trace", "fits free bounded parameters while preserving fixed parameters and reports convergence evidence", "recovers exact exponential parameters and reports convergence honestly" | Engine only; scale, zero shift, linear background and width are fitted; lattice, phase-scale and preferred-orientation parameters are not; no control |
| CLS-R110 | partial | unit "lists the active parameters and honours fixed overrides", "keeps fixed parameters untouched and clamps free parameters to their bounds", "rejects runs with no free parameters, non-finite residuals or out-of-bounds starts" | Engine only; no control |
| CLS-R111 | partial | unit "never reports a run that ran out of iterations as converged", "rejects d-axis data and traces that are too short to fit" | Engine only; no display |
| CLS-R112 | partial | unit "parses bounded reflection data, reports exact residual metrics, and ranks a finite difference map"; e2e "loads observed reflections and reports Fo/Fc residuals plus difference-density extrema" | Fc uses the Z-based model only; CIF reflection loops cannot be loaded (CLS-R008); no sigma weighting control |
| CLS-R113 | verified | unit "parses bounded reflection data, reports exact residual metrics, and ranks a finite difference map"; e2e "loads observed reflections and reports Fo/Fc residuals plus difference-density extrema" |  |
| CLS-R114 | partial | unit "parses bounded reflection data, reports exact residual metrics, and ranks a finite difference map"; e2e "loads observed reflections and reports Fo/Fc residuals plus difference-density extrema" | The grid feeds the extrema list; the grid itself is not drawn |
| CLS-R115 | verified | unit "parses bounded reflection data, reports exact residual metrics, and ranks a finite difference map"; e2e "loads observed reflections and reports Fo/Fc residuals plus difference-density extrema" |  |
| CLS-R116 | partial | unit "fits free bounded parameters while preserving fixed parameters and reports convergence evidence" | A generic bounded solver with coordinate, occupancy and ADP parameter kinds; it is not connected to structure parameters or to any control |
| CLS-R117 | missing | — | No charge-flipping code |
| CLS-R118 | verified | unit "imports CUBE, XSF, and CCP4 grids and provides bounded slices, resampling, and isosurfaces"; e2e "imports a local scalar field and exposes slice plus isosurface results" |  |
| CLS-R119 | implemented | — | `parseXsfGrid` is wired to the Volumetric fields card and is covered inside the combined volumetric unit test ("imports CUBE, XSF, and CCP4 grids and provides bounded slices, resampling, and isosurfaces"); the browser test uses CUBE only |
| CLS-R120 | implemented | — | `parseCcp4Grid` is wired to the Volumetric fields card and is covered inside the combined volumetric unit test ("imports CUBE, XSF, and CCP4 grids and provides bounded slices, resampling, and isosurfaces"); the browser test uses CUBE only |
| CLS-R121 | partial | unit "imports CUBE, XSF, and CCP4 grids and provides bounded slices, resampling, and isosurfaces"; e2e "imports a local scalar field and exposes slice plus isosurface results" | Independent levels are offered and the triangle count is reported; the preview is a 2D projection; independent opacities are not evidenced |
| CLS-R122 | verified | unit "imports CUBE, XSF, and CCP4 grids and provides bounded slices, resampling, and isosurfaces"; e2e "imports a local scalar field and exposes slice plus isosurface results" |  |
| CLS-R123 | partial | unit "imports CUBE, XSF, and CCP4 grids and provides bounded slices, resampling, and isosurfaces" | Engine function only; no control |
| CLS-R124 | partial | unit "imports CUBE, XSF, and CCP4 grids and provides bounded slices, resampling, and isosurfaces" | Engine function only; the card does not expose it |
| CLS-R125 | verified | unit "reports bounded occupied/void/accessibility fractions and selectable periodic components"; e2e "runs bounded periodic void analysis and builds an inspectable morphology" |  |
| CLS-R126 | verified | unit "reports bounded occupied/void/accessibility fractions and selectable periodic components"; e2e "runs bounded periodic void analysis and builds an inspectable morphology" |  |
| CLS-R127 | partial | unit "reports bounded occupied/void/accessibility fractions and selectable periodic components" | Components are listed and selectable in the panel with a 2D preview; the browser test runs the analysis, not the selection |
| CLS-R128 | verified | unit "builds BFDH and Wulff polyhedra with inspectable facets and deterministic twin transforms"; e2e "runs bounded periodic void analysis and builds an inspectable morphology" |  |
| CLS-R129 | implemented | — | Wulff construction with per-facet Energy inputs is in the Crystal morphology card and in the combined morphology unit test ("builds BFDH and Wulff polyhedra with inspectable facets and deterministic twin transforms"); no browser test uses Wulff |
| CLS-R130 | verified | unit "builds BFDH and Wulff polyhedra with inspectable facets and deterministic twin transforms"; e2e "runs bounded periodic void analysis and builds an inspectable morphology" |  |
| CLS-R131 | implemented | — | Per-facet include checkbox, Weight and Energy inputs are in the card; no test edits them |
| CLS-R132 | partial | unit "builds BFDH and Wulff polyhedra with inspectable facets and deterministic twin transforms" | Engine function only; no control to supply a matrix |
| CLS-R133 | missing | — | The morphology preview is display only |
| CLS-R134 | partial | e2e "edits document metadata through the same undoable history" | The Data & metadata dialog shows per-block scalar, loop and tag counts; no raw tag list and no search |
| CLS-R135 | partial | unit "updates one loop cell while preserving loop shape and neighboring raw values" | Engine function only; no loop editor |
| CLS-R136 | partial | unit "edits and removes CIF scalars without mutating unrelated entries", "treats a supplied custom CIF map as the complete edited set"; e2e "edits document metadata through the same undoable history" | Custom CIF scalars are added and removed in the dialog; loop rows and columns cannot be |
| CLS-R137 | verified | unit "preserves unknown CIF 1.1 scalars and loops through parse/serialize/parse", "preserves an unknown CIF loop while editing metadata and canonical cell values" |  |
| CLS-R138 | missing | — | No bundled dictionary data |
| CLS-R139 | verified | unit "classifies preserved, changed, generated and omitted metadata deterministically"; e2e "previews metadata impact and downloads a selected scientific format" |  |
| CLS-R140 | partial | e2e "previews metadata impact and downloads a selected scientific format" | The dialog has a "preserve CIF metadata" option; a separate choice for derived values is not evidenced |
| CLS-R141 | verified | e2e "previews metadata impact and downloads a selected scientific format"; unit "preserves an unknown CIF loop while editing metadata and canonical cell values" |  |
| CLS-R142 | verified | unit "emits the CIF 2.0 magic header without discarding preserved source content" |  |
| CLS-R143 | missing | — | No P1 target |
| CLS-R144 | missing | — | No mmCIF target |
| CLS-R145 | missing | — | No PDB target |
| CLS-R146 | verified | unit "exports POSCAR and extended XYZ from the same canonical coordinates" |  |
| CLS-R147 | verified | unit "exports POSCAR and extended XYZ from the same canonical coordinates" |  |
| CLS-R148 | partial | unit "exports a reflections CSV with d-spacings and structure-factor intensities", "exports an hkl reflection file with fixed-width indices and |F|²", "degrades honestly when a site lacks a verified scattering factor", "rejects a degenerate cell" | CSV and fixed-width HKL exist in the export engine only; the Export dialog does not offer them; no TSV |
| CLS-R149 | missing | — | No powder export target |
| CLS-R150 | partial | unit "exports measurements CSV with explicit units and RFC 4180-safe labels" | Measurements only; no coordination or site tables |
| CLS-R151 | partial | e2e "downloads a true vector SVG publication graphic" | SVG and PNG cover the structure view only |
| CLS-R152 | missing | — | No GLB code |
| CLS-R153 | missing | — | No report export |
| CLS-R154 | verified | e2e "edits document metadata through the same undoable history"; unit "classifies preserved, changed, generated and omitted metadata deterministically" | Generated-timestamp opt-in is not evidenced |
| CLS-R155 | verified | e2e "previews metadata impact and downloads a selected scientific format"; unit "classifies preserved, changed, generated and omitted metadata deterministically" |  |
| CLS-R156 | implemented | — | Plain-language headings ("Explore and build a crystal", "Choose a starter structure") and collapsed advanced site fields; no test and no dedicated disclosure mode |
| CLS-R157 | missing | — | No guide or glossary |
| CLS-R158 | missing | — | Needs the guide |
| CLS-R159 | missing | — | The catalog page lists three generic steps only |
| CLS-R160 | implemented | — | No guidance layer exists, so no control is hidden; no test |
| CLS-R161 | partial | e2e "lists structure-health findings for the working structure" | Health findings carry a severity word and plots have labels; there is no legend for element colours and no audit of colour-only states |
| CLS-R162 | partial | e2e "Phase 1 reflows across the explicit acceptance viewport matrix", "Phase 1 workspace has no serious or critical axe violations", "Phase 1 controls are keyboard operable and dialogs restore focus", "Phase 2 acceptance reflows the new panels without overflow", "Phase 2 acceptance passes Axe and keyboard operation for the new panels" | No `prefers-reduced-motion` rule; the 3D canvas has no keyboard navigation |
| CLS-R163 | partial | e2e "renders the diffraction panel and a powder pattern for the default structure", "imports a local scalar field and exposes slice plus isosurface results" | Diffraction, reflection, slice and facet tables exist; no table for 3D-selected values |
| CLS-R164 | verified | e2e "opens Crystal Lattice Studio through the catalog and keeps the engine local", "opens a local file without uploading it and allows the same file to be selected again" |  |
| CLS-R165 | verified | e2e "renders an interactive crystal viewport for the selected starter" |  |
| CLS-R166 | implemented | — | e2e "saves and reopens a project with structure and view selections" covers project reload; no test removes a measurement |
| CLS-R167 | prohibited | — | Prohibited: cannot run in a browser (native executables) and their licences do not allow redistribution with the site. Reflection and structure files for those programs can still be imported and exported |
| CLS-R168 | prohibited | — | Prohibited: both databases require a licence and authentication (accounts or keys), which the platform rules forbid. Files the user obtained lawfully open through Open structure |
| CLS-R169 | partial | — | Site theme selector exists; no dark-theme run for this route is recorded and the workspace stylesheets define no dark rules |
| CLS-R170 | partial | e2e "Phase 1 reflows across the explicit acceptance viewport matrix", "Phase 2 acceptance reflows the new panels without overflow"; e2e "<slug> fits phone and tablet screens: nothing cut off, fields at least 16px, header links at least 24px" | Tested at 320, 390, 768, 844 and 1440 px, including the reflection table at 320 px; 1920 and 2560 px are not tested |
| CLS-R171 | verified | e2e "Phase 1 workspace has no serious or critical axe violations", "Phase 2 acceptance passes Axe and keyboard operation for the new panels"; e2e (`tests/e2e/accessibility.spec.ts`) "has no serious or critical axe violations at <route>" |  |

## Open work

1. CLS-R008, CLS-R009, CLS-R010, CLS-R012, CLS-R004, CLS-R007: CIF reflection and powder loops, XYE column mapping, block chooser, empty-crystal creation, PDB symmetry records, fixed-width SHELX reflections.
2. CLS-R018, CLS-R024, CLS-R026, CLS-R028, CLS-R029, CLS-R031–CLS-R034: cell metric display and controls for unwrap, periodic images, basis transform, strain, defect concentration, slab, domain overlay and comparison.
3. CLS-R036–CLS-R041, CLS-R043–CLS-R045, CLS-R048: viewport controls for ellipsoids, view presets, vectors and axes, colour overrides, hide/isolate/invert, clipping, polyhedra criteria, magnetic vectors; GLB export.
4. CLS-R050–CLS-R055, CLS-R058–CLS-R060: Hall symbol, Wyckoff multiplicity, asymmetric-unit extraction, operation browser and preview, extinction conditions, source versus detected symmetry.
5. CLS-R062–CLS-R064, CLS-R065–CLS-R073, CLS-R075: angle, torsion and plane-angle controls, bonding and contact criteria, neighbour shells, distribution charts, bond-valence and composition display, grouped health findings.
6. CLS-R076–CLS-R078, CLS-R080–CLS-R087: interactive reciprocal lattice, Miller planes and directions, reciprocal-to-real link, Wulff net, Ewald view, Wigner–Seitz cell, reciprocal sections.
7. CLS-R088–CLS-R108: wavelength presets, reflection-table columns, chart inspection and transforms, electron diffraction, single-crystal and Laue panels, profile, size, strain and orientation controls, residual curves, multi-phase patterns.
8. CLS-R109–CLS-R117: fit and refinement controls, structure-parameter refinement, charge flipping.
9. CLS-R121, CLS-R123, CLS-R124, CLS-R127, CLS-R132, CLS-R133: 3D isosurface view, plane slice, resampling, cavity selection test, twin matrix input, morphology export.
10. CLS-R134–CLS-R140, CLS-R143–CLS-R153: tag search, loop editor, dictionary guidance, derived-value choice, P1 CIF, mmCIF, PDB, reflection and powder exports, diagram and report export.
11. CLS-R156–CLS-R163: guide, glossary, starter workflows, colour legends, reduced-motion handling, canvas keyboard navigation and table alternatives.
12. CLS-R119, CLS-R120, CLS-R129, CLS-R131, CLS-R156, CLS-R160, CLS-R166: tests; CLS-R169, CLS-R170: dark-theme run and overflow tests to 2560 px.

## Known limitations

- Structure factors use the atomic number as the X-ray and electron scattering factor; neutron mode uses coherent scattering lengths for 83 elements.
- Difference-Fourier density is phased by the current model and labelled model-dependent; BFDH output is a geometry heuristic; void fractions depend on grid spacing, probe radius and radius basis.
- Potentially large operations are bounded and fail visibly rather than truncating.
- The isosurface, void and morphology previews are 2D projections.

## Verification evidence

- 2026-10-06: `tests/e2e/responsive.spec.ts` passes for this tool at 320, 390 and 768 px with touch and 2x pixel density (nothing cut off by a clipping ancestor, editable fields at least 16px, header links at least 24px).

- 2026-10-05, `expand/crystal-lattice-studio` from `main` @ `a582f5dc`: `pnpm tool:check crystal-lattice-studio --base origin/main` 50/171, no errors; `pnpm docs:sync` and `pnpm docs:check` passed; `pnpm exec vitest run tests/unit/cad-progress.test.ts tests/unit/sheets-wave-b.test.ts tests/unit/deployment-config.test.ts` passed.

## Change log

- 2026-10-05 — Created: 171 requirements as built at a582f5dc.

# Crystal Lattice Studio Phase 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add trustworthy symmetry analysis, local-environment/structure-health workflows, crystallographic model-building transforms, and the advanced structure visualization required by Phase 2 of the Crystal Lattice Studio master design.

**Architecture:** Keep all scientific calculations in framework-independent engines operating on the existing canonical `CrystalDocument`. Build no-dependency local-environment/model-building engines first, then add one browser-local symmetry adapter around `@spglib/moyo-wasm@0.16.0`; React only coordinates those engines and Three.js renders their derived models. Every expensive or tolerance-sweep operation is generation-keyed so stale results cannot replace newer structure state.

**Tech Stack:** React `19.2.8`, TypeScript `7.0.2`, Vite `8.2.2`, Three.js `0.185.1`, Vitest `4.1.11`, Playwright `1.63.0`, pnpm `12.3.4`; `@spglib/moyo-wasm` is added only at the exact verified stable version `0.16.0` and must remain exactly pinned.

**Spec:** `docs/superpowers/specs/2026-09-11-crystal-lattice-studio-design.md`

**Phase 1 baseline:** `docs/superpowers/plans/2026-09-11-crystal-lattice-studio-phase-1-completion.md`

## Global Constraints

- Remain backend-free and local-only; structure data never leaves the browser.
- Public copy contains user-facing crystallography guidance only; do not expose private development discussion.
- Keep every dependency exactly pinned; never use `^` or `~`.
- Do not add the symmetry dependency until both `package.json` and `pnpm-lock.yaml` can be updated together and frozen-lockfile CI can validate the exact version.
- Preserve imported/source symmetry separately from detected symmetry; detected results never silently rewrite source tags.
- Occupancy/disorder limitations must be surfaced rather than coerced into a false ordered-structure result.
- Invalid transforms or model-building operations must fail without replacing the last valid document.
- Reuse canonical fractional coordinates and Phase 1 lattice/periodic engines; do not duplicate crystallographic math in React or Three.js code.
- No inert Phase 3–5 controls.
- TDD is mandatory for production behavior: focused failing test, confirmed RED, smallest correct implementation, focused GREEN.
- Prefer Crystal-only unit/browser verification; broaden only when shared registry/dependency/build surfaces change.
- Re-read current `main`, governance, target files, branch inventory, CI, and task state immediately before each write.

---

## Phase 2 file map

### Pure scientific engines

- `src/tools/crystal/local-environment-engine.ts` — short contacts, hydrogen-bond candidates, neighbor shells, coordination, pair distributions and coordination-polyhedron metrics.
- `src/tools/crystal/structure-health-engine.ts` — composition/mass/density plus deterministic error/warning/info findings.
- `src/tools/crystal/model-building-engine.ts` — crystal-system constraints, basis/origin/strain transforms, defects, slabs, twin/domain and comparison helpers.
- `src/tools/crystal/symmetry-types.ts` — normalized symmetry result/operation/Wyckoff/tolerance types independent of Moyo.
- `src/tools/crystal/symmetry-engine.ts` — Moyo adapter, equivalent-site generation, standard cells, operation validation, stability sweep and symmetry-break comparison.
- `src/tools/crystal/bond-valence-data.ts` — small provenance-recorded parameter table sufficient for verified Phase 2 fixtures.

### UI/visualization

- `src/tools/crystal/CrystalEnvironmentPanel.tsx` — coordination, contacts, hydrogen bonds, pair distributions and health findings.
- `src/tools/crystal/CrystalSymmetryPanel.tsx` — detected/source symmetry, operations, Wyckoff assignments, tolerance sweep, standardization and break inspection.
- `src/tools/crystal/CrystalModelBuilderPanel.tsx` — cell constraints, transforms, defects, slabs, twin/domain and comparison workflows.
- Extend `src/tools/crystal/viewport-model.ts` and `CrystalViewport.tsx` — polyhedra, ellipsoids, clipping, magnetic vectors, richer selection/filter state.
- Extend `CrystalWorkspace.tsx` and `crystal-workspace.css` — task areas `Symmetry`, expanded `Build`, and environment/health surfaces.

### Tests

- `tests/unit/crystal-environment.test.ts`
- `tests/unit/crystal-health.test.ts`
- `tests/unit/crystal-model-building.test.ts`
- `tests/unit/crystal-symmetry.test.ts`
- Extend `tests/unit/crystal-viewport-model.test.ts`
- Extend `tests/e2e/crystal-lattice-studio.spec.ts`

---

### Task 1: Deterministic local-environment analysis

**Files:**
- Create: `src/tools/crystal/local-environment-engine.ts`
- Test: `tests/unit/crystal-environment.test.ts`

**Interfaces:**

```ts
export interface NeighborShellMember { siteId:string; image:readonly [number,number,number]; distance:number; }
export interface NeighborShell { index:number; meanDistance:number; members:readonly NeighborShellMember[]; }
export interface ShortContact { aSiteId:string; bSiteId:string; imageShift:readonly [number,number,number]; distance:number; threshold:number; }
export interface HydrogenBondCandidate { donorId:string; hydrogenId:string; acceptorId:string; acceptorImage:readonly [number,number,number]; hADistance:number; dhaAngle:number; }
export interface PairHistogramBin { center:number; count:number; }

export function coordinationEnvironment(document:CrystalDocument, siteId:string, options?:{ radiusScale?:number; shellTolerance?:number }): { coordinationNumber:number; neighbors:readonly NeighborShellMember[]; shells:readonly NeighborShell[] };
export function findShortContacts(document:CrystalDocument, scale?:number): readonly ShortContact[];
export function findHydrogenBondCandidates(document:CrystalDocument, options?:{ maxHADistance?:number; minDhaAngle?:number }): readonly HydrogenBondCandidate[];
export function pairDistanceHistogram(document:CrystalDocument, options:{ maxDistance:number; binWidth:number; pair?:readonly [string,string] }): readonly PairHistogramBin[];
```

- [ ] **Step 1: Write failing deterministic fixtures**

```ts
it('reports eight first-shell neighbors for the BCC center', () => {
  const bcc = createStarterStructure('bcc');
  const env = coordinationEnvironment(bcc, bcc.sites[1]!.id);
  expect(env.coordinationNumber).toBe(8);
  expect(env.shells[0]!.members).toHaveLength(8);
});

it('finds a periodic O-H...O candidate only when distance and angle pass', () => {
  const result = findHydrogenBondCandidates(hydrogenBondFixture(), { maxHADistance: 2.5, minDhaAngle: 150 });
  expect(result).toHaveLength(1);
  expect(result[0]!.dhaAngle).toBeGreaterThanOrEqual(150);
});

it('builds a bounded pair histogram without double-counting image pairs', () => {
  const bins = pairDistanceHistogram(createStarterStructure('nacl'), { maxDistance: 5, binWidth: 0.1, pair: ['Na','Cl'] });
  expect(bins.reduce((sum, bin) => sum + bin.count, 0)).toBeGreaterThan(0);
  expect(bins.every((bin) => Number.isFinite(bin.count) && bin.count >= 0)).toBe(true);
});
```

- [ ] **Step 2: Confirm RED**

Run: `pnpm exec vitest run tests/unit/crystal-environment.test.ts`

Expected: FAIL because `local-environment-engine.ts` does not exist.

- [ ] **Step 3: Implement from existing periodic primitives**

Use `periodicDistance`, `minimumImageFractionalDelta`, `fractionalToCartesian`, and the existing verified element radii. Enumerate only the image range required by the requested cutoff; deduplicate pairs by stable site/image key. Neighbor shells are formed by sorting distances and grouping adjacent distances within `shellTolerance` (default `0.05 Å`). Hydrogen-bond defaults are explicit (`H···A <= 2.5 Å`, `D-H···A >= 150°`) and remain user-configurable.

- [ ] **Step 4: Verify GREEN**

Run: `pnpm exec vitest run tests/unit/crystal-environment.test.ts tests/unit/crystal-geometry.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

Commit: `feat(crystal): add local environment analysis`

---

### Task 2: Composition, density, bond valence and structure-health findings

**Files:**
- Create: `src/tools/crystal/bond-valence-data.ts`
- Create: `src/tools/crystal/structure-health-engine.ts`
- Test: `tests/unit/crystal-health.test.ts`

**Interfaces:**

```ts
export type HealthSeverity = 'error'|'warning'|'info';
export interface StructureHealthFinding { id:string; severity:HealthSeverity; message:string; siteIds:readonly string[]; }
export interface CompositionSummary { formula:string; reducedFormula:string; formulaMass:number; cellMass:number; density:number; fractions:Readonly<Record<string,number>>; }
export interface BondValenceResult { siteId:string; value:number|null; diagnostic?:string; }

export function summarizeComposition(document:CrystalDocument): CompositionSummary;
export function computeBondValenceSums(document:CrystalDocument): readonly BondValenceResult[];
export function validateCrystalStructure(document:CrystalDocument): readonly StructureHealthFinding[];
```

- [ ] **Step 1: Write failing tests**

```ts
it('reports NaCl composition and finite density', () => {
  const summary = summarizeComposition(createStarterStructure('nacl'));
  expect(summary.formula).toMatch(/Na.*Cl|Cl.*Na/);
  expect(summary.formulaMass).toBeGreaterThan(50);
  expect(summary.density).toBeGreaterThan(0);
});

it('separates invalid occupancy from short-contact warnings', () => {
  const findings = validateCrystalStructure(healthFixture());
  expect(findings.some((item) => item.severity === 'error' && /occupancy/i.test(item.message))).toBe(true);
  expect(findings.some((item) => item.severity === 'warning' && /contact/i.test(item.message))).toBe(true);
});
```

- [ ] **Step 2: Confirm RED**

Run: `pnpm exec vitest run tests/unit/crystal-health.test.ts`

Expected: missing modules.

- [ ] **Step 3: Implement explicit, non-diagnostic health rules**

Formula/mass/density use occupancy-weighted site counts and `cellVolume`. Health checks cover invalid/nonfinite cell metrics, occupancy outside `[0,1]`, unsupported element labels, coincident/near-coincident sites, non-positive isotropic ADPs, invalid anisotropic tensors when present, and anomalously short contacts. Findings state observations only and never claim experimental correctness.

Bond-valence sums return `null` plus a diagnostic when the required element/oxidation-state parameter is absent; never substitute a guessed parameter.

- [ ] **Step 4: Verify GREEN**

Run: `pnpm exec vitest run tests/unit/crystal-health.test.ts tests/unit/crystal-document.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

Commit: `feat(crystal): add structure health analysis`

---

### Task 3: Complete site properties and crystal-system constraints

**Files:**
- Modify: `src/tools/crystal/document-engine.ts`
- Modify: `src/tools/crystal/CrystalStructurePanel.tsx`
- Extend: `tests/unit/crystal-document.test.ts`
- Extend: `tests/e2e/crystal-lattice-studio.spec.ts`

**Interfaces:**

```ts
export type CrystalSystemConstraint = 'none'|'cubic'|'tetragonal'|'orthorhombic'|'hexagonal'|'trigonal'|'monoclinic'|'triclinic';
export function constrainCell(cell:UnitCell, system:CrystalSystemConstraint, changed:'a'|'b'|'c'|'alpha'|'beta'|'gamma'): UnitCell;
```

- [ ] **Step 1: Write failing tests**

```ts
it('keeps cubic lengths equal and angles orthogonal', () => {
  expect(constrainCell({ a:4,b:5,c:6,alpha:80,beta:90,gamma:100 }, 'cubic', 'a'))
    .toEqual({ a:4,b:4,c:4,alpha:90,beta:90,gamma:90 });
});
```

Browser coverage edits isotope, occupancy, oxidation state, disorder assembly/group, notes, `uIso`, and anisotropic terms; invalid values remain visibly rejected.

- [ ] **Step 2: Confirm RED**

Run: `pnpm exec vitest run tests/unit/crystal-document.test.ts --grep "constraint|site properties"`

Run: `pnpm exec playwright test tests/e2e/crystal-lattice-studio.spec.ts --grep "site properties|crystal system"`

- [ ] **Step 3: Implement native-labelled advanced site controls**

Keep advanced properties behind disclosure. Applying a crystal-system constraint is explicit and undoable. Do not infer a crystal system from approximate cell metrics in this task; detection belongs to the symmetry engine.

- [ ] **Step 4: Verify GREEN**

Run the same focused tests.

- [ ] **Step 5: Commit**

Commit: `feat(crystal): add constrained cells and site properties`

---

### Task 4: Reversible transforms, defects and structure comparison

**Files:**
- Create: `src/tools/crystal/model-building-engine.ts`
- Test: `tests/unit/crystal-model-building.test.ts`

**Interfaces:**

```ts
export function transformBasis(document:CrystalDocument, matrix:Mat3, originShift?:Vec3): CrystalDocument;
export function applyStrain(document:CrystalDocument, strain:Mat3): CrystalDocument;
export function createVacancy(document:CrystalDocument, siteId:string): CrystalDocument;
export function createSubstitution(document:CrystalDocument, siteId:string, element:string): CrystalDocument;
export function createInterstitial(document:CrystalDocument, site:Omit<CrystalSite,'id'>): CrystalDocument;
export function defectConcentration(before:CrystalDocument, after:CrystalDocument): number;
export function compareMappedStructures(a:CrystalDocument, b:CrystalDocument): { cellDelta:UnitCell; siteDeltas:readonly { aSiteId:string; bSiteId:string; cartesianDelta:Vec3; distance:number }[] };
```

- [ ] **Step 1: Write failing transform/defect fixtures**

```ts
it('applies identity basis transform without moving sites', () => {
  const source = createStarterStructure('bcc');
  expect(transformBasis(source, [[1,0,0],[0,1,0],[0,0,1]]).sites).toEqual(source.sites);
});

it('builds vacancy substitution and interstitial edits with provenance', () => {
  const source = createStarterStructure('bcc');
  expect(createVacancy(source, source.sites[0]!.id).sites).toHaveLength(source.sites.length - 1);
  expect(createSubstitution(source, source.sites[0]!.id, 'Ni').sites[0]!.element).toBe('Ni');
});
```

- [ ] **Step 2: Confirm RED**

Run: `pnpm exec vitest run tests/unit/crystal-model-building.test.ts`

- [ ] **Step 3: Implement validated immutable transforms**

Require finite matrices, non-singular transformed cells, preserved canonical fractional coordinates where mathematically appropriate, new stable IDs for interstitials, and provenance records describing each transform. Structure comparison succeeds only when mapping is deterministic; otherwise return an explicit mapping error rather than nearest-neighbor guessing.

- [ ] **Step 4: Verify GREEN**

Run focused model-building + cell/document tests.

- [ ] **Step 5: Commit**

Commit: `feat(crystal): add reversible model transforms`

---

### Task 5: Slabs, periodic reconstruction and twin/domain overlays

**Files:**
- Extend: `src/tools/crystal/model-building-engine.ts`
- Extend: `tests/unit/crystal-model-building.test.ts`

**Interfaces:**

```ts
export function reconstructPeriodicMolecule(document:CrystalDocument, seedSiteId:string): readonly { siteId:string; image:readonly [number,number,number]; fractional:Vec3 }[];
export function buildSlab(document:CrystalDocument, options:{ hkl:readonly [number,number,number]; thickness:number; vacuum:number; offset:number }): CrystalDocument;
export function createDomainOverlay(document:CrystalDocument, transform:Mat3): readonly { siteId:string; position:Vec3 }[];
```

- [ ] **Step 1: Add failing periodic/slab/domain fixtures**

Use a molecule split across a cell boundary, cubic `(1,0,0)` slab, and identity/non-identity domain transforms. Assert connected periodic reconstruction, requested normal spacing, nonzero vacuum, deterministic transformed coordinates.

- [ ] **Step 2: Confirm RED**

Run: `pnpm exec vitest run tests/unit/crystal-model-building.test.ts --grep "periodic molecule|slab|domain"`

- [ ] **Step 3: Implement bounded deterministic geometry**

Use existing periodic bond candidates for connectivity, reciprocal-plane math derived from the Phase 1 cell engine for slab orientation, and explicit matrix multiplication for domain overlays. Reject `(0,0,0)` Miller indices, non-positive thickness, negative vacuum, singular transforms, and outputs above the existing site guard.

- [ ] **Step 4: Verify GREEN**

Run focused tests.

- [ ] **Step 5: Commit**

Commit: `feat(crystal): add slabs and domain transforms`

---

### Task 6: Add the exact browser-local Moyo dependency and normalized symmetry adapter

**Files:**
- Modify together: `package.json`, `pnpm-lock.yaml`
- Create: `src/tools/crystal/symmetry-types.ts`
- Create: `src/tools/crystal/symmetry-engine.ts`
- Test: `tests/unit/crystal-symmetry.test.ts`

**Interfaces:**

```ts
export interface CrystalSymmetryOperation { rotation:readonly [number,number,number,number,number,number,number,number,number]; translation:Vec3; }
export interface CrystalSymmetryResult {
  number:number; hmSymbol:string; hallNumber:number; crystalSystem:string; pointGroup:string;
  pearsonSymbol:string; operations:readonly CrystalSymmetryOperation[];
  wyckoffs:readonly string[]; siteSymmetrySymbols:readonly string[]; orbits:readonly number[];
  standardized:CrystalDocument; primitive:CrystalDocument; tolerance:number;
}
export async function analyzeCrystalSymmetry(document:CrystalDocument, tolerance?:number): Promise<CrystalSymmetryResult>;
```

- [ ] **Step 1: Add failing adapter tests before the dependency/implementation**

```ts
it('detects Im-3m BCC and assigns equivalent corner/body sites', async () => {
  const result = await analyzeCrystalSymmetry(createStarterStructure('bcc'), 1e-4);
  expect(result.number).toBe(229);
  expect(result.hmSymbol).toMatch(/Im.*3.*m/i);
  expect(result.operations.length).toBeGreaterThan(1);
  expect(result.wyckoffs).toHaveLength(2);
});
```

Also assert input basis is row-major, fractional positions are unchanged before analysis, unsupported element mapping fails visibly, and disordered mixed-occupancy sites are not silently coerced.

- [ ] **Step 2: Confirm RED**

Run: `pnpm exec vitest run tests/unit/crystal-symmetry.test.ts`

Expected: module/dependency missing.

- [ ] **Step 3: Add dependency atomically and implement adapter**

Generate lock changes with:

```bash
pnpm add --save-exact @spglib/moyo-wasm@0.16.0
```

Then implement one lazy initialization promise for the WASM module and map the canonical `cellToMatrix(document.cell)` row-wise basis, fractional positions, and verified atomic numbers to Moyo. Normalize output into repository-owned types so UI code never depends directly on package-generated types.

- [ ] **Step 4: Verify frozen install, symmetry tests and production build**

Run:

```bash
pnpm install --frozen-lockfile
pnpm exec vitest run tests/unit/crystal-symmetry.test.ts
pnpm build
```

Expected: exact frozen install, symmetry fixtures and browser bundle all PASS.

- [ ] **Step 5: Commit**

Commit: `feat(crystal): add local symmetry engine`

---

### Task 7: Symmetry operations, equivalent sites, standardization and validation

**Files:**
- Extend: `src/tools/crystal/symmetry-engine.ts`
- Extend: `tests/unit/crystal-symmetry.test.ts`

**Interfaces:**

```ts
export function applySymmetryOperation(frac:Vec3, operation:CrystalSymmetryOperation): Vec3;
export function generateEquivalentSites(document:CrystalDocument, result:CrystalSymmetryResult): CrystalDocument;
export function standardizeCrystal(document:CrystalDocument, result:CrystalSymmetryResult, mode:'conventional'|'primitive'): CrystalDocument;
export function validateSourceSymmetry(document:CrystalDocument, result:CrystalSymmetryResult, tolerance:number): readonly StructureHealthFinding[];
export function reflectionAllowed(hkl:readonly [number,number,number], operations:readonly CrystalSymmetryOperation[], tolerance?:number): boolean;
```

- [ ] **Step 1: Write failing operation/standardization/extinction tests**

Use identity/inversion operations, BCC primitive/conventional fixtures and known BCC `h+k+l` odd/even extinction fixtures.

- [ ] **Step 2: Confirm RED**

Run the symmetry unit file with `--grep "operation|standard|reflection|source symmetry"`.

- [ ] **Step 3: Implement with canonical wrapped fractional coordinates and provenance**

Equivalent-site generation deduplicates under the active tolerance; standardization records the source transform; source symmetry remains a distinct record and failed validation produces findings rather than replacement.

- [ ] **Step 4: Verify GREEN**

Run full Crystal symmetry + cell + document unit files.

- [ ] **Step 5: Commit**

Commit: `feat(crystal): add symmetry transforms and validation`

---

### Task 8: Tolerance stability sweep and symmetry-break inspector

**Files:**
- Extend: `src/tools/crystal/symmetry-engine.ts`
- Extend: `tests/unit/crystal-symmetry.test.ts`

**Interfaces:**

```ts
export interface SymmetrySweepPoint { tolerance:number; number:number; hmSymbol:string; operationCount:number; wyckoffs:readonly string[]; }
export async function sweepSymmetryTolerance(document:CrystalDocument, tolerances:readonly number[]): Promise<readonly SymmetrySweepPoint[]>;
export async function inspectSymmetryBreak(before:CrystalDocument, after:CrystalDocument, tolerance:number): Promise<{ surviving:readonly CrystalSymmetryOperation[]; broken:readonly CrystalSymmetryOperation[]; offendingSiteIds:readonly string[] }>;
```

- [ ] **Step 1: Write failing perturbation fixtures**

Slightly displace one BCC site and assert that a coarse tolerance preserves more symmetry than a strict tolerance; the break inspector must identify at least the displaced site and one lost operation.

- [ ] **Step 2: Confirm RED**

Run focused symmetry tests.

- [ ] **Step 3: Implement bounded, ordered sweeps**

Reject duplicate/nonpositive/nonfinite tolerances, sort requested tolerances ascending for deterministic output, and key each async analysis to the document identity plus coordinates. The UI task will cancel/ignore stale generations.

- [ ] **Step 4: Verify GREEN**

Run focused symmetry tests.

- [ ] **Step 5: Commit**

Commit: `feat(crystal): add symmetry stability diagnostics`

---

### Task 9: Advanced viewport models — polyhedra, ADPs, clipping, magnetic vectors and selection filters

**Files:**
- Extend: `src/tools/crystal/viewport-model.ts`
- Extend: `src/tools/crystal/CrystalViewport.tsx`
- Extend: `tests/unit/crystal-viewport-model.test.ts`

**Interfaces:**

```ts
export interface RenderPolyhedron { centerSiteId:string; vertices:readonly Vec3[]; distortion:number|null; }
export interface RenderEllipsoid { siteId:string; axes:Vec3; orientation:Mat3; probability:number; }
export interface RenderVector { siteId:string; start:Vec3; end:Vec3; label:string; }
```

- [ ] **Step 1: Write failing render-model tests**

Assert a coordination polyhedron for a supported center, no ellipsoid for invalid/missing ADP, a finite ellipsoid for a positive-definite tensor, deterministic clip filtering, and magnetic arrows only when imported magnetic vectors exist.

- [ ] **Step 2: Confirm RED**

Run: `pnpm exec vitest run tests/unit/crystal-viewport-model.test.ts`

- [ ] **Step 3: Extend the model before Three rendering**

All heavy geometry is derived in the pure model. Three.js receives only bounded arrays; polyhedron/ellipsoid/vector geometries are explicitly disposed with the existing viewport lifecycle. Add multi-select, hide, isolate, invert and element/property filtering to view state without mutating `CrystalDocument`.

- [ ] **Step 4: Verify GREEN**

Run viewport model tests and focused Crystal viewport browser cases.

- [ ] **Step 5: Commit**

Commit: `feat(crystal): add advanced structure visualization`

---

### Task 10: Expose Phase 2 environment, model-building and symmetry workflows

**Files:**
- Create: `src/tools/crystal/CrystalEnvironmentPanel.tsx`
- Create: `src/tools/crystal/CrystalModelBuilderPanel.tsx`
- Create: `src/tools/crystal/CrystalSymmetryPanel.tsx`
- Modify: `src/tools/crystal/CrystalWorkspace.tsx`
- Modify: `src/tools/crystal/crystal-workspace.css`
- Extend: `tests/e2e/crystal-lattice-studio.spec.ts`

**Interfaces:**
- Produces reachable `Symmetry`, `Environment & health`, and expanded `Build` task areas backed only by completed Phase 2 engines.

- [ ] **Step 1: Write failing browser workflows**

Cover: select a site and inspect coordination shell; inspect health findings; build vacancy/substitution/interstitial with undo; apply a valid cell constraint; detect BCC symmetry and inspect one operation/Wyckoff result; run a tolerance sweep; perturb a site and view symmetry-break results; preview/apply conventional/primitive standardization; render/toggle a coordination polyhedron.

- [ ] **Step 2: Confirm RED**

Run:

```bash
pnpm exec playwright test tests/e2e/crystal-lattice-studio.spec.ts --grep "symmetry|coordination|health|defect|constraint|polyhedron"
```

- [ ] **Step 3: Implement accessible progressive-disclosure panels**

Native controls/tables remain keyboard-operable. Async symmetry actions show pending/error/result states and use a monotonically increasing generation ID so an older result cannot overwrite a newer structure edit. Every transform previews affected site count/cell and remains undoable through the existing history engine.

- [ ] **Step 4: Verify GREEN**

Run the same focused browser selection plus all Phase 2 unit files.

- [ ] **Step 5: Commit**

Commit: `feat(crystal): expose phase 2 analysis workflows`

---

### Task 11: Phase 2 acceptance and completion ledger

**Files:**
- Extend: `tests/e2e/crystal-lattice-studio.spec.ts`
- Create: `docs/superpowers/plans/2026-09-13-crystal-lattice-studio-phase-2-completion.md`
- Update: `.tasks/IN_PROGRESS.md`

- [ ] **Step 1: Add Phase 2 acceptance tests before any final fixes**

Acceptance covers one high-symmetry cubic structure, one lower-symmetry structure, one partial-occupancy/disorder case that must surface a limitation rather than guess, symmetry result invalidation after an edit, narrow/mobile reflow for the new panels, keyboard operation, and serious/critical Axe checks for the new task areas.

- [ ] **Step 2: Run focused release evidence**

```bash
pnpm install --frozen-lockfile
pnpm exec vitest run tests/unit/crystal-*.test.ts
pnpm build
pnpm exec playwright test tests/e2e/crystal-lattice-studio.spec.ts
```

- [ ] **Step 3: Fix only demonstrated Phase 2 acceptance failures**

Do not alter unrelated tools or shared primitives without explicit scope extension.

- [ ] **Step 4: Rerun the failed focused gate and then the full Crystal release gate**

Expected: all Crystal unit tests, production build, and focused Crystal browser suite PASS.

- [ ] **Step 5: Write completion ledger and advance tracking to Phase 3**

Map master capabilities completed by Phase 2, remaining Phase 3–5 capabilities, conditional items, exact test/build evidence, dependency version/provenance, and any open limitation without introducing a new exclusion.

- [ ] **Step 6: Commit**

Commit: `docs(crystal): record phase 2 acceptance`

---

## Plan self-review

- **Spec coverage:** Tasks 1–5 cover Phase 2 model-building/local-environment/health scope; Tasks 6–8 cover the complete non-magnetic space-group/Wyckoff/stability/standardization/source-validation slice; Task 9 covers Phase 2 visualization completion; Task 10 makes the engines reachable without dead controls; Task 11 provides the deterministic phase gate.
- **Deferred intentionally by the master design:** reflection/powder import and reciprocal/diffraction remain Phase 3; refinement/fields/voids/morphology remain Phase 4; dictionary-complete metadata/all exports/guide/performance release audit remain Phase 5.
- **Conditional scope retained:** GLB remains conditional on validity/load proof; experimental coordinate refinement/charge flipping remain Phase 4 validation-gated; automatic magnetic-space-group solving remains conditional under the master design.
- **Type consistency:** Phase 2 engines consume the existing `CrystalDocument`, `UnitCell`, `CrystalSite`, `Vec3`, and `Mat3`; normalized symmetry types isolate UI/tests from package-specific generated types.
- **No placeholder UI:** only completed engines become task-area controls.
- **Dependency safety:** the only planned Phase 2 dependency is exact `@spglib/moyo-wasm@0.16.0`; package and lockfile move together and frozen-lockfile CI is a hard gate.
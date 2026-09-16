# Crystal Lattice Studio Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a usable local-first Crystal Lattice Studio foundation with loss-aware structure import, editable periodic cells/sites, a performant interactive 3D viewport, measurements, project history, metadata preservation, and first-wave exports.

**Architecture:** A framework-independent `CrystalDocument` and pure scientific engines own periodic/cell/format behavior. React coordinates that state and Three.js renders it; input/output adapters preserve source metadata, and scientific edits are reversible through bounded history. Phase 1 adds no dependency because the repository already pins Three.js `0.185.1`.

**Tech Stack:** React `19.2.8`, TypeScript `7.0.2`, Vite `8.2.2`, Three.js `0.185.1`, Vitest `4.1.11`, Playwright `1.63.0`, pnpm `12.3.4`.

**Spec:** `docs/superpowers/specs/2026-09-11-crystal-lattice-studio-design.md`

## Global Constraints

- Remain backend-free and local-only; no analytics, telemetry, remote conversion, or upload path.
- Public copy contains only user-facing scientific/product guidance and never private project discussion or internal prompting.
- Keep all dependencies exactly pinned; Phase 1 adds no dependency.
- Preserve unknown CIF tags and loops by default; lossy export must be explicit.
- Invalid scientific state must fail visibly without replacing the previous valid document.
- Keep the tool lazy-loaded through the central registry/workspace loader.
- Integrate completed work on `origin/main`; do not alter unrelated tool branches or code.
- Use TDD for production behavior: write a focused failing test, observe the intended failure, implement the smallest correct behavior, then rerun the focused test.
- Prefer focused unit/browser tests for Crystal Lattice Studio. Run broader validation only when shared registry/build behavior changes or focused evidence is insufficient.
- Re-read `origin/main` and each existing target file immediately before every write because other agents may update the repository concurrently.

---

## Phase 1 file map

### Scientific core

- `src/tools/crystal/crystal-types.ts` — canonical document, site, cell, metadata, view-state, measurement and history types.
- `src/tools/crystal/cell-engine.ts` — lattice matrices, reciprocal matrices, coordinate transforms, volume and metric tensors.
- `src/tools/crystal/document-engine.ts` — starter/empty documents and immutable site/cell edit operations.
- `src/tools/crystal/history-engine.ts` — bounded undo/redo/reset state.
- `src/tools/crystal/periodic-engine.ts` — wrapping, minimum-image vectors, periodic shells, supercells and bond candidates.
- `src/tools/crystal/measurement-engine.ts` — distance, angle and torsion calculations.
- `src/tools/crystal/element-data.ts` — small provenance-annotated Phase 1 element presentation/radius/mass dataset used by starters and bonding.

### Formats and persistence

- `src/tools/crystal/cif-engine.ts` — CIF 1.1/2.0 tokenization, parse tree, structure extraction and loss-aware serialization.
- `src/tools/crystal/structure-import-engine.ts` — format detection and POSCAR/XYZ/extXYZ/PDB/structural-mmCIF import adapters.
- `src/tools/crystal/project-engine.ts` — versioned project JSON serialization/validation.
- `src/tools/crystal/metadata-engine.ts` — scalar/loop metadata edits and export-diff model.
- `src/tools/crystal/structure-export-engine.ts` — CIF, POSCAR, XYZ/extXYZ, project and CSV outputs.

### Rendering and UI

- `src/tools/crystal/viewport-model.ts` — framework-free render-instance model derived from `CrystalDocument`.
- `src/tools/crystal/CrystalViewport.tsx` — Three.js renderer/camera/selection lifecycle.
- `src/tools/crystal/CrystalStructurePanel.tsx` — cell/site/supercell/measurement controls.
- `src/tools/crystal/CrystalMetadataDialog.tsx` — loss-aware source metadata browser/editor.
- `src/tools/crystal/CrystalExportDialog.tsx` — target-format and metadata export workflow.
- `src/tools/crystal/CrystalWorkspace.tsx` — Phase 1 orchestration and task-oriented workspace.
- `src/tools/crystal/crystal-workspace.css` — tool-local layout, reflow and accessible state styling.

### Tests

- `tests/unit/crystal-cell.test.ts`
- `tests/unit/crystal-document.test.ts`
- `tests/unit/crystal-cif.test.ts`
- `tests/unit/crystal-import.test.ts`
- `tests/unit/crystal-geometry.test.ts`
- `tests/unit/crystal-project.test.ts`
- `tests/unit/crystal-export.test.ts`
- `tests/unit/crystal-viewport-model.test.ts`
- `tests/e2e/crystal-lattice-studio.spec.ts`

---

### Task 1: Register the lazy tool route and accessible workspace shell

**Files:**
- Modify: `src/catalog.ts`
- Modify: `src/tools/workspaces.tsx`
- Create: `src/tools/crystal/CrystalWorkspace.tsx`
- Create: `src/tools/crystal/crystal-workspace.css`
- Test: `tests/e2e/crystal-lattice-studio.spec.ts`

**Interfaces:**
- Consumes: existing `ToolDefinition`, `ToolLayout`, lazy workspace loader.
- Produces: route slug `crystal-lattice-studio`; default `CrystalWorkspace` component with `data-testid="crystal-workspace"`.

- [ ] **Step 1: Write the failing route/browser test**

```ts
import { expect, test } from '@playwright/test';

test('opens Crystal Lattice Studio through the catalog and keeps the engine local', async ({ page }) => {
  await page.goto('./#/');
  const link = page.getByRole('link', { name: /Crystal Lattice Studio/ });
  await expect(link).toHaveAttribute('href', '#/tools/crystal-lattice-studio');
  await link.click();
  await expect(page.getByTestId('suite-title')).toContainText('Crystal Lattice Studio');
  await expect(page.getByTestId('privacy-status')).toContainText(/local|browser|device/i);
  await expect(page.getByTestId('crystal-workspace')).toBeVisible();
});
```

- [ ] **Step 2: Run the focused test and confirm RED**

Run: `pnpm exec playwright test tests/e2e/crystal-lattice-studio.spec.ts --grep "opens Crystal"`

Expected: FAIL because the catalog link/route/workspace does not exist.

- [ ] **Step 3: Add the smallest repo-native shell**

Add `'crystal-lattice-studio'` to `ToolSlug`, a user-facing catalog entry, and this lazy loader:

```ts
'crystal-lattice-studio': () => import('./crystal/CrystalWorkspace'),
```

The initial workspace must render a concise local status plus a starter selector, with no dead controls for later phases:

```tsx
export default function CrystalWorkspace() {
  return (
    <div className="crystal-workspace workspace-body" data-testid="crystal-workspace">
      <header className="crystal-workspace__header">
        <div><p className="eyebrow">Structure workspace</p><h2>Explore a crystal</h2></div>
        <p role="status">Choose a starter structure or open a local structure file.</p>
      </header>
    </div>
  );
}
```

- [ ] **Step 4: Verify GREEN and production compilation**

Run: `pnpm exec playwright test tests/e2e/crystal-lattice-studio.spec.ts --grep "opens Crystal"`

Run: `pnpm build`

Expected: focused browser test PASS and production build PASS.

- [ ] **Step 5: Commit**

Commit message: `feat(crystal): register Crystal Lattice Studio shell`

---

### Task 2: Establish canonical cell/site types and lattice mathematics

**Files:**
- Create: `src/tools/crystal/crystal-types.ts`
- Create: `src/tools/crystal/cell-engine.ts`
- Test: `tests/unit/crystal-cell.test.ts`

**Interfaces:**

```ts
export type Vec3 = readonly [number, number, number];
export type Mat3 = readonly [Vec3, Vec3, Vec3];
export interface UnitCell { a: number; b: number; c: number; alpha: number; beta: number; gamma: number; }
export interface CrystalSite {
  id: string; label: string; element: string; fractional: Vec3; occupancy: number;
  isotope?: number; oxidationState?: number; disorderAssembly?: string; disorderGroup?: string;
  uIso?: number; uAniso?: readonly [number, number, number, number, number, number]; notes?: string;
}
export interface CrystalDocument {
  version: 1; id: string; name: string; sourceFormat: string; sourceText?: string;
  cell: UnitCell; sites: readonly CrystalSite[]; importedSnapshot?: ImportedCrystalSnapshot;
  cif?: CifDocument; metadata: CrystalMetadataState; provenance: readonly CrystalTransformRecord[];
}
```

Exports from `cell-engine.ts`:

```ts
validateCell(cell: UnitCell): { ok: true } | { ok: false; error: string };
cellToMatrix(cell: UnitCell): Mat3;
cellVolume(cell: UnitCell): number;
metricTensor(cell: UnitCell): Mat3;
reciprocalMatrix(cell: UnitCell): Mat3;
fractionalToCartesian(frac: Vec3, cell: UnitCell): Vec3;
cartesianToFractional(cart: Vec3, cell: UnitCell): Vec3;
```

- [ ] **Step 1: Write failing numeric fixtures**

```ts
import { describe, expect, it } from 'vitest';
import { cartesianToFractional, cellToMatrix, cellVolume, fractionalToCartesian, reciprocalMatrix, validateCell } from '../../src/tools/crystal/cell-engine';

const cubic = { a: 5, b: 5, c: 5, alpha: 90, beta: 90, gamma: 90 };

describe('crystal cell engine', () => {
  it('computes a cubic 125 Å³ cell and reciprocal basis', () => {
    expect(cellVolume(cubic)).toBeCloseTo(125, 10);
    expect(cellToMatrix(cubic)[0]).toEqual([5, 0, 0]);
    expect(reciprocalMatrix(cubic)[0][0]).toBeCloseTo(0.2, 10);
  });

  it('round-trips fractional coordinates in a triclinic cell', () => {
    const cell = { a: 4.1, b: 5.2, c: 6.3, alpha: 78, beta: 83, gamma: 71 };
    const fractional = [0.17, 0.42, 0.88] as const;
    const restored = cartesianToFractional(fractionalToCartesian(fractional, cell), cell);
    restored.forEach((value, index) => expect(value).toBeCloseTo(fractional[index]!, 10));
  });

  it('rejects singular or nonphysical cells', () => {
    expect(validateCell({ ...cubic, a: 0 }).ok).toBe(false);
    expect(validateCell({ ...cubic, gamma: 180 }).ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run and confirm RED**

Run: `pnpm exec vitest run tests/unit/crystal-cell.test.ts`

Expected: FAIL because `cell-engine.ts` is missing.

- [ ] **Step 3: Implement deterministic lattice math**

Use the standard crystallographic direct-basis construction:

```ts
const deg = Math.PI / 180;
const ca = Math.cos(cell.alpha * deg), cb = Math.cos(cell.beta * deg), cg = Math.cos(cell.gamma * deg);
const sg = Math.sin(cell.gamma * deg);
const ax: Vec3 = [cell.a, 0, 0];
const bx: Vec3 = [cell.b * cg, cell.b * sg, 0];
const cx: Vec3 = [
  cell.c * cb,
  cell.c * (ca - cb * cg) / sg,
  cell.c * Math.sqrt(1 - cb * cb - ((ca - cb * cg) / sg) ** 2),
];
```

Validate finite positive lengths, angles strictly between 0° and 180°, nonzero determinant, and positive radicand within numeric tolerance. Invert the direct matrix explicitly and derive reciprocal basis without `2π` so d-spacing calculations later use crystallographic reciprocal units.

- [ ] **Step 4: Verify GREEN**

Run: `pnpm exec vitest run tests/unit/crystal-cell.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

Commit message: `feat(crystal): add lattice cell mathematics`

---

### Task 3: Add starter structures, immutable document edits and bounded history

**Files:**
- Create: `src/tools/crystal/element-data.ts`
- Create: `src/tools/crystal/starter-structures.ts`
- Create: `src/tools/crystal/document-engine.ts`
- Create: `src/tools/crystal/history-engine.ts`
- Test: `tests/unit/crystal-document.test.ts`

**Interfaces:**

```ts
export type StarterStructureId = 'sc'|'bcc'|'fcc'|'diamond'|'nacl'|'cscl'|'zincblende'|'graphite'|'perovskite'|'rutile'|'fluorite'|'wurtzite'|'molecular';
createStarterStructure(id: StarterStructureId): CrystalDocument;
createEmptyCrystal(name?: string): CrystalDocument;
setCrystalCell(document: CrystalDocument, cell: UnitCell): CrystalDocument;
addCrystalSite(document: CrystalDocument, site: Omit<CrystalSite,'id'>): CrystalDocument;
duplicateCrystalSite(document: CrystalDocument, siteId: string): CrystalDocument;
updateCrystalSite(document: CrystalDocument, siteId: string, patch: Partial<Omit<CrystalSite,'id'>>): CrystalDocument;
deleteCrystalSite(document: CrystalDocument, siteId: string): CrystalDocument;
wrapCrystalSites(document: CrystalDocument): CrystalDocument;

export interface CrystalHistory { readonly past: readonly CrystalDocument[]; readonly present: CrystalDocument; readonly future: readonly CrystalDocument[]; readonly imported: CrystalDocument; }
createCrystalHistory(document: CrystalDocument): CrystalHistory;
commitCrystalHistory(history: CrystalHistory, next: CrystalDocument, limit?: number): CrystalHistory;
undoCrystalHistory(history: CrystalHistory): CrystalHistory;
redoCrystalHistory(history: CrystalHistory): CrystalHistory;
resetCrystalHistory(history: CrystalHistory): CrystalHistory;
```

- [ ] **Step 1: Write failing document/history tests**

```ts
it('creates NaCl with stable labels and wraps edited sites', () => {
  const nacl = createStarterStructure('nacl');
  expect(nacl.sites.map((site) => site.element)).toEqual(expect.arrayContaining(['Na','Cl']));
  const shifted = updateCrystalSite(nacl, nacl.sites[0]!.id, { fractional: [1.25, -0.1, 0.5] });
  const wrapped = wrapCrystalSites(shifted);
  expect(wrapped.sites[0]!.fractional).toEqual([0.25, 0.9, 0.5]);
});

it('undoes, redoes and resets without mutating prior snapshots', () => {
  const start = createStarterStructure('bcc');
  const history = createCrystalHistory(start);
  const changed = commitCrystalHistory(history, setCrystalCell(start, { ...start.cell, a: start.cell.a + 1 }));
  expect(undoCrystalHistory(changed).present.cell.a).toBe(start.cell.a);
  expect(redoCrystalHistory(undoCrystalHistory(changed)).present.cell.a).toBe(start.cell.a + 1);
  expect(resetCrystalHistory(changed).present).toEqual(start);
});
```

- [ ] **Step 2: Confirm RED**

Run: `pnpm exec vitest run tests/unit/crystal-document.test.ts`

Expected: FAIL because starter/document/history engines do not exist.

- [ ] **Step 3: Implement immutable operations and starter fixtures**

Use deterministic IDs derived from starter/site order (`nacl-site-1`, etc.) and monotonic local IDs for user-added sites. Starter structures contain scientifically conventional cells/coordinates but no unverified claims in public copy. The Phase 1 element dataset must include, at minimum, H, C, N, O, F, Na, Mg, Al, Si, P, S, Cl, K, Ca, Ti, Fe, Zn, Cs plus any elements required by the 13 starters, with provenance comments for masses/covalent radii/color conventions.

History must cap `past` at 100 snapshots by default and clear `future` after a new edit.

- [ ] **Step 4: Verify GREEN**

Run: `pnpm exec vitest run tests/unit/crystal-document.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

Commit message: `feat(crystal): add documents starters and history`

---

### Task 4: Implement loss-aware CIF 1.1/2.0 parsing and serialization

**Files:**
- Create: `src/tools/crystal/cif-engine.ts`
- Test: `tests/unit/crystal-cif.test.ts`

**Interfaces:**

```ts
export type CifVersion = '1.1' | '2.0';
export interface CifScalar { kind:'scalar'; tag:string; value:string; rawValue:string; }
export interface CifLoop { kind:'loop'; tags:readonly string[]; rows:readonly (readonly string[])[]; rawValues:readonly (readonly string[])[]; }
export interface CifBlock { name:string; entries:readonly (CifScalar|CifLoop)[]; }
export interface CifDocument { version:CifVersion; blocks:readonly CifBlock[]; sourceText:string; }
export class CifParseError extends Error { constructor(message:string, readonly line:number, readonly column:number); }
parseCif(text: string, versionHint?: CifVersion): CifDocument;
structureFromCif(cif: CifDocument, blockName?: string): CrystalDocument;
serializeCif(cif: CifDocument, options?: { version?: CifVersion; blockName?: string }): string;
```

- [ ] **Step 1: Write failing preservation fixtures**

```ts
const cif11 = `data_demo\n_cell_length_a 5.0\n_cell_length_b 5.0\n_cell_length_c 5.0\n_cell_angle_alpha 90\n_cell_angle_beta 90\n_cell_angle_gamma 90\n_custom_note\n;line one\nline two\n;\nloop_\n_atom_site_label\n_atom_site_type_symbol\n_atom_site_fract_x\n_atom_site_fract_y\n_atom_site_fract_z\nNa1 Na 0 0 0\nCl1 Cl 0.5 0.5 0.5\nloop_\n_custom_a\n_custom_b\nfoo 'bar baz'\n`;

it('preserves unknown CIF scalars and loops through parse/serialize/parse', () => {
  const parsed = parseCif(cif11, '1.1');
  const reparsed = parseCif(serializeCif(parsed), '1.1');
  expect(reparsed.blocks[0]!.entries).toEqual(parsed.blocks[0]!.entries);
  expect(structureFromCif(parsed).sites).toHaveLength(2);
});

it('keeps multiple data blocks selectable', () => {
  const parsed = parseCif(`${cif11}\ndata_second\n_cell_length_a 3`);
  expect(parsed.blocks.map((block) => block.name)).toEqual(['demo','second']);
});

it('reports malformed loop location', () => {
  expect(() => parseCif('data_x\nloop_\n_a\n_b\n1')).toThrow(CifParseError);
});
```

Add a CIF 2.0 fixture containing the `#\\#CIF_2.0` signature and triple-quoted/list/table values; Phase 1 may preserve list/table values as syntactically validated raw values rather than interpreting their semantics, but serialization must not corrupt them.

- [ ] **Step 2: Confirm RED**

Run: `pnpm exec vitest run tests/unit/crystal-cif.test.ts`

Expected: FAIL because the CIF engine is missing.

- [ ] **Step 3: Implement a small tokenizer/parser rather than regex-only parsing**

Tokenizer states must cover whitespace/comments, bare tokens, single/double quotes, semicolon text fields at column 1, CIF 2.0 triple quotes and balanced list/table delimiters. Parser must enforce loop row width and retain unknown entries. `structureFromCif` reads cell tags plus `_atom_site_*` label/type/fractional/occupancy/Uiso fields without deleting the original parse tree.

- [ ] **Step 4: Verify GREEN**

Run: `pnpm exec vitest run tests/unit/crystal-cif.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

Commit message: `feat(crystal): add loss-aware CIF parser`

---

### Task 5: Add POSCAR, XYZ/extXYZ, PDB and structural-mmCIF import adapters

**Files:**
- Create: `src/tools/crystal/structure-import-engine.ts`
- Test: `tests/unit/crystal-import.test.ts`

**Interfaces:**

```ts
export type CrystalImportFormat = 'cif'|'mmcif'|'pdb'|'poscar'|'xyz'|'extxyz';
export interface CrystalImportResult { document: CrystalDocument; format: CrystalImportFormat; warnings: readonly string[]; }
detectCrystalFormat(filename: string, text: string): CrystalImportFormat;
importCrystalText(filename: string, text: string): CrystalImportResult;
```

- [ ] **Step 1: Write failing cross-format fixtures**

Tests must cover:

```ts
expect(importCrystalText('POSCAR', poscarDirect).document.sites[0]!.fractional).toEqual([0,0,0]);
expect(importCrystalText('cartesian.vasp', poscarCartesian).document.sites[1]!.fractional[0]).toBeCloseTo(0.5);
expect(importCrystalText('sample.xyz', xyz).document.sites).toHaveLength(3);
expect(importCrystalText('sample.extxyz', extxyz).document.cell.a).toBeCloseTo(5);
expect(importCrystalText('sample.pdb', pdbWithCryst1).document.cell.gamma).toBeCloseTo(90);
expect(importCrystalText('sample.cif', mmcifAtomSite).document.sites[0]!.label).toMatch(/CA|C1/);
```

Also assert malformed counts/coordinate records produce explicit errors instead of partial silent imports.

- [ ] **Step 2: Confirm RED**

Run: `pnpm exec vitest run tests/unit/crystal-import.test.ts`

Expected: FAIL because the import adapter is missing.

- [ ] **Step 3: Implement format-specific adapters**

Rules:
- POSCAR: handle global/three-axis scale, VASP 5 element/count lines, Selective Dynamics, Direct and Cartesian modes.
- XYZ: accept exact atom count and symbol/x/y/z lines; use a generated nonperiodic-display cell only when no lattice exists and mark that assumption as a warning.
- extXYZ: parse `Lattice="..."` and `Properties=...` when present.
- PDB: parse `CRYST1`, `ATOM` and `HETATM`; derive fractional coordinates through `cartesianToFractional` when cell exists.
- structural mmCIF: route through the CIF parser and recognize common `_atom_site.Cartn_*` / cell tags in addition to core CIF fractional fields.

Every adapter stores original source text/format on `CrystalDocument` for provenance.

- [ ] **Step 4: Verify GREEN**

Run: `pnpm exec vitest run tests/unit/crystal-import.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

Commit message: `feat(crystal): add structure import adapters`

---

### Task 6: Add periodic geometry, supercells, bonding and measurements

**Files:**
- Create: `src/tools/crystal/periodic-engine.ts`
- Create: `src/tools/crystal/measurement-engine.ts`
- Test: `tests/unit/crystal-geometry.test.ts`

**Interfaces:**

```ts
wrapFractional(frac: Vec3): Vec3;
minimumImageFractionalDelta(a: Vec3, b: Vec3): Vec3;
periodicDistance(a: Vec3, b: Vec3, cell: UnitCell): number;
expandSupercell(document: CrystalDocument, repeats: readonly [number,number,number], maxSites?: number): CrystalDocument;
generatePeriodicImages(document: CrystalDocument, radiusShell: number): readonly CrystalSiteImage[];
findPeriodicBonds(document: CrystalDocument, tolerance?: number): readonly CrystalBond[];
measureAngle(a: Vec3, b: Vec3, c: Vec3, cell: UnitCell): number;
measureDihedral(a: Vec3, b: Vec3, c: Vec3, d: Vec3, cell: UnitCell): number;
```

- [ ] **Step 1: Write failing periodic fixtures**

```ts
it('uses the minimum periodic image across a cell boundary', () => {
  expect(periodicDistance([0.95,0,0],[0.05,0,0], cubic)).toBeCloseTo(0.5, 10);
});

it('expands a BCC cell deterministically and enforces the site limit', () => {
  const bcc = createStarterStructure('bcc');
  expect(expandSupercell(bcc, [2,2,2]).sites).toHaveLength(bcc.sites.length * 8);
  expect(() => expandSupercell(bcc, [100,100,100], 50_000)).toThrow(/limit|sites/i);
});

it('measures an orthogonal angle', () => {
  expect(measureAngle([1,0,0],[0,0,0],[0,1,0], { ...cubic, a:1,b:1,c:1 })).toBeCloseTo(90, 10);
});
```

- [ ] **Step 2: Confirm RED**

Run: `pnpm exec vitest run tests/unit/crystal-geometry.test.ts`

Expected: FAIL because periodic/measurement engines are missing.

- [ ] **Step 3: Implement periodic math and bounded expansion**

Minimum-image deltas wrap each fractional component to `[-0.5, 0.5)`, then transform by the full triclinic cell matrix. Bonds compare nearest-image distances to `(r_cov(A) + r_cov(B)) * tolerance`, default `1.15`; sites without a verified radius are skipped with a diagnostic instead of guessed.

Supercell output records the transform in provenance and uses stable image IDs `${site.id}@${i},${j},${k}`.

- [ ] **Step 4: Verify GREEN**

Run: `pnpm exec vitest run tests/unit/crystal-geometry.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

Commit message: `feat(crystal): add periodic geometry and measurements`

---

### Task 7: Add versioned project persistence and safe validation

**Files:**
- Create: `src/tools/crystal/project-engine.ts`
- Test: `tests/unit/crystal-project.test.ts`

**Interfaces:**

```ts
export interface CrystalProjectV1 { schema:'inmotools.crystal-project'; version:1; document:CrystalDocument; view:CrystalViewState; measurements:readonly CrystalMeasurement[]; }
serializeCrystalProject(project: CrystalProjectV1): string;
parseCrystalProject(text: string): CrystalProjectV1;
```

- [ ] **Step 1: Write failing round-trip and hostile-input tests**

```ts
it('round-trips project state without losing imported source metadata', () => {
  const project = makeProjectFrom(createStarterStructure('diamond'));
  expect(parseCrystalProject(serializeCrystalProject(project))).toEqual(project);
});

it('rejects nonfinite cell values and prototype keys', () => {
  expect(() => parseCrystalProject('{"schema":"inmotools.crystal-project","version":1,"document":{"__proto__":{"polluted":true}}}')).toThrow();
});
```

- [ ] **Step 2: Confirm RED**

Run: `pnpm exec vitest run tests/unit/crystal-project.test.ts`

Expected: FAIL because project engine is missing.

- [ ] **Step 3: Implement schema validation**

Parse JSON, recursively reject `__proto__`, `prototype` and `constructor` object keys, validate all required shapes and finite numeric values, and run `validateCell`. Never merge untrusted parsed objects into ambient objects with `Object.assign`.

- [ ] **Step 4: Verify GREEN**

Run: `pnpm exec vitest run tests/unit/crystal-project.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

Commit message: `feat(crystal): add local project persistence`

---

### Task 8: Build the instanced Three.js viewport and selection model

**Files:**
- Create: `src/tools/crystal/viewport-model.ts`
- Create: `src/tools/crystal/CrystalViewport.tsx`
- Test: `tests/unit/crystal-viewport-model.test.ts`
- Extend: `tests/e2e/crystal-lattice-studio.spec.ts`

**Interfaces:**

```ts
export type CrystalRepresentation = 'ball-stick'|'sticks'|'space-fill'|'points'|'wireframe';
export interface CrystalRenderModel { atoms:readonly RenderAtom[]; bonds:readonly RenderBond[]; cellEdges:readonly [Vec3,Vec3][]; modelKey:string; }
buildCrystalRenderModel(document: CrystalDocument, options: CrystalRenderOptions): CrystalRenderModel;
```

`CrystalViewport` props:

```ts
interface CrystalViewportProps {
  document: CrystalDocument;
  representation: CrystalRepresentation;
  selectedSiteIds: ReadonlySet<string>;
  onSelectionChange(ids: ReadonlySet<string>): void;
}
```

- [ ] **Step 1: Write failing model and browser tests**

```ts
it('builds one atom instance per visible site and twelve unit-cell edges', () => {
  const model = buildCrystalRenderModel(createStarterStructure('nacl'), defaultRenderOptions);
  expect(model.atoms.length).toBeGreaterThan(0);
  expect(model.cellEdges).toHaveLength(12);
});
```

Browser addition:

```ts
await page.goto('./#/tools/crystal-lattice-studio');
await page.getByLabel('Starter structure').selectOption('nacl');
await expect(page.getByRole('img', { name: /interactive crystal structure/i })).toBeVisible();
await expect(page.getByRole('button', { name: 'Fit structure' })).toBeEnabled();
```

- [ ] **Step 2: Confirm RED**

Run: `pnpm exec vitest run tests/unit/crystal-viewport-model.test.ts`

Run: `pnpm exec playwright test tests/e2e/crystal-lattice-studio.spec.ts --grep "viewport|starter"`

Expected: FAIL because viewport model/component are missing.

- [ ] **Step 3: Implement renderer using existing lifecycle conventions**

Requirements:
- one `THREE.InstancedMesh` per compatible atom visual group, not one mesh per atom;
- instanced/cylinder bonds or bounded line representation;
- explicit unit-cell edge geometry;
- bounded `renderer.setPixelRatio(Math.min(2, devicePixelRatio || 1))`;
- `ResizeObserver` sizing;
- OrbitControls damping;
- perspective/orthographic toggle and fit/reset/+X/+Y/+Z view presets;
- raycast instance ID -> stable site ID selection;
- save camera state across representation-only changes; refit when `document.id`/structure identity changes;
- cancel `requestAnimationFrame`, disconnect observer, dispose controls/geometries/materials/renderer on cleanup.

- [ ] **Step 4: Verify GREEN**

Run: `pnpm exec vitest run tests/unit/crystal-viewport-model.test.ts`

Run: `pnpm exec playwright test tests/e2e/crystal-lattice-studio.spec.ts --grep "viewport|starter"`

Expected: PASS.

- [ ] **Step 5: Commit**

Commit message: `feat(crystal): add interactive structure viewport`

---

### Task 9: Wire cell/site editing, supercells, measurements, undo/redo and reset into the workspace

**Files:**
- Create: `src/tools/crystal/CrystalStructurePanel.tsx`
- Modify: `src/tools/crystal/CrystalWorkspace.tsx`
- Modify: `src/tools/crystal/crystal-workspace.css`
- Extend: `tests/e2e/crystal-lattice-studio.spec.ts`

**Interfaces:**
- Consumes all Phase 1 document/history/cell/periodic/measurement engines.
- Produces task areas `Explore`, `Build`, `Geometry`, `Data & metadata`, `Export` only. Do not display inert Phase 2–5 buttons.

- [ ] **Step 1: Write failing interaction tests**

Add browser tests that:
- choose BCC and verify volume;
- edit `a` and observe the recalculated volume;
- switch one site between fractional/cartesian editing and verify equivalent coordinates;
- add, duplicate, delete and wrap sites;
- preview and apply a `2×2×1` supercell;
- create a two-site periodic distance measurement;
- undo/redo an edit;
- reset to the imported/starter snapshot.

Example:

```ts
await page.getByLabel('Cell a (Å)').fill('4');
await expect(page.getByTestId('crystal-cell-volume')).toContainText('64');
await page.getByRole('button', { name: 'Undo' }).click();
await expect(page.getByLabel('Cell a (Å)')).not.toHaveValue('4');
```

- [ ] **Step 2: Confirm RED**

Run: `pnpm exec playwright test tests/e2e/crystal-lattice-studio.spec.ts --grep "cell|site|supercell|measurement|undo"`

Expected: FAIL because editing controls are absent.

- [ ] **Step 3: Implement accessible editing surfaces**

Use native labels/number inputs/tables. Cell edits are staged and only committed when `validateCell` succeeds. Site table rows key by stable site ID. Supercell controls show resulting site count before apply and block above the Phase 1 default limit (50,000 sites) unless the user reduces repeats. Measurements show value + units text, not color alone.

- [ ] **Step 4: Verify GREEN**

Run: `pnpm exec playwright test tests/e2e/crystal-lattice-studio.spec.ts --grep "cell|site|supercell|measurement|undo"`

Expected: PASS.

- [ ] **Step 5: Commit**

Commit message: `feat(crystal): add editable structure workflows`

---

### Task 10: Add metadata inspection/editing and core scientific exports

**Files:**
- Create: `src/tools/crystal/metadata-engine.ts`
- Create: `src/tools/crystal/structure-export-engine.ts`
- Create: `src/tools/crystal/CrystalMetadataDialog.tsx`
- Create: `src/tools/crystal/CrystalExportDialog.tsx`
- Test: `tests/unit/crystal-export.test.ts`
- Extend: `tests/e2e/crystal-lattice-studio.spec.ts`

**Interfaces:**

```ts
export interface MetadataDiff { preserved:readonly string[]; changed:readonly string[]; generated:readonly string[]; omitted:readonly string[]; }
setCifScalar(cif:CifDocument, block:string, tag:string, value:string): CifDocument;
removeCifTag(cif:CifDocument, block:string, tag:string): CifDocument;
setCifLoopCell(cif:CifDocument, block:string, loopIndex:number, row:number, tag:string, value:string): CifDocument;
computeMetadataDiff(source:CifDocument|undefined, output:CifDocument|undefined): MetadataDiff;
exportCrystal(document:CrystalDocument, target:'cif1'|'cif2'|'poscar'|'xyz'|'extxyz'|'project'|'measurements-csv', options:CrystalExportOptions): { filename:string; mime:string; text:string; diff:MetadataDiff };
```

- [ ] **Step 1: Write failing export/metadata tests**

```ts
it('preserves an unknown CIF loop while editing a known scalar', () => {
  const imported = importCrystalText('sample.cif', cifWithUnknownLoop).document;
  const edited = setExportMetadata(imported, { title: 'Reviewed structure' });
  const out = exportCrystal(edited, 'cif1', defaultExportOptions);
  expect(out.text).toContain('_custom_a');
  expect(out.text).toContain('Reviewed structure');
  expect(out.diff.omitted).not.toContain('_custom_a');
});

it('exports POSCAR and extended XYZ from the same canonical coordinates', () => {
  const document = createStarterStructure('nacl');
  expect(exportCrystal(document, 'poscar', defaultExportOptions).text).toMatch(/Direct/);
  expect(exportCrystal(document, 'extxyz', defaultExportOptions).text).toMatch(/Lattice=/);
});
```

- [ ] **Step 2: Confirm RED**

Run: `pnpm exec vitest run tests/unit/crystal-export.test.ts`

Expected: FAIL because metadata/export engines are missing.

- [ ] **Step 3: Implement loss-aware export workflow**

The dialog exposes:
- target format;
- filename stem;
- editable title/description/creator/provenance notes where representable;
- custom CIF scalar tags with syntax validation;
- preserved/changed/generated/omitted preview before download.

CIF export starts from the imported `CifDocument` when available, updates supported structural tags from canonical state, and leaves unknown content intact. Non-CIF formats show unavoidable omissions before download. Use existing `downloadText`.

P1-expanded CIF is deliberately Phase 2 because correct symmetry expansion depends on the symmetry engine; do not provide a deceptive Phase 1 button.

- [ ] **Step 4: Verify GREEN and one browser download**

Run: `pnpm exec vitest run tests/unit/crystal-export.test.ts`

Run: `pnpm exec playwright test tests/e2e/crystal-lattice-studio.spec.ts --grep "metadata|export"`

Expected: PASS.

- [ ] **Step 5: Commit**

Commit message: `feat(crystal): add metadata-aware exports`

---

### Task 11: Add local file/project open-save flows and first publication graphics

**Files:**
- Create: `src/tools/crystal/crystal-graphics-export.ts`
- Modify: `src/tools/crystal/CrystalWorkspace.tsx`
- Modify: `src/tools/crystal/CrystalExportDialog.tsx`
- Extend: `tests/unit/crystal-export.test.ts`
- Extend: `tests/e2e/crystal-lattice-studio.spec.ts`

**Interfaces:**

```ts
buildCrystalSvg(document:CrystalDocument, options:CrystalSvgOptions): string;
exportCrystalPng(viewport:HTMLCanvasElement, options:CrystalPngOptions): Promise<Blob>;
```

GLB export may use Three.js `GLTFExporter` from the existing Three package and is included in Phase 1 only when visible atom/bond/cell geometry can be encoded deterministically; semantic crystallographic metadata remains in CIF/project outputs.

- [ ] **Step 1: Write failing local-file and graphics tests**

Browser tests must verify:
- importing a local CIF changes structure summary and never performs an upload request;
- re-selecting the same file works through `consumeFileInput`;
- saving a project JSON and reopening it restores structure/view selections;
- SVG export downloads actual vector primitives and labels, not an embedded raster image;
- PNG export honors transparent versus solid background choices.

Unit SVG assertion:

```ts
const svg = buildCrystalSvg(createStarterStructure('nacl'), { width:800, height:600, showCell:true, background:'transparent' });
expect(svg).toContain('<svg');
expect(svg).toMatch(/<circle|<line/);
expect(svg).not.toContain('data:image/png');
```

- [ ] **Step 2: Confirm RED**

Run: `pnpm exec vitest run tests/unit/crystal-export.test.ts`

Run: `pnpm exec playwright test tests/e2e/crystal-lattice-studio.spec.ts --grep "local file|project|SVG|PNG"`

Expected: FAIL because these flows are absent.

- [ ] **Step 3: Implement file and graphics flows**

Use `consumeFileInput` for structure/project input reset. Never fetch user-selected bytes. SVG renderer projects the current deterministic structure view into vector lines/circles/labels with escaped text. PNG uses the WebGL/canvas output only after checking requested pixel dimensions against a bounded maximum and reports when the requested size must be reduced. GLB export is exposed only after a focused GLB header/load test proves the generated bytes are valid.

- [ ] **Step 4: Verify GREEN**

Run: `pnpm exec vitest run tests/unit/crystal-export.test.ts`

Run: `pnpm exec playwright test tests/e2e/crystal-lattice-studio.spec.ts --grep "local file|project|SVG|PNG|GLB"`

Expected: PASS for every feature that is exposed.

- [ ] **Step 5: Commit**

Commit message: `feat(crystal): add local projects and publication exports`

---

### Task 12: Phase 1 acceptance, reflow/accessibility, and completion ledger

**Files:**
- Extend: `tests/e2e/crystal-lattice-studio.spec.ts`
- Extend only if needed by a verified failure: `src/tools/crystal/crystal-workspace.css`
- Create: `docs/superpowers/plans/2026-09-11-crystal-lattice-studio-phase-1-completion.md`

**Interfaces:**
- Produces the Phase 1 acceptance evidence and explicit mapping from master capabilities to `implemented`, `phase-2+`, or `conditional` status. Deferral to a later named phase is not an exclusion.

- [ ] **Step 1: Add the failing acceptance checks before any final CSS/interaction fixes**

Browser acceptance matrix:

```ts
const viewports = [
  { name:'320 portrait', width:320, height:568 },
  { name:'390 portrait', width:390, height:844 },
  { name:'844 landscape', width:844, height:390 },
  { name:'768 tablet', width:768, height:1024 },
  { name:'1440 desktop', width:1440, height:900 },
];
```

For each viewport, assert document horizontal overflow <= 1 px after loading NaCl and opening the Build panel. Run `AxeBuilder` against the suite workspace and require zero serious/critical violations. Add keyboard tests for starter selector, task areas, site table controls, viewport preset buttons, metadata dialog, export dialog and dialog Escape/return-focus behavior.

- [ ] **Step 2: Run focused Phase 1 tests and observe any RED acceptance failures**

Run: `pnpm exec vitest run tests/unit/crystal-*.test.ts`

Run: `pnpm exec playwright test tests/e2e/crystal-lattice-studio.spec.ts`

Expected before final polish: any remaining reflow/a11y defects appear as focused failures; scientific/unit tests remain green.

- [ ] **Step 3: Fix only demonstrated Phase 1 acceptance failures**

Adjust Crystal-specific CSS/markup/interactions only. Do not refactor shared repo primitives unless a verified shared defect blocks this tool and the user explicitly extends permission beyond this tool.

- [ ] **Step 4: Run fresh release evidence**

Run:

```bash
pnpm exec vitest run tests/unit/crystal-*.test.ts
pnpm build
pnpm exec playwright test tests/e2e/crystal-lattice-studio.spec.ts
```

Expected: all Crystal unit tests PASS, production build PASS, focused Crystal browser suite PASS.

Because `src/catalog.ts` and `src/tools/workspaces.tsx` are shared registry surfaces, additionally run the smallest existing navigation/catalog test that covers registry integrity if one exists; do not run unrelated heavy browser suites without a concrete reason.

- [ ] **Step 5: Write the Phase 1 completion ledger**

The completion document must enumerate master-spec capabilities delivered in Phase 1, capabilities intentionally assigned to Phases 2–5, any conditional item encountered, exact test/build evidence, and no unapproved exclusion. It must not contain private chain-of-thought or hidden prompting.

- [ ] **Step 6: Re-check integration and commit**

Verify current `main`, ensure no Crystal work is stranded on another branch, and commit with message:

`docs(crystal): record phase 1 acceptance`

---

## Plan self-review checklist

- **Spec coverage:** Phase 1 covers the master design's document core, starter structures, cell/site editing, periodic geometry, history/project persistence, initial import/export formats, CIF preservation, core measurements, Three.js viewport, selection/basic representations, initial metadata editing, and publication outputs. Symmetry-dependent features are explicitly deferred to Phase 2; reciprocal/diffraction to Phase 3; refinement/fields/voids/morphology to Phase 4; dictionary-complete metadata/learnability/performance audit to Phase 5.
- **No dead UI:** Later-phase functionality is not represented by inert buttons.
- **No placeholders:** Each task has concrete files, interfaces, RED/GREEN commands, implementation constraints and commit boundary.
- **Type consistency:** `UnitCell`, `Vec3`, `CrystalSite`, `CrystalDocument`, `CifDocument`, `CrystalHistory` and export interfaces are introduced before downstream tasks consume them.
- **Scientific safety:** calculations live in framework-free engines; invalid cells do not replace valid state; assumptions are surfaced; unknown CIF content is preserved.
- **Repository safety:** Phase 1 adds no dependency and changes shared code only at the two required registration points.

import { cellToMatrix, validateCell } from './cell-engine';
import { ELEMENTS } from './element-data';
import { periodicDistance } from './periodic-engine';
import type { CrystalDocument, CrystalSite, Mat3, UnitCell, Vec3 } from './crystal-types';
import type { CrystalSymmetryOperation, CrystalSymmetryResult, SymmetryAdapterCell } from './symmetry-types';
import type { StructureHealthFinding } from './structure-health-engine';

const DEFAULT_TOLERANCE = 1e-4;
const VECTOR_EPSILON = 1e-10;
const LATTICE_NOISE_EPSILON = 1e-9;
const MAX_EQUIVALENT_SITES = 50_000;
const MOYO_SETTING = 'Standard';
const MOYO_WASM_FILE = '@spglib/moyo-wasm/moyo_wasm_bg.wasm';

type MoyoModule = typeof import('@spglib/moyo-wasm');

interface NodeProcessBindings {
  readonly versions?: { readonly node?: string };
  readonly getBuiltinModule?: (specifier: string) => unknown;
}

const ATOMIC_NUMBERS: ReadonlyMap<string, number> = new Map(
  Object.values(ELEMENTS)
    .filter((element) => element.atomicNumber > 0)
    .map((element) => [element.symbol, element.atomicNumber] as const),
);

const ELEMENT_SYMBOLS: ReadonlyMap<number, string> = new Map(
  [...ATOMIC_NUMBERS].map(([symbol, atomicNumber]) => [atomicNumber, symbol] as const),
);

let moyoModulePromise: Promise<MoyoModule> | undefined;

const length = (vector: Vec3): number => Math.hypot(vector[0], vector[1], vector[2]);

const snapZero = (value: number): number => (Math.abs(value) < LATTICE_NOISE_EPSILON ? 0 : value);

function dot(left: Vec3, right: Vec3): number {
  return left[0] * right[0] + left[1] * right[1] + left[2] * right[2];
}

function angleDegrees(left: Vec3, right: Vec3): number {
  const denominator = length(left) * length(right);
  if (!Number.isFinite(denominator) || denominator <= VECTOR_EPSILON) {
    throw new RangeError('Lattice basis contains a zero-length vector.');
  }
  const cosine = Math.min(1, Math.max(-1, dot(left, right) / denominator));
  return (Math.acos(cosine) * 180) / Math.PI;
}

function atomicNumberFor(element: string): number {
  const atomicNumber = ATOMIC_NUMBERS.get(element);
  if (atomicNumber === undefined) {
    throw new RangeError(`Unsupported element "${element}": no verified atomic number mapping is available.`);
  }
  return atomicNumber;
}

function assertOrdered(document: CrystalDocument): void {
  const disordered = document.sites.some(
    (site) => site.occupancy !== 1 || site.disorderAssembly !== undefined || site.disorderGroup !== undefined,
  );
  if (disordered) {
    throw new RangeError(
      'Symmetry analysis requires fully occupied, ordered sites; partial occupancy or explicit disorder is not supported.',
    );
  }
}

export function crystalToMoyoCell(document: CrystalDocument): SymmetryAdapterCell {
  const matrix = cellToMatrix(document.cell);
  return {
    lattice: {
      basis: [
        snapZero(matrix[0][0]), snapZero(matrix[0][1]), snapZero(matrix[0][2]),
        snapZero(matrix[1][0]), snapZero(matrix[1][1]), snapZero(matrix[1][2]),
        snapZero(matrix[2][0]), snapZero(matrix[2][1]), snapZero(matrix[2][2]),
      ],
    },
    positions: document.sites.map(
      (site): [number, number, number] => [site.fractional[0], site.fractional[1], site.fractional[2]],
    ),
    numbers: document.sites.map((site) => atomicNumberFor(site.element)),
  };
}

function basisToMatrix(basis: readonly number[]): Mat3 {
  if (basis.length !== 9 || !basis.every(Number.isFinite)) {
    throw new RangeError('Symmetry result returned an invalid lattice basis.');
  }
  return [
    [basis[0], basis[1], basis[2]],
    [basis[3], basis[4], basis[5]],
    [basis[6], basis[7], basis[8]],
  ];
}

function matrixToCell(matrix: Mat3): UnitCell {
  const [a, b, c] = matrix;
  const cell: UnitCell = {
    a: length(a),
    b: length(b),
    c: length(c),
    alpha: angleDegrees(b, c),
    beta: angleDegrees(a, c),
    gamma: angleDegrees(a, b),
  };
  const validation = validateCell(cell);
  if (!validation.ok) throw new RangeError(validation.error);
  return cell;
}

function documentFromSymmetryCell(
  document: CrystalDocument,
  cell: SymmetryAdapterCell,
  mode: 'standardized' | 'primitive',
  tolerance: number,
): CrystalDocument {
  const sites: CrystalSite[] = cell.positions.map((position, index) => {
    const atomicNumber = cell.numbers[index];
    const symbol = atomicNumber === undefined ? undefined : ELEMENT_SYMBOLS.get(atomicNumber);
    if (!symbol) {
      throw new RangeError(
        `Unsupported element with atomic number ${String(atomicNumber)}: no verified element mapping is available.`,
      );
    }
    return {
      id: `${document.id}-${mode}-site-${index + 1}`,
      label: `${symbol}${index + 1}`,
      element: symbol,
      fractional: [position[0], position[1], position[2]] as Vec3,
      occupancy: 1,
    };
  });
  return {
    ...document,
    id: `${document.id}-${mode}`,
    name: `${document.name} (${mode === 'standardized' ? 'standardized' : 'primitive'} cell)`,
    cell: matrixToCell(basisToMatrix(cell.lattice.basis)),
    sites,
    provenance: [
      ...document.provenance,
      {
        kind: `symmetry-${mode}`,
        label: `Derived ${mode} cell from local symmetry analysis`,
        detail: `Detected at tolerance ${tolerance} Å`,
      },
    ],
  };
}

function normalizeRotation(rotation: readonly number[]): CrystalSymmetryOperation['rotation'] {
  return [
    rotation[0], rotation[1], rotation[2],
    rotation[3], rotation[4], rotation[5],
    rotation[6], rotation[7], rotation[8],
  ];
}

function nodeProcess(): NodeProcessBindings | undefined {
  return (globalThis as { process?: NodeProcessBindings }).process;
}

async function loadMoyo(): Promise<MoyoModule> {
  if (!moyoModulePromise) {
    moyoModulePromise = (async () => {
      const module = await import('@spglib/moyo-wasm');
      const runtime = nodeProcess();
      if (runtime?.versions?.node) {
        const fs = runtime.getBuiltinModule?.('node:fs') as
          | { readFileSync: (path: string) => Uint8Array }
          | undefined;
        const nodeModule = runtime.getBuiltinModule?.('node:module') as
          | { createRequire: (filename: string) => { resolve: (specifier: string) => string } }
          | undefined;
        if (!fs || !nodeModule) {
          throw new Error('The local symmetry kernel could not access the required Node.js runtime modules.');
        }
        const require = nodeModule.createRequire(import.meta.url);
        module.initSync({ module: fs.readFileSync(require.resolve(MOYO_WASM_FILE)) });
      } else {
        await module.default();
      }
      return module;
    })().catch((error: unknown) => {
      moyoModulePromise = undefined;
      throw error;
    });
  }
  return moyoModulePromise;
}

export async function analyzeCrystalSymmetry(
  document: CrystalDocument,
  tolerance: number = DEFAULT_TOLERANCE,
): Promise<CrystalSymmetryResult> {
  if (!Number.isFinite(tolerance) || tolerance <= 0) {
    throw new RangeError('Symmetry tolerance must be a positive finite distance in ångström.');
  }
  assertOrdered(document);
  const cell = crystalToMoyoCell(document);
  const module = await loadMoyo();
  const dataset = module.analyze_cell(JSON.stringify(cell), tolerance, MOYO_SETTING);
  const group = module.space_group_type(dataset.number);
  return {
    number: dataset.number,
    hmSymbol: dataset.hm_symbol,
    hallNumber: dataset.hall_number,
    crystalSystem: group.crystal_system.toLowerCase(),
    pointGroup: group.geometric_crystal_class,
    pearsonSymbol: dataset.pearson_symbol,
    operations: dataset.operations.map(
      (operation): CrystalSymmetryOperation => ({
        rotation: normalizeRotation(operation.rotation),
        translation: [operation.translation[0], operation.translation[1], operation.translation[2]],
      }),
    ),
    wyckoffs: [...dataset.wyckoffs],
    siteSymmetrySymbols: [...dataset.site_symmetry_symbols],
    orbits: [...dataset.orbits],
    standardized: documentFromSymmetryCell(document, dataset.std_cell, 'standardized', tolerance),
    primitive: documentFromSymmetryCell(document, dataset.prim_std_cell, 'primitive', tolerance),
    tolerance,
  };
}

const wrapFractional = (value: number): number => {
  const wrapped = value - Math.floor(value);
  return Object.is(wrapped, -0) ? 0 : wrapped;
};

export function applySymmetryOperation(fractional: Vec3, operation: CrystalSymmetryOperation): Vec3 {
  const [r0, r1, r2, r3, r4, r5, r6, r7, r8] = operation.rotation;
  const [t0, t1, t2] = operation.translation;
  return [
    wrapFractional(r0 * fractional[0] + r1 * fractional[1] + r2 * fractional[2] + t0),
    wrapFractional(r3 * fractional[0] + r4 * fractional[1] + r5 * fractional[2] + t1),
    wrapFractional(r6 * fractional[0] + r7 * fractional[1] + r8 * fractional[2] + t2),
  ];
}

export function generateEquivalentSites(document: CrystalDocument, result: CrystalSymmetryResult): CrystalDocument {
  const sites: CrystalSite[] = [];
  const seen = new Set<string>();
  for (const site of document.sites) {
    for (const operation of result.operations) {
      const fractional = applySymmetryOperation(site.fractional, operation);
      const key = `${site.element}|${fractional.map((value) => Math.round(value / result.tolerance)).join('|')}`;
      if (seen.has(key)) continue;
      seen.add(key);
      if (sites.length >= MAX_EQUIVALENT_SITES) {
        throw new RangeError(
          `Equivalent-site generation would exceed the ${MAX_EQUIVALENT_SITES.toLocaleString()}-site limit.`,
        );
      }
      sites.push({ ...site, id: `${site.id}@sym-${sites.length + 1}`, fractional });
    }
  }
  return {
    ...document,
    id: `${document.id}-equivalent-sites`,
    name: `${document.name} — symmetry-equivalent sites`,
    sites,
    provenance: [
      ...document.provenance,
      {
        kind: 'symmetry-equivalent-sites',
        label: `Generated ${sites.length} symmetry-equivalent sites`,
        detail: `${result.hmSymbol} at tolerance ${result.tolerance} Å`,
      },
    ],
  };
}

export function standardizeCrystal(
  document: CrystalDocument,
  result: CrystalSymmetryResult,
  mode: 'conventional' | 'primitive',
): CrystalDocument {
  const source = mode === 'primitive' ? result.primitive : result.standardized;
  return {
    ...source,
    provenance: [
      ...document.provenance,
      {
        kind: 'symmetry-standardize',
        label: `Standardized to the ${mode} cell`,
        detail: `${result.hmSymbol} (#${result.number}) at tolerance ${result.tolerance} Å`,
      },
    ],
  };
}

export function validateSourceSymmetry(
  document: CrystalDocument,
  result: CrystalSymmetryResult,
  tolerance: number,
): readonly StructureHealthFinding[] {
  const findings: StructureHealthFinding[] = [];
  result.operations.forEach((operation, index) => {
    const siteIds = document.sites
      .filter((site) => {
        const mapped = applySymmetryOperation(site.fractional, operation);
        return !document.sites.some(
          (candidate) =>
            candidate.element === site.element &&
            periodicDistance(mapped, candidate.fractional, document.cell) <= tolerance,
        );
      })
      .map((site) => site.id);
    if (siteIds.length > 0) {
      findings.push({
        id: `symmetry-operation-${index + 1}`,
        severity: 'warning',
        message: `Symmetry operation ${index + 1} of ${result.hmSymbol} does not map every site onto an equivalent site within ${tolerance} Å.`,
        siteIds,
      });
    }
  });
  return findings;
}

export function reflectionAllowed(
  hkl: readonly [number, number, number],
  operations: readonly CrystalSymmetryOperation[],
  tolerance: number = DEFAULT_TOLERANCE,
): boolean {
  if (!hkl.every(Number.isInteger)) throw new RangeError('Reflection indices must be integers.');
  if (!Number.isFinite(tolerance) || tolerance <= 0) {
    throw new RangeError('Reflection tolerance must be a positive finite number.');
  }
  for (const operation of operations) {
    const [r0, r1, r2, r3, r4, r5, r6, r7, r8] = operation.rotation;
    const image = [
      hkl[0] * r0 + hkl[1] * r3 + hkl[2] * r6,
      hkl[0] * r1 + hkl[1] * r4 + hkl[2] * r7,
      hkl[0] * r2 + hkl[1] * r5 + hkl[2] * r8,
    ];
    if (image[0] !== hkl[0] || image[1] !== hkl[1] || image[2] !== hkl[2]) continue;
    const phase =
      hkl[0] * operation.translation[0] +
      hkl[1] * operation.translation[1] +
      hkl[2] * operation.translation[2];
    if (Math.abs(phase - Math.round(phase)) > tolerance) return false;
  }
  return true;
}
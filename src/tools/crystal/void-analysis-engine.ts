import { getElementReference } from './element-data';
import { periodicDistance } from './periodic-engine';
import type { CrystalDocument, Vec3 } from './crystal-types';

const DEFAULT_MAX_POINTS = 250_000;

export interface VoidAnalysisOptions {
  readonly gridSpacing: number;
  readonly probeRadius: number;
  readonly atomRadiusScale?: number;
  readonly maxPoints?: number;
}

export interface VoidAnalysisAssumptions {
  readonly gridSpacing: number;
  readonly probeRadius: number;
  readonly atomRadiusScale: number;
  readonly radiusBasis: 'scaled-covalent-radius';
  readonly connectivity: 'periodic-6-neighbor';
}

export interface VoidComponent {
  readonly id: string;
  readonly voxelCount: number;
  readonly fraction: number;
  readonly accessibleVoxelCount: number;
  readonly accessible: boolean;
  readonly voxelIndices: readonly number[];
}

export interface VoidAnalysisResult {
  readonly dimensions: readonly [number, number, number];
  readonly gridPointCount: number;
  readonly occupiedFraction: number;
  readonly voidFraction: number;
  readonly accessibleFraction: number;
  readonly components: readonly VoidComponent[];
  readonly assumptions: VoidAnalysisAssumptions;
}

export interface IsolatedVoidComponent {
  readonly component: VoidComponent;
  readonly points: readonly Vec3[];
}

function assertPositiveFinite(value: number, label: string): void {
  if (!Number.isFinite(value) || value <= 0) throw new RangeError(`${label} must be a positive finite number.`);
}

function offset(x: number, y: number, z: number, dimensions: readonly [number, number, number]): number {
  return x + dimensions[0] * (y + dimensions[1] * z);
}

function coordinates(index: number, dimensions: readonly [number, number, number]): readonly [number, number, number] {
  const x = index % dimensions[0];
  const yz = Math.floor(index / dimensions[0]);
  const y = yz % dimensions[1];
  const z = Math.floor(yz / dimensions[1]);
  return [x, y, z];
}

function fractionalCenter(
  x: number,
  y: number,
  z: number,
  dimensions: readonly [number, number, number],
): Vec3 {
  return [
    (x + 0.5) / dimensions[0],
    (y + 0.5) / dimensions[1],
    (z + 0.5) / dimensions[2],
  ];
}

function wrapped(value: number, size: number): number {
  return (value + size) % size;
}

export function analyzePeriodicVoids(
  document: CrystalDocument,
  options: VoidAnalysisOptions,
): VoidAnalysisResult {
  assertPositiveFinite(options.gridSpacing, 'Void grid spacing');
  if (!Number.isFinite(options.probeRadius) || options.probeRadius < 0) {
    throw new RangeError('Probe radius must be a non-negative finite number.');
  }
  const atomRadiusScale = options.atomRadiusScale ?? 1;
  assertPositiveFinite(atomRadiusScale, 'Atom radius scale');
  const maxPoints = options.maxPoints ?? DEFAULT_MAX_POINTS;
  if (!Number.isSafeInteger(maxPoints) || maxPoints <= 0) {
    throw new RangeError('Void grid point limit must be a positive integer.');
  }
  if (document.sites.length === 0) throw new RangeError('Void analysis requires at least one atomic site.');

  const dimensions: [number, number, number] = [
    Math.max(2, Math.ceil(document.cell.a / options.gridSpacing)),
    Math.max(2, Math.ceil(document.cell.b / options.gridSpacing)),
    Math.max(2, Math.ceil(document.cell.c / options.gridSpacing)),
  ];
  const gridPointCount = dimensions[0] * dimensions[1] * dimensions[2];
  if (!Number.isSafeInteger(gridPointCount) || gridPointCount > maxPoints) {
    throw new RangeError(
      `Void grid would contain ${gridPointCount.toLocaleString()} points, exceeding the ${maxPoints.toLocaleString()}-point limit; increase grid spacing.`,
    );
  }

  const radiusBySite = new Map<string, number>();
  for (const site of document.sites) {
    const radius = getElementReference(site.element)?.covalentRadius;
    if (radius === null || radius === undefined || !Number.isFinite(radius) || radius <= 0) {
      throw new RangeError(
        `Void analysis cannot infer an exclusion radius for element "${site.element}". Supply a supported atomic model before running the grid.`,
      );
    }
    radiusBySite.set(site.id, radius * atomRadiusScale);
  }

  const voidMask = new Uint8Array(gridPointCount);
  const accessibleMask = new Uint8Array(gridPointCount);
  let voidCount = 0;
  let accessibleCount = 0;

  for (let z = 0; z < dimensions[2]; z += 1) {
    for (let y = 0; y < dimensions[1]; y += 1) {
      for (let x = 0; x < dimensions[0]; x += 1) {
        const fractional = fractionalCenter(x, y, z, dimensions);
        let minimumSurfaceClearance = Number.POSITIVE_INFINITY;
        for (const site of document.sites) {
          const clearance = periodicDistance(fractional, site.fractional, document.cell) - radiusBySite.get(site.id)!;
          minimumSurfaceClearance = Math.min(minimumSurfaceClearance, clearance);
        }
        const index = offset(x, y, z, dimensions);
        if (minimumSurfaceClearance > 0) {
          voidMask[index] = 1;
          voidCount += 1;
          if (minimumSurfaceClearance + 1e-12 >= options.probeRadius) {
            accessibleMask[index] = 1;
            accessibleCount += 1;
          }
        }
      }
    }
  }

  const visited = new Uint8Array(gridPointCount);
  const components: VoidComponent[] = [];
  const neighbors = [
    [1, 0, 0], [-1, 0, 0],
    [0, 1, 0], [0, -1, 0],
    [0, 0, 1], [0, 0, -1],
  ] as const;

  for (let seed = 0; seed < gridPointCount; seed += 1) {
    if (!voidMask[seed] || visited[seed]) continue;
    const queue = [seed];
    const voxels: number[] = [];
    let head = 0;
    let accessibleVoxels = 0;
    visited[seed] = 1;

    while (head < queue.length) {
      const current = queue[head++]!;
      voxels.push(current);
      if (accessibleMask[current]) accessibleVoxels += 1;
      const [x, y, z] = coordinates(current, dimensions);
      for (const [dx, dy, dz] of neighbors) {
        const neighbor = offset(
          wrapped(x + dx, dimensions[0]),
          wrapped(y + dy, dimensions[1]),
          wrapped(z + dz, dimensions[2]),
          dimensions,
        );
        if (!voidMask[neighbor] || visited[neighbor]) continue;
        visited[neighbor] = 1;
        queue.push(neighbor);
      }
    }

    components.push({
      id: `void-${components.length + 1}`,
      voxelCount: voxels.length,
      fraction: voxels.length / gridPointCount,
      accessibleVoxelCount: accessibleVoxels,
      accessible: accessibleVoxels > 0,
      voxelIndices: voxels,
    });
  }

  components.sort((left, right) => right.voxelCount - left.voxelCount || left.id.localeCompare(right.id));
  const normalizedComponents = components.map((component, index) => ({
    ...component,
    id: `void-${index + 1}`,
  }));

  return {
    dimensions,
    gridPointCount,
    occupiedFraction: (gridPointCount - voidCount) / gridPointCount,
    voidFraction: voidCount / gridPointCount,
    accessibleFraction: accessibleCount / gridPointCount,
    components: normalizedComponents,
    assumptions: {
      gridSpacing: options.gridSpacing,
      probeRadius: options.probeRadius,
      atomRadiusScale,
      radiusBasis: 'scaled-covalent-radius',
      connectivity: 'periodic-6-neighbor',
    },
  };
}

export function isolateVoidComponent(
  result: VoidAnalysisResult,
  componentId: string,
): IsolatedVoidComponent {
  const component = result.components.find((candidate) => candidate.id === componentId);
  if (!component) throw new RangeError(`Unknown void component: ${componentId}`);
  const points = component.voxelIndices.map((index) => {
    const [x, y, z] = coordinates(index, result.dimensions);
    return fractionalCenter(x, y, z, result.dimensions);
  });
  return { component, points };
}

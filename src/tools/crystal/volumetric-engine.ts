import { cellToMatrix, fractionalToCartesian } from './cell-engine';
import type { Mat3, UnitCell, Vec3 } from './crystal-types';

const BOHR_TO_ANGSTROM = 0.529177210903;
const MAX_GRID_POINTS = 8_000_000;
const MAX_SURFACE_TRIANGLES = 200_000;

export type ScalarGridSourceFormat = 'cube' | 'xsf' | 'ccp4' | 'derived';

export interface ScalarGrid {
  readonly name: string;
  readonly sourceFormat: ScalarGridSourceFormat;
  readonly dimensions: readonly [number, number, number];
  /** Cartesian origin in ångström. */
  readonly origin: Vec3;
  /** Cartesian step vectors for +1 grid index along x/y/z, in ångström. */
  readonly axes: Mat3;
  /** Canonical x-fastest storage: x + nx * (y + ny * z). */
  readonly values: readonly number[];
  readonly periodic: boolean;
  readonly valueUnit: string;
}

export type OrthogonalAxis = 'x' | 'y' | 'z';

export interface ScalarSlice {
  readonly width: number;
  readonly height: number;
  readonly values: readonly number[];
  readonly label: string;
}

export interface PlaneSliceOptions {
  /** Normalized grid-fraction coordinate of the first sample. */
  readonly origin: Vec3;
  /** Normalized grid-fraction vector across the slice width. */
  readonly u: Vec3;
  /** Normalized grid-fraction vector across the slice height. */
  readonly v: Vec3;
  readonly width: number;
  readonly height: number;
}

export interface ResampleOptions {
  readonly maxPoints: number;
}

export interface Isosurface {
  readonly level: number;
  readonly vertices: readonly Vec3[];
  readonly triangles: readonly (readonly [number, number, number])[];
  readonly sourceRange: readonly [number, number];
}

function parseFinite(raw: string, context: string): number {
  const value = Number(raw);
  if (!Number.isFinite(value)) throw new RangeError(`Invalid numeric value "${raw}" ${context}.`);
  return value;
}

function parseInteger(raw: string, context: string): number {
  const value = Number(raw);
  if (!Number.isSafeInteger(value)) throw new RangeError(`Invalid integer value "${raw}" ${context}.`);
  return value;
}

function assertGridSize(dimensions: readonly [number, number, number]): number {
  if (!dimensions.every((value) => Number.isSafeInteger(value) && value > 0)) {
    throw new RangeError('Scalar-grid dimensions must be positive integers.');
  }
  const count = dimensions[0] * dimensions[1] * dimensions[2];
  if (!Number.isSafeInteger(count) || count > MAX_GRID_POINTS) {
    throw new RangeError(`Scalar grid exceeds the ${MAX_GRID_POINTS.toLocaleString()}-point browser limit.`);
  }
  return count;
}

const vectorScale = (value: Vec3, scale: number): Vec3 =>
  [value[0] * scale, value[1] * scale, value[2] * scale];

const vectorAdd = (left: Vec3, right: Vec3): Vec3 =>
  [left[0] + right[0], left[1] + right[1], left[2] + right[2]];

function gridOffset(x: number, y: number, z: number, dimensions: readonly [number, number, number]): number {
  return x + dimensions[0] * (y + dimensions[1] * z);
}

function parseVector(fields: readonly string[], context: string): Vec3 {
  if (fields.length < 3) throw new RangeError(`${context} requires three numeric components.`);
  return [
    parseFinite(fields[0]!, context),
    parseFinite(fields[1]!, context),
    parseFinite(fields[2]!, context),
  ];
}

/**
 * Parse the conventional Gaussian CUBE scalar-grid layout. Positive voxel
 * counts use atomic units (Bohr); negative counts are treated as ångström.
 * Multiple-valued/orbital CUBE variants are intentionally rejected instead of
 * being guessed.
 */
export function parseCubeGrid(filename: string, text: string): ScalarGrid {
  const lines = text.replace(/\r\n?/gu, '\n').split('\n');
  if (lines.length < 6) throw new RangeError('CUBE input is too short.');
  const atomLine = lines[2]!.trim().split(/\s+/u).filter(Boolean);
  if (atomLine.length < 4) throw new RangeError('CUBE atom-count/origin record is incomplete.');
  const atomCountRaw = parseInteger(atomLine[0]!, 'in the CUBE atom-count record');
  const atomCount = Math.abs(atomCountRaw);
  const rawOrigin = parseVector(atomLine.slice(1, 4), 'CUBE origin');

  const counts: number[] = [];
  const rawAxes: Vec3[] = [];
  for (let axis = 0; axis < 3; axis += 1) {
    const fields = lines[3 + axis]!.trim().split(/\s+/u).filter(Boolean);
    if (fields.length < 4) throw new RangeError(`CUBE grid-axis record ${axis + 1} is incomplete.`);
    const count = parseInteger(fields[0]!, `in CUBE grid-axis record ${axis + 1}`);
    if (count === 0) throw new RangeError('CUBE voxel counts must not be zero.');
    counts.push(count);
    rawAxes.push(parseVector(fields.slice(1, 4), `CUBE grid-axis ${axis + 1}`));
  }

  const signs = new Set(counts.map((count) => Math.sign(count)));
  if (signs.size !== 1) throw new RangeError('CUBE voxel-count unit signs must be consistent on all three axes.');
  const scale = counts[0]! > 0 ? BOHR_TO_ANGSTROM : 1;
  const dimensions = counts.map(Math.abs) as [number, number, number];
  const total = assertGridSize(dimensions);

  let dataStart = 6 + atomCount;
  if (dataStart > lines.length) throw new RangeError('CUBE atom records are truncated.');
  if (atomCountRaw < 0) {
    if (dataStart >= lines.length) throw new RangeError('CUBE orbital descriptor is missing.');
    const orbitalHeader = lines[dataStart]!.trim().split(/\s+/u).filter(Boolean);
    const orbitalCount = parseInteger(orbitalHeader[0] ?? '', 'in the CUBE orbital descriptor');
    if (orbitalCount !== 1) {
      throw new RangeError('Only single-valued CUBE scalar fields are supported; multi-orbital CUBE data must be split before import.');
    }
    dataStart += 1;
  }

  const dataTokens = lines.slice(dataStart).join(' ').trim().split(/\s+/u).filter(Boolean);
  if (dataTokens.length !== total) {
    throw new RangeError(`CUBE scalar count mismatch: expected ${total.toLocaleString()}, found ${dataTokens.length.toLocaleString()}.`);
  }
  const values = dataTokens.map((raw, index) => parseFinite(raw, `at CUBE scalar ${index + 1}`));

  return {
    name: filename || 'CUBE field',
    sourceFormat: 'cube',
    dimensions,
    origin: vectorScale(rawOrigin, scale),
    axes: rawAxes.map((axis) => vectorScale(axis, scale)) as unknown as Mat3,
    values,
    periodic: false,
    valueUnit: 'source units',
  };
}

/** Parse the first XCrySDen XSF BEGIN_DATAGRID_3D block. */
export function parseXsfGrid(filename: string, text: string): ScalarGrid {
  const lines = text.replace(/\r\n?/gu, '\n').split('\n');
  const begin = lines.findIndex((line) => /^\s*BEGIN_DATAGRID_3D(?:_|\s|$)/iu.test(line));
  if (begin < 0) throw new RangeError('XSF input does not contain a BEGIN_DATAGRID_3D block.');
  if (begin + 5 >= lines.length) throw new RangeError('XSF DATAGRID_3D header is truncated.');

  const dimensionsFields = lines[begin + 1]!.trim().split(/\s+/u).filter(Boolean);
  if (dimensionsFields.length < 3) throw new RangeError('XSF DATAGRID_3D dimensions are incomplete.');
  const dimensions: [number, number, number] = [
    parseInteger(dimensionsFields[0]!, 'in XSF nx'),
    parseInteger(dimensionsFields[1]!, 'in XSF ny'),
    parseInteger(dimensionsFields[2]!, 'in XSF nz'),
  ];
  const total = assertGridSize(dimensions);
  const origin = parseVector(lines[begin + 2]!.trim().split(/\s+/u).filter(Boolean), 'XSF grid origin');
  const spans = [
    parseVector(lines[begin + 3]!.trim().split(/\s+/u).filter(Boolean), 'XSF grid vector 1'),
    parseVector(lines[begin + 4]!.trim().split(/\s+/u).filter(Boolean), 'XSF grid vector 2'),
    parseVector(lines[begin + 5]!.trim().split(/\s+/u).filter(Boolean), 'XSF grid vector 3'),
  ] as const;
  const axes: Mat3 = [
    vectorScale(spans[0], 1 / Math.max(1, dimensions[0] - 1)),
    vectorScale(spans[1], 1 / Math.max(1, dimensions[1] - 1)),
    vectorScale(spans[2], 1 / Math.max(1, dimensions[2] - 1)),
  ];

  const end = lines.findIndex((line, index) => index > begin + 5 && /^\s*END_DATAGRID_3D/iu.test(line));
  if (end < 0) throw new RangeError('XSF DATAGRID_3D block is missing END_DATAGRID_3D.');
  const tokens = lines.slice(begin + 6, end).join(' ').trim().split(/\s+/u).filter(Boolean);
  if (tokens.length !== total) {
    throw new RangeError(`XSF scalar count mismatch: expected ${total.toLocaleString()}, found ${tokens.length.toLocaleString()}.`);
  }

  return {
    name: filename || 'XSF field',
    sourceFormat: 'xsf',
    dimensions,
    origin,
    axes,
    values: tokens.map((raw, index) => parseFinite(raw, `at XSF scalar ${index + 1}`)),
    periodic: true,
    valueUnit: 'source units',
  };
}

function plausibleCcp4Header(view: DataView, littleEndian: boolean): boolean {
  const nc = view.getInt32(0, littleEndian);
  const nr = view.getInt32(4, littleEndian);
  const ns = view.getInt32(8, littleEndian);
  const mode = view.getInt32(12, littleEndian);
  return [nc, nr, ns].every((value) => Number.isSafeInteger(value) && value > 0 && value <= 8192)
    && (mode === 0 || mode === 2);
}

function ccp4Endian(view: DataView): boolean {
  const stamp0 = view.getUint8(212);
  const stamp1 = view.getUint8(213);
  if (stamp0 === 0x44 && (stamp1 === 0x41 || stamp1 === 0x44 || stamp1 === 0x00)) return true;
  if (stamp0 === 0x11 && stamp1 === 0x11) return false;
  if (plausibleCcp4Header(view, true)) return true;
  if (plausibleCcp4Header(view, false)) return false;
  throw new RangeError('CCP4/MRC header endianness could not be determined safely.');
}

function ascii(view: DataView, start: number, length: number): string {
  let result = '';
  for (let index = 0; index < length; index += 1) result += String.fromCharCode(view.getUint8(start + index));
  return result;
}

/**
 * Read the maintainable CCP4/MRC subset used by the Studio: mode 2 float maps
 * and mode 0 signed-byte masks, with canonical MAPC/MAPR/MAPS reordering.
 */
export function parseCcp4Grid(filename: string, buffer: ArrayBuffer): ScalarGrid {
  if (buffer.byteLength < 1024) throw new RangeError('CCP4/MRC input is shorter than the 1024-byte header.');
  const view = new DataView(buffer);
  const little = ccp4Endian(view);
  const intWord = (word: number): number => view.getInt32((word - 1) * 4, little);
  const floatWord = (word: number): number => view.getFloat32((word - 1) * 4, little);

  const nc = intWord(1), nr = intWord(2), ns = intWord(3), mode = intWord(4);
  const mapc = intWord(17), mapr = intWord(18), maps = intWord(19);
  if (new Set([mapc, mapr, maps]).size !== 3 || ![mapc, mapr, maps].every((axis) => axis >= 1 && axis <= 3)) {
    throw new RangeError('CCP4/MRC MAPC/MAPR/MAPS must be a permutation of axes 1, 2, 3.');
  }
  if (![0, 2].includes(mode)) throw new RangeError(`CCP4/MRC mode ${mode} is not supported; only mode 0 and mode 2 are accepted.`);
  const mapId = ascii(view, 208, 4);
  if (mapId !== 'MAP ') throw new RangeError('CCP4/MRC MAP identifier is missing from header word 53.');

  const fileCounts = [nc, nr, ns] as const;
  const dimensionsArray = [0, 0, 0];
  dimensionsArray[mapc - 1] = nc;
  dimensionsArray[mapr - 1] = nr;
  dimensionsArray[maps - 1] = ns;
  const dimensions = dimensionsArray as [number, number, number];
  const total = assertGridSize(dimensions);

  const sampling: [number, number, number] = [intWord(8), intWord(9), intWord(10)];
  if (!sampling.every((value) => Number.isSafeInteger(value) && value > 0)) {
    throw new RangeError('CCP4/MRC NX/NY/NZ sampling intervals must be positive.');
  }
  const cell: UnitCell = {
    a: floatWord(11), b: floatWord(12), c: floatWord(13),
    alpha: floatWord(14), beta: floatWord(15), gamma: floatWord(16),
  };
  const basis = cellToMatrix(cell);
  const axes: Mat3 = [
    vectorScale(basis[0], 1 / sampling[0]),
    vectorScale(basis[1], 1 / sampling[1]),
    vectorScale(basis[2], 1 / sampling[2]),
  ];

  const fileStarts = [intWord(5), intWord(6), intWord(7)];
  const starts = [0, 0, 0];
  starts[mapc - 1] = fileStarts[0]!;
  starts[mapr - 1] = fileStarts[1]!;
  starts[maps - 1] = fileStarts[2]!;
  const origin = fractionalToCartesian(
    [starts[0]! / sampling[0], starts[1]! / sampling[1], starts[2]! / sampling[2]],
    cell,
  );

  const symmetryBytes = intWord(24);
  if (!Number.isSafeInteger(symmetryBytes) || symmetryBytes < 0) {
    throw new RangeError('CCP4/MRC NSYMBT must be a non-negative byte count.');
  }
  const bytesPerValue = mode === 2 ? 4 : 1;
  const dataStart = 1024 + symmetryBytes;
  if (dataStart + total * bytesPerValue > buffer.byteLength) {
    throw new RangeError('CCP4/MRC map data are truncated.');
  }

  const values = new Array<number>(total);
  let fileIndex = 0;
  for (let section = 0; section < ns; section += 1) {
    for (let row = 0; row < nr; row += 1) {
      for (let column = 0; column < nc; column += 1) {
        const canonical = [0, 0, 0];
        canonical[mapc - 1] = column;
        canonical[mapr - 1] = row;
        canonical[maps - 1] = section;
        const value = mode === 2
          ? view.getFloat32(dataStart + fileIndex * 4, little)
          : view.getInt8(dataStart + fileIndex);
        if (!Number.isFinite(value)) throw new RangeError('CCP4/MRC map contains a non-finite scalar.');
        values[gridOffset(canonical[0]!, canonical[1]!, canonical[2]!, dimensions)] = value;
        fileIndex += 1;
      }
    }
  }

  return {
    name: filename || 'CCP4/MRC field',
    sourceFormat: 'ccp4',
    dimensions,
    origin,
    axes,
    values,
    periodic: true,
    valueUnit: 'source units',
  };
}

function sampleTrilinear(grid: ScalarGrid, normalized: Vec3): number {
  const [nx, ny, nz] = grid.dimensions;
  const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));
  const x = clamp01(normalized[0]) * Math.max(0, nx - 1);
  const y = clamp01(normalized[1]) * Math.max(0, ny - 1);
  const z = clamp01(normalized[2]) * Math.max(0, nz - 1);
  const x0 = Math.floor(x), y0 = Math.floor(y), z0 = Math.floor(z);
  const x1 = Math.min(nx - 1, x0 + 1), y1 = Math.min(ny - 1, y0 + 1), z1 = Math.min(nz - 1, z0 + 1);
  const tx = x - x0, ty = y - y0, tz = z - z0;
  const at = (ix: number, iy: number, iz: number): number => grid.values[gridOffset(ix, iy, iz, grid.dimensions)]!;

  const c00 = at(x0, y0, z0) * (1 - tx) + at(x1, y0, z0) * tx;
  const c10 = at(x0, y1, z0) * (1 - tx) + at(x1, y1, z0) * tx;
  const c01 = at(x0, y0, z1) * (1 - tx) + at(x1, y0, z1) * tx;
  const c11 = at(x0, y1, z1) * (1 - tx) + at(x1, y1, z1) * tx;
  const c0 = c00 * (1 - ty) + c10 * ty;
  const c1 = c01 * (1 - ty) + c11 * ty;
  return c0 * (1 - tz) + c1 * tz;
}

export function orthogonalSlice(grid: ScalarGrid, axis: OrthogonalAxis, index: number): ScalarSlice {
  if (!Number.isSafeInteger(index)) throw new RangeError('Slice index must be an integer.');
  const [nx, ny, nz] = grid.dimensions;
  const axisSize = axis === 'x' ? nx : axis === 'y' ? ny : nz;
  if (index < 0 || index >= axisSize) throw new RangeError(`${axis.toUpperCase()} slice index is outside the grid.`);

  const values: number[] = [];
  let width: number;
  let height: number;
  if (axis === 'x') {
    width = ny; height = nz;
    for (let z = 0; z < nz; z += 1) for (let y = 0; y < ny; y += 1) {
      values.push(grid.values[gridOffset(index, y, z, grid.dimensions)]!);
    }
  } else if (axis === 'y') {
    width = nx; height = nz;
    for (let z = 0; z < nz; z += 1) for (let x = 0; x < nx; x += 1) {
      values.push(grid.values[gridOffset(x, index, z, grid.dimensions)]!);
    }
  } else {
    width = nx; height = ny;
    for (let y = 0; y < ny; y += 1) for (let x = 0; x < nx; x += 1) {
      values.push(grid.values[gridOffset(x, y, index, grid.dimensions)]!);
    }
  }
  return { width, height, values, label: `${axis.toUpperCase()} index ${index}` };
}

export function samplePlaneSlice(grid: ScalarGrid, options: PlaneSliceOptions): ScalarSlice {
  if (!Number.isSafeInteger(options.width) || !Number.isSafeInteger(options.height)
    || options.width < 2 || options.height < 2 || options.width * options.height > 1_000_000) {
    throw new RangeError('Plane slice width and height must be integers >= 2 with at most 1,000,000 samples.');
  }
  if (![...options.origin, ...options.u, ...options.v].every(Number.isFinite)) {
    throw new RangeError('Plane slice vectors must contain finite values.');
  }
  const values: number[] = [];
  for (let row = 0; row < options.height; row += 1) {
    const tv = row / (options.height - 1);
    for (let column = 0; column < options.width; column += 1) {
      const tu = column / (options.width - 1);
      const position: Vec3 = [
        options.origin[0] + options.u[0] * tu + options.v[0] * tv,
        options.origin[1] + options.u[1] * tu + options.v[1] * tv,
        options.origin[2] + options.u[2] * tu + options.v[2] * tv,
      ];
      values.push(sampleTrilinear(grid, position));
    }
  }
  return { width: options.width, height: options.height, values, label: 'Arbitrary plane' };
}

export function resampleScalarGrid(grid: ScalarGrid, options: ResampleOptions): ScalarGrid {
  if (!Number.isSafeInteger(options.maxPoints) || options.maxPoints < 1) {
    throw new RangeError('Resampling point limit must be a positive integer.');
  }
  const dimensions = [...grid.dimensions] as [number, number, number];
  const count = (): number => dimensions[0] * dimensions[1] * dimensions[2];
  while (count() > options.maxPoints) {
    let candidate = -1;
    let largest = -1;
    for (let axis = 0; axis < 3; axis += 1) {
      if (dimensions[axis]! > 1 && dimensions[axis]! > largest) {
        largest = dimensions[axis]!;
        candidate = axis;
      }
    }
    if (candidate < 0) break;
    dimensions[candidate]! -= 1;
  }

  if (dimensions[0] === grid.dimensions[0]
    && dimensions[1] === grid.dimensions[1]
    && dimensions[2] === grid.dimensions[2]) return { ...grid };

  const values: number[] = [];
  for (let z = 0; z < dimensions[2]; z += 1) {
    for (let y = 0; y < dimensions[1]; y += 1) {
      for (let x = 0; x < dimensions[0]; x += 1) {
        values.push(sampleTrilinear(grid, [
          dimensions[0] === 1 ? 0.5 : x / (dimensions[0] - 1),
          dimensions[1] === 1 ? 0.5 : y / (dimensions[1] - 1),
          dimensions[2] === 1 ? 0.5 : z / (dimensions[2] - 1),
        ]));
      }
    }
  }

  const axes: Mat3 = grid.axes.map((axis, axisIndex) => {
    const originalCount = grid.dimensions[axisIndex]!;
    const nextCount = dimensions[axisIndex]!;
    const spanScale = nextCount > 1 ? (originalCount - 1) / (nextCount - 1) : 0;
    return vectorScale(axis, spanScale);
  }) as unknown as Mat3;

  return { ...grid, dimensions, axes, values, name: `${grid.name} (resampled)` };
}

function gridPoint(grid: ScalarGrid, x: number, y: number, z: number): Vec3 {
  return vectorAdd(
    grid.origin,
    vectorAdd(
      vectorScale(grid.axes[0], x),
      vectorAdd(vectorScale(grid.axes[1], y), vectorScale(grid.axes[2], z)),
    ),
  );
}

function interpolateIso(a: Vec3, b: Vec3, va: number, vb: number, level: number): Vec3 {
  if (Math.abs(vb - va) < 1e-15) return a;
  const t = Math.min(1, Math.max(0, (level - va) / (vb - va)));
  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ];
}

const TETRAHEDRA = [
  [0, 5, 1, 6],
  [0, 1, 2, 6],
  [0, 2, 3, 6],
  [0, 3, 7, 6],
  [0, 7, 4, 6],
  [0, 4, 5, 6],
] as const;
const TETRA_EDGES = [[0, 1], [0, 2], [0, 3], [1, 2], [1, 3], [2, 3]] as const;

export function extractIsosurface(grid: ScalarGrid, level: number): Isosurface {
  if (!Number.isFinite(level)) throw new RangeError('Isosurface level must be finite.');
  const [nx, ny, nz] = grid.dimensions;
  if (nx < 2 || ny < 2 || nz < 2) throw new RangeError('Isosurface extraction requires at least 2 samples along each axis.');
  const min = Math.min(...grid.values);
  const max = Math.max(...grid.values);
  if (level < min || level > max) return { level, vertices: [], triangles: [], sourceRange: [min, max] };

  const vertices: Vec3[] = [];
  const triangles: [number, number, number][] = [];
  const cornerDeltas = [
    [0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0],
    [0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1],
  ] as const;

  for (let z = 0; z < nz - 1; z += 1) {
    for (let y = 0; y < ny - 1; y += 1) {
      for (let x = 0; x < nx - 1; x += 1) {
        const positions = cornerDeltas.map(([dx, dy, dz]) => gridPoint(grid, x + dx, y + dy, z + dz));
        const values = cornerDeltas.map(([dx, dy, dz]) =>
          grid.values[gridOffset(x + dx, y + dy, z + dz, grid.dimensions)]!);

        for (const tetra of TETRAHEDRA) {
          const intersections: Vec3[] = [];
          const keys = new Set<string>();
          for (const [ea, eb] of TETRA_EDGES) {
            const ia = tetra[ea]!, ib = tetra[eb]!;
            const va = values[ia]!, vb = values[ib]!;
            const aSide = va - level;
            const bSide = vb - level;
            if (aSide * bSide > 0) continue;
            if (aSide === 0 && bSide === 0) continue;
            const point = interpolateIso(positions[ia]!, positions[ib]!, va, vb, level);
            const key = point.map((value) => value.toPrecision(12)).join(',');
            if (!keys.has(key)) {
              keys.add(key);
              intersections.push(point);
            }
          }
          if (intersections.length < 3) continue;

          const base = vertices.length;
          vertices.push(...intersections);
          if (intersections.length === 3) {
            triangles.push([base, base + 1, base + 2]);
          } else {
            for (let index = 1; index + 1 < intersections.length; index += 1) {
              triangles.push([base, base + index, base + index + 1]);
            }
          }
          if (triangles.length > MAX_SURFACE_TRIANGLES) {
            throw new RangeError(`Isosurface exceeds the ${MAX_SURFACE_TRIANGLES.toLocaleString()}-triangle browser limit; resample the grid or choose another level.`);
          }
        }
      }
    }
  }

  return { level, vertices, triangles, sourceRange: [min, max] };
}

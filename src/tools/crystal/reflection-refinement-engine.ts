import { cellVolume } from './cell-engine';
import { structureFactor } from './structure-factor-engine';
import type { CrystalDocument, Vec3 } from './crystal-types';
import type { MillerIndex } from './reciprocal-engine';

const MAX_REFLECTIONS = 200_000;
const MAX_GRID_POINTS = 262_144;
const TWO_PI = Math.PI * 2;

export interface ObservedReflection {
  readonly hkl: MillerIndex;
  readonly observedAmplitude: number;
  readonly sigma?: number;
}

export interface ReflectionResidualInput {
  readonly observedAmplitude: number;
  readonly calculatedAmplitude: number;
  readonly weight?: number;
}

export interface ReflectionResidualMetrics {
  readonly r1: number;
  readonly weightedR2: number;
  readonly formulae: {
    readonly r1: string;
    readonly weightedR2: string;
  };
}

export interface DifferenceFourierOptions {
  readonly nx: number;
  readonly ny: number;
  readonly nz: number;
}

export interface DifferenceFourierGrid {
  readonly dimensions: readonly [number, number, number];
  readonly values: readonly number[];
  readonly min: number;
  readonly max: number;
  readonly volume: number;
  readonly modelDependentPhases: true;
  readonly phaseNote: string;
}

export interface ResidualDensityPeak {
  readonly index: readonly [number, number, number];
  readonly fractional: Vec3;
  readonly value: number;
}

export interface ResidualDensityExtrema {
  readonly maxima: readonly ResidualDensityPeak[];
  readonly minima: readonly ResidualDensityPeak[];
}

function finiteNumber(raw: string, context: string): number {
  const value = Number(raw);
  if (!Number.isFinite(value)) throw new RangeError(`Invalid numeric value "${raw}" ${context}.`);
  return value;
}

function assertGridDimension(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 2 || value > 128) {
    throw new RangeError(`${label} must be an integer from 2 through 128.`);
  }
}

/**
 * Parse the common supported SHELX-style text subset:
 * h k l Fo sigma(Fo). A 0 0 0 record terminates the dataset. Blank/comment
 * lines are ignored. The parser intentionally does not guess alternate column
 * layouts; callers must map those before use.
 */
export function parseObservedReflections(filename: string, text: string): readonly ObservedReflection[] {
  if (!text.trim()) throw new RangeError('Observed reflection file is empty.');
  const reflections: ObservedReflection[] = [];
  const lines = text.split(/\r?\n/u);

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex]!.trim();
    if (!line || line.startsWith('#') || line.startsWith('!')) continue;
    const fields = line.split(/[\s,;]+/u).filter(Boolean);
    if (fields.length < 4) {
      throw new RangeError(`Line ${lineIndex + 1} of ${filename || 'reflection input'} needs h k l and Fo columns.`);
    }

    const h = finiteNumber(fields[0]!, `for h on line ${lineIndex + 1}`);
    const k = finiteNumber(fields[1]!, `for k on line ${lineIndex + 1}`);
    const l = finiteNumber(fields[2]!, `for l on line ${lineIndex + 1}`);
    if (![h, k, l].every(Number.isSafeInteger)) {
      throw new RangeError(`Reflection indices on line ${lineIndex + 1} must be integers.`);
    }

    const observedAmplitude = finiteNumber(fields[3]!, `for Fo on line ${lineIndex + 1}`);
    if (h === 0 && k === 0 && l === 0) break;
    if (observedAmplitude < 0) {
      throw new RangeError(`Observed amplitude on line ${lineIndex + 1} must not be negative.`);
    }

    const sigma = fields[4] === undefined
      ? undefined
      : finiteNumber(fields[4], `for sigma(Fo) on line ${lineIndex + 1}`);
    if (sigma !== undefined && sigma <= 0) {
      throw new RangeError(`sigma(Fo) on line ${lineIndex + 1} must be positive when supplied.`);
    }

    reflections.push({
      hkl: [h, k, l],
      observedAmplitude,
      ...(sigma === undefined ? {} : { sigma }),
    });
    if (reflections.length > MAX_REFLECTIONS) {
      throw new RangeError(`Observed reflection input exceeds the ${MAX_REFLECTIONS.toLocaleString()}-reflection limit.`);
    }
  }

  if (reflections.length === 0) throw new RangeError('Observed reflection input contains no usable reflections.');
  return reflections;
}

export function reflectionResiduals(
  reflections: readonly ReflectionResidualInput[],
): ReflectionResidualMetrics {
  if (reflections.length === 0) throw new RangeError('Residual analysis requires at least one reflection.');

  let absoluteDifference = 0;
  let absoluteObserved = 0;
  let weightedSquareDifference = 0;
  let weightedObservedFourth = 0;

  reflections.forEach((reflection, index) => {
    const weight = reflection.weight ?? 1;
    if (![reflection.observedAmplitude, reflection.calculatedAmplitude, weight].every(Number.isFinite)) {
      throw new RangeError(`Reflection ${index + 1} contains a non-finite residual input.`);
    }
    if (reflection.observedAmplitude < 0 || reflection.calculatedAmplitude < 0) {
      throw new RangeError(`Reflection ${index + 1} amplitudes must not be negative.`);
    }
    if (weight <= 0) throw new RangeError(`Reflection ${index + 1} weight must be positive.`);

    const amplitudeDifference = Math.abs(reflection.observedAmplitude - reflection.calculatedAmplitude);
    const observedSquare = reflection.observedAmplitude * reflection.observedAmplitude;
    const calculatedSquare = reflection.calculatedAmplitude * reflection.calculatedAmplitude;
    absoluteDifference += amplitudeDifference;
    absoluteObserved += reflection.observedAmplitude;
    weightedSquareDifference += weight * (observedSquare - calculatedSquare) ** 2;
    weightedObservedFourth += weight * observedSquare * observedSquare;
  });

  return {
    r1: absoluteObserved > 0
      ? absoluteDifference / absoluteObserved
      : (absoluteDifference === 0 ? 0 : Number.POSITIVE_INFINITY),
    weightedR2: weightedObservedFourth > 0
      ? Math.sqrt(weightedSquareDifference / weightedObservedFourth)
      : (weightedSquareDifference === 0 ? 0 : Number.POSITIVE_INFINITY),
    formulae: {
      r1: 'R1 = Σ||Fo| − |Fc|| / Σ|Fo|',
      weightedR2: 'wR2 = √(Σw(Fo² − Fc²)² / ΣwFo⁴)',
    },
  };
}

export function differenceFourierGrid(
  document: CrystalDocument,
  reflections: readonly ObservedReflection[],
  options: DifferenceFourierOptions,
): DifferenceFourierGrid {
  const { nx, ny, nz } = options;
  assertGridDimension(nx, 'Grid nx');
  assertGridDimension(ny, 'Grid ny');
  assertGridDimension(nz, 'Grid nz');
  const total = nx * ny * nz;
  if (total > MAX_GRID_POINTS) {
    throw new RangeError(`Difference-Fourier grid exceeds the ${MAX_GRID_POINTS.toLocaleString()}-point browser limit.`);
  }
  if (reflections.length === 0) throw new RangeError('Difference-Fourier analysis requires observed reflections.');

  const terms = reflections.map((reflection) => {
    const calculated = structureFactor(document, reflection.hkl);
    const amplitude = Math.hypot(calculated.real, calculated.imag);
    const phase = Math.atan2(calculated.imag, calculated.real);
    return {
      hkl: reflection.hkl,
      deltaAmplitude: reflection.observedAmplitude - amplitude,
      phase,
    };
  });

  const volume = cellVolume(document.cell);
  const values = new Array<number>(total);
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  let offset = 0;

  for (let iz = 0; iz < nz; iz += 1) {
    const z = iz / nz;
    for (let iy = 0; iy < ny; iy += 1) {
      const y = iy / ny;
      for (let ix = 0; ix < nx; ix += 1) {
        const x = ix / nx;
        let density = 0;
        for (const term of terms) {
          const [h, k, l] = term.hkl;
          density += term.deltaAmplitude * Math.cos(term.phase - TWO_PI * (h * x + k * y + l * z));
        }
        density /= volume;
        values[offset++] = density;
        min = Math.min(min, density);
        max = Math.max(max, density);
      }
    }
  }

  return {
    dimensions: [nx, ny, nz],
    values,
    min,
    max,
    volume,
    modelDependentPhases: true,
    phaseNote: 'Difference density uses phases from the current calculated structural model; peaks are model-dependent and are not independent proof of atom positions.',
  };
}

function gridOffset(ix: number, iy: number, iz: number, nx: number, ny: number): number {
  return ix + nx * (iy + ny * iz);
}

function wrapped(value: number, size: number): number {
  return (value + size) % size;
}

export function rankResidualDensityPeaks(
  grid: DifferenceFourierGrid,
  limit: number = 10,
): ResidualDensityExtrema {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 1000) {
    throw new RangeError('Residual-density peak limit must be an integer from 1 through 1000.');
  }
  const [nx, ny, nz] = grid.dimensions;
  if (grid.values.length !== nx * ny * nz) throw new RangeError('Residual-density grid size does not match its dimensions.');

  const maxima: ResidualDensityPeak[] = [];
  const minima: ResidualDensityPeak[] = [];
  for (let iz = 0; iz < nz; iz += 1) {
    for (let iy = 0; iy < ny; iy += 1) {
      for (let ix = 0; ix < nx; ix += 1) {
        const value = grid.values[gridOffset(ix, iy, iz, nx, ny)]!;
        if (!Number.isFinite(value)) throw new RangeError('Residual-density grid contains a non-finite value.');

        let isMaximum = true;
        let isMinimum = true;
        for (let dz = -1; dz <= 1; dz += 1) {
          for (let dy = -1; dy <= 1; dy += 1) {
            for (let dx = -1; dx <= 1; dx += 1) {
              if (dx === 0 && dy === 0 && dz === 0) continue;
              const neighbor = grid.values[gridOffset(
                wrapped(ix + dx, nx),
                wrapped(iy + dy, ny),
                wrapped(iz + dz, nz),
                nx,
                ny,
              )]!;
              if (value < neighbor) isMaximum = false;
              if (value > neighbor) isMinimum = false;
            }
          }
        }

        const peak: ResidualDensityPeak = {
          index: [ix, iy, iz],
          fractional: [ix / nx, iy / ny, iz / nz],
          value,
        };
        if (isMaximum) maxima.push(peak);
        if (isMinimum) minima.push(peak);
      }
    }
  }

  maxima.sort((left, right) => right.value - left.value
    || left.index[2] - right.index[2]
    || left.index[1] - right.index[1]
    || left.index[0] - right.index[0]);
  minima.sort((left, right) => left.value - right.value
    || left.index[2] - right.index[2]
    || left.index[1] - right.index[1]
    || left.index[0] - right.index[0]);

  return {
    maxima: maxima.slice(0, limit),
    minima: minima.slice(0, limit),
  };
}

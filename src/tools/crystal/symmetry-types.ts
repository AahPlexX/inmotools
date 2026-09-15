import type { CrystalDocument, Vec3 } from './crystal-types';

export interface CrystalSymmetryOperation {
  readonly rotation: readonly [number, number, number, number, number, number, number, number, number];
  readonly translation: Vec3;
}

export interface CrystalSymmetryResult {
  readonly number: number;
  readonly hmSymbol: string;
  readonly hallNumber: number;
  readonly crystalSystem: string;
  readonly pointGroup: string;
  readonly pearsonSymbol: string;
  readonly operations: readonly CrystalSymmetryOperation[];
  readonly wyckoffs: readonly string[];
  readonly siteSymmetrySymbols: readonly string[];
  readonly orbits: readonly number[];
  readonly standardized: CrystalDocument;
  readonly primitive: CrystalDocument;
  readonly tolerance: number;
}

export interface SymmetryAdapterCell {
  readonly lattice: { readonly basis: readonly number[] };
  readonly positions: readonly (readonly [number, number, number])[];
  readonly numbers: readonly number[];
}
export type Vec3 = readonly [number, number, number];
export type Mat3 = readonly [Vec3, Vec3, Vec3];

export interface UnitCell {
  readonly a: number;
  readonly b: number;
  readonly c: number;
  readonly alpha: number;
  readonly beta: number;
  readonly gamma: number;
}

export interface CrystalSite {
  readonly id: string;
  readonly label: string;
  readonly element: string;
  readonly fractional: Vec3;
  readonly occupancy: number;
  readonly isotope?: number;
  readonly oxidationState?: number;
  readonly disorderAssembly?: string;
  readonly disorderGroup?: string;
  readonly uIso?: number;
  readonly uAniso?: readonly [number, number, number, number, number, number];
  readonly notes?: string;
}

export type CrystalSourceFormat =
  | 'starter'
  | 'empty'
  | 'cif'
  | 'mmcif'
  | 'pdb'
  | 'poscar'
  | 'xyz'
  | 'extxyz'
  | 'project'
  | 'unknown';

export interface CrystalMetadataState {
  readonly title?: string;
  readonly description?: string;
  readonly creator?: string;
  readonly provenanceNotes?: string;
  readonly customCifTags?: Readonly<Record<string, string>>;
}

export interface CrystalTransformRecord {
  readonly kind: string;
  readonly label: string;
  readonly detail?: string;
}

export interface ImportedCrystalSnapshot {
  readonly name: string;
  readonly sourceFormat: CrystalSourceFormat;
  readonly sourceText?: string;
  readonly cell: UnitCell;
  readonly sites: readonly CrystalSite[];
}

export interface CrystalDocument {
  readonly version: 1;
  readonly id: string;
  readonly name: string;
  readonly sourceFormat: CrystalSourceFormat;
  readonly sourceText?: string;
  readonly cell: UnitCell;
  readonly sites: readonly CrystalSite[];
  readonly importedSnapshot?: ImportedCrystalSnapshot;
  readonly metadata: CrystalMetadataState;
  readonly provenance: readonly CrystalTransformRecord[];
}

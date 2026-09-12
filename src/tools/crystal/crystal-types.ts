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

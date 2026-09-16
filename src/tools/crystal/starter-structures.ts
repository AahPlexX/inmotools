import type { CrystalSite, UnitCell, Vec3 } from './crystal-types';

export type StarterStructureId =
  | 'sc' | 'bcc' | 'fcc' | 'diamond' | 'nacl' | 'cscl' | 'zincblende'
  | 'graphite' | 'perovskite' | 'rutile' | 'fluorite' | 'wurtzite' | 'molecular';

export interface StarterStructureDefinition {
  readonly id: StarterStructureId;
  readonly name: string;
  readonly description: string;
  readonly cell: UnitCell;
  readonly sites: readonly Omit<CrystalSite, 'id'>[];
}

const cubic = (a: number): UnitCell => ({ a, b:a, c:a, alpha:90, beta:90, gamma:90 });
const tetragonal = (a: number, c: number): UnitCell => ({ a, b:a, c, alpha:90, beta:90, gamma:90 });
const hexagonal = (a: number, c: number): UnitCell => ({ a, b:a, c, alpha:90, beta:90, gamma:120 });
const site = (label: string, element: string, fractional: Vec3, occupancy = 1): Omit<CrystalSite,'id'> => ({ label, element, fractional, occupancy });

const FCC: readonly Vec3[] = [[0,0,0],[0,.5,.5],[.5,0,.5],[.5,.5,0]];
const DIAMOND_SHIFT: Vec3 = [.25,.25,.25];
const add = (left: Vec3, right: Vec3): Vec3 => [
  (left[0] + right[0]) % 1,
  (left[1] + right[1]) % 1,
  (left[2] + right[2]) % 1,
];

const withLabels = (element: string, points: readonly Vec3[], prefix = element): readonly Omit<CrystalSite,'id'>[] =>
  points.map((fractional, index) => site(`${prefix}${index + 1}`, element, fractional));

const rutileU = 0.305;
const fluoriteF: readonly Vec3[] = [
  [.25,.25,.25],[.25,.25,.75],[.25,.75,.25],[.25,.75,.75],
  [.75,.25,.25],[.75,.25,.75],[.75,.75,.25],[.75,.75,.75],
];

export const STARTER_STRUCTURES: Readonly<Record<StarterStructureId, StarterStructureDefinition>> = {
  sc: {
    id:'sc',
    name:'Simple cubic lattice',
    description:'Illustrative one-site simple cubic lattice for learning periodicity; X is a teaching lattice point, not a chemical element.',
    cell:cubic(3),
    sites:[site('X1','X',[0,0,0])],
  },
  bcc: {
    id:'bcc',
    name:'α-Iron — body-centered cubic',
    description:'Conventional body-centered cubic iron model.',
    cell:cubic(2.8665),
    sites:[site('Fe1','Fe',[0,0,0]), site('Fe2','Fe',[.5,.5,.5])],
  },
  fcc: {
    id:'fcc',
    name:'Copper — face-centered cubic',
    description:'Conventional face-centered cubic copper model.',
    cell:cubic(3.6149),
    sites:withLabels('Cu', FCC),
  },
  diamond: {
    id:'diamond',
    name:'Diamond',
    description:'Conventional cubic diamond carbon model.',
    cell:cubic(3.567),
    sites:withLabels('C', [...FCC, ...FCC.map((point) => add(point, DIAMOND_SHIFT))]),
  },
  nacl: {
    id:'nacl',
    name:'Sodium chloride — rock salt',
    description:'Conventional cubic rock-salt structure with interpenetrating Na and Cl sublattices.',
    cell:cubic(5.6402),
    sites:[
      ...withLabels('Cl', FCC),
      ...withLabels('Na', [[.5,0,0],[0,.5,0],[0,0,.5],[.5,.5,.5]]),
    ],
  },
  cscl: {
    id:'cscl',
    name:'Cesium chloride',
    description:'Cubic CsCl structure with two interpenetrating primitive sublattices.',
    cell:cubic(4.123),
    sites:[site('Cs1','Cs',[0,0,0]), site('Cl1','Cl',[.5,.5,.5])],
  },
  zincblende: {
    id:'zincblende',
    name:'Zinc sulfide — zinc blende',
    description:'Conventional cubic zinc-blende ZnS model.',
    cell:cubic(5.4093),
    sites:[
      ...withLabels('S', FCC),
      ...withLabels('Zn', FCC.map((point) => add(point, DIAMOND_SHIFT))),
    ],
  },
  graphite: {
    id:'graphite',
    name:'Graphite',
    description:'Hexagonal layered carbon model showing AB-stacked graphitic sheets.',
    cell:hexagonal(2.461, 6.708),
    sites:[
      site('C1','C',[0,0,0]), site('C2','C',[1/3,2/3,0]),
      site('C3','C',[0,0,.5]), site('C4','C',[2/3,1/3,.5]),
    ],
  },
  perovskite: {
    id:'perovskite',
    name:'Strontium titanate — cubic perovskite',
    description:'Ideal cubic SrTiO₃ perovskite model.',
    cell:cubic(3.905),
    sites:[
      site('Sr1','Sr',[0,0,0]), site('Ti1','Ti',[.5,.5,.5]),
      site('O1','O',[.5,.5,0]), site('O2','O',[.5,0,.5]), site('O3','O',[0,.5,.5]),
    ],
  },
  rutile: {
    id:'rutile',
    name:'Titanium dioxide — rutile',
    description:'Tetragonal rutile TiO₂ model using the conventional internal oxygen parameter.',
    cell:tetragonal(4.5937, 2.9587),
    sites:[
      site('Ti1','Ti',[0,0,0]), site('Ti2','Ti',[.5,.5,.5]),
      site('O1','O',[rutileU,rutileU,0]), site('O2','O',[1-rutileU,1-rutileU,0]),
      site('O3','O',[.5+rutileU,.5-rutileU,.5]), site('O4','O',[.5-rutileU,.5+rutileU,.5]),
    ],
  },
  fluorite: {
    id:'fluorite',
    name:'Calcium fluoride — fluorite',
    description:'Conventional cubic CaF₂ fluorite model.',
    cell:cubic(5.4626),
    sites:[...withLabels('Ca', FCC), ...withLabels('F', fluoriteF)],
  },
  wurtzite: {
    id:'wurtzite',
    name:'Zinc sulfide — wurtzite',
    description:'Hexagonal wurtzite ZnS model with an idealized internal parameter.',
    cell:hexagonal(3.82, 6.26),
    sites:[
      site('Zn1','Zn',[1/3,2/3,0]), site('Zn2','Zn',[2/3,1/3,.5]),
      site('S1','S',[1/3,2/3,.375]), site('S2','S',[2/3,1/3,.875]),
    ],
  },
  molecular: {
    id:'molecular',
    name:'Molecular packing example',
    description:'Illustrative periodic water-molecule packing for learning molecular boundaries; it is not presented as an experimental ice phase.',
    cell:{ a:8, b:8, c:8, alpha:90, beta:90, gamma:90 },
    sites:[
      site('O1','O',[.20,.20,.20]), site('H1','H',[.32,.20,.20]), site('H2','H',[.16,.31,.20]),
      site('O2','O',[.70,.70,.70]), site('H3','H',[.82,.70,.70]), site('H4','H',[.66,.81,.70]),
    ],
  },
};

export const STARTER_STRUCTURE_IDS = Object.freeze(Object.keys(STARTER_STRUCTURES) as StarterStructureId[]);

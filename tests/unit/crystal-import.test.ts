import { describe, expect, it } from 'vitest';
import { detectCrystalFormat, importCrystalText } from '../../src/tools/crystal/structure-import-engine';

const expectVectorClose = (actual: readonly number[], expected: readonly number[]): void => {
  expect(actual).toHaveLength(expected.length);
  expected.forEach((value, index) => expect(actual[index]).toBeCloseTo(value, 12));
};

const poscarDirect = `NaCl direct
1.0
5 0 0
0 5 0
0 0 5
Na Cl
1 1
Selective dynamics
Direct
0 0 0 T T T
0.5 0.5 0.5 F F F
`;

const poscarCartesian = `Cartesian scaled
2.0
1 0 0
0 1 0
0 0 1
C
2
Cartesian
0 0 0
0.5 0.5 0.5
`;

const poscarThreeAxisScale = `Anisotropic scale
2 3 4
1 0 0
0 1 0
0 0 1
Si
1
Cartesian
0.5 0.5 0.5
`;

const xyz = `3
water-like geometry
O 0 0 0
H 0.95 0 0
H -0.24 0.93 0
`;

const extxyz = `2
Lattice="5 0 0 0 6 0 0 0 7" Properties=species:S:1:pos:R:3 pbc="T T T"
Na 0 0 0
Cl 2.5 3 3.5
`;

const pdb = [
  'CRYST1   10.000   11.000   12.000  90.00  90.00 120.00 P 1           1',
  'ATOM      1  C1  UNK A   1       0.000   0.000   0.000  1.00 10.00           C  ',
  'HETATM    2  O1  UNK A   1       5.000   0.000   0.000  0.50 12.00           O  ',
  'END',
].join('\n');

const mmcif = `data_demo
_cell.length_a 10
_cell.length_b 10
_cell.length_c 10
_cell.angle_alpha 90
_cell.angle_beta 90
_cell.angle_gamma 90
loop_
_atom_site.group_PDB
_atom_site.id
_atom_site.type_symbol
_atom_site.label_atom_id
_atom_site.Cartn_x
_atom_site.Cartn_y
_atom_site.Cartn_z
_atom_site.occupancy
ATOM 1 C CA 5 0 0 1.0
ATOM 2 O O1 0 5 0 0.5
`;

describe('crystal structure import adapters', () => {
  it('detects supported structure formats from filename and content', () => {
    expect(detectCrystalFormat('POSCAR', poscarDirect)).toBe('poscar');
    expect(detectCrystalFormat('sample.vasp', poscarDirect)).toBe('poscar');
    expect(detectCrystalFormat('sample.xyz', xyz)).toBe('xyz');
    expect(detectCrystalFormat('sample.xyz', extxyz)).toBe('extxyz');
    expect(detectCrystalFormat('sample.pdb', pdb)).toBe('pdb');
    expect(detectCrystalFormat('sample.cif', mmcif)).toBe('mmcif');
  });

  it('imports POSCAR Direct, Selective Dynamics and scaled Cartesian coordinates', () => {
    const direct = importCrystalText('POSCAR', poscarDirect);
    expect(direct.format).toBe('poscar');
    expect(direct.document.cell.a).toBeCloseTo(5, 10);
    expect(direct.document.sites.map((site) => site.element)).toEqual(['Na', 'Cl']);
    expectVectorClose(direct.document.sites[1]!.fractional, [0.5, 0.5, 0.5]);
    expect(direct.document.sourceText).toBe(poscarDirect);

    const cartesian = importCrystalText('cartesian.vasp', poscarCartesian);
    expect(cartesian.document.cell.a).toBeCloseTo(2, 10);
    expect(cartesian.document.sites[1]!.fractional[0]).toBeCloseTo(0.5, 10);
  });

  it('supports VASP three-axis scaling and applies it to Cartesian positions', () => {
    const imported = importCrystalText('three-scale.vasp', poscarThreeAxisScale);
    expect(imported.document.cell.a).toBeCloseTo(2, 10);
    expect(imported.document.cell.b).toBeCloseTo(3, 10);
    expect(imported.document.cell.c).toBeCloseTo(4, 10);
    expectVectorClose(imported.document.sites[0]!.fractional, [0.5, 0.5, 0.5]);
  });

  it('imports plain XYZ with an explicit nonperiodic-display assumption warning', () => {
    const imported = importCrystalText('sample.xyz', xyz);
    expect(imported.format).toBe('xyz');
    expect(imported.document.sites).toHaveLength(3);
    expect(imported.document.sites[0]!.element).toBe('O');
    expect(imported.warnings.join(' ')).toMatch(/nonperiodic|display cell|lattice/i);
    expect(imported.document.sourceText).toBe(xyz);
  });

  it('imports extXYZ Lattice and Properties metadata without guessing the cell', () => {
    const imported = importCrystalText('sample.xyz', extxyz);
    expect(imported.format).toBe('extxyz');
    expect(imported.document.cell.a).toBeCloseTo(5, 10);
    expect(imported.document.cell.b).toBeCloseTo(6, 10);
    expect(imported.document.cell.c).toBeCloseTo(7, 10);
    expectVectorClose(imported.document.sites[1]!.fractional, [0.5, 0.5, 0.5]);
    expect(imported.warnings).toEqual([]);
  });

  it('imports fixed-column PDB CRYST1 plus ATOM and HETATM coordinates', () => {
    const imported = importCrystalText('sample.pdb', pdb);
    expect(imported.format).toBe('pdb');
    expect(imported.document.cell.gamma).toBeCloseTo(120, 10);
    expect(imported.document.sites).toHaveLength(2);
    expect(imported.document.sites[0]!.element).toBe('C');
    expect(imported.document.sites[1]!.occupancy).toBeCloseTo(0.5, 10);
  });

  it('imports structural PDBx/mmCIF Cartesian atom-site coordinates through the CIF parser', () => {
    const imported = importCrystalText('sample.cif', mmcif);
    expect(imported.format).toBe('mmcif');
    expect(imported.document.sites).toHaveLength(2);
    expect(imported.document.sites[0]!.label).toBe('CA');
    expect(imported.document.sites[0]!.fractional[0]).toBeCloseTo(0.5, 10);
    expect(imported.document.sites[1]!.fractional[1]).toBeCloseTo(0.5, 10);
    expect(imported.document.sites[1]!.occupancy).toBeCloseTo(0.5, 10);
    expect(imported.document.cif).toBeDefined();
  });

  it('rejects malformed atom counts and coordinate records instead of partially importing', () => {
    expect(() => importCrystalText('bad.xyz', '2\ncomment\nC 0 0 0\n')).toThrow(/count|atom|record/i);
    expect(() => importCrystalText('bad.vasp', `bad\n1\n1 0 0\n0 1 0\n0 0 1\nC\n2\nDirect\n0 0 0\n`)).toThrow(/count|position|record/i);
    expect(() => importCrystalText('bad.pdb', 'ATOM      1  C   UNK A   1       nope')).toThrow(/coordinate|ATOM|record/i);
  });
});
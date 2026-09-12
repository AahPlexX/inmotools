import { describe, expect, it } from 'vitest';
import { CifParseError, parseCif, serializeCif, structureFromCif } from '../../src/tools/crystal/cif-engine';

const CIF11 = `data_demo
_cell_length_a 5.0
_cell_length_b 5.0
_cell_length_c 5.0
_cell_angle_alpha 90
_cell_angle_beta 90
_cell_angle_gamma 90
_custom_note
;line one
line two
;
loop_
_atom_site_label
_atom_site_type_symbol
_atom_site_fract_x
_atom_site_fract_y
_atom_site_fract_z
_atom_site_occupancy
Na1 Na 0 0 0 1
Cl1 Cl 0.5 0.5 0.5 0.75
loop_
_custom_a
_custom_b
foo 'bar baz'
`;

describe('CIF engine', () => {
  it('preserves unknown CIF 1.1 scalars and loops through parse/serialize/parse', () => {
    const parsed = parseCif(CIF11, '1.1');
    const reparsed = parseCif(serializeCif(parsed), '1.1');
    expect(reparsed.blocks).toEqual(parsed.blocks);

    const structure = structureFromCif(parsed);
    expect(structure.cell.a).toBeCloseTo(5, 10);
    expect(structure.sites).toHaveLength(2);
    expect(structure.sites[1]!.label).toBe('Cl1');
    expect(structure.sites[1]!.occupancy).toBeCloseTo(0.75, 10);
    expect(structure.cif?.blocks[0]!.entries).toEqual(parsed.blocks[0]!.entries);
  });

  it('keeps multiple data blocks selectable instead of discarding later blocks', () => {
    const parsed = parseCif(`${CIF11}\ndata_second\n_cell_length_a 3\n`);
    expect(parsed.blocks.map((block) => block.name)).toEqual(['demo', 'second']);
    expect(structureFromCif(parsed, 'demo').name).toContain('demo');
  });

  it('parses standard uncertainty notation for structural numeric values', () => {
    const cif = parseCif(CIF11.replace('_cell_length_a 5.0', '_cell_length_a 5.000(12)'));
    expect(structureFromCif(cif).cell.a).toBeCloseTo(5, 10);
  });

  it('reports malformed loop width with a source location', () => {
    try {
      parseCif('data_x\nloop_\n_a\n_b\n1\n');
      throw new Error('expected parseCif to fail');
    } catch (error) {
      expect(error).toBeInstanceOf(CifParseError);
      const parseError = error as CifParseError;
      expect(parseError.line).toBeGreaterThan(0);
      expect(parseError.column).toBeGreaterThan(0);
      expect(parseError.message).toMatch(/loop/i);
    }
  });

  it('recognizes CIF 2.0 magic, triple-quoted strings, and compound values without corrupting them', () => {
    const cif2 = `#\\#CIF_2.0
data_unicode
_cell_length_a 4
_cell_length_b 4
_cell_length_c 4
_cell_angle_alpha 90
_cell_angle_beta 90
_cell_angle_gamma 90
_title '''A crystal
with Unicode α'''
_custom_list [1 2 'three four']
_custom_table {'first':1 'second':[2 3]}
loop_
_atom_site.label
_atom_site.type_symbol
_atom_site.fract_x
_atom_site.fract_y
_atom_site.fract_z
C1 C 0 0 0
`;
    const parsed = parseCif(cif2);
    expect(parsed.version).toBe('2.0');
    const serialized = serializeCif(parsed, { version:'2.0' });
    expect(serialized.startsWith('#\\#CIF_2.0')).toBe(true);
    expect(serialized).toContain("'''A crystal\nwith Unicode α'''");
    expect(serialized).toContain("[1 2 'three four']");
    expect(serialized).toContain("{'first':1 'second':[2 3]}");
    expect(parseCif(serialized).blocks).toEqual(parsed.blocks);
  });
});

import { describe, expect, it } from 'vitest';
import { createStarterStructure, setCrystalCell } from '../../src/tools/crystal/document-engine';
import { importCrystalText } from '../../src/tools/crystal/structure-import-engine';
import { parseCif } from '../../src/tools/crystal/cif-engine';
import {
  computeMetadataDiff,
  removeCifTag,
  setCifLoopCell,
  setCifScalar,
  setExportMetadata,
} from '../../src/tools/crystal/metadata-engine';
import {
  defaultExportOptions,
  exportCrystal,
} from '../../src/tools/crystal/structure-export-engine';

const cifWithUnknownLoop = `data_demo
_cell_length_a 5
_cell_length_b 5
_cell_length_c 5
_cell_angle_alpha 90
_cell_angle_beta 90
_cell_angle_gamma 90
_chemical_name_common 'Original structure'
_custom_note 'keep me'
loop_
_custom_a
_custom_b
foo 'bar baz'
loop_
_atom_site_label
_atom_site_type_symbol
_atom_site_fract_x
_atom_site_fract_y
_atom_site_fract_z
_atom_site_occupancy
Na1 Na 0 0 0 1
Cl1 Cl 0.5 0.5 0.5 1
`;

describe('Crystal metadata editing', () => {
  it('edits and removes CIF scalars without mutating unrelated entries', () => {
    const source = parseCif(cifWithUnknownLoop, '1.1');
    const edited = setCifScalar(source, 'demo', '_chemical_name_common', 'Reviewed structure');
    const removed = removeCifTag(edited, 'demo', '_custom_note');

    expect(source.blocks[0]!.entries).not.toEqual(removed.blocks[0]!.entries);
    expect(edited.blocks[0]!.entries.some((entry) => entry.kind === 'scalar' && entry.tag === '_custom_note')).toBe(true);
    expect(removed.blocks[0]!.entries.some((entry) => entry.kind === 'scalar' && entry.tag === '_custom_note')).toBe(false);
    expect(removed.blocks[0]!.entries.some((entry) => entry.kind === 'loop' && entry.tags.includes('_custom_a'))).toBe(true);
  });

  it('updates one loop cell while preserving loop shape and neighboring raw values', () => {
    const source = parseCif(cifWithUnknownLoop, '1.1');
    const edited = setCifLoopCell(source, 'demo', 1, 0, '_atom_site_fract_x', '0.125');
    const atomLoop = edited.blocks[0]!.entries.filter((entry) => entry.kind === 'loop')[1]!;
    expect(atomLoop.kind).toBe('loop');
    if (atomLoop.kind !== 'loop') throw new Error('Expected atom loop');
    expect(atomLoop.rows[0]![2]).toBe('0.125');
    expect(atomLoop.rows[0]![3]).toBe('0');
    expect(atomLoop.rows).toHaveLength(2);
  });

  it('classifies preserved, changed, generated and omitted metadata deterministically', () => {
    const source = parseCif(cifWithUnknownLoop, '1.1');
    const changed = setCifScalar(source, 'demo', '_chemical_name_common', 'Reviewed structure');
    const output = removeCifTag(setCifScalar(changed, 'demo', '_audit_creation_method', 'InMo Tools'), 'demo', '_custom_note');
    const diff = computeMetadataDiff(source, output);

    expect(diff.changed).toContain('_chemical_name_common');
    expect(diff.generated).toContain('_audit_creation_method');
    expect(diff.omitted).toContain('_custom_note');
    expect(diff.preserved).toContain('_custom_a');
  });
});

describe('Crystal structure export', () => {
  it('preserves an unknown CIF loop while editing metadata and canonical cell values', () => {
    const imported = importCrystalText('sample.cif', cifWithUnknownLoop).document;
    const editedMetadata = setExportMetadata(imported, { title: 'Reviewed structure' });
    const edited = setCrystalCell(editedMetadata, { ...editedMetadata.cell, a: 6.25 });
    const out = exportCrystal(edited, 'cif1', defaultExportOptions);

    expect(out.text).toContain('_custom_a');
    expect(out.text).toContain("'bar baz'");
    expect(out.text).toContain('Reviewed structure');
    expect(out.text).toMatch(/_cell_length_a\s+6\.25\b/);
    expect(out.diff.omitted).not.toContain('_custom_a');
  });

  it('emits the CIF 2.0 magic header without discarding preserved source content', () => {
    const imported = importCrystalText('sample.cif', cifWithUnknownLoop).document;
    const out = exportCrystal(imported, 'cif2', defaultExportOptions);
    expect(out.text.startsWith('#\\#CIF_2.0\n')).toBe(true);
    expect(out.text).toContain('_custom_note');
    expect(out.text).toContain('_custom_a');
  });

  it('exports POSCAR and extended XYZ from the same canonical coordinates', () => {
    const document = createStarterStructure('nacl');
    const poscar = exportCrystal(document, 'poscar', defaultExportOptions);
    const extxyz = exportCrystal(document, 'extxyz', defaultExportOptions);

    expect(poscar.text).toMatch(/\nDirect\n/);
    expect(poscar.text).toContain('Na Cl');
    expect(extxyz.text).toMatch(/^\d+\nLattice="/);
    expect(extxyz.text).toContain('Properties=species:S:1:pos:R:3');
    expect(extxyz.text).toContain('Na 0 0 0');
  });

  it('exports measurements CSV with explicit units and RFC 4180-safe labels', () => {
    const document = createStarterStructure('bcc');
    const out = exportCrystal(document, 'measurements-csv', {
      ...defaultExportOptions,
      measurements: [{
        id: 'measurement-1',
        kind: 'distance',
        siteIds: [document.sites[0]!.id, document.sites[1]!.id],
        value: 2.4824,
        unit: 'Å',
        label: 'corner, center',
      }],
    });
    expect(out.text).toContain('id,kind,label,site_ids,value,unit');
    expect(out.text).toContain('"corner, center"');
    expect(out.text).toContain('Å');
  });
});

import { describe, expect, it } from 'vitest';
import { importCrystalText } from '../../src/tools/crystal/structure-import-engine';
import { parseCrystalProject, serializeCrystalProject } from '../../src/tools/crystal/project-engine';

const cif = `data_project
_cell_length_a 5
_cell_length_b 5
_cell_length_c 5
_cell_angle_alpha 90
_cell_angle_beta 90
_cell_angle_gamma 90
_custom_preserved 'keep me'
loop_
_atom_site_label
_atom_site_type_symbol
_atom_site_fract_x
_atom_site_fract_y
_atom_site_fract_z
Na1 Na 0 0 0
Cl1 Cl 0.5 0.5 0.5
`;

const projectFixture = () => {
  const document = importCrystalText('project.cif', cif).document;
  return {
    schema: 'inmotools.crystal-project' as const,
    version: 1 as const,
    document,
    view: {
      projection: 'perspective' as const,
      cameraPosition: [8, 8, 8] as const,
      target: [0, 0, 0] as const,
      up: [0, 1, 0] as const,
      representation: 'ball-and-stick' as const,
      showCell: true,
      showAxes: true,
      showBonds: true,
      atomScale: 1,
      bondScale: 1,
      background: '#101820',
    },
    measurements: [
      {
        id: 'measurement-1',
        kind: 'distance' as const,
        siteIds: [document.sites[0]!.id, document.sites[1]!.id] as const,
        value: 4.330127018922193,
        unit: 'Å' as const,
        label: 'Na1–Cl1',
      },
    ],
  };
};

describe('Crystal Lattice Studio project persistence', () => {
  it('round-trips document source, CIF preservation state, view state and measurements', () => {
    const project = projectFixture();
    const parsed = parseCrystalProject(serializeCrystalProject(project));

    expect(parsed).toEqual(project);
    expect(parsed.document.sourceText).toBe(cif);
    expect(parsed.document.cif?.blocks[0]?.entries).toEqual(project.document.cif?.blocks[0]?.entries);
    expect(parsed.measurements[0]?.siteIds).toEqual(project.measurements[0]?.siteIds);
  });

  it('rejects unsupported project schema versions rather than guessing a migration', () => {
    const project = projectFixture();
    const serialized = serializeCrystalProject(project);
    expect(() => parseCrystalProject(serialized.replace('"version":1', '"version":2'))).toThrow(/version|unsupported/i);
    expect(() => parseCrystalProject(serialized.replace('inmotools.crystal-project', 'other.project'))).toThrow(/schema|project/i);
  });

  it('rejects prototype-pollution keys recursively before materializing a project', () => {
    expect(() => parseCrystalProject('{"schema":"inmotools.crystal-project","version":1,"document":{"__proto__":{"polluted":true}},"view":{},"measurements":[]}')).toThrow(/unsafe|prototype|key/i);
    expect(() => parseCrystalProject('{"schema":"inmotools.crystal-project","version":1,"document":{"metadata":{"constructor":{"prototype":{"polluted":true}}}},"view":{},"measurements":[]}')).toThrow(/unsafe|prototype|constructor|key/i);
  });

  it('rejects non-finite and malformed scientific numeric values on parse', () => {
    const serialized = serializeCrystalProject(projectFixture());
    const nonFiniteCell = serialized.replace(/"a":5(?:\.0+)?/, '"a":1e400');
    expect(() => parseCrystalProject(nonFiniteCell)).toThrow(/finite|cell|number/i);

    const badOccupancy = serialized.replace(/"occupancy":1/, '"occupancy":1.5');
    expect(() => parseCrystalProject(badOccupancy)).toThrow(/occupancy|between|range/i);
  });

  it('refuses to serialize non-finite application state instead of coercing it to null', () => {
    const project = projectFixture();
    const hostile = {
      ...project,
      view: { ...project.view, atomScale: Number.NaN },
    };
    expect(() => serializeCrystalProject(hostile)).toThrow(/finite|number|view/i);
  });

  it('rejects malformed measurement references and invalid view enums', () => {
    const project = projectFixture();
    const badMeasurement = {
      ...project,
      measurements: [{ ...project.measurements[0]!, siteIds: ['missing-site', project.document.sites[1]!.id] }],
    };
    expect(() => parseCrystalProject(JSON.stringify(badMeasurement))).toThrow(/measurement|site|reference/i);

    const badView = { ...project, view: { ...project.view, projection: 'fish-eye' } };
    expect(() => parseCrystalProject(JSON.stringify(badView))).toThrow(/projection|view/i);
  });
});
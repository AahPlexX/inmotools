import { describe, expect, it } from 'vitest';
import {
  extractIsosurface,
  orthogonalSlice,
  parseCcp4Grid,
  parseCubeGrid,
  parseXsfGrid,
  resampleScalarGrid,
  samplePlaneSlice,
} from '../../src/tools/crystal/volumetric-engine';

function makeCcp4(): ArrayBuffer {
  const buffer = new ArrayBuffer(1024 + 8 * 4);
  const view = new DataView(buffer);
  const setI = (word: number, value: number) => view.setInt32((word - 1) * 4, value, true);
  const setF = (word: number, value: number) => view.setFloat32((word - 1) * 4, value, true);
  setI(1, 2); setI(2, 2); setI(3, 2); setI(4, 2);
  setI(8, 2); setI(9, 2); setI(10, 2);
  setF(11, 2); setF(12, 2); setF(13, 2);
  setF(14, 90); setF(15, 90); setF(16, 90);
  setI(17, 1); setI(18, 2); setI(19, 3);
  setI(24, 0);
  for (const [offset, code] of [...'MAP '].entries()) view.setUint8(208 + offset, code.charCodeAt(0));
  view.setUint8(212, 0x44); view.setUint8(213, 0x41);
  for (let index = 0; index < 8; index += 1) view.setFloat32(1024 + index * 4, index, true);
  return buffer;
}

describe('crystal volumetric field pipeline', () => {
  it('imports CUBE, XSF, and CCP4 grids and provides bounded slices, resampling, and isosurfaces', () => {
    const cube = parseCubeGrid('demo.cube', [
      'CUBE demo',
      'density',
      '0 0 0 0',
      '2 1 0 0',
      '2 0 1 0',
      '2 0 0 1',
      '0 1 2 3 4 5 6 7',
    ].join('\n'));
    expect(cube.dimensions).toEqual([2, 2, 2]);
    expect(cube.values).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(cube.sourceFormat).toBe('cube');

    const xsf = parseXsfGrid('demo.xsf', [
      'BEGIN_BLOCK_DATAGRID_3D',
      'density',
      'BEGIN_DATAGRID_3D_density',
      '2 2 2',
      '0 0 0',
      '1 0 0',
      '0 1 0',
      '0 0 1',
      '0 1 2 3 4 5 6 7',
      'END_DATAGRID_3D',
      'END_BLOCK_DATAGRID_3D',
    ].join('\n'));
    expect(xsf.dimensions).toEqual([2, 2, 2]);
    expect(xsf.values).toHaveLength(8);

    const ccp4 = parseCcp4Grid('demo.map', makeCcp4());
    expect(ccp4.dimensions).toEqual([2, 2, 2]);
    expect(ccp4.values[7]).toBeCloseTo(7);

    const zSlice = orthogonalSlice(cube, 'z', 1);
    expect(zSlice.width).toBe(2);
    expect(zSlice.height).toBe(2);
    expect(zSlice.values).toHaveLength(4);

    const plane = samplePlaneSlice(cube, {
      origin: [0, 0, 0.5],
      u: [1, 0, 0],
      v: [0, 1, 0],
      width: 3,
      height: 3,
    });
    expect(plane.values).toHaveLength(9);
    expect(plane.values.every(Number.isFinite)).toBe(true);

    const originalValues = [...cube.values];
    const reduced = resampleScalarGrid(cube, { maxPoints: 4 });
    expect(reduced.values.length).toBeLessThanOrEqual(4);
    expect(cube.values).toEqual(originalValues);

    const surface = extractIsosurface(cube, 3.5);
    expect(surface.vertices.length).toBeGreaterThan(0);
    expect(surface.triangles.length).toBeGreaterThan(0);
    expect(surface.triangles.every((face) => face.length === 3)).toBe(true);
  });
});

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { CadKernelShape, CadKernelShapeBounds } from '../../src/tools/cad/kernel-contract';
import {
  createOcctCadKernelAdapter,
  type OcctCadKernelAdapter,
} from '../../src/tools/cad/occt-adapter';

/** Ruled-surface bounds (e.g. a loft) carry OCCT's own numerical tolerance and are not bit-exact. */
function expectBoundsClose(actual: CadKernelShapeBounds, expected: CadKernelShapeBounds, precision = 5): void {
  actual.min.forEach((value, index) => expect(value).toBeCloseTo(expected.min[index]!, precision));
  actual.max.forEach((value, index) => expect(value).toBeCloseTo(expected.max[index]!, precision));
}

describe('CAD exact OCCT adapter', () => {
  let kernel: OcctCadKernelAdapter;
  let box: CadKernelShape;

  beforeAll(async () => {
    kernel = await createOcctCadKernelAdapter();
    box = kernel.box(20, 10, 5);
  });

  afterAll(() => {
    kernel.dispose();
  });

  it('creates an analytic 20 × 10 × 5 box with exact engineering queries', () => {
    expect(kernel.volume(box)).toBeCloseTo(1000, 8);
    expect(kernel.area(box)).toBeCloseTo(700, 8);
    expect(kernel.centerOfMass(box)).toEqual([10, 5, 2.5]);
    expect(kernel.bounds(box)).toEqual({ min: [0, 0, 0], max: [20, 10, 5] });

    const mesh = kernel.tessellate(box, { linearDeflection: 0.1, angularDeflection: 0.5 });
    expect(mesh.positions.length).toBeGreaterThan(0);
    expect(mesh.normals.length).toBe(mesh.positions.length);
    expect(mesh.indices.length).toBeGreaterThan(0);
    expect(mesh.indices.length % 3).toBe(0);
  });

  it('constructs an exact planar profile and extrudes it to the expected volume', () => {
    const profile = kernel.profileFace({
      normal: [0, 0, 1],
      edges: [
        { kind: 'line', start: [0, 0, 0], end: [20, 0, 0] },
        { kind: 'line', start: [20, 0, 0], end: [20, 10, 0] },
        { kind: 'line', start: [20, 10, 0], end: [0, 10, 0] },
        { kind: 'line', start: [0, 10, 0], end: [0, 0, 0] },
      ],
    });
    const extruded = kernel.extrude(profile, 5, [0, 0, 1]);
    try {
      expect(kernel.volume(extruded)).toBeCloseTo(1000, 8);
      expect(kernel.bounds(extruded)).toEqual({ min: [0, 0, 0], max: [20, 10, 5] });
    } finally {
      kernel.release(extruded);
      kernel.release(profile);
    }
  });

  it('revolves an exact rectangular profile through one full turn', () => {
    const profile = kernel.profileFace({
      normal: [0, 0, 1],
      edges: [
        { kind: 'line', start: [5, 0, 0], end: [15, 0, 0] },
        { kind: 'line', start: [15, 0, 0], end: [15, 10, 0] },
        { kind: 'line', start: [15, 10, 0], end: [5, 10, 0] },
        { kind: 'line', start: [5, 10, 0], end: [5, 0, 0] },
      ],
    });
    const revolved = kernel.revolve(profile, [0, 0, 0], [0, 1, 0], Math.PI * 2);
    try {
      expect(kernel.volume(revolved)).toBeCloseTo(Math.PI * (15 ** 2 - 5 ** 2) * 10, 5);
    } finally {
      kernel.release(revolved);
      kernel.release(profile);
    }
  });

  it('sweeps an exact circular wire along a straight exact spine', () => {
    const profile = kernel.profileWire({
      edges: [{ kind: 'circle', center: [0, 0, 0], normal: [1, 0, 0], radius: 2 }],
    });
    const path = kernel.profileWire({
      edges: [{ kind: 'line', start: [0, 0, 0], end: [10, 0, 0] }],
    });
    const swept = kernel.sweep(profile, path);
    try {
      expect(kernel.volume(swept)).toBeCloseTo(Math.PI * 2 ** 2 * 10, 5);
      expect(kernel.bounds(swept)).toEqual({ min: [0, -2, -2], max: [10, 2, 2] });
    } finally {
      kernel.release(swept);
      kernel.release(path);
      kernel.release(profile);
    }
  });

  it('builds a real exact helix wire spanning exactly its declared radius and height', () => {
    // 5 complete turns (height/pitch = 10/2), so the x/y projection covers the full circle.
    const helix = kernel.helixWire({ origin: [0, 0, 0], axis: [0, 0, 1], pitch: 2, height: 10, radius: 5 });
    try {
      expectBoundsClose(kernel.bounds(helix), { min: [-5, -5, 0], max: [5, 5, 10] });
    } finally {
      kernel.release(helix);
    }
  });

  it('sweeps a small circle along a real exact helix into a coil solid', () => {
    const profile = kernel.profileWire({
      edges: [{ kind: 'circle', center: [5, 0, 0], normal: [0, 1, 0], radius: 0.5 }],
    });
    const helix = kernel.helixWire({ origin: [0, 0, 0], axis: [0, 0, 1], pitch: 2, height: 10, radius: 5 });
    const coil = kernel.sweep(profile, helix);
    try {
      const volume = kernel.volume(coil);
      expect(Number.isFinite(volume)).toBe(true);
      expect(volume).toBeGreaterThan(0);
      // A generalized-cylinder sanity bound: swept volume can't exceed cross-section area times path arc length.
      const turns = 10 / 2;
      const archLength = turns * Math.hypot(2 * Math.PI * 5, 2);
      expect(volume).toBeLessThan(Math.PI * 0.5 ** 2 * archLength * 1.05);
    } finally {
      kernel.release(coil);
      kernel.release(helix);
      kernel.release(profile);
    }
  });

  it('rejects a helix with a non-positive radius', () => {
    expect(() => kernel.helixWire({ origin: [0, 0, 0], axis: [0, 0, 1], pitch: 2, height: 10, radius: 0 })).toThrow(/radius/i);
  });

  it('heals an already-valid solid without changing its volume', () => {
    const healed = kernel.heal(box);
    try {
      expect(kernel.volume(healed)).toBeCloseTo(1000, 6);
    } finally {
      kernel.release(healed);
    }
  });

  it('unifies same-domain faces on a solid without changing its volume', () => {
    const unified = kernel.unify(box);
    try {
      expect(kernel.volume(unified)).toBeCloseTo(1000, 6);
    } finally {
      kernel.release(unified);
    }
  });

  it('sews six individually built exact faces into one closed 1000 mm^3 solid', () => {
    // Corners of a 20x10x5 box: bottom (z=0) A-D, top (z=5) E-H.
    const A: [number, number, number] = [0, 0, 0];
    const B: [number, number, number] = [20, 0, 0];
    const C: [number, number, number] = [20, 10, 0];
    const D: [number, number, number] = [0, 10, 0];
    const E: [number, number, number] = [0, 0, 5];
    const F: [number, number, number] = [20, 0, 5];
    const G: [number, number, number] = [20, 10, 5];
    const H: [number, number, number] = [0, 10, 5];
    const rectFace = (normal: [number, number, number], p1: typeof A, p2: typeof A, p3: typeof A, p4: typeof A) => kernel.profileFace({
      normal,
      edges: [
        { kind: 'line', start: p1, end: p2 },
        { kind: 'line', start: p2, end: p3 },
        { kind: 'line', start: p3, end: p4 },
        { kind: 'line', start: p4, end: p1 },
      ],
    });
    const faces = [
      rectFace([0, 0, -1], A, B, C, D),
      rectFace([0, 0, 1], E, F, G, H),
      rectFace([0, -1, 0], A, B, F, E),
      rectFace([0, 1, 0], D, C, G, H),
      rectFace([-1, 0, 0], A, E, H, D),
      rectFace([1, 0, 0], B, C, G, F),
    ];

    const sewn = kernel.sew(faces);
    try {
      expect(kernel.volume(sewn)).toBeCloseTo(1000, 4);
    } finally {
      kernel.release(sewn);
      for (const face of faces) kernel.release(face);
    }
  });

  it('rejects a sew call given fewer than two shapes', () => {
    expect(() => kernel.sew([box])).toThrow(/at least two/i);
  });

  it('lofts two exact circular wires into a solid frustum', () => {
    const sectionA = kernel.profileWire({
      edges: [{ kind: 'circle', center: [0, 0, 0], normal: [1, 0, 0], radius: 2 }],
    });
    const sectionB = kernel.profileWire({
      edges: [{ kind: 'circle', center: [10, 0, 0], normal: [1, 0, 0], radius: 4 }],
    });
    const lofted = kernel.loft([sectionA, sectionB], true);
    try {
      const expectedVolume = Math.PI * 10 / 3 * (2 ** 2 + 2 * 4 + 4 ** 2);
      expect(kernel.volume(lofted)).toBeCloseTo(expectedVolume, 5);
      // The frustum's overall bounding box spans the wider (radius-4) end in y/z, not the narrower end.
      expectBoundsClose(kernel.bounds(lofted), { min: [0, -4, -4], max: [10, 4, 4] });
    } finally {
      kernel.release(lofted);
      kernel.release(sectionB);
      kernel.release(sectionA);
    }
  });

  it('mirrors an exact box across a plane while preserving its volume', () => {
    const mirrored = kernel.mirror(box, [0, 0, 0], [1, 0, 0]);
    try {
      expect(kernel.volume(mirrored)).toBeCloseTo(1000, 8);
      expectBoundsClose(kernel.bounds(mirrored), { min: [-20, 0, 0], max: [0, 10, 5] });
    } finally {
      kernel.release(mirrored);
    }
  });

  it('rejects a mirror plane with a zero-length normal', () => {
    expect(() => kernel.mirror(box, [0, 0, 0], [0, 0, 0])).toThrow(/non-zero/);
  });

  it('thickens a planar exact face into a solid of the expected volume', () => {
    const face = kernel.profileFace({
      normal: [0, 0, 1],
      edges: [
        { kind: 'line', start: [0, 0, 0], end: [10, 0, 0] },
        { kind: 'line', start: [10, 0, 0], end: [10, 10, 0] },
        { kind: 'line', start: [10, 10, 0], end: [0, 10, 0] },
        { kind: 'line', start: [0, 10, 0], end: [0, 0, 0] },
      ],
    });
    const thickened = kernel.thicken(face, 2);
    try {
      expect(kernel.volume(thickened)).toBeCloseTo(200, 6);
    } finally {
      kernel.release(thickened);
      kernel.release(face);
    }
  });

  it('performs a real OCCT cylindrical cut that reduces exact volume', () => {
    const tool = kernel.cylinder(2, 5);
    const cut = kernel.cut(box, tool);
    const cutVolume = kernel.volume(cut);

    expect(cutVolume).toBeGreaterThan(0);
    expect(cutVolume).toBeLessThan(1000);
  });

  it('round-trips exact geometry through STEP without losing box volume', () => {
    const step = kernel.exportStep([box]);
    expect(step.byteLength).toBeGreaterThan(100);

    const [roundTripped] = kernel.importStep(step);
    expect(roundTripped).toBeDefined();
    expect(kernel.volume(roundTripped!)).toBeCloseTo(1000, 6);
  });

  it('round-trips exact geometry through binary BREP without losing box volume', () => {
    const brep = kernel.exportBrep([box]);
    expect(brep.byteLength).toBeGreaterThan(100);

    const [roundTripped] = kernel.importBrep(brep);
    expect(roundTripped).toBeDefined();
    expect(kernel.volume(roundTripped!)).toBeCloseTo(1000, 8);
  });
});

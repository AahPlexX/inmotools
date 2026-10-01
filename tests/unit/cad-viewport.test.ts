import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  applyBodyHighlight,
  computeBodiesBounds,
  computeFitView,
  createBodyGeometry,
  describeViewportState,
  exceedsClickDragThreshold,
  isBodySelected,
  resolveClickedBodyId,
} from '../../src/tools/cad/CadViewport';
import type { CadKernelBodyResult, CadKernelMesh } from '../../src/tools/cad/kernel-contract';

function body(bodyId: string, min: [number, number, number], max: [number, number, number]): CadKernelBodyResult {
  return {
    bodyId,
    mesh: { positions: new Float32Array(), normals: new Float32Array(), indices: new Uint32Array() },
    bounds: { min, max },
  };
}

function triangleMesh(): CadKernelMesh {
  return {
    positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
    normals: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]),
    indices: new Uint32Array([0, 1, 2]),
  };
}

describe('computeBodiesBounds', () => {
  it('returns null for an empty body list', () => {
    expect(computeBodiesBounds([])).toBeNull();
  });

  it('returns a single body bounds unchanged', () => {
    const bounds = computeBodiesBounds([body('a', [0, 0, 0], [2, 4, 6])]);
    expect(bounds).toEqual({ min: [0, 0, 0], max: [2, 4, 6] });
  });

  it('unions bounds across multiple bodies without recomputing from geometry', () => {
    const bounds = computeBodiesBounds([
      body('a', [0, -1, 0], [2, 1, 2]),
      body('b', [-3, 0, -5], [1, 6, 0]),
    ]);
    expect(bounds).toEqual({ min: [-3, -1, -5], max: [2, 6, 2] });
  });
});

describe('computeFitView', () => {
  it('returns null when there are no bounds', () => {
    expect(computeFitView(null)).toBeNull();
  });

  it('computes the center and radius of a bounds box', () => {
    const fit = computeFitView({ min: [0, 0, 0], max: [2, 4, 6] });
    expect(fit).toEqual({ center: [1, 2, 3], radius: 6 });
  });

  it('floors the radius so a degenerate (flat/point) body still frames sensibly', () => {
    const fit = computeFitView({ min: [0, 0, 0], max: [0, 0, 0] });
    expect(fit?.radius).toBeCloseTo(0.1);
  });
});

describe('isBodySelected', () => {
  it('is true only for a matching body selection', () => {
    expect(isBodySelected({ kind: 'body', id: 'b1' }, 'b1')).toBe(true);
    expect(isBodySelected({ kind: 'body', id: 'b2' }, 'b1')).toBe(false);
  });

  it('is false for a feature selection, even with the same id', () => {
    expect(isBodySelected({ kind: 'feature', id: 'b1' }, 'b1')).toBe(false);
  });

  it('is false when nothing is selected', () => {
    expect(isBodySelected(null, 'b1')).toBe(false);
  });
});

describe('resolveClickedBodyId', () => {
  it('returns the first defined body id (nearest raycast hit)', () => {
    expect(resolveClickedBodyId(['a', 'b'])).toBe('a');
  });

  it('skips undefined entries (a hit whose mesh has no bodyId tag)', () => {
    expect(resolveClickedBodyId([undefined, 'b'])).toBe('b');
  });

  it('returns null for no hits at all (clicked empty space)', () => {
    expect(resolveClickedBodyId([])).toBeNull();
  });
});

describe('exceedsClickDragThreshold', () => {
  it('does not exceed the threshold for a stationary click', () => {
    expect(exceedsClickDragThreshold(0, 0)).toBe(false);
  });

  it('does not exceed the threshold for tiny jitter under the default px', () => {
    expect(exceedsClickDragThreshold(2, 1)).toBe(false);
  });

  it('exceeds the threshold once movement crosses it (an orbit drag, not a click)', () => {
    expect(exceedsClickDragThreshold(10, 0)).toBe(true);
  });

  it('honors a custom threshold', () => {
    expect(exceedsClickDragThreshold(5, 0, 10)).toBe(false);
    expect(exceedsClickDragThreshold(11, 0, 10)).toBe(true);
  });
});

describe('describeViewportState', () => {
  it('describes an empty, idle viewport', () => {
    expect(describeViewportState(0, false)).toBe('CAD viewport, no bodies to display yet');
  });

  it('describes an empty, rebuilding viewport', () => {
    expect(describeViewportState(0, true)).toBe('CAD viewport rebuilding, no bodies yet');
  });

  it('uses singular "body" for exactly one body', () => {
    expect(describeViewportState(1, false)).toBe('CAD viewport showing 1 tessellated body');
  });

  it('uses plural "bodies" and mentions last-good-result phrasing while rebuilding', () => {
    expect(describeViewportState(3, true)).toBe('CAD viewport rebuilding, showing last successful result of 3 tessellated bodies');
  });
});

describe('createBodyGeometry', () => {
  it('builds a BufferGeometry directly from the kernel mesh arrays without recomputing normals', () => {
    const mesh = triangleMesh();
    const geometry = createBodyGeometry(mesh);

    expect(geometry.getAttribute('position').count).toBe(3);
    expect(geometry.getAttribute('normal').count).toBe(3);
    expect(geometry.getAttribute('normal').array).toBe(mesh.normals);
    expect(geometry.index?.count).toBe(3);

    geometry.computeBoundingBox();
    expect(geometry.boundingBox?.min.toArray()).toEqual([0, 0, 0]);
    expect(geometry.boundingBox?.max.toArray()).toEqual([1, 1, 0]);
  });
});

describe('applyBodyHighlight', () => {
  it('assigns the highlight material only to the selected body and the base material to the rest', () => {
    const base = new THREE.MeshStandardMaterial();
    const highlight = new THREE.MeshStandardMaterial();
    const meshA = new THREE.Mesh(createBodyGeometry(triangleMesh()), base);
    const meshB = new THREE.Mesh(createBodyGeometry(triangleMesh()), base);
    const meshes = new Map([
      ['body-a', meshA],
      ['body-b', meshB],
    ]);

    applyBodyHighlight(meshes, { kind: 'body', id: 'body-b' }, base, highlight);

    expect(meshA.material).toBe(base);
    expect(meshB.material).toBe(highlight);
  });

  it('assigns the base material to every body when nothing is selected', () => {
    const base = new THREE.MeshStandardMaterial();
    const highlight = new THREE.MeshStandardMaterial();
    const meshA = new THREE.Mesh(createBodyGeometry(triangleMesh()), highlight);
    const meshes = new Map([['body-a', meshA]]);

    applyBodyHighlight(meshes, null, base, highlight);

    expect(meshA.material).toBe(base);
  });
});

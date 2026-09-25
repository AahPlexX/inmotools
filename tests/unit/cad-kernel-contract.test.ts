import { describe, expect, it } from 'vitest';
import {
  assertKernelRequest,
  collectKernelTransferables,
  createKernelFailure,
  isCurrentKernelResponse,
  type CadKernelRequest,
  type CadKernelResponse,
} from '../../src/tools/cad/kernel-contract';
import type { CadProject } from '../../src/tools/cad/cad-types';

function project(): CadProject {
  return {
    schemaVersion: 1,
    id: 'project-1',
    name: 'Kernel contract fixture',
    metadata: {
      title: '',
      creator: '',
      organization: '',
      description: '',
      revision: '',
      partNumber: '',
      projectNumber: '',
      material: '',
      rights: '',
      license: '',
      tags: [],
      createdAt: '2026-09-12T00:00:00.000Z',
      modifiedAt: '2026-09-12T00:00:00.000Z',
      custom: {},
    },
    units: { length: 'mm', angle: 'rad' },
    parameters: [],
    sketches: [],
    features: [],
    bodies: [],
    materials: [],
    configurations: [],
    components: [],
    assemblyRelations: [],
    namedViews: [],
    snapshots: [],
    viewport: {},
    exportDefaults: {},
  };
}

function rebuildRequest(revision = 7): CadKernelRequest {
  return {
    revision,
    project: project(),
    quality: 'final',
    operation: { kind: 'rebuild', dirtyFeatureIds: [] },
  };
}

describe('CAD exact-kernel worker contract', () => {
  it('accepts a serializable revisioned rebuild request and rejects malformed revisions', () => {
    const request = rebuildRequest();
    expect(assertKernelRequest(request)).toBe(request);
    expect(JSON.parse(JSON.stringify(request))).toEqual(request);
    expect(() => assertKernelRequest({ ...request, revision: -1 })).toThrow(/revision/i);
    expect(() => assertKernelRequest({ ...request, revision: 1.5 })).toThrow(/revision/i);
  });

  it('treats only the matching revision as current', () => {
    const response: CadKernelResponse = {
      revision: 11,
      ok: true,
      payload: { kind: 'rebuild', bodies: [], warnings: [] },
    };

    expect(isCurrentKernelResponse(response, 11)).toBe(true);
    expect(isCurrentKernelResponse(response, 12)).toBe(false);
  });

  it('collects each tessellation ArrayBuffer exactly once for zero-copy worker transfer', () => {
    const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
    const normals = new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]);
    const indices = new Uint32Array([0, 1, 2]);
    const response: CadKernelResponse = {
      revision: 3,
      ok: true,
      payload: {
        kind: 'rebuild',
        warnings: [],
        bodies: [
          {
            bodyId: 'body-1',
            mesh: { positions, normals, indices },
            bounds: { min: [0, 0, 0], max: [1, 1, 0] },
          },
        ],
      },
    };

    const transferables = collectKernelTransferables(response);
    expect(transferables).toHaveLength(3);
    expect(new Set(transferables).size).toBe(3);
    expect(transferables).toContain(positions.buffer);
    expect(transferables).toContain(normals.buffer);
    expect(transferables).toContain(indices.buffer);
  });

  it('normalizes thrown values into explicit revision-preserving kernel failures', () => {
    expect(createKernelFailure(9, new Error('WASM initialization failed'), 'kernel-init', false)).toEqual({
      revision: 9,
      ok: false,
      error: {
        code: 'kernel-init',
        message: 'WASM initialization failed',
        recoverable: false,
      },
    });
    expect(createKernelFailure(10, 'cancelled', 'cancelled', true).revision).toBe(10);
  });
});

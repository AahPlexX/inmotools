import { describe, expect, it } from 'vitest';
import { CadKernelSession } from '../../src/tools/cad/kernel-session';
import type { CadProject } from '../../src/tools/cad/cad-types';
import type { CadKernelResponse } from '../../src/tools/cad/kernel-contract';

function project(): CadProject {
  return {
    schemaVersion: 1,
    id: 'project-session',
    name: 'Session fixture',
    metadata: {
      title: '', creator: '', organization: '', description: '', revision: '', partNumber: '', projectNumber: '',
      material: '', rights: '', license: '', tags: [], createdAt: '', modifiedAt: '', custom: {},
    },
    units: { length: 'mm', angle: 'rad' },
    parameters: [], sketches: [], features: [], bodies: [], materials: [], configurations: [], components: [],
    assemblyRelations: [], namedViews: [], snapshots: [], viewport: {}, exportDefaults: {},
  };
}

function success(revision: number): CadKernelResponse {
  return { revision, ok: true, payload: { kind: 'rebuild', bodies: [], warnings: [] } };
}

describe('CAD kernel revision session', () => {
  it('issues strictly increasing request revisions and accepts only the latest response', () => {
    const session = new CadKernelSession();
    const first = session.issue(project(), 'preview', { kind: 'rebuild', dirtyFeatureIds: [] });
    const second = session.issue(project(), 'final', { kind: 'rebuild', dirtyFeatureIds: ['feature-1'] });

    expect(first.request.revision).toBe(1);
    expect(second.request.revision).toBe(2);
    expect(session.accept(first.generation, success(first.request.revision))).toBe(false);
    expect(session.accept(second.generation, success(second.request.revision))).toBe(true);
  });

  it('invalidation rejects a pending response without requiring a replacement request', () => {
    const session = new CadKernelSession();
    const pending = session.issue(project(), 'preview', { kind: 'rebuild', dirtyFeatureIds: [] });
    const invalidatedRevision = session.invalidate();

    expect(invalidatedRevision).toBe(2);
    expect(session.accept(pending.generation, success(pending.request.revision))).toBe(false);
  });

  it('restart advances both revision and worker generation so responses from the terminated worker stay stale', () => {
    const session = new CadKernelSession();
    const pending = session.issue(project(), 'final', { kind: 'rebuild', dirtyFeatureIds: [] });
    const restart = session.restart();

    expect(restart.generation).toBe(pending.generation + 1);
    expect(restart.revision).toBe(pending.request.revision + 1);
    expect(session.accept(pending.generation, success(pending.request.revision))).toBe(false);

    const replacement = session.issue(project(), 'final', { kind: 'rebuild', dirtyFeatureIds: [] });
    expect(replacement.generation).toBe(restart.generation);
    expect(session.accept(replacement.generation, success(replacement.request.revision))).toBe(true);
  });

  it('does not allow one successful response to be committed twice', () => {
    const session = new CadKernelSession();
    const pending = session.issue(project(), 'final', { kind: 'rebuild', dirtyFeatureIds: [] });
    const response = success(pending.request.revision);

    expect(session.accept(pending.generation, response)).toBe(true);
    expect(session.accept(pending.generation, response)).toBe(false);
  });
});

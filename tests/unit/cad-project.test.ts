import { describe, expect, it } from 'vitest';
import {
  canReorderFeature,
  commitCadProject,
  createCadProject,
  featureDependencyClosure,
  markFeatureDirty,
  redoCadProject,
  reorderFeature,
  setFeatureSuppressed,
  undoCadProject,
} from '../../src/tools/cad/project-engine';
import type { CadFeature, CadProject } from '../../src/tools/cad/cad-types';

const feature = (id: string, type: CadFeature['type'], dependsOn: string[] = []): CadFeature => ({
  id,
  label: id,
  type,
  bodyId: type === 'sketch' ? null : 'body-main',
  dependsOn,
  topologyRefs: [],
  parameters: {},
  suppressed: false,
  status: 'clean',
  diagnostic: null,
});

function withFeatures(features: CadFeature[]): CadProject {
  return {
    ...createCadProject('Fixture'),
    features,
    bodies: [{ id: 'body-main', label: 'Main body', featureIds: features.filter((item) => item.bodyId === 'body-main').map((item) => item.id), visible: true }],
  };
}

describe('CAD parametric project engine', () => {
  it('creates a serializable project with stable canonical defaults', () => {
    const project = createCadProject('Bracket');
    expect(project.schemaVersion).toBe(1);
    expect(project.name).toBe('Bracket');
    expect(project.units.length).toBe('mm');
    expect(project.units.angle).toBe('rad');
    expect(project.features).toEqual([]);
    expect(project.bodies).toEqual([]);
    expect(project.metadata.tags).toEqual([]);
    expect(project.id).toMatch(/^cad-/);
  });

  it('invalidates only the selected feature and its downstream dependency closure', () => {
    const project = withFeatures([
      feature('sketch', 'sketch'),
      feature('extrude', 'extrude', ['sketch']),
      feature('fillet', 'fillet', ['extrude']),
      feature('independent-box', 'primitive'),
    ]);

    expect([...featureDependencyClosure(project, ['extrude'])]).toEqual(['extrude', 'fillet']);

    const dirty = markFeatureDirty(project, 'extrude');
    expect(dirty.features.map((item) => [item.id, item.status])).toEqual([
      ['sketch', 'clean'],
      ['extrude', 'dirty'],
      ['fillet', 'dirty'],
      ['independent-box', 'clean'],
    ]);
  });

  it('does not treat suppressed dependents as rebuilt geometry while preserving their dependency identity', () => {
    const project = withFeatures([
      feature('sketch', 'sketch'),
      feature('extrude', 'extrude', ['sketch']),
      feature('fillet', 'fillet', ['extrude']),
    ]);
    const suppressed = setFeatureSuppressed(project, 'fillet', true);
    expect(suppressed.features.find((item) => item.id === 'fillet')?.status).toBe('suppressed');
    expect([...featureDependencyClosure(suppressed, ['extrude'])]).toEqual(['extrude', 'fillet']);
  });

  it('rejects a reorder that would move a feature before one of its dependencies', () => {
    const project = withFeatures([
      feature('sketch', 'sketch'),
      feature('extrude', 'extrude', ['sketch']),
      feature('fillet', 'fillet', ['extrude']),
    ]);
    expect(canReorderFeature(project, 'fillet', 0)).toBe(false);
    expect(() => reorderFeature(project, 'fillet', 0)).toThrow(/dependency/i);
  });

  it('allows a dependency-safe reorder of independent features and keeps body feature order aligned', () => {
    const project = withFeatures([
      feature('box-a', 'primitive'),
      feature('box-b', 'primitive'),
      feature('fillet', 'fillet', ['box-a']),
    ]);
    expect(canReorderFeature(project, 'box-b', 0)).toBe(true);
    const reordered = reorderFeature(project, 'box-b', 0);
    expect(reordered.features.map((item) => item.id)).toEqual(['box-b', 'box-a', 'fillet']);
    expect(reordered.bodies[0]?.featureIds).toEqual(['box-b', 'box-a', 'fillet']);
  });

  it('preserves undo/redo semantics and clears redo after a divergent commit', () => {
    const initial = { past: [], present: createCadProject('Bracket'), future: [], limit: 100 };
    const renamed = commitCadProject(initial, 'rename', (project) => ({ ...project, name: 'Bracket A' }));
    expect(renamed.present.name).toBe('Bracket A');

    const undone = undoCadProject(renamed);
    expect(undone.present.name).toBe('Bracket');
    expect(redoCadProject(undone).present.name).toBe('Bracket A');

    const divergent = commitCadProject(undone, 'rename differently', (project) => ({ ...project, name: 'Bracket B' }));
    expect(divergent.future).toEqual([]);
    expect(redoCadProject(divergent).present.name).toBe('Bracket B');
  });

  it('caps retained undo history at the configured limit', () => {
    let history = { past: [], present: createCadProject('Fixture'), future: [], limit: 4 };
    for (let index = 0; index < 7; index += 1) {
      history = commitCadProject(history, `rename ${index}`, (project) => ({ ...project, name: `Fixture ${index}` }));
    }
    expect(history.past).toHaveLength(4);
    expect(history.present.name).toBe('Fixture 6');
  });
});

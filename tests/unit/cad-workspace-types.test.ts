import { describe, expect, it } from 'vitest';
import type { CadFeature } from '../../src/tools/cad/cad-types';
import { selectedFeature } from '../../src/tools/cad/cad-workspace-types';
import { createCadProject } from '../../src/tools/cad/project-engine';

function feature(id: string): CadFeature {
  return {
    id,
    label: id,
    type: 'primitive',
    bodyId: 'body-main',
    dependsOn: [],
    topologyRefs: [],
    parameters: {},
    suppressed: false,
    status: 'dirty',
    diagnostic: null,
  };
}

describe('CAD workspace selection helpers', () => {
  it('resolves the selected feature by id when the selection kind is feature', () => {
    const project = { ...createCadProject('Selection fixture'), features: [feature('a'), feature('b')] };
    expect(selectedFeature(project, { kind: 'feature', id: 'b' })).toEqual(feature('b'));
  });

  it('returns null when nothing is selected', () => {
    const project = { ...createCadProject('Selection fixture'), features: [feature('a')] };
    expect(selectedFeature(project, null)).toBeNull();
  });

  it('returns null for a body selection rather than guessing a matching feature', () => {
    const project = { ...createCadProject('Selection fixture'), features: [feature('a')] };
    expect(selectedFeature(project, { kind: 'body', id: 'a' })).toBeNull();
  });

  it('returns null when the selected feature id no longer exists', () => {
    const project = { ...createCadProject('Selection fixture'), features: [feature('a')] };
    expect(selectedFeature(project, { kind: 'feature', id: 'missing' })).toBeNull();
  });
});

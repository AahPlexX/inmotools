import { describe, expect, it } from 'vitest';
import type { CadFeature } from '../../src/tools/cad/cad-types';
import { selectedFeature, selectedSketch } from '../../src/tools/cad/cad-workspace-types';
import { createCadProject } from '../../src/tools/cad/project-engine';
import type { CadSketch } from '../../src/tools/cad/sketch-types';

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

function sketch(id: string): CadSketch {
  return {
    id,
    label: id,
    plane: { kind: 'origin', plane: 'XY' },
    entities: [],
    constraints: [],
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

describe('CAD workspace sketch selection helper', () => {
  it('resolves the selected sketch by id when the selection kind is sketch', () => {
    const project = { ...createCadProject('Selection fixture'), sketches: [sketch('s1'), sketch('s2')] };
    expect(selectedSketch(project, { kind: 'sketch', id: 's2' })).toEqual(sketch('s2'));
  });

  it('returns null when nothing is selected', () => {
    const project = { ...createCadProject('Selection fixture'), sketches: [sketch('s1')] };
    expect(selectedSketch(project, null)).toBeNull();
  });

  it('returns null for a feature or body selection rather than guessing a matching sketch', () => {
    const project = { ...createCadProject('Selection fixture'), sketches: [sketch('s1')] };
    expect(selectedSketch(project, { kind: 'feature', id: 's1' })).toBeNull();
    expect(selectedSketch(project, { kind: 'body', id: 's1' })).toBeNull();
  });

  it('returns null when the selected sketch id no longer exists', () => {
    const project = { ...createCadProject('Selection fixture'), sketches: [sketch('s1')] };
    expect(selectedSketch(project, { kind: 'sketch', id: 'missing' })).toBeNull();
  });
});

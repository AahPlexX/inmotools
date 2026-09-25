import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { CadFeature } from '../../src/tools/cad/cad-types';
import CadInspector from '../../src/tools/cad/CadInspector';
import { createCadProject } from '../../src/tools/cad/project-engine';

const box: CadFeature = {
  id: 'box-1',
  label: 'Box 1',
  type: 'primitive',
  bodyId: 'body-1',
  dependsOn: [],
  topologyRefs: [],
  parameters: { kind: 'box', width: 20, depth: 10, height: 5 },
  suppressed: false,
  status: 'clean',
  diagnostic: null,
};

const renderInspector = () => renderToStaticMarkup(createElement(CadInspector, {
  project: { ...createCadProject('Inspector fixture'), features: [box] },
  selection: { kind: 'feature', id: box.id },
  onParameterChange: vi.fn(),
}));

describe('CAD feature inspector', () => {
  it('shows primitive kind as read-only while keeping dimensions editable', () => {
    const html = renderInspector();

    expect(html).toContain('cad-inspector-parameter-readonly');
    expect(html).toContain('box');
    expect(html).not.toContain('id="cad-param-box-1-kind"');
    expect(html).toContain('id="cad-param-box-1-width" type="number"');
  });
});

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import CadTree from '../../src/tools/cad/CadTree';
import { createCadProject } from '../../src/tools/cad/project-engine';

describe('CAD model tree bodies', () => {
  it('renders a body visibility checkbox with its current visibility state', () => {
    const project = {
      ...createCadProject('Tree fixture'),
      bodies: [{ id: 'body-1', label: 'Bracket', featureIds: ['box-1'], visible: false }],
    };
    const html = renderToStaticMarkup(createElement(CadTree, {
      project,
      selection: null,
      onSelectFeature: vi.fn(),
      onSelectBody: vi.fn(),
      onToggleBodyVisibility: vi.fn(),
      onToggleSuppressed: vi.fn(),
      onSelectSketch: vi.fn(),
    }));

    expect(html).toContain('Bracket');
    expect(html).toContain('aria-label="Show Bracket"');
    expect(html).toContain('type="checkbox" aria-label="Show Bracket"');
  });
});

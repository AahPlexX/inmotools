import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import CadTree, { matchesCadTreeSearch } from '../../src/tools/cad/CadTree';
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

  it('matches tree labels and types case-insensitively and leaves empty queries unfiltered', () => {
    expect(matchesCadTreeSearch('Mounting Bracket', 'body', 'BRACKET')).toBe(true);
    expect(matchesCadTreeSearch('Extrude 1', 'extrude', 'EXTRUDE')).toBe(true);
    expect(matchesCadTreeSearch('Sketch 1', 'sketch', '')).toBe(true);
    expect(matchesCadTreeSearch('Sketch 1', 'sketch', 'body')).toBe(false);
  });

  it('renders a labeled search field for a non-empty tree', () => {
    const project = {
      ...createCadProject('Tree fixture'),
      bodies: [{ id: 'body-1', label: 'Bracket', featureIds: [], visible: true }],
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

    expect(html).toContain('type="search" aria-label="Search tree"');
  });
});

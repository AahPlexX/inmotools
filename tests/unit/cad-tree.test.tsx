import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import CadTree, { matchesCadTreeSearch, matchesCadTreeSuppressionFilter } from '../../src/tools/cad/CadTree';
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

  it('filters feature suppression state independently of name and type search', () => {
    expect(matchesCadTreeSuppressionFilter(false, 'all')).toBe(true);
    expect(matchesCadTreeSuppressionFilter(true, 'all')).toBe(true);
    expect(matchesCadTreeSuppressionFilter(false, 'active')).toBe(true);
    expect(matchesCadTreeSuppressionFilter(true, 'active')).toBe(false);
    expect(matchesCadTreeSuppressionFilter(false, 'suppressed')).toBe(false);
    expect(matchesCadTreeSuppressionFilter(true, 'suppressed')).toBe(true);
  });

  it('renders an accessible suppression filter with all features shown by default', () => {
    const project = {
      ...createCadProject('Tree fixture'),
      features: [
        { id: 'active', label: 'Active feature', type: 'extrude' as const, bodyId: 'body-1', dependsOn: [], topologyRefs: [], parameters: {}, suppressed: false, status: 'clean' as const, diagnostic: null },
        { id: 'suppressed', label: 'Suppressed feature', type: 'fillet' as const, bodyId: 'body-1', dependsOn: [], topologyRefs: [], parameters: {}, suppressed: true, status: 'suppressed' as const, diagnostic: null },
      ],
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

    expect(html).toContain('aria-label="Feature suppression filter"');
    expect(html).toContain('Active feature');
    expect(html).toContain('Suppressed feature');
  });
});

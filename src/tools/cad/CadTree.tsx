import { useState } from 'react';
import type { CadTreeProps } from './cad-workspace-types';

export function matchesCadTreeSearch(label: string, type: string, query: string): boolean {
  const normalizedQuery = query.trim().toLowerCase();
  return normalizedQuery.length === 0 || `${label} ${type}`.toLowerCase().includes(normalizedQuery);
}

export default function CadTree({ project, selection, onSelectFeature, onSelectBody, onToggleBodyVisibility, onToggleSuppressed, onSelectSketch }: CadTreeProps) {
  const [search, setSearch] = useState('');

  if (project.features.length === 0 && project.sketches.length === 0 && project.bodies.length === 0) {
    return <p className="cad-tree-empty">No features yet. Create a sketch or primitive to begin.</p>;
  }

  const sketches = project.sketches.filter((sketch) => matchesCadTreeSearch(sketch.label, 'sketch', search));
  const bodies = project.bodies.filter((body) => matchesCadTreeSearch(body.label, 'body', search));
  const features = project.features.filter((feature) => matchesCadTreeSearch(feature.label, feature.type, search));
  const hasMatches = sketches.length + bodies.length + features.length > 0;

  return (
    <>
      <input
        id="cad-tree-search"
        type="search"
        aria-label="Search tree"
        placeholder="Search by name or type"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
      />
      {hasMatches ? (
        <ul className="cad-tree" role="tree" aria-label="Feature tree">
          {sketches.map((sketch) => {
            const isSelected = selection?.kind === 'sketch' && selection.id === sketch.id;
            return (
              <li key={sketch.id} role="treeitem" aria-selected={isSelected}>
                <button
                  type="button"
                  className={`cad-tree-item${isSelected ? ' cad-tree-item-selected' : ''}`}
                  onClick={() => onSelectSketch(isSelected ? null : sketch.id)}
                  aria-current={isSelected ? 'true' : undefined}
                >
                  <span className="cad-tree-item-label">{sketch.label}</span>
                  <span className="cad-tree-item-type">sketch</span>
                </button>
              </li>
            );
          })}
          {bodies.map((body) => {
            const isSelected = selection?.kind === 'body' && selection.id === body.id;
            return (
              <li key={body.id} role="treeitem" aria-selected={isSelected}>
                <button
                  type="button"
                  className={`cad-tree-item${isSelected ? ' cad-tree-item-selected' : ''}`}
                  onClick={() => onSelectBody(isSelected ? null : body.id)}
                  aria-current={isSelected ? 'true' : undefined}
                >
                  <span className="cad-tree-item-label">{body.label}</span>
                  <span className="cad-tree-item-type">body</span>
                </button>
                <label className="cad-tree-item-suppress">
                  <input
                    type="checkbox"
                    checked={body.visible}
                    onChange={(event) => onToggleBodyVisibility(body.id, event.target.checked)}
                    aria-label={`Show ${body.label}`}
                  />
                  Visible
                </label>
              </li>
            );
          })}
          {features.map((feature) => {
            const isSelected = selection?.kind === 'feature' && selection.id === feature.id;
            return (
              <li key={feature.id} role="treeitem" aria-selected={isSelected}>
                <button
                  type="button"
                  className={`cad-tree-item${isSelected ? ' cad-tree-item-selected' : ''}`}
                  onClick={() => onSelectFeature(isSelected ? null : feature.id)}
                  aria-current={isSelected ? 'true' : undefined}
                >
                  <span className="cad-tree-item-label">{feature.label}</span>
                  <span className="cad-tree-item-type">{feature.type}</span>
                  {feature.status === 'failed' ? <span className="cad-tree-item-warning" role="img" aria-label="Feature failed to rebuild">⚠</span> : null}
                </button>
                <label className="cad-tree-item-suppress">
                  <input
                    type="checkbox"
                    checked={feature.suppressed}
                    onChange={(event) => onToggleSuppressed(feature.id, event.target.checked)}
                  />
                  Suppressed
                </label>
              </li>
            );
          })}
        </ul>
      ) : <p className="cad-tree-empty" role="status">No matching items.</p>}
    </>
  );
}

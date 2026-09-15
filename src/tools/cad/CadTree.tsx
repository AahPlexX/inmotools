import type { CadTreeProps } from './cad-workspace-types';

export default function CadTree({ project, selection, onSelectFeature, onToggleSuppressed }: CadTreeProps) {
  if (project.features.length === 0) {
    return <p className="cad-tree-empty">No features yet. Create a sketch or primitive to begin.</p>;
  }

  return (
    <ul className="cad-tree" role="tree" aria-label="Feature tree">
      {project.features.map((feature) => {
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
  );
}

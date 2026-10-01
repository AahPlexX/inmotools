import { useRef, useState, type FormEvent } from 'react';
import { readCanonicalCoordinate } from './coordinate-engine';
import { layerPlayerTokenIds } from './editor-engine';
import { useFocusTrap } from './TacticalOverlay';
import type { PlayerToken, TacticalProject } from './tactics-types';

export interface TacticalInspectorProps {
  project: TacticalProject;
  sceneId: string;
  sceneTokens: PlayerToken[];
  selectedTokenId?: string;
  groupedTokenIds: string[];
  tab: 'players' | 'layers';
  sheetOpen: boolean;
  onTabChange: (tab: 'players' | 'layers') => void;
  onSelectToken: (tokenId: string) => void;
  onToggleGrouped: (tokenId: string) => void;
  onGroup: (layerName: string) => void;
  onToggleTokenLock: (tokenId: string, locked: boolean) => void;
  onLayerVisibility: (layerId: string, visible: boolean) => void;
  onLayerLocked: (layerId: string, locked: boolean) => void;
  onReorderLayer: (layerId: string, direction: -1 | 1) => void;
  onSoloLayer: (layerId: string) => void;
  onFocusLayer: (layerId: string) => void;
  onNudge: (dx: number, dy: number) => void;
  onSetPosition: (event: FormEvent<HTMLFormElement>) => void;
  onCloseSheet: () => void;
}

function playerLabel(project: TacticalProject, token: PlayerToken): { jersey: string; name: string } {
  const team = project.teams.find((candidate) => candidate.id === token.teamId);
  const player = team?.roster.find((candidate) => candidate.id === token.playerId);
  return {
    jersey: player?.jerseyNumber ?? '—',
    name: player?.displayName ?? token.id,
  };
}

export default function TacticalInspector({
  project,
  sceneId,
  sceneTokens,
  selectedTokenId,
  groupedTokenIds,
  tab,
  sheetOpen,
  onTabChange,
  onSelectToken,
  onToggleGrouped,
  onGroup,
  onToggleTokenLock,
  onLayerVisibility,
  onLayerLocked,
  onReorderLayer,
  onSoloLayer,
  onFocusLayer,
  onNudge,
  onSetPosition,
  onCloseSheet,
}: TacticalInspectorProps) {
  const sheetRef = useRef<HTMLElement>(null);
  const [groupName, setGroupName] = useState('Group');
  const scene = project.scenes.find((candidate) => candidate.id === sceneId);
  const layers = scene?.layers ?? [];
  const selectedToken = sceneTokens.find((token) => token.id === selectedTokenId);
  useFocusTrap(sheetOpen, sheetRef, onCloseSheet);

  function submitGroup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onGroup(groupName);
  }

  return (
    <aside
      ref={sheetRef}
      className="tactical-inspector"
      aria-label="Player precision controls"
      tabIndex={-1}
    >
      {sheetOpen ? (
        <button id="tactical-close-players-sheet" type="button" className="action-button secondary" onClick={onCloseSheet}>
          Close players sheet
        </button>
      ) : null}
      <div className="tactical-inspector-tabs" role="group" aria-label="Inspector sections">
        <button type="button" aria-pressed={tab === 'players'} onClick={() => onTabChange('players')}>Show players</button>
        <button type="button" aria-pressed={tab === 'layers'} onClick={() => onTabChange('layers')}>Show layers</button>
      </div>

      <div hidden={tab !== 'players'}>
        <h3>Players</h3>
        <div className="tactical-player-list">
          {sceneTokens.map((token) => {
            const label = playerLabel(project, token);
            return (
              <div key={token.id} className="tactical-player-row">
                <button
                  type="button"
                  className={token.id === selectedTokenId ? 'selected' : ''}
                  aria-pressed={token.id === selectedTokenId}
                  onClick={() => onSelectToken(token.id)}
                >
                  <strong>{label.jersey}</strong>
                  <span>{label.name}</span>
                </button>
                <label className="tactical-include">
                  <input
                    type="checkbox"
                    aria-label={`Include ${label.name} in group`}
                    checked={groupedTokenIds.includes(token.id)}
                    onChange={() => onToggleGrouped(token.id)}
                  />
                </label>
              </div>
            );
          })}
        </div>

        <form className="tactical-group-form" onSubmit={submitGroup}>
          <label>
            Group layer name
            <input value={groupName} maxLength={80} onChange={(event) => setGroupName(event.target.value)} />
          </label>
          <button type="submit" className="action-button secondary" disabled={!groupedTokenIds.length}>
            Group checked players
          </button>
        </form>

        <button
          type="button"
          className="action-button secondary"
          disabled={!selectedToken}
          onClick={() => selectedToken && onToggleTokenLock(selectedToken.id, !selectedToken.locked)}
        >
          {selectedToken?.locked ? 'Unlock selected player' : 'Lock selected player'}
        </button>

        <h3>Precision move</h3>
        <div className="tactical-dpad" role="group" aria-label="Nudge selected player">
          <button type="button" onClick={() => onNudge(0, -0.02)} aria-label="Move player up">↑</button>
          <button type="button" onClick={() => onNudge(-0.02, 0)} aria-label="Move player left">←</button>
          <button type="button" onClick={() => onNudge(0.02, 0)} aria-label="Move player right">→</button>
          <button type="button" onClick={() => onNudge(0, 0.02)} aria-label="Move player down">↓</button>
        </div>

        {selectedToken ? (
          <form
            className="tactical-coordinate-form"
            onSubmit={onSetPosition}
            key={`${selectedToken.id}-${selectedToken.position.x}-${selectedToken.position.y}`}
          >
            <label>
              X %
              <input
                name="xPercent"
                type="number"
                min="0"
                max="100"
                step="0.1"
                defaultValue={(selectedToken.position.x * 100).toFixed(1)}
              />
            </label>
            <label>
              Y %
              <input
                name="yPercent"
                type="number"
                min="0"
                max="100"
                step="0.1"
                defaultValue={(selectedToken.position.y * 100).toFixed(1)}
              />
            </label>
            <button type="submit">Set position</button>
            <p className="tactical-coordinate-readout">
              {(() => {
                const reading = readCanonicalCoordinate(selectedToken.position, project.pitch.dimensions);
                return `Normalized ${reading.x.toFixed(3)}, ${reading.y.toFixed(3)}. Pitch metres ${reading.xMeters.toFixed(2)} m by ${reading.yMeters.toFixed(2)} m.`;
              })()}
            </p>
          </form>
        ) : <p>Select a player to enable exact coordinates.</p>}
      </div>

      <div className="tactical-layer-panel" hidden={tab !== 'layers'}>
        <h3>Layers</h3>
        {layers.map((layer, index) => {
          const count = layerPlayerTokenIds(project, sceneId, layer.id).length;
          return (
            <section key={layer.id} className="tactical-layer-row" aria-label={layer.name}>
              <h4>{layer.name}</h4>
              <p>{count} player{count === 1 ? '' : 's'}</p>
              <label className="tactical-include">
                <input
                  type="checkbox"
                  checked={layer.visible}
                  onChange={(event) => onLayerVisibility(layer.id, event.target.checked)}
                />
                <span>Show {layer.name}</span>
              </label>
              <label className="tactical-include">
                <input
                  type="checkbox"
                  checked={layer.locked}
                  onChange={(event) => onLayerLocked(layer.id, event.target.checked)}
                />
                <span>Lock {layer.name}</span>
              </label>
              <div className="tactical-layer-actions">
                <button type="button" disabled={index === 0} onClick={() => onReorderLayer(layer.id, -1)}>
                  Move {layer.name} up
                </button>
                <button type="button" disabled={index === layers.length - 1} onClick={() => onReorderLayer(layer.id, 1)}>
                  Move {layer.name} down
                </button>
                <button type="button" onClick={() => onSoloLayer(layer.id)}>Solo {layer.name}</button>
                <button type="button" onClick={() => onFocusLayer(layer.id)}>Focus {layer.name}</button>
              </div>
            </section>
          );
        })}
      </div>
    </aside>
  );
}

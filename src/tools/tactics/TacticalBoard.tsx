import { useMemo, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { serializeTacticalBoardSvg, type TacticalBoardRenderOptions } from './board-engine';
import {
  TacticalAnalysisOverlay,
  type AnalysisDisplaySettings,
} from './TacticalAnalysisPanel';
import type { NormalizedPoint, TacticalProject } from './tactics-types';
import { clientPointToNormalized } from './workspace-engine';

export interface TacticalBoardProps {
  project: TacticalProject;
  sceneId: string;
  selectedTokenId?: string;
  interactionMode: 'move' | 'arrow';
  arrowStart?: NormalizedPoint | null;
  analysisSettings?: AnalysisDisplaySettings;
  renderOptions?: TacticalBoardRenderOptions;
  onSelectToken: (tokenId: string) => void;
  onPitchPoint: (point: NormalizedPoint) => void;
  onOpenActions: (tokenId?: string) => void;
  onSelectBall?: () => void;
  onSelectAnnotation?: (annotationId: string) => void;
}

function entityFromTarget(target: EventTarget | null):
  | { kind: 'player'; id: string }
  | { kind: 'ball' }
  | { kind: 'annotation'; id: string }
  | null {
  if (!(target instanceof Element)) return null;
  const label = target.closest('[data-token-id]');
  if (label?.getAttribute('data-tactical-kind') === 'player-label') {
    const labelId = label.getAttribute('data-token-id');
    if (labelId) return { kind: 'player', id: labelId };
  }
  const player = target.closest<SVGGElement>('g[data-tactical-kind="player"]');
  if (player?.id) return { kind: 'player', id: player.id };
  if (target.closest('[data-tactical-kind="ball"]')) return { kind: 'ball' };
  const annotation = target.closest<SVGElement>('[data-tactical-kind="annotation"]');
  if (annotation?.id) return { kind: 'annotation', id: annotation.id };
  return null;
}

export default function TacticalBoard({
  project,
  sceneId,
  selectedTokenId,
  interactionMode,
  arrowStart,
  analysisSettings,
  renderOptions,
  onSelectToken,
  onPitchPoint,
  onOpenActions,
  onSelectBall,
  onSelectAnnotation,
}: TacticalBoardProps) {
  const svg = useMemo(
    () => serializeTacticalBoardSvg(project, sceneId, renderOptions),
    [project, sceneId, renderOptions],
  );

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (!event.isPrimary || event.button !== 0) return;
    const entity = entityFromTarget(event.target);
    if (entity?.kind === 'annotation') {
      onSelectAnnotation?.(entity.id);
      return;
    }
    if (interactionMode === 'move' && entity?.kind === 'player') {
      onSelectToken(entity.id);
      return;
    }
    if (interactionMode === 'move' && entity?.kind === 'ball') {
      onSelectBall?.();
      return;
    }

    const rect = event.currentTarget.getBoundingClientRect();
    onPitchPoint(clientPointToNormalized(event, rect));
  }

  function handleContextMenu(event: ReactMouseEvent<HTMLDivElement>) {
    event.preventDefault();
    const entity = entityFromTarget(event.target);
    onOpenActions(entity?.kind === 'player' ? entity.id : undefined);
  }

  const instruction = interactionMode === 'arrow'
    ? arrowStart
      ? 'Arrow start set. Tap or click the pitch to place the arrow end.'
      : 'Tap or click the pitch to place the arrow start.'
    : selectedTokenId
      ? 'Tap or click the pitch to move the selected player.'
      : 'Select a player, then tap or click the pitch to move them.';

  return (
    <section className="tactical-board-panel" aria-labelledby="tactical-board-heading">
      <div className="tactical-board-heading-row">
        <div>
          <h3 id="tactical-board-heading">Pitch board</h3>
          <p>{instruction}</p>
        </div>
        <span className="tactical-board-mode" aria-label={`Current tool: ${interactionMode}`}>
          {interactionMode === 'arrow' ? 'Arrow tool' : 'Move tool'}
        </span>
      </div>
      <div
        className="tactical-board"
        data-interaction-mode={interactionMode}
        data-selected-token={selectedTokenId ?? ''}
        onPointerDown={handlePointerDown}
        onContextMenu={handleContextMenu}
        role="group"
        aria-label={instruction}
      >
        <div className="tactical-board-svg" dangerouslySetInnerHTML={{ __html: svg }} />
        {analysisSettings ? (
          <TacticalAnalysisOverlay
            project={project}
            sceneId={sceneId}
            selectedTokenId={selectedTokenId}
            settings={analysisSettings}
          />
        ) : null}
        {arrowStart ? (
          <div
            className="tactical-arrow-start"
            style={{ left: `${arrowStart.x * 100}%`, top: `${arrowStart.y * 100}%` }}
            aria-hidden="true"
          />
        ) : null}
      </div>
    </section>
  );
}

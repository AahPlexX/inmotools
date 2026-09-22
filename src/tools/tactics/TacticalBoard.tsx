import { useMemo, type PointerEvent as ReactPointerEvent } from 'react';
import { serializeTacticalBoardSvg } from './board-engine';
import type { NormalizedPoint, TacticalProject } from './tactics-types';
import { clientPointToNormalized } from './workspace-engine';

export interface TacticalBoardProps {
  project: TacticalProject;
  sceneId: string;
  selectedTokenId?: string;
  interactionMode: 'move' | 'arrow';
  arrowStart?: NormalizedPoint | null;
  onSelectToken: (tokenId: string) => void;
  onPitchPoint: (point: NormalizedPoint) => void;
}

function tokenIdFromTarget(target: EventTarget | null): string | undefined {
  if (!(target instanceof Element)) return undefined;
  const token = target.closest<SVGGElement>('g[data-tactical-kind="player"]');
  return token?.id || undefined;
}

export default function TacticalBoard({
  project,
  sceneId,
  selectedTokenId,
  interactionMode,
  arrowStart,
  onSelectToken,
  onPitchPoint,
}: TacticalBoardProps) {
  const svg = useMemo(
    () => serializeTacticalBoardSvg(project, sceneId),
    [project, sceneId],
  );

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (!event.isPrimary || event.button !== 0) return;
    const tokenId = tokenIdFromTarget(event.target);
    if (interactionMode === 'move' && tokenId) {
      onSelectToken(tokenId);
      return;
    }

    const rect = event.currentTarget.getBoundingClientRect();
    onPitchPoint(clientPointToNormalized(event, rect));
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
        role="group"
        aria-label={instruction}
      >
        <div className="tactical-board-svg" dangerouslySetInnerHTML={{ __html: svg }} />
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

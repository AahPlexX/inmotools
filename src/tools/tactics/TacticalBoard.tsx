import { useRef, useState, useMemo, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { serializeTacticalBoardSvg, type TacticalBoardRenderOptions } from './board-engine';
import {
  TacticalAnalysisOverlay,
  type AnalysisDisplaySettings,
} from './TacticalAnalysisPanel';
import type { NormalizedPoint, TacticalProject } from './tactics-types';
import {
  PITCH_PAN_STEP,
  PITCH_ZOOM_MAX,
  PITCH_ZOOM_MIN,
  PITCH_ZOOM_STEP,
  dragPitchViewport,
  panPitchViewport,
  viewportPointToNormalized,
  zoomPitchViewport,
  type PitchViewport,
} from './workspace-engine';

export interface TacticalBoardProps {
  project: TacticalProject;
  sceneId: string;
  selectedTokenId?: string;
  interactionMode: 'move' | 'arrow' | 'freehand';
  arrowStart?: NormalizedPoint | null;
  freehandPoints?: readonly NormalizedPoint[];
  analysisSettings?: AnalysisDisplaySettings;
  renderOptions?: TacticalBoardRenderOptions;
  onSelectToken: (tokenId: string) => void;
  onPitchPoint: (point: NormalizedPoint) => void;
  onOpenActions: (tokenId?: string) => void;
  onSelectBall?: () => void;
  onSelectAnnotation?: (annotationId: string) => void;
  onFreehandGesture?: (phase: 'start' | 'extend' | 'end', point: NormalizedPoint) => void;
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
  freehandPoints = [],
  analysisSettings,
  renderOptions,
  onSelectToken,
  onPitchPoint,
  onOpenActions,
  onSelectBall,
  onSelectAnnotation,
  onFreehandGesture,
}: TacticalBoardProps) {
  const svg = useMemo(
    () => serializeTacticalBoardSvg(project, sceneId, renderOptions),
    [project, sceneId, renderOptions],
  );
  const [viewport, setViewport] = useState<PitchViewport>({ zoom: 1, panX: 0, panY: 0 });
  const [panDrag, setPanDrag] = useState(false);
  const viewportRef = useRef(viewport);
  const panDragRef = useRef<{ pointerId: number; x: number; y: number } | null>(null);
  const drawingRef = useRef(false);
  viewportRef.current = viewport;

  function pointFromEvent(event: ReactPointerEvent<HTMLDivElement>): NormalizedPoint {
    const rect = event.currentTarget.getBoundingClientRect();
    return viewportPointToNormalized(
      event.clientX - rect.left,
      event.clientY - rect.top,
      rect.width,
      rect.height,
      viewportRef.current,
    );
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (!event.isPrimary || event.button !== 0) return;
    if (panDrag) {
      panDragRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
      event.currentTarget.setPointerCapture(event.pointerId);
      return;
    }
    const entity = entityFromTarget(event.target);
    if (entity?.kind === 'annotation') {
      onSelectAnnotation?.(entity.id);
      return;
    }
    if (interactionMode === 'freehand') {
      drawingRef.current = true;
      event.currentTarget.setPointerCapture(event.pointerId);
      onFreehandGesture?.('start', pointFromEvent(event));
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

    onPitchPoint(pointFromEvent(event));
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const pan = panDragRef.current;
    if (pan && event.pointerId === pan.pointerId) {
      const rect = event.currentTarget.getBoundingClientRect();
      const dx = (event.clientX - pan.x) / rect.width;
      const dy = (event.clientY - pan.y) / rect.height;
      pan.x = event.clientX;
      pan.y = event.clientY;
      const next = dragPitchViewport(viewportRef.current, dx, dy);
      viewportRef.current = next;
      setViewport(next);
      return;
    }
    if (!drawingRef.current || interactionMode !== 'freehand') return;
    onFreehandGesture?.('extend', pointFromEvent(event));
  }

  function handlePointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    if (panDragRef.current?.pointerId === event.pointerId) {
      panDragRef.current = null;
      return;
    }
    if (!drawingRef.current) return;
    drawingRef.current = false;
    onFreehandGesture?.('end', pointFromEvent(event));
  }

  function handleContextMenu(event: ReactMouseEvent<HTMLDivElement>) {
    event.preventDefault();
    const entity = entityFromTarget(event.target);
    onOpenActions(entity?.kind === 'player' ? entity.id : undefined);
  }

  const instruction = panDrag
    ? 'Drag on the pitch (the drawn field). Pan (sliding the view) moves the view when zoom (how close the pitch looks) is above 1. The zoom and pan buttons stay available.'
    : interactionMode === 'freehand'
      ? 'Drag on the pitch (the drawn field) and release. A freehand stroke (a line you draw by hand) appears. Or choose Add freehand point, then Save freehand.'
    : interactionMode === 'arrow'
      ? arrowStart
        ? 'Arrow start set. Tap or click the pitch to place the arrow end.'
        : 'Tap or click the pitch to place the arrow start.'
      : selectedTokenId
        ? 'Tap or click the pitch to move the selected player.'
        : 'Select a player, then tap or click the pitch to move them.';
  const modeLabel = panDrag
    ? 'Pan tool'
    : interactionMode === 'freehand'
      ? 'Freehand tool'
      : interactionMode === 'arrow'
        ? 'Arrow tool'
        : 'Move tool';

  return (
    <section className="tactical-board-panel" aria-labelledby="tactical-board-heading">
      <div className="tactical-board-heading-row">
        <div>
          <h3 id="tactical-board-heading">Pitch board</h3>
          <p>{instruction}</p>
        </div>
        <span className="tactical-board-mode" aria-label={`Current tool: ${interactionMode}`}>
          {modeLabel}
        </span>
      </div>
      <div className="tactical-pitch-view-controls" role="group" aria-label="Pitch zoom and pan">
        <button type="button" onClick={() => setViewport((current) => zoomPitchViewport(current, current.zoom + PITCH_ZOOM_STEP))} disabled={viewport.zoom >= PITCH_ZOOM_MAX}>Zoom in</button>
        <button type="button" onClick={() => setViewport((current) => zoomPitchViewport(current, current.zoom - PITCH_ZOOM_STEP))} disabled={viewport.zoom <= PITCH_ZOOM_MIN}>Zoom out</button>
        <button type="button" onClick={() => setViewport((current) => panPitchViewport(current, -PITCH_PAN_STEP, 0))} disabled={viewport.zoom <= PITCH_ZOOM_MIN}>Pan left</button>
        <button type="button" onClick={() => setViewport((current) => panPitchViewport(current, PITCH_PAN_STEP, 0))} disabled={viewport.zoom <= PITCH_ZOOM_MIN}>Pan right</button>
        <button type="button" onClick={() => setViewport((current) => panPitchViewport(current, 0, -PITCH_PAN_STEP))} disabled={viewport.zoom <= PITCH_ZOOM_MIN}>Pan up</button>
        <button type="button" onClick={() => setViewport((current) => panPitchViewport(current, 0, PITCH_PAN_STEP))} disabled={viewport.zoom <= PITCH_ZOOM_MIN}>Pan down</button>
        <button type="button" onClick={() => setViewport({ zoom: 1, panX: 0, panY: 0 })}>Reset pitch view</button>
        <button type="button" aria-pressed={panDrag} onClick={() => setPanDrag((current) => !current)}>Drag to pan</button>
      </div>
      <div
        className="tactical-board"
        data-interaction-mode={panDrag ? 'pan' : interactionMode}
        data-selected-token={selectedTokenId ?? ''}
        data-pitch-zoom={String(viewport.zoom)}
        data-pitch-pan-x={String(viewport.panX)}
        data-pitch-pan-y={String(viewport.panY)}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onContextMenu={handleContextMenu}
        role="group"
        aria-label={instruction}
      >
        <div
          className="tactical-board-stage"
          style={{ transform: `translate(${viewport.panX * 100}%, ${viewport.panY * 100}%) scale(${viewport.zoom})` }}
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
          {freehandPoints.length ? (
            <svg className="tactical-freehand-preview" viewBox="0 0 1 1" preserveAspectRatio="none" aria-hidden="true">
              <polyline
                points={freehandPoints.map((point) => `${point.x},${point.y}`).join(' ')}
                fill="none"
                stroke="#fef08a"
                strokeWidth="0.008"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          ) : null}
          {arrowStart ? (
            <div
              className="tactical-arrow-start"
              style={{ left: `${arrowStart.x * 100}%`, top: `${arrowStart.y * 100}%` }}
              aria-hidden="true"
            />
          ) : null}
        </div>
      </div>
    </section>
  );
}

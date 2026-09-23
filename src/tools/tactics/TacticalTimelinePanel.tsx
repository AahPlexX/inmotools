import { useMemo, useState, type FormEvent } from 'react';
import TacticalCoordinationControls from './TacticalCoordinationControls';
import { createMotionPath, setKeyframeMotionPath } from './motion-engine';
import { createNormalizedPoint } from './pitch-engine';
import {
  addTimelineKeyframe,
  addTimelineMarker,
  addTimelineTrack,
  sampleTacticalTimeline,
  setTimelinePlayhead,
} from './timeline-engine';
import type {
  InterpolationKind,
  TacticalMotionPathKind,
  TacticalProject,
  TimelineTrack,
} from './tactics-types';

export interface TacticalTimelinePanelProps {
  project: TacticalProject;
  onEdit: (
    label: string,
    updater: (current: TacticalProject) => TacticalProject,
    message: string,
  ) => void;
}

function nextId(prefix: string, existing: string[]): string {
  const occupied = new Set(existing);
  let index = 1;
  while (occupied.has(`${prefix}-${index}`)) index += 1;
  return `${prefix}-${index}`;
}
function initialTargetPosition(project: TacticalProject, targetId: string) {
  if (targetId === 'ball') return { ...project.ball.position };
  const token = project.playerTokens.find((candidate) => candidate.id === targetId);
  if (!token) throw new Error(`Timeline target ${targetId} does not exist.`);
  return { ...token.position };
}

function withMotionSegment(
  project: TacticalProject,
  targetId: string,
  startMs: number,
  endMs: number,
  endX: number,
  endY: number,
  interpolation: InterpolationKind,
  pathKind: TacticalMotionPathKind,
  controls: Array<{ x: number; y: number }>,
): TacticalProject {
  if (!Number.isInteger(startMs) || !Number.isInteger(endMs) || startMs < 0 || endMs <= startMs) {
    throw new RangeError('Motion times must use non-negative integer milliseconds with end after start.');
  }
  if (endMs > project.timeline.durationMs) {
    throw new RangeError('Motion end cannot exceed the timeline duration.');
  }
  const sampled = sampleTacticalTimeline(project.timeline, startMs);
  const startPosition = sampled[targetId]?.position ?? initialTargetPosition(project, targetId);
  const endPosition = createNormalizedPoint(endX, endY);
  const startId = `motion-${targetId}-${startMs}`;
  const endId = `motion-${targetId}-${endMs}`;
  const startKeyframe = {
    id: startId,
    timeMs: startMs,
    position: startPosition,
    interpolation,
  } as const;
  const endKeyframe = {
    id: endId,
    timeMs: endMs,
    position: endPosition,
    interpolation: 'hold' as const,
  };

  const existing = project.timeline.tracks.find((track) => track.targetId === targetId);
  let track: TimelineTrack;
  let timeline = project.timeline;
  if (existing) {
    track = addTimelineKeyframe(existing, startKeyframe);
    track = addTimelineKeyframe(track, endKeyframe);
    timeline = {
      ...timeline,
      tracks: timeline.tracks.map((candidate) => candidate.id === existing.id ? track : candidate),
    };
  } else {
    track = {
      id: `track-${targetId}`,
      targetId,
      keyframes: [startKeyframe, endKeyframe],
    };
    timeline = addTimelineTrack(timeline, track);
  }

  if (pathKind !== 'linear') {
    const path = createMotionPath(pathKind, controls);
    const updatedTrack = setKeyframeMotionPath(track, startId, path);
    timeline = {
      ...timeline,
      tracks: timeline.tracks.map((candidate) => candidate.targetId === targetId ? updatedTrack : candidate),
    };
  }
  return { ...project, timeline };
}

export default function TacticalTimelinePanel({ project, onEdit }: TacticalTimelinePanelProps) {
  const targets = useMemo(
    () => [...project.playerTokens.map((token) => token.id), 'ball'],
    [project.playerTokens],
  );
  const [pathKind, setPathKind] = useState<TacticalMotionPathKind>('linear');

  function submitPlayhead(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const timeMs = Number(new FormData(event.currentTarget).get('playheadMs'));
    onEdit(
      'Set timeline playhead',
      (current) => ({ ...current, timeline: setTimelinePlayhead(current.timeline, timeMs) }),
      `Playhead set to ${timeMs} ms.`,
    );
  }

  function submitMarker(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const label = String(data.get('markerLabel') ?? '').trim();
    const timeMs = Number(data.get('markerTimeMs'));
    onEdit(
      'Add timeline marker',
      (current) => ({
        ...current,
        timeline: addTimelineMarker(current.timeline, {
          id: nextId('marker', current.timeline.markers.map((marker) => marker.id)),
          timeMs,
          kind: 'coaching-trigger',
          label,
        }),
      }),
      'Timeline marker added.',
    );
  }

  function submitMotion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const targetId = String(data.get('motionTarget') ?? '');
    const controls = pathKind === 'linear'
      ? []
      : pathKind === 'quadratic-bezier'
        ? [createNormalizedPoint(Number(data.get('control1X')) / 100, Number(data.get('control1Y')) / 100)]
        : [
            createNormalizedPoint(Number(data.get('control1X')) / 100, Number(data.get('control1Y')) / 100),
            createNormalizedPoint(Number(data.get('control2X')) / 100, Number(data.get('control2Y')) / 100),
          ];
    onEdit(
      'Author timeline motion segment',
      (current) => withMotionSegment(
        current,
        targetId,
        Number(data.get('motionStartMs')),
        Number(data.get('motionEndMs')),
        Number(data.get('motionEndX')) / 100,
        Number(data.get('motionEndY')) / 100,
        String(data.get('motionInterpolation')) as InterpolationKind,
        pathKind,
        controls,
      ),
      'Motion segment authored.',
    );
  }

  return (
    <details className="tactical-setup tactical-authoring">
      <summary>Timeline &amp; motion</summary>
      <div className="tactical-authoring-grid">
        <form onSubmit={submitPlayhead} aria-label="Timeline playhead">
          <h3>Playhead</h3>
          <label>
            Playhead (ms)
            <input name="playheadMs" type="number" min="0" step="1" max={project.timeline.durationMs} defaultValue={project.timeline.playheadMs} />
          </label>
          <button type="submit">Set playhead</button>
        </form>

        <form onSubmit={submitMarker} aria-label="Timeline marker">
          <h3>Marker</h3>
          <label>Marker label<input name="markerLabel" required /></label>
          <label>Marker time (ms)<input name="markerTimeMs" type="number" min="0" step="1" max={project.timeline.durationMs} required /></label>
          <button type="submit">Add timeline marker</button>
          {project.timeline.markers.length ? (
            <ul>{project.timeline.markers.map((marker) => <li key={marker.id}>{marker.timeMs} ms â€” {marker.label}</li>)}</ul>
          ) : <p>No timeline markers yet.</p>}
        </form>

        <form onSubmit={submitMotion} aria-label="Motion segment">
          <h3>Motion segment</h3>
          <label>
            Motion target
            <select name="motionTarget" defaultValue={targets[0]}>
              {targets.map((targetId) => <option key={targetId} value={targetId}>{targetId}</option>)}
            </select>
          </label>
          <label>Motion start (ms)<input name="motionStartMs" type="number" min="0" step="1" defaultValue="0" required /></label>
          <label>Motion end (ms)<input name="motionEndMs" type="number" min="1" step="1" defaultValue="1000" required /></label>
          <label>Motion end X %<input name="motionEndX" type="number" min="0" max="100" step="0.1" defaultValue="60" required /></label>
          <label>Motion end Y %<input name="motionEndY" type="number" min="0" max="100" step="0.1" defaultValue="50" required /></label>
          <label>
            Interpolation
            <select name="motionInterpolation" defaultValue="smooth">
              {['linear', 'smooth', 'ease-in', 'ease-out', 'ease-in-out', 'hold'].map((kind) => <option key={kind} value={kind}>{kind}</option>)}
            </select>
          </label>
          <label>
            Motion path
            <select value={pathKind} onChange={(event) => setPathKind(event.target.value as TacticalMotionPathKind)}>
              <option value="linear">Linear</option>
              <option value="quadratic-bezier">Quadratic BÃ©zier</option>
              <option value="cubic-bezier">Cubic BÃ©zier</option>
            </select>
          </label>
          {pathKind !== 'linear' ? (
            <>
              <label>Control 1 X %<input name="control1X" type="number" min="0" max="100" step="0.1" defaultValue="50" required /></label>
              <label>Control 1 Y %<input name="control1Y" type="number" min="0" max="100" step="0.1" defaultValue="25" required /></label>
            </>
          ) : null}
          {pathKind === 'cubic-bezier' ? (
            <>
              <label>Control 2 X %<input name="control2X" type="number" min="0" max="100" step="0.1" defaultValue="65" required /></label>
              <label>Control 2 Y %<input name="control2Y" type="number" min="0" max="100" step="0.1" defaultValue="75" required /></label>
            </>
          ) : null}
          <button type="submit">Author motion segment</button>
        </form>

        <TacticalCoordinationControls project={project} onEdit={onEdit} />

        <section aria-labelledby="timeline-tracks-heading">
          <h3 id="timeline-tracks-heading">Tracks</h3>
          {project.timeline.tracks.length ? (
            <ul>
              {project.timeline.tracks.map((track) => (
                <li key={track.id}>{track.targetId}: {track.keyframes.length} keyframes</li>
              ))}
            </ul>
          ) : <p>No authored motion tracks yet.</p>}
        </section>
      </div>
    </details>
  );
}

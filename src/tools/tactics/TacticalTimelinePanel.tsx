import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import TacticalBezierPathEditor from './TacticalBezierPathEditor';
import TacticalCoordinationControls from './TacticalCoordinationControls';
import TacticalTimingControls from './TacticalTimingControls';
import { createMotionPath, setKeyframeMotionPath } from './motion-engine';
import { createNormalizedPoint } from './pitch-engine';
import {
  addTimelineKeyframe,
  addTimelineMarker,
  addTimelineTrack,
  sampleTacticalTimeline,
  setTimelinePlayhead,
  stepTimelineFrame,
  timelineKeyframeTimes,
} from './timeline-engine';
import { TIMELINE_MARKER_KINDS } from './tactics-types';
import type {
  InterpolationKind,
  NormalizedPoint,
  TacticalMotionPathKind,
  TacticalProject,
  TimelineMarkerKind,
  TimelineTrack,
} from './tactics-types';

export interface TacticalTimelinePanelProps {
  project: TacticalProject;
  activeSceneId: string;
  previewTimeMs: number;
  onPreviewTimeChange: (timeMs: number) => void;
  onTransportStatus: (message: string) => void;
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
function trackTimingLabel(track: TimelineTrack): string {
  if (!track.keyframes.length) return '0 keyframes';
  const times = track.keyframes.map((keyframe) => keyframe.timeMs);
  return track.keyframes.length + ' keyframes, ' + Math.min(...times) + '-' + Math.max(...times) + ' ms';
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
  timingBezier?: [number, number, number, number],
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
    bezier: interpolation === 'cubic-bezier' ? timingBezier : undefined,
  };
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

export default function TacticalTimelinePanel({
  project,
  activeSceneId,
  previewTimeMs,
  onPreviewTimeChange,
  onTransportStatus,
  onEdit,
}: TacticalTimelinePanelProps) {
  const targets = useMemo(
    () => [...project.playerTokens.map((token) => token.id), 'ball'],
    [project.playerTokens],
  );
  const [motionTarget, setMotionTarget] = useState(targets[0] ?? 'ball');
  const [motionStartMs, setMotionStartMs] = useState(0);
  const [motionEndMs, setMotionEndMs] = useState(1000);
  const [motionEnd, setMotionEnd] = useState<NormalizedPoint>(() => createNormalizedPoint(0.6, 0.5));
  const [pathControls, setPathControls] = useState<[NormalizedPoint, NormalizedPoint]>(() => [
    createNormalizedPoint(0.5, 0.25),
    createNormalizedPoint(0.65, 0.75),
  ]);
  const [pathKind, setPathKind] = useState<TacticalMotionPathKind>('linear');
  const [interpolation, setInterpolation] = useState<InterpolationKind>('smooth');
  const [frameRate, setFrameRate] = useState(30);
  const [playing, setPlaying] = useState(false);
  const previewTimeRef = useRef(previewTimeMs);
  const keyframeTimes = useMemo(() => timelineKeyframeTimes(project.timeline), [project.timeline]);

  useEffect(() => {
    previewTimeRef.current = previewTimeMs;
  }, [previewTimeMs]);

  useEffect(() => {
    if (!targets.includes(motionTarget)) setMotionTarget(targets[0] ?? 'ball');
  }, [motionTarget, targets]);

  const motionStartPoint = useMemo(() => {
    const sampled = sampleTacticalTimeline(project.timeline, motionStartMs)[motionTarget]?.position;
    if (sampled) return createNormalizedPoint(sampled.x, sampled.y);
    if (motionTarget === 'ball') return createNormalizedPoint(project.ball.position.x, project.ball.position.y);
    const token = project.playerTokens.find((candidate) => candidate.id === motionTarget);
    return token
      ? createNormalizedPoint(token.position.x, token.position.y)
      : createNormalizedPoint(0.5, 0.5);
  }, [motionStartMs, motionTarget, project.ball.position, project.playerTokens, project.timeline]);


  useEffect(() => {
    if (!playing) return;
    const durationMs = project.timeline.durationMs;
    if (durationMs <= 0) {
      setPlaying(false);
      return;
    }

    let animationFrame = 0;
    let previousTimestamp = performance.now();
    const tick = (timestamp: number) => {
      const elapsedMs = (timestamp - previousTimestamp) * project.timeline.playbackRate;
      previousTimestamp = timestamp;
      let nextTime = previewTimeRef.current + elapsedMs;

      if (nextTime >= durationMs) {
        if (project.timeline.loop) {
          nextTime %= durationMs;
        } else {
          previewTimeRef.current = durationMs;
          onPreviewTimeChange(durationMs);
          setPlaying(false);
          onTransportStatus('Playback reached the end of the timeline.');
          return;
        }
      }

      const integerTime = Math.max(0, Math.min(durationMs, Math.round(nextTime)));
      previewTimeRef.current = integerTime;
      onPreviewTimeChange(integerTime);
      animationFrame = requestAnimationFrame(tick);
    };
    const handleVisibilityChange = () => {
      if (!document.hidden) return;
      setPlaying(false);
      onTransportStatus('Playback paused while this tab is hidden.');
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    animationFrame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(animationFrame);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [
    onPreviewTimeChange,
    onTransportStatus,
    playing,
    project.timeline.durationMs,
    project.timeline.loop,
    project.timeline.playbackRate,
  ]);

  function setPreviewTime(timeMs: number) {
    const next = setTimelinePlayhead({ ...project.timeline, loop: false }, Math.round(timeMs)).playheadMs;
    previewTimeRef.current = next;
    onPreviewTimeChange(next);
  }

  function play() {
    if (project.timeline.durationMs <= 0) return;
    if (previewTimeRef.current >= project.timeline.durationMs && !project.timeline.loop) {
      setPreviewTime(0);
    }
    setPlaying(true);
    onTransportStatus('Timeline playback started.');
  }

  function pause() {
    setPlaying(false);
    onTransportStatus('Timeline playback paused.');
  }

  function stop() {
    setPlaying(false);
    setPreviewTime(0);
    onTransportStatus('Timeline playback stopped.');
  }

  function moveToKeyframe(direction: -1 | 1) {
    const current = previewTimeRef.current;
    const next = direction > 0
      ? keyframeTimes.find((time) => time > current) ?? project.timeline.durationMs
      : [...keyframeTimes].reverse().find((time) => time < current) ?? 0;
    setPreviewTime(next);
    onTransportStatus(direction > 0 ? 'Moved to next keyframe.' : 'Moved to previous keyframe.');
  }

  function stepFrame(direction: -1 | 1) {
    const next = stepTimelineFrame(
      previewTimeRef.current,
      project.timeline.durationMs,
      frameRate,
      direction,
    );
    setPreviewTime(next);
    onTransportStatus(direction > 0 ? 'Moved forward one frame.' : 'Moved back one frame.');
  }

  function submitPlayhead(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const timeMs = Number(new FormData(event.currentTarget).get('playheadMs'));
    setPreviewTime(timeMs);
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
    const kind = String(data.get('markerKind') ?? 'coaching-cue') as TimelineMarkerKind;
    onEdit(
      'Add timeline marker',
      (current) => ({
        ...current,
        timeline: addTimelineMarker(current.timeline, {
          id: nextId('marker', current.timeline.markers.map((marker) => marker.id)),
          timeMs,
          kind,
          label,
        }),
      }),
      'Timeline marker added.',
    );
  }

  function submitMotion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const controls = pathKind === 'linear'
      ? []
      : pathKind === 'quadratic-bezier'
        ? [{ ...pathControls[0] }]
        : [{ ...pathControls[0] }, { ...pathControls[1] }];
    const timingBezier = interpolation === 'cubic-bezier'
      ? [
          Number(data.get('timingX1')),
          Number(data.get('timingY1')),
          Number(data.get('timingX2')),
          Number(data.get('timingY2')),
        ] as [number, number, number, number]
      : undefined;

    onEdit(
      'Author timeline motion segment',
      (current) => withMotionSegment(
        current,
        motionTarget,
        motionStartMs,
        motionEndMs,
        motionEnd.x,
        motionEnd.y,
        interpolation,
        pathKind,
        controls,
        timingBezier,
      ),
      'Motion segment authored.',
    );
  }

  return (
    <details className="tactical-setup tactical-authoring">
      <summary>Timeline &amp; motion</summary>
      <div className="tactical-authoring-grid">
        <section className="tactical-transport" aria-labelledby="timeline-transport-heading">
          <h3 id="timeline-transport-heading">Transport</h3>
          <div className="tactical-transport-status">
            <strong data-testid="timeline-preview-time">{previewTimeMs} ms</strong>
            <span>{playing ? 'Playing' : 'Paused'}</span>
          </div>
          <label>
            Timeline scrubber
            <input
              type="range"
              min="0"
              max={project.timeline.durationMs}
              step="1"
              value={previewTimeMs}
              onChange={(event) => setPreviewTime(Number(event.target.value))}
            />
          </label>
          <div className="tactical-transport-actions" role="group" aria-label="Timeline transport">
            <button type="button" aria-label="Previous keyframe" onClick={() => moveToKeyframe(-1)}>Previous keyframe</button>
            <button type="button" aria-label="Previous frame" onClick={() => stepFrame(-1)}>Previous frame</button>
            <button type="button" aria-label="Play timeline" disabled={playing} onClick={play}>Play</button>
            <button type="button" aria-label="Pause timeline" disabled={!playing} onClick={pause}>Pause</button>
            <button type="button" aria-label="Stop timeline" onClick={stop}>Stop</button>
            <button type="button" aria-label="Next frame" onClick={() => stepFrame(1)}>Next frame</button>
            <button type="button" aria-label="Next keyframe" onClick={() => moveToKeyframe(1)}>Next keyframe</button>
          </div>
          <label>
            Playback speed
            <select
              value={project.timeline.playbackRate}
              onChange={(event) => {
                const playbackRate = Number(event.target.value);
                onEdit(
                  'Set timeline playback speed',
                  (current) => ({ ...current, timeline: { ...current.timeline, playbackRate } }),
                  `Playback speed set to ${playbackRate}×.`,
                );
              }}
            >
              {[0.25, 0.5, 1, 1.5, 2].map((rate) => <option key={rate} value={rate}>{rate}×</option>)}
            </select>
          </label>
          <label className="tactical-loop-control">
            <input
              type="checkbox"
              checked={project.timeline.loop}
              onChange={(event) => {
                const loop = event.target.checked;
                onEdit(
                  'Set timeline loop',
                  (current) => ({ ...current, timeline: { ...current.timeline, loop } }),
                  loop ? 'Timeline looping enabled.' : 'Timeline looping disabled.',
                );
              }}
            />
            Loop playback
          </label>
          <label>
            Frame rate
            <select value={frameRate} onChange={(event) => setFrameRate(Number(event.target.value))}>
              {[24, 25, 30, 50, 60].map((rate) => <option key={rate} value={rate}>{rate} fps</option>)}
            </select>
          </label>
        </section>
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
          <label>
            Marker type
            <select name="markerKind" defaultValue="coaching-cue">
              {TIMELINE_MARKER_KINDS.map((kind) => (
                <option key={kind} value={kind}>{kind.replaceAll('-', ' ')}</option>
              ))}
            </select>
          </label>
          <label>Marker label<input name="markerLabel" required /></label>
          <label>Marker time (ms)<input name="markerTimeMs" type="number" min="0" step="1" max={project.timeline.durationMs} required /></label>
          <button type="submit">Add timeline marker</button>
          {project.timeline.markers.length ? (
            <ul>
              {project.timeline.markers.map((marker) => (
                <li key={marker.id}>{marker.timeMs} ms - {marker.label} ({marker.kind.replaceAll('-', ' ')})</li>
              ))}
            </ul>
          ) : <p>No timeline markers yet.</p>}
        </form>

        <form onSubmit={submitMotion} aria-label="Motion segment">
          <h3>Motion segment</h3>
          <label>
            Motion target
            <select name="motionTarget" value={motionTarget} onChange={(event) => setMotionTarget(event.target.value)}>
              {targets.map((targetId) => <option key={targetId} value={targetId}>{targetId}</option>)}
            </select>
          </label>
          <label>Motion start (ms)<input name="motionStartMs" type="number" min="0" max={project.timeline.durationMs} step="1" value={motionStartMs} onChange={(event) => setMotionStartMs(Number(event.target.value))} required /></label>
          <label>Motion end (ms)<input name="motionEndMs" type="number" min="1" max={project.timeline.durationMs} step="1" value={motionEndMs} onChange={(event) => setMotionEndMs(Number(event.target.value))} required /></label>
          <label>
            Interpolation
            <select
              name="motionInterpolation"
              value={interpolation}
              onChange={(event) => setInterpolation(event.target.value as InterpolationKind)}
            >
              {['linear', 'smooth', 'ease-in', 'ease-out', 'ease-in-out', 'cubic-bezier', 'hold'].map((kind) => <option key={kind} value={kind}>{kind}</option>)}
            </select>
          </label>
          {interpolation === 'cubic-bezier' ? (
            <>
              <label>Timing control X1<input name="timingX1" type="number" min="0" max="1" step="0.01" defaultValue="0.25" required /></label>
              <label>Timing control Y1<input name="timingY1" type="number" step="0.01" defaultValue="0.1" required /></label>
              <label>Timing control X2<input name="timingX2" type="number" min="0" max="1" step="0.01" defaultValue="0.25" required /></label>
              <label>Timing control Y2<input name="timingY2" type="number" step="0.01" defaultValue="1" required /></label>
            </>
          ) : null}
          <label>
            Motion path
            <select value={pathKind} onChange={(event) => setPathKind(event.target.value as TacticalMotionPathKind)}>
              <option value="linear">Linear</option>
              <option value="quadratic-bezier">Quadratic Bezier</option>
              <option value="cubic-bezier">Cubic Bezier</option>
            </select>
          </label>
          <TacticalBezierPathEditor
            kind={pathKind}
            start={motionStartPoint}
            end={motionEnd}
            controls={pathControls}
            onEndChange={setMotionEnd}
            onControlsChange={setPathControls}
          />
          <button type="submit">Author motion segment</button>
        </form>

        <TacticalTimingControls project={project} activeSceneId={activeSceneId} onEdit={onEdit} />

        <TacticalCoordinationControls project={project} onEdit={onEdit} />

        <section aria-labelledby="timeline-tracks-heading">
          <h3 id="timeline-tracks-heading">Tracks</h3>
          {project.timeline.tracks.length ? (
            <ul>
              {project.timeline.tracks.map((track) => (
                <li key={track.id}>{track.targetId}: {trackTimingLabel(track)}</li>
              ))}
            </ul>
          ) : <p>No authored motion tracks yet.</p>}
        </section>
      </div>
    </details>
  );
}

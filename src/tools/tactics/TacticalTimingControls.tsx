import { type FormEvent } from 'react';
import { cloneTacticalScene } from './scene-engine';
import {
  addTimelineKeyframe,
  offsetTimelineGroup,
  offsetTimelineTrack,
} from './timeline-engine';
import type { TacticalProject } from './tactics-types';

export interface TacticalTimingControlsProps {
  project: TacticalProject;
  activeSceneId: string;
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

export default function TacticalTimingControls({
  project,
  activeSceneId,
  onEdit,
}: TacticalTimingControlsProps) {
  const trackTargets = project.timeline.tracks.map((track) => track.targetId);
  const firstTarget = trackTargets[0] ?? '';
  function submitScene(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const startMs = Number(data.get('sceneStartMs'));
    const durationMs = Number(data.get('sceneDurationMs'));
    const name = String(data.get('sceneName') ?? '').trim();

    onEdit(
      'Clone timeline scene',
      (current) => cloneTacticalScene(current, activeSceneId, {
        id: nextId('scene', current.scenes.map((scene) => scene.id)),
        name,
        startMs,
        durationMs,
      }),
      'Timeline scene cloned.',
    );
  }

  function submitVisibility(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const targetId = String(data.get('visibilityTarget') ?? '');
    const timeMs = Number(data.get('visibilityTimeMs'));
    const visible = String(data.get('visibilityState')) === 'visible';

    onEdit(
      'Add visibility change',
      (current) => {
        const track = current.timeline.tracks.find((item) => item.targetId === targetId);
        if (!track) throw new Error(`Timeline target ${targetId} does not have a track.`);
        const updated = addTimelineKeyframe(track, {
          id: nextId(`visibility-${targetId}`, track.keyframes.map((keyframe) => keyframe.id)),
          timeMs,
          visible,
          interpolation: 'hold',
        });
        return {
          ...current,
          timeline: {
            ...current.timeline,
            tracks: current.timeline.tracks.map((item) => item.id === track.id ? updated : item),
          },
        };
      },
      'Visibility change added.',
    );
  }

  function submitOffset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const targetId = String(data.get('offsetTarget') ?? '');
    const deltaMs = Number(data.get('trackOffsetMs'));

    onEdit(
      'Offset timeline track',
      (current) => {
        const track = current.timeline.tracks.find((item) => item.targetId === targetId);
        if (!track) throw new Error(`Timeline target ${targetId} does not have a track.`);
        const updated = offsetTimelineTrack(track, deltaMs);
        if (updated.keyframes.some((keyframe) => keyframe.timeMs > current.timeline.durationMs)) {
          throw new RangeError('Track offset cannot move keyframes beyond the timeline duration.');
        }
        return {
          ...current,
          timeline: {
            ...current.timeline,
            tracks: current.timeline.tracks.map((item) => item.id === track.id ? updated : item),
          },
        };
      },
      'Timeline track offset applied.',
    );
  }
  function submitGroupTiming(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const targetIds = data.getAll('groupTimingTargets').map((value) => String(value));
    const baseOffsetMs = Number(data.get('groupBaseOffsetMs'));
    const staggerStepMs = Number(data.get('groupStaggerStepMs'));

    onEdit(
      'Apply grouped timeline timing',
      (current) => ({
        ...current,
        timeline: offsetTimelineGroup(
          current.timeline,
          targetIds,
          baseOffsetMs,
          staggerStepMs,
        ),
      }),
      'Grouped timeline timing applied.',
    );
  }

  return (
    <>
      <form onSubmit={submitScene} aria-label="Scene sequencing">
        <h3>Scene sequencing</h3>
        <p>Clone the active scene at a new timeline range so players and authored objects remain independently editable.</p>
        <label>Scene name<input name="sceneName" required /></label>
        <label>Scene start (ms)<input name="sceneStartMs" type="number" min="0" step="1" defaultValue="1000" required /></label>
        <label>Scene duration (ms)<input name="sceneDurationMs" type="number" min="0" step="1" defaultValue="1000" required /></label>
        <button type="submit">Add scene</button>
        <ul>
          {project.scenes.map((scene) => (
            <li key={scene.id}>
              {scene.startMs}-{scene.startMs + scene.durationMs} ms - {scene.name}
            </li>
          ))}
        </ul>
      </form>
      <form onSubmit={submitVisibility} aria-label="Temporal visibility">
        <h3>Visibility</h3>
        <label>
          Visibility target
          <select name="visibilityTarget" defaultValue={firstTarget}>
            {trackTargets.map((target) => <option key={target} value={target}>{target}</option>)}
          </select>
        </label>
        <label>Visibility time (ms)<input name="visibilityTimeMs" type="number" min="0" step="1" defaultValue="750" required /></label>
        <label>
          Visibility state
          <select name="visibilityState" defaultValue="hidden">
            <option value="visible">Visible</option>
            <option value="hidden">Hidden</option>
          </select>
        </label>
        <button type="submit" disabled={!firstTarget}>Add visibility change</button>
      </form>

      <form onSubmit={submitOffset} aria-label="Track timing offset">
        <h3>Track offset</h3>
        <label>
          Offset target
          <select name="offsetTarget" defaultValue={firstTarget}>
            {trackTargets.map((target) => <option key={target} value={target}>{target}</option>)}
          </select>
        </label>
        <label>Track offset (ms)<input name="trackOffsetMs" type="number" step="1" defaultValue="200" required /></label>
        <button type="submit" disabled={!firstTarget}>Offset track</button>
        <small>Offsets move the entire authored track and may not create negative or out-of-range project time.</small>
      </form>
      <form onSubmit={submitGroupTiming} aria-label="Grouped timing">
        <h3>Group timing &amp; stagger</h3>
        <label>
          Group targets
          <select
            name="groupTimingTargets"
            multiple
            size={Math.min(Math.max(trackTargets.length, 2), 5)}
            aria-describedby="group-timing-help"
          >
            {trackTargets.map((target) => <option key={target} value={target}>{target}</option>)}
          </select>
        </label>
        <label>Group base offset (ms)<input name="groupBaseOffsetMs" type="number" step="1" defaultValue="100" required /></label>
        <label>Stagger step (ms)<input name="groupStaggerStepMs" type="number" step="1" defaultValue="200" required /></label>
        <button type="submit" disabled={!firstTarget}>Apply group timing</button>
        <small id="group-timing-help">
          Selected targets keep their authored motion while each later selection receives one additional stagger step.
        </small>
      </form>
    </>
  );
}

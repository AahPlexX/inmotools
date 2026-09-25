import { type FormEvent, type MouseEvent } from 'react';
import {
  cloneTacticalScene,
  renameTacticalScene,
  reorderTacticalScene,
  splitTacticalScene,
} from './scene-engine';
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
  const activeScene = project.scenes.find((scene) => scene.id === activeSceneId) ?? project.scenes[0];
  const defaultSplitMs = activeScene
    ? activeScene.startMs + Math.max(1, Math.floor(activeScene.durationMs / 2))
    : 1;

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

  function submitSceneRename(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const sceneId = String(data.get('sceneEditId') ?? '');
    const name = String(data.get('sceneEditName') ?? '');
    onEdit(
      'Rename timeline scene',
      (current) => renameTacticalScene(current, sceneId, name),
      'Timeline scene renamed.',
    );
  }

  function moveScene(event: MouseEvent<HTMLButtonElement>, direction: -1 | 1) {
    const form = event.currentTarget.form;
    if (!form) return;
    const sceneId = String(new FormData(form).get('sceneEditId') ?? '');
    onEdit(
      direction < 0 ? 'Move timeline scene earlier' : 'Move timeline scene later',
      (current) => reorderTacticalScene(current, sceneId, direction),
      direction < 0 ? 'Timeline scene moved earlier.' : 'Timeline scene moved later.',
    );
  }

  function splitScene(event: MouseEvent<HTMLButtonElement>) {
    const form = event.currentTarget.form;
    if (!form) return;
    const data = new FormData(form);
    const sceneId = String(data.get('sceneEditId') ?? '');
    const splitMs = Number(data.get('sceneSplitMs'));
    const rightName = String(data.get('sceneSplitName') ?? '').trim();
    onEdit(
      'Split timeline scene',
      (current) => splitTacticalScene(current, sceneId, {
        rightId: nextId('scene', current.scenes.map((scene) => scene.id)),
        rightName,
        splitMs,
      }),
      'Timeline scene split.',
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
      <form key={`scene-edit-${activeSceneId}`} onSubmit={submitSceneRename} aria-label="Scene editing">
        <h3>Scene editing</h3>
        <p>Editing {activeScene?.name ?? activeSceneId}. Choose another scene with the Scene view control.</p>
        <input name="sceneEditId" type="hidden" value={activeSceneId} />
        <label>
          Rename scene to
          <input name="sceneEditName" defaultValue={activeScene?.name ?? ''} required />
        </label>
        <button type="submit">Rename scene</button>
        <div className="tactical-authoring-actions">
          <button type="button" onClick={(event) => moveScene(event, -1)} disabled={project.scenes.length < 2}>
            Move scene earlier
          </button>
          <button type="button" onClick={(event) => moveScene(event, 1)} disabled={project.scenes.length < 2}>
            Move scene later
          </button>
        </div>
        <label>
          Split at (ms)
          <input
            name="sceneSplitMs"
            type="number"
            min={(activeScene?.startMs ?? 0) + 1}
            max={Math.max((activeScene?.startMs ?? 0) + 1, (activeScene?.startMs ?? 0) + (activeScene?.durationMs ?? 0) - 1)}
            step="1"
            defaultValue={defaultSplitMs}
            required
          />
        </label>
        <label>
          New scene name
          <input name="sceneSplitName" defaultValue="Next phase" required />
        </label>
        <button type="button" onClick={splitScene} disabled={!activeScene || activeScene.durationMs < 2}>
          Split scene
        </button>
        <small>
          Splitting is blocked when authored scene motion continues past the split point so motion is never silently stranded.
        </small>
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

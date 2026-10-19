import { useState } from 'react';
import type { FormEvent, MouseEvent } from 'react';
import {
  cloneTacticalScene,
  joinTacticalScenes,
  renameTacticalScene,
  reorderTacticalScene,
  splitTacticalScene,
} from './scene-engine';
import {
  addTimelineSubstitutionEvent,
  nextTimelineSubstitutionId,
} from './substitution-engine';
import {
  addTimelineVisibilityChange,
  offsetTimelineGroup,
  offsetTimelineTrack,
} from './timeline-engine';
import type { SceneTransition, TacticalProject } from './tactics-types';
import { setSceneTransition } from './transition-engine';

export interface TacticalTimingControlsProps {
  project: TacticalProject;
  activeSceneId: string;
  onEdit: (
    label: string,
    updater: (current: TacticalProject) => TacticalProject,
    message: string,
  ) => boolean | void;
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
  const visibilityTargets = activeScene ? [
    ...activeScene.layers.map((layer) => ({ id: layer.id, label: `Layer: ${layer.name}` })),
    ...project.playerTokens
      .filter((token) => token.sceneId === activeScene.id)
      .map((token) => {
        const team = project.teams.find((candidate) => candidate.id === token.teamId);
        const player = team?.roster.find((candidate) => candidate.id === token.playerId);
        return {
          id: token.id,
          label: `Player: ${player?.displayName?.trim() || player?.jerseyNumber?.trim() || token.id}`,
        };
      }),
    ...project.equipment
      .filter((item) => item.sceneId === activeScene.id)
      .map((item) => ({ id: item.id, label: `Equipment: ${item.kind}` })),
    ...activeScene.objects.map((object) => ({ id: object.id, label: `Object: ${object.kind} (${object.id})` })),
    ...project.annotations
      .filter((annotation) => annotation.sceneId === activeScene.id)
      .map((annotation) => ({
        id: annotation.id,
        label: `Annotation: ${annotation.label?.trim() || annotation.kind}`,
      })),
  ] : [];
  const uniqueVisibilityTargets = [...new Map(
    visibilityTargets.map((target) => [target.id, target] as const),
  ).values()];
  const firstVisibilityTarget = uniqueVisibilityTargets[0]?.id ?? '';
  const substitutionCandidates = activeScene ? project.playerTokens
    .filter((token) => token.sceneId === activeScene.id)
    .flatMap((token) => {
      const team = project.teams.find((candidate) => candidate.id === token.teamId);
      const player = team?.roster.find((candidate) => candidate.id === token.playerId);
      if (!team || !player || player.status === 'neutral' || player.status === 'coach') return [];
      return [{
        id: token.id,
        teamId: team.id,
        status: player.status,
        label: `${player.displayName.trim() || player.jerseyNumber?.trim() || token.id} — ${player.status}`,
      }];
    }) : [];
  const firstOutgoingTarget = substitutionCandidates.find((candidate) => candidate.status === 'active')?.id ?? '';
  const firstIncomingTarget = substitutionCandidates.find((candidate) => candidate.status === 'substitute')?.id ?? '';
  const chronologicalScenes = [...project.scenes].sort(
    (left, right) => left.startMs - right.startMs || left.id.localeCompare(right.id),
  );
  const activeSceneIndex = chronologicalScenes.findIndex((scene) => scene.id === activeScene?.id);
  const nextScene = activeSceneIndex >= 0 ? chronologicalScenes[activeSceneIndex + 1] : undefined;
  const defaultSplitMs = activeScene
    ? activeScene.startMs + Math.max(1, Math.floor(activeScene.durationMs / 2))
    : 1;
  const [transitionDraft, setTransitionDraft] = useState<{
    sceneId: string; source?: SceneTransition; kind: SceneTransition['kind'] | 'none'; duration: string;
  } | null>(null);
  const draft = transitionDraft?.sceneId === activeSceneId && transitionDraft.source === activeScene?.transition ? transitionDraft : null;
  const transitionKind = draft?.kind ?? activeScene?.transition?.kind ?? 'none';
  const transitionDuration = draft?.duration ?? String(activeScene?.transition?.durationMs ?? Math.min(500, activeScene?.durationMs ?? 500));
  function editTransition(kind: typeof transitionKind, duration: string) {
    setTransitionDraft({ sceneId: activeSceneId, source: activeScene?.transition, kind, duration });
  }

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

  function submitTransition(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const rawKind = data.get('transitionKind');
    const kind = typeof rawKind === 'string' ? rawKind : 'none';
    const transition = kind === 'none' ? undefined : {
      kind: kind as SceneTransition['kind'],
      durationMs: kind === 'cut' ? 0 : Number(data.get('transitionDurationMs')),
    };
    const saved = onEdit('Set chapter transition', current => setSceneTransition(current, activeSceneId, transition), 'Chapter transition saved.');
    if (saved !== false) setTransitionDraft(null);
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

  function joinNextScene() {
    if (!activeScene || !nextScene) return;
    onEdit(
      'Join timeline scenes',
      (current) => joinTacticalScenes(current, activeScene.id, nextScene.id),
      'Timeline scenes joined.',
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
      (current) => ({
        ...current,
        timeline: addTimelineVisibilityChange(current.timeline, targetId, timeMs, visible),
      }),
      'Visibility change added.',
    );
  }

  function submitSubstitution(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const outgoingTargetId = String(data.get('substitutionOutgoing') ?? '');
    const incomingTargetId = String(data.get('substitutionIncoming') ?? '');
    const timeMs = Number(data.get('substitutionTimeMs'));

    onEdit(
      'Author timed substitution',
      (current) => addTimelineSubstitutionEvent(current, {
        id: nextTimelineSubstitutionId(current.timeline),
        timeMs,
        outgoingTargetId,
        incomingTargetId,
      }),
      `Timed substitution authored at ${timeMs} ms.`,
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
        <div className="tactical-authoring-actions">
          <button type="button" onClick={splitScene} disabled={!activeScene || activeScene.durationMs < 2}>
            Split scene
          </button>
          <button type="button" onClick={joinNextScene} disabled={!activeScene || !nextScene}>
            Join with next scene
          </button>
        </div>
        <small>
          Splitting is blocked when authored scene motion continues past the split point. Joining is available only for the next contiguous phase and preserves authored scene data.
        </small>
      </form>
      <form onSubmit={submitTransition} aria-label="Chapter transition" aria-describedby="chapter-transition-help">
        <h3>Chapter transition</h3>
        <label>
          Exit transition
          <select name="transitionKind" value={transitionKind} onChange={event => editTransition(event.target.value as typeof transitionKind, transitionDuration)}>
            <option value="none">No exit transition</option>
            <option value="cut">Cut</option>
            <option value="fade">Fade through background</option>
            <option value="morph">Morph players and ball</option>
          </select>
        </label>
        <label>
          Transition duration (ms)
          <input name="transitionDurationMs" type="number" step="1" value={transitionDuration} onChange={event => editTransition(transitionKind, event.target.value)} />
        </label>
        <button type="submit">Save chapter transition</button>
        <small>Fade and morph duration: 1 to {activeScene?.durationMs ?? 0} ms.</small>
        <small id="chapter-transition-help">Transitions finish at the next contiguous scene. Fade passes through the background. Morph pairs visible players by roster identity and moves the ball; other players, props and drawings switch halfway. Setting any transition makes preview and timed exports follow the playhead’s chapter; Scene view seeks to its start. None removes this scene’s setting. Duration is ignored for Cut and None.</small>
      </form>
      <form onSubmit={submitVisibility} aria-label="Temporal visibility">
        <h3>Visibility</h3>
        <label>
          Visibility target
          <select name="visibilityTarget" defaultValue={firstVisibilityTarget}>
            {uniqueVisibilityTargets.map((target) => (
              <option key={target.id} value={target.id}>{target.label}</option>
            ))}
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
        <button type="submit" disabled={!firstVisibilityTarget}>Add visibility change</button>
      </form>

      <form onSubmit={submitSubstitution} aria-label="Timed substitution">
        <h3>Substitution</h3>
        <p>Swap one on-field player for one off-field roster player at an exact timeline time.</p>
        <label>
          Outgoing player
          <select name="substitutionOutgoing" defaultValue={firstOutgoingTarget}>
            {substitutionCandidates.map((candidate) => (
              <option key={`out-${candidate.id}`} value={candidate.id}>{candidate.label}</option>
            ))}
          </select>
        </label>
        <label>
          Incoming player
          <select name="substitutionIncoming" defaultValue={firstIncomingTarget}>
            {substitutionCandidates.map((candidate) => (
              <option key={`in-${candidate.id}`} value={candidate.id}>{candidate.label}</option>
            ))}
          </select>
        </label>
        <label>
          Substitution time (ms)
          <input name="substitutionTimeMs" type="number" min="0" step="1" defaultValue="2000" required />
        </label>
        <button type="submit" disabled={!firstOutgoingTarget || !firstIncomingTarget}>Add timed substitution</button>
        <small>
          Active and substitute roster players stay selectable because earlier timed swaps can change who is on the field. At the chosen time, the outgoing player must be visible, the incoming player must be hidden, and both must belong to the same team and scene.
        </small>
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

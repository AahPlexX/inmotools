import { useMemo, useState, type FormEvent } from 'react';
import {
  applyCoordinatedAction,
  COORDINATED_ACTION_PRESETS,
  createCoordinatedActionTemplate,
} from './action-engine';
import { findPotentialPathConflicts, type PotentialPathConflict } from './conflict-engine';
import { addBallPossessionEvent } from './possession-engine';
import { createNormalizedPoint } from './pitch-engine';
import { addTimelineTrack, sampleTacticalTimeline } from './timeline-engine';
import {
  applyLinkedUnitAdjustment,
  applyLinkedUnitTranslation,
  createLinkedUnit,
  type LinkedUnitAdjustmentKind,
} from './unit-engine';
import type { TacticalProject, TacticalTimeline } from './tactics-types';

export interface TacticalCoordinationControlsProps {
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

function initialPosition(project: TacticalProject, targetId: string) {
  if (targetId === 'ball') return { ...project.ball.position };
  const token = project.playerTokens.find((candidate) => candidate.id === targetId);
  if (!token) throw new Error(`Timeline target ${targetId} does not exist.`);
  return { ...token.position };
}

function positionAt(project: TacticalProject, targetId: string, timeMs: number) {
  return sampleTacticalTimeline(project.timeline, timeMs)[targetId]?.position
    ?? initialPosition(project, targetId);
}

function ensureTargetTrack(
  project: TacticalProject,
  timeline: TacticalTimeline,
  targetId: string,
): TacticalTimeline {
  if (timeline.tracks.some((track) => track.targetId === targetId)) return timeline;
  return addTimelineTrack(timeline, {
    id: `track-${targetId}`,
    targetId,
    keyframes: [{
      id: `static-${targetId}-0`,
      timeMs: 0,
      position: initialPosition(project, targetId),
      interpolation: 'hold',
    }],
  });
}

export default function TacticalCoordinationControls({
  project,
  onEdit,
}: TacticalCoordinationControlsProps) {
  const playerTargets = useMemo(
    () => project.playerTokens.map((token) => token.id),
    [project.playerTokens],
  );
  const [conflicts, setConflicts] = useState<PotentialPathConflict[] | null>(null);
  const [actionPresetId, setActionPresetId] = useState('custom');
  const [unitOperation, setUnitOperation] = useState('translation');
  const selectedPreset = COORDINATED_ACTION_PRESETS.find((preset) => preset.id === actionPresetId);

  function submitAction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const targetA = String(data.get('actionTargetA') ?? '');
    const targetB = String(data.get('actionTargetB') ?? '');
    const targetC = String(data.get('actionTargetC') ?? '');
    const startMs = Number(data.get('actionStartMs'));
    const durationMs = Number(data.get('actionDurationMs'));
    const targets = [targetA, targetB, targetC];
    const endpoints = [
      createNormalizedPoint(Number(data.get('actionAEndX')) / 100, Number(data.get('actionAEndY')) / 100),
      createNormalizedPoint(Number(data.get('actionBEndX')) / 100, Number(data.get('actionBEndY')) / 100),
      createNormalizedPoint(Number(data.get('actionCEndX')) / 100, Number(data.get('actionCEndY')) / 100),
    ];

    onEdit(
      'Apply coordinated action',
      (current) => {
        if (!selectedPreset) {
          const template = createCoordinatedActionTemplate({
            id: `ui-action-${startMs}-${targetA}-${targetB}`,
            label: 'Custom coordinated action',
            roles: [
              {
                roleId: 'a',
                from: positionAt(current, targetA, startMs),
                to: endpoints[0]!,
                startOffsetMs: 0,
                durationMs,
                interpolation: 'smooth',
              },
              {
                roleId: 'b',
                from: positionAt(current, targetB, startMs),
                to: endpoints[1]!,
                startOffsetMs: 0,
                durationMs,
                interpolation: 'smooth',
              },
            ],
          });
          return {
            ...current,
            timeline: applyCoordinatedAction(
              current.timeline,
              template,
              { a: targetA, b: targetB },
              startMs,
            ),
          };
        }

        const assignments: Record<string, string> = {};
        const template = createCoordinatedActionTemplate({
          id: `ui-${selectedPreset.id}-${startMs}-${targets.slice(0, selectedPreset.roles.length).join('-')}`,
          label: selectedPreset.label,
          roles: selectedPreset.roles.map((role, index) => {
            const targetId = targets[index] ?? '';
            assignments[role.roleId] = targetId;
            return {
              roleId: role.roleId,
              from: positionAt(current, targetId, startMs + role.startOffsetMs),
              to: endpoints[index]!,
              startOffsetMs: role.startOffsetMs,
              durationMs: Math.max(1, Math.round(durationMs * role.durationScale)),
              interpolation: 'smooth',
            };
          }),
        });
        return {
          ...current,
          timeline: applyCoordinatedAction(current.timeline, template, assignments, startMs),
        };
      },
      selectedPreset ? `${selectedPreset.label} action authored.` : 'Coordinated action authored.',
    );
  }

  function submitLinkedUnit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const memberA = String(data.get('unitMemberA') ?? '');
    const memberB = String(data.get('unitMemberB') ?? '');
    const memberC = String(data.get('unitMemberC') ?? '');
    const members = [memberA, memberB, memberC].filter(Boolean);
    const startMs = Number(data.get('unitStartMs'));
    const durationMs = Number(data.get('unitDurationMs'));
    const operation = String(data.get('unitOperation') ?? 'translation');
    onEdit(
      operation === 'translation' ? 'Translate linked unit' : `Adjust linked unit: ${operation}`,
      (current) => {
        const unit = createLinkedUnit(
          `ui-unit-${members.join('-')}`,
          'Linked tactical unit',
          members,
        );
        const startPositions = Object.fromEntries(
          members.map((member) => [member, positionAt(current, member, startMs)]),
        );
        const timeline = operation === 'translation'
          ? applyLinkedUnitTranslation(
              current.timeline,
              unit,
              startPositions,
              {
                x: Number(data.get('unitDeltaX')) / 100,
                y: Number(data.get('unitDeltaY')) / 100,
              },
              startMs,
              durationMs,
            )
          : applyLinkedUnitAdjustment(
              current.timeline,
              unit,
              startPositions,
              {
                kind: operation as LinkedUnitAdjustmentKind,
                amount: Number(data.get('unitAdjustment')) / 100,
                direction: current.pitch.direction,
              },
              startMs,
              durationMs,
            );
        return { ...current, timeline };
      },
      operation === 'translation'
        ? 'Linked unit translated.'
        : `Linked unit ${operation} authored.`,
    );
  }

  function submitPossession(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const rawHolder = String(data.get('possessionHolder') ?? '');
    const holderTargetId = rawHolder || null;
    const timeMs = Number(data.get('possessionTimeMs'));
    onEdit(
      'Add possession event',
      (current) => {
        let timeline = ensureTargetTrack(current, current.timeline, 'ball');
        if (holderTargetId) timeline = ensureTargetTrack(current, timeline, holderTargetId);
        timeline = addBallPossessionEvent(timeline, {
          id: nextId('possession', timeline.possessionEvents?.map((item) => item.id) ?? []),
          timeMs,
          holderTargetId,
        });
        return { ...current, timeline };
      },
      holderTargetId ? `Possession assigned to ${holderTargetId}.` : 'Ball possession released.',
    );
  }

  function submitConflictReview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setConflicts(findPotentialPathConflicts(
      project.timeline,
      project.pitch.dimensions,
      {
        stepMs: Number(data.get('conflictStepMs')),
        thresholdMeters: Number(data.get('conflictThresholdMeters')),
      },
    ));
  }

  const firstTarget = playerTargets[0] ?? '';
  const secondTarget = playerTargets[1] ?? firstTarget;
  const thirdTarget = playerTargets[2] ?? '';

  return (
    <>
      <form onSubmit={submitAction} aria-label="Coordinated action">
        <h3>Coordinated action</h3>
        <label>
          Action pattern
          <select
            name="actionPreset"
            value={actionPresetId}
            onChange={(event) => setActionPresetId(event.target.value)}
          >
            <option value="custom">Custom pair</option>
            {COORDINATED_ACTION_PRESETS.map((preset) => (
              <option key={preset.id} value={preset.id}>{preset.label}</option>
            ))}
          </select>
        </label>
        <label>
          Action target A
          <select name="actionTargetA" defaultValue={firstTarget}>
            {playerTargets.map((target) => <option key={target} value={target}>{target}</option>)}
          </select>
        </label>
        <label>
          Action target B
          <select name="actionTargetB" defaultValue={secondTarget}>
            {playerTargets.map((target) => <option key={target} value={target}>{target}</option>)}
          </select>
        </label>
        {selectedPreset ? (
          <label>
            Action target C
            <select name="actionTargetC" defaultValue={thirdTarget} required>
              {playerTargets.map((target) => <option key={target} value={target}>{target}</option>)}
            </select>
          </label>
        ) : <input name="actionTargetC" type="hidden" value="" />}
        <label>Action start (ms)<input name="actionStartMs" type="number" min="0" step="1" defaultValue="0" required /></label>
        <label>Action duration (ms)<input name="actionDurationMs" type="number" min="1" step="1" defaultValue="1000" required /></label>
        <label>Action A end X %<input name="actionAEndX" type="number" min="0" max="100" step="0.1" defaultValue="45" required /></label>
        <label>Action A end Y %<input name="actionAEndY" type="number" min="0" max="100" step="0.1" defaultValue="35" required /></label>
        <label>Action B end X %<input name="actionBEndX" type="number" min="0" max="100" step="0.1" defaultValue="55" required /></label>
        <label>Action B end Y %<input name="actionBEndY" type="number" min="0" max="100" step="0.1" defaultValue="65" required /></label>
        {selectedPreset ? (
          <>
            <label>Action C end X %<input name="actionCEndX" type="number" min="0" max="100" step="0.1" defaultValue="65" required /></label>
            <label>Action C end Y %<input name="actionCEndY" type="number" min="0" max="100" step="0.1" defaultValue="50" required /></label>
            <small>
              Pattern timing gives you a useful starting sequence. Targets and end positions stay editable for your actual players and session.
            </small>
          </>
        ) : (
          <>
            <input name="actionCEndX" type="hidden" value="50" />
            <input name="actionCEndY" type="hidden" value="50" />
          </>
        )}
        <button
          type="submit"
          disabled={playerTargets.length < (selectedPreset ? selectedPreset.roles.length : 2)}
        >
          Apply coordinated action
        </button>
      </form>

      <form onSubmit={submitLinkedUnit} aria-label="Linked unit">
        <h3>Linked unit</h3>
        <label>
          Linked member A
          <select name="unitMemberA" defaultValue={firstTarget}>
            {playerTargets.map((target) => <option key={target} value={target}>{target}</option>)}
          </select>
        </label>
        <label>
          Linked member B
          <select name="unitMemberB" defaultValue={secondTarget}>
            {playerTargets.map((target) => <option key={target} value={target}>{target}</option>)}
          </select>
        </label>
        <label>
          Linked member C (optional)
          <select name="unitMemberC" defaultValue="">
            <option value="">None</option>
            {playerTargets.map((target) => <option key={target} value={target}>{target}</option>)}
          </select>
        </label>
        <label>
          Unit operation
          <select
            name="unitOperation"
            value={unitOperation}
            onChange={(event) => setUnitOperation(event.target.value)}
          >
            <option value="translation">Translate together</option>
            <option value="line-shift">Line shift</option>
            <option value="step">Step forward</option>
            <option value="drop">Drop</option>
            <option value="width">Adjust width</option>
            <option value="depth">Adjust depth</option>
          </select>
        </label>
        <label>Unit start (ms)<input name="unitStartMs" type="number" min="0" step="1" defaultValue="1500" required /></label>
        <label>Unit duration (ms)<input name="unitDurationMs" type="number" min="1" step="1" defaultValue="1000" required /></label>
        {unitOperation === 'translation' ? (
          <>
            <label>Unit delta X %<input name="unitDeltaX" type="number" step="0.1" defaultValue="5" required /></label>
            <label>Unit delta Y %<input name="unitDeltaY" type="number" step="0.1" defaultValue="0" required /></label>
            <input name="unitAdjustment" type="hidden" value="0" />
          </>
        ) : (
          <>
            <label>
              Unit adjustment %
              <input
                name="unitAdjustment"
                type="number"
                step="0.1"
                defaultValue={unitOperation === 'width' || unitOperation === 'depth' ? '25' : '5'}
                required
              />
            </label>
            <input name="unitDeltaX" type="hidden" value="0" />
            <input name="unitDeltaY" type="hidden" value="0" />
            <small>
              Step and drop follow the current direction of play. Width and depth scale the unit around its centre; line shift moves the unit across the pitch.
            </small>
          </>
        )}
        <button type="submit" disabled={playerTargets.length < 2}>
          {unitOperation === 'translation' ? 'Translate linked unit' : 'Apply linked unit adjustment'}
        </button>
      </form>

      <form onSubmit={submitPossession} aria-label="Ball possession">
        <h3>Possession &amp; handoff</h3>
        <label>
          Possession holder
          <select name="possessionHolder" defaultValue={firstTarget}>
            <option value="">Release / loose ball</option>
            {playerTargets.map((target) => <option key={target} value={target}>{target}</option>)}
          </select>
        </label>
        <label>Possession time (ms)<input name="possessionTimeMs" type="number" min="0" step="1" defaultValue="500" required /></label>
        <button type="submit">Add possession event</button>
        {project.timeline.possessionEvents?.length ? (
          <ul>
            {project.timeline.possessionEvents.map((item) => (
              <li key={item.id}>{item.timeMs} ms -&gt; {item.holderTargetId ?? 'released'}</li>
            ))}
          </ul>
        ) : <p>No possession events yet.</p>}
      </form>

      <form onSubmit={submitConflictReview} aria-label="Potential path conflict review">
        <h3>Path-conflict review</h3>
        <label>Conflict step (ms)<input name="conflictStepMs" type="number" min="1" step="1" defaultValue="250" required /></label>
        <label>Conflict threshold (m)<input name="conflictThresholdMeters" type="number" min="0.1" step="0.1" defaultValue="1" required /></label>
        <button type="submit">Review path conflicts</button>
        {conflicts === null ? (
          <p>Run the review to inspect authored tracks.</p>
        ) : conflicts.length ? (
          <div aria-live="polite">
            <strong>Potential conflicts found: {conflicts.length}</strong>
            <ul>
              {conflicts.slice(0, 8).map((conflict) => (
                <li key={`${conflict.targetA}-${conflict.targetB}-${conflict.timeMs}`}>
                  {conflict.timeMs} ms - {conflict.targetA} / {conflict.targetB} - {conflict.distanceMeters.toFixed(2)} m
                </li>
              ))}
            </ul>
          </div>
        ) : <p aria-live="polite">No potential conflicts at this threshold.</p>}
        <small>Geometric proximity aid only; it does not predict collisions or player intent.</small>
      </form>
    </>
  );
}

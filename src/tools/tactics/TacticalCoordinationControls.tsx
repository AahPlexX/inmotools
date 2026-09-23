import { useMemo, useState, type FormEvent } from 'react';
import { applyCoordinatedAction, createCoordinatedActionTemplate } from './action-engine';
import { findPotentialPathConflicts, type PotentialPathConflict } from './conflict-engine';
import { addBallPossessionEvent } from './possession-engine';
import { createNormalizedPoint } from './pitch-engine';
import { addTimelineTrack, sampleTacticalTimeline } from './timeline-engine';
import { applyLinkedUnitTranslation, createLinkedUnit } from './unit-engine';
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
  function submitAction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const targetA = String(data.get('actionTargetA') ?? '');
    const targetB = String(data.get('actionTargetB') ?? '');
    const startMs = Number(data.get('actionStartMs'));
    const durationMs = Number(data.get('actionDurationMs'));
    onEdit(
      'Apply coordinated action',
      (current) => {
        const template = createCoordinatedActionTemplate({
          id: `ui-action-${startMs}-${targetA}-${targetB}`,
          label: 'Coordinated action',
          roles: [
            {
              roleId: 'a',
              from: positionAt(current, targetA, startMs),
              to: createNormalizedPoint(
                Number(data.get('actionAEndX')) / 100,
                Number(data.get('actionAEndY')) / 100,
              ),
              startOffsetMs: 0,
              durationMs,
              interpolation: 'smooth',
            },
            {
              roleId: 'b',
              from: positionAt(current, targetB, startMs),
              to: createNormalizedPoint(
                Number(data.get('actionBEndX')) / 100,
                Number(data.get('actionBEndY')) / 100,
              ),
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
      },
      'Coordinated action authored.',
    );
  }

  function submitLinkedUnit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const memberA = String(data.get('unitMemberA') ?? '');
    const memberB = String(data.get('unitMemberB') ?? '');
    const startMs = Number(data.get('unitStartMs'));
    const durationMs = Number(data.get('unitDurationMs'));
    onEdit(
      'Translate linked unit',
      (current) => {
        const unit = createLinkedUnit(
          `ui-unit-${memberA}-${memberB}`,
          'Linked tactical unit',
          [memberA, memberB],
        );
        return {
          ...current,
          timeline: applyLinkedUnitTranslation(
            current.timeline,
            unit,
            {
              [memberA]: positionAt(current, memberA, startMs),
              [memberB]: positionAt(current, memberB, startMs),
            },
            {
              x: Number(data.get('unitDeltaX')) / 100,
              y: Number(data.get('unitDeltaY')) / 100,
            },
            startMs,
            durationMs,
          ),
        };
      },
      'Linked unit translated.',
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

  return (
    <>
      <form onSubmit={submitAction} aria-label="Coordinated action">
        <h3>Coordinated action</h3>
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
        <label>Action start (ms)<input name="actionStartMs" type="number" min="0" step="1" defaultValue="0" required /></label>
        <label>Action duration (ms)<input name="actionDurationMs" type="number" min="1" step="1" defaultValue="1000" required /></label>
        <label>Action A end X %<input name="actionAEndX" type="number" min="0" max="100" step="0.1" defaultValue="45" required /></label>
        <label>Action A end Y %<input name="actionAEndY" type="number" min="0" max="100" step="0.1" defaultValue="35" required /></label>
        <label>Action B end X %<input name="actionBEndX" type="number" min="0" max="100" step="0.1" defaultValue="55" required /></label>
        <label>Action B end Y %<input name="actionBEndY" type="number" min="0" max="100" step="0.1" defaultValue="65" required /></label>
        <button type="submit" disabled={playerTargets.length < 2}>Apply coordinated action</button>
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
        <label>Unit start (ms)<input name="unitStartMs" type="number" min="0" step="1" defaultValue="1500" required /></label>
        <label>Unit duration (ms)<input name="unitDurationMs" type="number" min="1" step="1" defaultValue="1000" required /></label>
        <label>Unit delta X %<input name="unitDeltaX" type="number" step="0.1" defaultValue="5" required /></label>
        <label>Unit delta Y %<input name="unitDeltaY" type="number" step="0.1" defaultValue="0" required /></label>
        <button type="submit" disabled={playerTargets.length < 2}>Translate linked unit</button>
      </form>

      <form onSubmit={submitPossession} aria-label="Ball possession">
        <h3>Possession & handoff</h3>
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
              <li key={item.id}>{item.timeMs} ms → {item.holderTargetId ?? 'released'}</li>
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
                  {conflict.timeMs} ms — {conflict.targetA} / {conflict.targetB} — {conflict.distanceMeters.toFixed(2)} m
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

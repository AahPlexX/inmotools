import { addTimelineVisibilityChange, sampleTacticalProjectAtTime } from './timeline-engine';
import type { TacticalProject, TacticalTimeline } from './tactics-types';

export interface TimelineSubstitutionEventInput {
  id: string;
  timeMs: number;
  outgoingTargetId: string;
  incomingTargetId: string;
}

type SubstitutionRole = 'outgoing' | 'incoming';

const SUBSTITUTION_PREFIX = 'substitution';

export function substitutionEventTag(idValue: string, role: SubstitutionRole): string {
  const id = idValue.trim();
  if (!id) throw new Error('Substitution id is required.');
  return `[${SUBSTITUTION_PREFIX}:${encodeURIComponent(id)}:${role}]`;
}

function hasSubstitutionId(timeline: TacticalTimeline, id: string): boolean {
  const outgoing = substitutionEventTag(id, 'outgoing');
  const incoming = substitutionEventTag(id, 'incoming');
  return timeline.tracks.some((track) => track.keyframes.some((keyframe) => (
    keyframe.event?.includes(outgoing) || keyframe.event?.includes(incoming)
  )));
}

export function nextTimelineSubstitutionId(timeline: TacticalTimeline): string {
  let index = 1;
  while (hasSubstitutionId(timeline, `substitution-${index}`)) index += 1;
  return `substitution-${index}`;
}

function appendEventTag(value: string | undefined, tag: string): string {
  const existing = value?.trim();
  if (!existing) return tag;
  if (existing.includes(tag)) return existing;
  return `${existing} | ${tag}`;
}

function rosterPlayerForToken(project: TacticalProject, targetId: string) {
  const token = project.playerTokens.find((candidate) => candidate.id === targetId);
  if (!token) throw new Error(`Substitution target ${targetId} is not a player token.`);
  const team = project.teams.find((candidate) => candidate.id === token.teamId);
  const player = team?.roster.find((candidate) => candidate.id === token.playerId);
  if (!team || !player) throw new Error(`Substitution target ${targetId} has no roster player.`);
  if (player.status === 'neutral' || player.status === 'coach') {
    throw new Error('Timed substitutions can use active or substitute roster players only.');
  }
  return { token, team, player };
}

export function addTimelineSubstitutionEvent(
  project: TacticalProject,
  input: TimelineSubstitutionEventInput,
): TacticalProject {
  const id = input.id.trim();
  if (!id) throw new Error('Substitution id is required.');
  if (!Number.isInteger(input.timeMs) || input.timeMs < 0) {
    throw new RangeError('Substitution time must be a non-negative integer millisecond value.');
  }
  if (input.timeMs > project.timeline.durationMs) {
    throw new RangeError('Substitution time cannot exceed timeline duration.');
  }
  const outgoingTargetId = input.outgoingTargetId.trim();
  const incomingTargetId = input.incomingTargetId.trim();
  if (!outgoingTargetId || !incomingTargetId) {
    throw new Error('Substitution outgoing and incoming players are required.');
  }
  if (outgoingTargetId === incomingTargetId) {
    throw new Error('Substitution outgoing and incoming players must be different.');
  }
  if (hasSubstitutionId(project.timeline, id)) {
    throw new Error(`Substitution id ${id} already exists.`);
  }

  const outgoing = rosterPlayerForToken(project, outgoingTargetId);
  const incoming = rosterPlayerForToken(project, incomingTargetId);
  if (outgoing.team.id !== incoming.team.id) {
    throw new Error('Substitution outgoing and incoming players must belong to the same team.');
  }
  if (outgoing.token.sceneId !== incoming.token.sceneId) {
    throw new Error('Substitution outgoing and incoming players must belong to the same scene.');
  }

  const priorTimeMs = input.timeMs === 0 ? 0 : input.timeMs - 1;
  const before = sampleTacticalProjectAtTime(project, priorTimeMs);
  const outgoingBefore = before.playerTokens.find((token) => token.id === outgoingTargetId);
  const incomingBefore = before.playerTokens.find((token) => token.id === incomingTargetId);
  if (!outgoingBefore?.visible) {
    throw new Error('Substitution outgoing player must be visible immediately before the authored time.');
  }
  if (incomingBefore?.visible) {
    throw new Error('Substitution incoming player must be hidden immediately before the authored time.');
  }

  let timeline = addTimelineVisibilityChange(
    project.timeline,
    outgoingTargetId,
    input.timeMs,
    false,
    outgoing.token.visible,
  );
  timeline = addTimelineVisibilityChange(
    timeline,
    incomingTargetId,
    input.timeMs,
    true,
    incoming.token.visible,
  );

  const eventTags = new Map<string, string>([
    [outgoingTargetId, substitutionEventTag(id, 'outgoing')],
    [incomingTargetId, substitutionEventTag(id, 'incoming')],
  ]);
  timeline = {
    ...timeline,
    tracks: timeline.tracks.map((track) => {
      const tag = eventTags.get(track.targetId);
      if (!tag) return track;
      return {
        ...track,
        keyframes: track.keyframes.map((keyframe) => (
          keyframe.timeMs === input.timeMs
            ? { ...keyframe, event: appendEventTag(keyframe.event, tag) }
            : keyframe
        )),
      };
    }),
  };

  return { ...project, timeline };
}

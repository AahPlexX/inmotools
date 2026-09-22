import type { FormationTemplate, SourceProvenance, TacticalProject } from './tactics-types';
import { createNormalizedPoint } from './pitch-engine';

const US_SOCCER_FORMATION_SOURCE: SourceProvenance = {
  kind: 'recommendation',
  authoritative: false,
  organization: 'U.S. Soccer',
  sourceTitle: 'The U.S. Way — Formations',
  sourceUrl: 'https://www.ussoccer.com/us-way/player-development/game/formations',
  sourceDate: '2026-09-21',
  note: 'U.S. Soccer identifies these as examples; other formations may be used.',
};

const TOOL_DEFAULT_SOURCE: SourceProvenance = {
  kind: 'tool-default',
  authoritative: false,
  sourceTitle: 'InMo Tools editable formation starter',
  sourceDate: '2026-09-21',
  note: 'Editable organizational starter; not a mandatory governing-body formation.',
};

function template(
  id: string,
  label: string,
  teamSize: number,
  goalkeepers: number,
  outfieldLines: number[],
  notation: string,
  notationIncludesGoalkeeper: boolean,
  provenance: SourceProvenance = TOOL_DEFAULT_SOURCE,
): FormationTemplate {
  return {
    id,
    label,
    teamSize,
    goalkeepers,
    outfieldLines,
    notation,
    notationIncludesGoalkeeper,
    provenance,
  };
}

export const FORMATION_TEMPLATES: FormationTemplate[] = [
  template('tool-3v3-1-1-1', '3v3 1-1-1 starter', 3, 0, [1, 1, 1], '1-1-1', false),
  template('ussf-4v4-1-2-1', 'U.S. Soccer U7–U8 4v4 example', 4, 0, [1, 2, 1], '1-2-1', false, US_SOCCER_FORMATION_SOURCE),
  template('tool-5v5-1-2-1-1', '5v5 1-2-1-1 starter', 5, 1, [2, 1, 1], '1-2-1-1', true),
  template('ussf-7v7-1-3-2-1', 'U.S. Soccer U9–U10 7v7 example', 7, 1, [3, 2, 1], '1-3-2-1', true, US_SOCCER_FORMATION_SOURCE),
  template('ussf-9v9-1-3-2-3', 'U.S. Soccer U11–U12 9v9 example', 9, 1, [3, 2, 3], '1-3-2-3', true, US_SOCCER_FORMATION_SOURCE),
  template('ussf-11v11-1-4-3-3', 'U.S. Soccer U13+ 11v11 example', 11, 1, [4, 3, 3], '1-4-3-3', true, US_SOCCER_FORMATION_SOURCE),
  template('tool-11v11-1-4-2-3-1', '11v11 1-4-2-3-1 starter', 11, 1, [4, 2, 3, 1], '1-4-2-3-1', true),
  template('tool-11v11-1-3-5-2', '11v11 1-3-5-2 starter', 11, 1, [3, 5, 2], '1-3-5-2', true),
  template('tool-11v11-1-4-4-2', '11v11 1-4-4-2 starter', 11, 1, [4, 4, 2], '1-4-4-2', true),
  template('tool-11v11-1-5-3-2', '11v11 1-5-3-2 starter', 11, 1, [5, 3, 2], '1-5-3-2', true),
  template('tool-11v11-1-3-4-3', '11v11 1-3-4-3 starter', 11, 1, [3, 4, 3], '1-3-4-3', true),
  template('tool-11v11-1-4-1-4-1', '11v11 1-4-1-4-1 starter', 11, 1, [4, 1, 4, 1], '1-4-1-4-1', true),
];

export function getFormationTemplate(id: string): FormationTemplate | undefined {
  return FORMATION_TEMPLATES.find((item) => item.id === id);
}

export function validateFormationTemplate(templateToValidate: FormationTemplate): string[] {
  const errors: string[] = [];
  const { teamSize, goalkeepers, outfieldLines } = templateToValidate;

  if (!Number.isInteger(teamSize) || teamSize < 1) {
    errors.push('Team size must be a positive integer.');
  }
  if (!Number.isInteger(goalkeepers) || goalkeepers < 0) {
    errors.push('Goalkeeper count must be a non-negative integer.');
  }
  if (outfieldLines.length === 0 || outfieldLines.some((count) => !Number.isInteger(count) || count < 1)) {
    errors.push('Outfield lines must contain positive integer player counts.');
  }

  const outfieldPlayers = outfieldLines.reduce((sum, count) => sum + count, 0);
  if (goalkeepers + outfieldPlayers !== teamSize) {
    errors.push('Formation player total does not match the selected team size.');
  }

  if (goalkeepers > 0 && !templateToValidate.notationIncludesGoalkeeper) {
    errors.push('Formation notation must explicitly include the goalkeeper.');
  }

  const expectedNotation = templateToValidate.notationIncludesGoalkeeper
    ? [goalkeepers, ...outfieldLines].join('-')
    : outfieldLines.join('-');
  if (templateToValidate.notation !== expectedNotation) {
    errors.push(`Formation notation must be ${expectedNotation} for these player counts.`);
  }

  return errors;
}

export interface CustomFormationInput {
  id: string;
  label: string;
  teamSize: number;
  goalkeepers: number;
  outfieldLines: number[];
}

export function createCustomFormationTemplate(input: CustomFormationInput): FormationTemplate {
  const id = input.id.trim();
  const label = input.label.trim();
  if (!id) throw new Error('Formation id is required.');
  if (!label) throw new Error('Formation label is required.');
  const notationIncludesGoalkeeper = input.goalkeepers > 0;
  const formation: FormationTemplate = {
    id,
    label,
    teamSize: input.teamSize,
    goalkeepers: input.goalkeepers,
    outfieldLines: [...input.outfieldLines],
    notation: (notationIncludesGoalkeeper
      ? [input.goalkeepers, ...input.outfieldLines]
      : input.outfieldLines).join('-'),
    notationIncludesGoalkeeper,
    provenance: {
      kind: 'custom',
      authoritative: false,
      sourceTitle: 'User-authored formation',
      note: 'Editable formation authored in Tactical Matchboard Studio.',
    },
  };
  const errors = validateFormationTemplate(formation);
  if (errors.length) throw new Error(errors.join(' '));
  return formation;
}

export function reviewFormationLegality(
  project: TacticalProject,
  formation: FormationTemplate,
): string[] {
  const issues = validateFormationTemplate(formation);
  const visibleTokens = project.playerTokens.filter((token) => token.visible);
  if (visibleTokens.length !== formation.teamSize) {
    issues.push(`Formation expects ${formation.teamSize} placed players; the board has ${visibleTokens.length}.`);
  }
  if (project.ruleset.teamSize !== formation.teamSize) {
    issues.push(`Rules profile expects ${project.ruleset.teamSize} players while the formation expects ${formation.teamSize}.`);
  }
  const assignedPlayers = visibleTokens.map((token) => `${token.teamId}:${token.playerId}`);
  if (new Set(assignedPlayers).size !== assignedPlayers.length) {
    issues.push('A roster player is assigned to more than one visible token.');
  }
  const goalkeeperCount = visibleTokens.filter((token) => {
    const team = project.teams.find((candidate) => candidate.id === token.teamId);
    const player = team?.roster.find((candidate) => candidate.id === token.playerId);
    return player?.role?.toLocaleLowerCase() === 'goalkeeper';
  }).length;
  if (goalkeeperCount !== formation.goalkeepers) {
    issues.push(`Formation expects ${formation.goalkeepers} goalkeeper${formation.goalkeepers === 1 ? '' : 's'}; the board has ${goalkeeperCount}.`);
  }
  return issues;
}

export interface CaptureFormationPhaseInput {
  id: string;
  label: string;
  teamId: string;
  timeMs: number;
}

export function captureFormationPhase(
  project: TacticalProject,
  input: CaptureFormationPhaseInput,
): TacticalProject {
  const id = input.id.trim();
  const label = input.label.trim();
  if (!id) throw new Error('Formation phase id is required.');
  if (!label) throw new Error('Formation phase label is required.');
  if (!Number.isInteger(input.timeMs) || input.timeMs < 0) {
    throw new RangeError('Formation phase time must be a non-negative integer number of milliseconds.');
  }
  if (!project.teams.some((team) => team.id === input.teamId)) {
    throw new Error(`Team "${input.teamId}" does not exist.`);
  }
  const tokens = project.playerTokens.filter((token) => token.teamId === input.teamId);
  if (!tokens.length) throw new Error(`Team "${input.teamId}" has no placed players to capture.`);
  const phase = {
    id,
    label,
    teamId: input.teamId,
    timeMs: input.timeMs,
    playerPositions: Object.fromEntries(tokens.map((token) => [
      token.id,
      createNormalizedPoint(token.position.x, token.position.y),
    ])),
  };
  return {
    ...project,
    formationStates: [...project.formationStates.filter((state) => state.id !== id), phase],
  };
}

export function morphFormationPhases(
  project: TacticalProject,
  fromId: string,
  toId: string,
  progress: number,
): TacticalProject {
  if (!Number.isFinite(progress) || progress < 0 || progress > 1) {
    throw new RangeError('Formation morph progress must be within [0, 1].');
  }
  const from = project.formationStates.find((state) => state.id === fromId);
  const to = project.formationStates.find((state) => state.id === toId);
  if (!from || !to) throw new Error('Both formation phases must exist before morphing.');
  if (from.teamId !== to.teamId) throw new Error('Formation phases must belong to the same team.');
  return {
    ...project,
    playerTokens: project.playerTokens.map((token) => {
      const start = from.playerPositions[token.id];
      const end = to.playerPositions[token.id];
      if (token.teamId !== from.teamId || !start || !end) return token;
      return {
        ...token,
        position: createNormalizedPoint(
          start.x + (end.x - start.x) * progress,
          start.y + (end.y - start.y) * progress,
        ),
      };
    }),
  };
}


export function materializeFormationPositions(
  formation: FormationTemplate,
  direction: 'left-to-right' | 'right-to-left' = 'left-to-right',
): import('./tactics-types').NormalizedPoint[] {
  const errors = validateFormationTemplate(formation);
  if (errors.length) {
    throw new Error(`Cannot place invalid formation: ${errors.join(' ')}`);
  }

  const points: import('./tactics-types').NormalizedPoint[] = [];
  const lineCount = formation.outfieldLines.length;
  const firstLineX = formation.goalkeepers > 0 ? 0.28 : 0.16;
  const lastLineX = 0.82;

  if (formation.goalkeepers > 0) {
    for (let index = 0; index < formation.goalkeepers; index += 1) {
      const y = (index + 1) / (formation.goalkeepers + 1);
      points.push({ x: 0.08, y });
    }
  }

  formation.outfieldLines.forEach((playersInLine, lineIndex) => {
    const x = lineCount === 1
      ? (firstLineX + lastLineX) / 2
      : firstLineX + (lastLineX - firstLineX) * (lineIndex / (lineCount - 1));
    for (let index = 0; index < playersInLine; index += 1) {
      points.push({
        x: Number(x.toFixed(12)),
        y: Number(((index + 1) / (playersInLine + 1)).toFixed(12)),
      });
    }
  });

  if (points.length !== formation.teamSize) {
    throw new Error('Formation placement did not produce the selected team size.');
  }

  return direction === 'right-to-left'
    ? points.map((point) => ({ x: Number((1 - point.x).toFixed(12)), y: point.y }))
    : points;
}

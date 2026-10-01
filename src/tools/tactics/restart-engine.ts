import { createNormalizedPoint } from './pitch-engine';
import type { NormalizedPoint, SourceProvenance, TacticalProject } from './tactics-types';

export interface RestartTemplate {
  id: string;
  label: string;
  kind: 'kick-off' | 'corner' | 'free-kick' | 'goal-kick';
  ballPosition: NormalizedPoint;
  guides: Array<{ label: string; points: NormalizedPoint[] }>;
  provenance: SourceProvenance;
}

const TOOL_RESTART_SOURCE: SourceProvenance = {
  kind: 'tool-default',
  authoritative: false,
  sourceTitle: 'InMo Tools editable restart starter',
  sourceDate: '2026-09-22',
  note: 'Coaching layout starter, not a governing-body legality decision.',
};

const IFAB_RESTART_SOURCES = {
  'kick-off': {
    kind: 'governing-source',
    authoritative: true,
    organization: 'The IFAB',
    sourceTitle: 'Laws of the Game 2026/27 — Law 8: The Start and Restart of Play',
    sourceUrl: 'https://www.theifab.com/laws/latest/the-start-and-restart-of-play/',
    sourceVersion: '2026/27',
    sourceDate: '2026-09-22',
  },
  'free-kick': {
    kind: 'governing-source',
    authoritative: true,
    organization: 'The IFAB',
    sourceTitle: 'Laws of the Game 2026/27 — Law 13: Free Kicks',
    sourceUrl: 'https://www.theifab.com/laws/latest/free-kicks/',
    sourceVersion: '2026/27',
    sourceDate: '2026-09-22',
  },
  'goal-kick': {
    kind: 'governing-source',
    authoritative: true,
    organization: 'The IFAB',
    sourceTitle: 'Laws of the Game 2026/27 — Law 16: The Goal Kick',
    sourceUrl: 'https://www.theifab.com/laws/latest/the-goal-kick/',
    sourceVersion: '2026/27',
    sourceDate: '2026-09-22',
  },
  corner: {
    kind: 'governing-source',
    authoritative: true,
    organization: 'The IFAB',
    sourceTitle: 'Laws of the Game 2026/27 — Law 17: The Corner Kick',
    sourceUrl: 'https://www.theifab.com/laws/latest/the-corner-kick/',
    sourceVersion: '2026/27',
    sourceDate: '2026-09-22',
  },
} satisfies Record<RestartTemplate['kind'], SourceProvenance>;

export interface RestartReviewIssue {
  code: 'kickoff-ball-not-centered' | 'corner-ball-outside-area' | 'goal-kick-ball-outside-area' | 'opponent-distance' | 'opponent-position';
  message: string;
  source: SourceProvenance;
}

export const RESTART_TEMPLATES: RestartTemplate[] = [
  {
    id: 'tool-kick-off',
    label: 'Kick-off starter',
    kind: 'kick-off',
    ballPosition: { x: 0.5, y: 0.5 },
    guides: [{ label: 'Kick-off support route', points: [{ x: 0.5, y: 0.5 }, { x: 0.42, y: 0.62 }] }],
    provenance: TOOL_RESTART_SOURCE,
  },
  {
    id: 'tool-corner-left',
    label: 'Left attacking corner starter',
    kind: 'corner',
    ballPosition: { x: 0.02, y: 0.02 },
    guides: [{ label: 'Corner attacking route', points: [{ x: 0.02, y: 0.02 }, { x: 0.14, y: 0.36 }, { x: 0.08, y: 0.5 }] }],
    provenance: TOOL_RESTART_SOURCE,
  },
  {
    id: 'tool-wide-free-kick',
    label: 'Wide free-kick starter',
    kind: 'free-kick',
    ballPosition: { x: 0.72, y: 0.12 },
    guides: [{ label: 'Wide free-kick route', points: [{ x: 0.72, y: 0.12 }, { x: 0.9, y: 0.45 }] }],
    provenance: TOOL_RESTART_SOURCE,
  },
];

export interface CustomRestartTemplateInput {
  id: string;
  label: string;
  kind: RestartTemplate['kind'];
  ballPosition: NormalizedPoint;
  guideLabel: string;
  guidePoints: NormalizedPoint[];
}

export function createCustomRestartTemplate(input: CustomRestartTemplateInput): RestartTemplate {
  const id = input.id.trim();
  const label = input.label.trim();
  const guideLabel = input.guideLabel.trim();
  if (!id) throw new Error('Restart template id is required.');
  if (!label) throw new Error('Restart template label is required.');
  if (!guideLabel) throw new Error('Restart guide label is required.');
  if (input.guidePoints.length < 2) throw new Error('Restart guide requires at least two points.');
  return {
    id,
    label,
    kind: input.kind,
    ballPosition: createNormalizedPoint(input.ballPosition.x, input.ballPosition.y),
    guides: [{
      label: guideLabel,
      points: input.guidePoints.map((point) => createNormalizedPoint(point.x, point.y)),
    }],
    provenance: {
      kind: 'custom',
      authoritative: false,
      sourceTitle: 'User-authored restart template',
      note: 'Local coaching template; not a governing-body legality decision.',
    },
  };
}

function distanceMeters(
  left: NormalizedPoint,
  right: NormalizedPoint,
  project: TacticalProject,
): number {
  const dx = (left.x - right.x) * project.pitch.dimensions.lengthMeters;
  const dy = (left.y - right.y) * project.pitch.dimensions.widthMeters;
  return Math.hypot(dx, dy);
}

function isInsideIfabGoalArea(point: NormalizedPoint, project: TacticalProject): boolean {
  const { lengthMeters, widthMeters } = project.pitch.dimensions;
  const xMeters = point.x * lengthMeters;
  const yMeters = point.y * widthMeters;
  const nearGoalLine = xMeters <= 5.5 || xMeters >= lengthMeters - 5.5;
  const goalAreaHalfWidth = (7.32 + 11) / 2;
  return nearGoalLine && Math.abs(yMeters - widthMeters / 2) <= goalAreaHalfWidth;
}

function isInsideIfabPenaltyArea(point: NormalizedPoint, project: TacticalProject, leftGoal: boolean): boolean {
  const { lengthMeters, widthMeters } = project.pitch.dimensions;
  const xMeters = point.x * lengthMeters;
  const yMeters = point.y * widthMeters;
  const withinDepth = leftGoal ? xMeters <= 16.5 : xMeters >= lengthMeters - 16.5;
  const penaltyAreaHalfWidth = (7.32 + 33) / 2;
  return withinDepth && Math.abs(yMeters - widthMeters / 2) <= penaltyAreaHalfWidth;
}

export function reviewRestartLegality(
  project: TacticalProject,
  template: RestartTemplate,
  restartingTeamId?: string,
): RestartReviewIssue[] {
  const source = IFAB_RESTART_SOURCES[template.kind];
  const issues: RestartReviewIssue[] = [];
  const ball = createNormalizedPoint(template.ballPosition.x, template.ballPosition.y);
  const usesIfabLaws = project.ruleset.provenance.organization === 'The IFAB';

  if (usesIfabLaws && template.kind === 'kick-off' && distanceMeters(ball, { x: 0.5, y: 0.5 }, project) > 0.01) {
    issues.push({ code: 'kickoff-ball-not-centered', message: 'IFAB kick-offs place the stationary ball on the centre mark.', source });
  }
  if (usesIfabLaws && template.kind === 'corner') {
    const cornerDistance = Math.min(
      ...[{ x: 0, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 0 }, { x: 1, y: 1 }]
        .map((corner) => distanceMeters(ball, corner, project)),
    );
    if (cornerDistance > 1) {
      issues.push({ code: 'corner-ball-outside-area', message: 'IFAB corner kicks place the ball within one metre of the nearest corner.', source });
    }
  }
  if (usesIfabLaws && template.kind === 'goal-kick' && !isInsideIfabGoalArea(ball, project)) {
    issues.push({ code: 'goal-kick-ball-outside-area', message: 'IFAB goal kicks place the stationary ball within the defending goal area.', source });
  }

  const opponents = restartingTeamId
    ? project.playerTokens.filter((token) => token.visible && token.teamId !== restartingTeamId)
    : [];
  if (usesIfabLaws && ['kick-off', 'free-kick', 'corner'].includes(template.kind)) {
    for (const opponent of opponents) {
      if (distanceMeters(ball, opponent.position, project) < 9.15) {
        issues.push({
          code: 'opponent-distance',
          message: `${opponent.id} is inside the IFAB 9.15 m opponent-distance guide. Quick-restart exceptions require referee judgment.`,
          source,
        });
      }
    }
  }
  if (usesIfabLaws && template.kind === 'goal-kick') {
    const leftGoal = ball.x <= 0.5;
    for (const opponent of opponents) {
      if (isInsideIfabPenaltyArea(opponent.position, project, leftGoal)) {
        issues.push({
          code: 'opponent-position',
          message: `${opponent.id} is inside the penalty area before the goal kick; IFAB Law 16 includes quick-restart exceptions requiring referee judgment.`,
          source,
        });
      }
    }
  }
  if (project.ruleset.id === 'ussf-pdi-7v7-2017' && template.kind === 'goal-kick') {
    const offset = (14 * 0.9144) / project.pitch.dimensions.lengthMeters;
    const leftGoal = ball.x <= 0.5;
    for (const opponent of opponents) {
      const behindBuildOutLine = leftGoal ? opponent.position.x >= offset : opponent.position.x <= 1 - offset;
      if (!behindBuildOutLine) {
        issues.push({
          code: 'opponent-position',
          message: `${opponent.id} is not behind the U.S. Soccer PDI build-out line before the goal kick is put into play.`,
          source: project.ruleset.provenance,
        });
      }
    }
  }
  return issues;
}

function requireEditableLayer(project: TacticalProject, sceneId: string, layerId: string): void {
  const scene = project.scenes.find((candidate) => candidate.id === sceneId);
  if (!scene) throw new Error(`Scene "${sceneId}" does not exist.`);
  const layer = scene.layers.find((candidate) => candidate.id === layerId);
  if (!layer) throw new Error(`Layer "${layerId}" does not exist in scene "${sceneId}".`);
  if (layer.locked) throw new Error(`Layer "${layerId}" is locked.`);
}

export function applyRestartTemplate(
  project: TacticalProject,
  sceneId: string,
  layerId: string,
  templateOrId: RestartTemplate | string,
): TacticalProject {
  requireEditableLayer(project, sceneId, layerId);
  const template = typeof templateOrId === 'string'
    ? RESTART_TEMPLATES.find((candidate) => candidate.id === templateOrId)
    : templateOrId;
  if (!template) throw new Error(`Restart template "${templateOrId}" does not exist.`);
  const occupied = new Set(project.annotations.map((annotation) => annotation.id));
  const annotations = template.guides.map((guide, index) => {
    let suffix = index + 1;
    let id = `restart-${template.id}-${suffix}`;
    while (occupied.has(id)) {
      suffix += 1;
      id = `restart-${template.id}-${suffix}`;
    }
    occupied.add(id);
    return {
      id,
      kind: 'restart-guide',
      label: guide.label,
      sceneId,
      layerId,
      points: guide.points.map((point) => createNormalizedPoint(point.x, point.y)),
      provenance: { ...template.provenance },
    };
  });
  return {
    ...project,
    ball: {
      ...project.ball,
      position: createNormalizedPoint(template.ballPosition.x, template.ballPosition.y),
      attachedToPlayerId: null,
    },
    annotations: [...project.annotations, ...annotations],
  };
}

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

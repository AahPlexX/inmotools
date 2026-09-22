import type {
  NormalizedPoint,
  TacticalProject,
} from './tactics-types';
import { isNormalizedPoint, trainingFormatProfiles } from './pitch-engine';

export const TACTICS_SCHEMA_VERSION = 1 as const;

function isoNow(): string {
  return new Date().toISOString();
}

function cloneDefaultRuleset(): TacticalProject['ruleset'] {
  const source = trainingFormatProfiles.find((profile) => profile.teamSize === 11);
  if (!source) throw new Error('Missing 11v11 starter rules profile.');
  return {
    ...source,
    provenance: { ...source.provenance },
  };
}

export function createStarterTacticalProject(): TacticalProject {
  const now = isoNow();
  return {
    schemaVersion: TACTICS_SCHEMA_VERSION,
    id: 'tactical-project',
    metadata: {
      title: 'Untitled tactical project',
      description: '',
      creator: '',
      club: '',
      ageGroup: '',
      sessionType: '',
      tacticalTheme: '',
      tags: [],
      rights: '',
      license: '',
      language: '',
      createdAt: now,
      modifiedAt: now,
      notes: '',
    },
    ruleset: cloneDefaultRuleset(),
    pitch: {
      profileId: 'training-11v11',
      dimensions: { lengthMeters: 105, widthMeters: 68 },
      direction: 'left-to-right',
      overlays: [],
    },
    teams: [],
    playerTokens: [],
    officials: [],
    equipment: [],
    scenes: [
      {
        id: 'scene-1',
        name: 'Scene 1',
        startMs: 0,
        durationMs: 5_000,
        layers: [
          {
            id: 'layer-1',
            name: 'Tactics',
            visible: true,
            locked: false,
          },
        ],
        objects: [],
      },
    ],
    formationStates: [],
    ball: {
      position: { x: 0.5, y: 0.5 },
      elevationMeters: 0,
      attachedToPlayerId: null,
    },
    annotations: [],
    timeline: {
      playheadMs: 0,
      durationMs: 5_000,
      loop: false,
      playbackRate: 1,
      tracks: [],
      markers: [],
    },
    cameraStates: [],
    analysisSettings: {
      includeGoalkeepers: true,
      distanceUnit: 'metric',
      passingLaneRadiusMeters: 1.5,
      visionSectorDeg: 120,
    },
    sessionPlan: {
      ageOrDevelopmentLevel: '',
      playerCount: 0,
      dimensions: '',
      equipment: [],
      objective: '',
      setup: '',
      coachingCues: [],
      progressions: [],
      regressions: [],
      durationMinutes: 0,
      notes: '',
    },
    media: [],
    importProvenance: [],
    exportPreferences: {
      aspect: 'landscape',
      width: 1920,
      height: 1080,
      frameRate: 30,
      quality: 0.9,
    },
  };
}

function validatePosition(errors: string[], id: string, point: NormalizedPoint): void {
  if (!isNormalizedPoint(point)) {
    errors.push(`Object ${id} position must use normalized [0, 1] coordinates.`);
  }
}

export function validateTacticalProject(project: TacticalProject): string[] {
  const errors: string[] = [];
  const sceneLayers = new Map(
    project.scenes.map((scene) => [scene.id, new Set(scene.layers.map((layer) => layer.id))]),
  );

  function validateSceneLayerRef(id: string, sceneId: string, layerId: string): void {
    const layers = sceneLayers.get(sceneId);
    if (!layers) {
      errors.push(`Object ${id} references missing scene ${sceneId}.`);
      return;
    }
    if (!layers.has(layerId)) {
      errors.push(`Object ${id} references missing layer ${layerId} in scene ${sceneId}.`);
    }
  }

  if (project.schemaVersion !== TACTICS_SCHEMA_VERSION) {
    errors.push(`Unsupported tactical project schema version: ${project.schemaVersion}.`);
  }

  if (
    !Number.isFinite(project.pitch.dimensions.lengthMeters)
    || project.pitch.dimensions.lengthMeters <= 0
    || !Number.isFinite(project.pitch.dimensions.widthMeters)
    || project.pitch.dimensions.widthMeters <= 0
  ) {
    errors.push('Pitch dimensions must be positive finite metre values.');
  }

  if (!Number.isInteger(project.timeline.playheadMs) || project.timeline.playheadMs < 0) {
    errors.push('Timeline playhead must be a non-negative integer number of milliseconds.');
  }
  if (!Number.isInteger(project.timeline.durationMs) || project.timeline.durationMs < 0) {
    errors.push('Timeline duration must be a non-negative integer number of milliseconds.');
  }

  for (const token of project.playerTokens) {
    validatePosition(errors, token.id, token.position);
    validateSceneLayerRef(token.id, token.sceneId, token.layerId);
  }
  for (const official of project.officials) {
    validatePosition(errors, official.id, official.position);
    validateSceneLayerRef(official.id, official.sceneId, official.layerId);
  }
  for (const item of project.equipment) {
    validatePosition(errors, item.id, item.position);
    validateSceneLayerRef(item.id, item.sceneId, item.layerId);
  }
  validatePosition(errors, 'ball', project.ball.position);

  for (const overlay of project.pitch.overlays) {
    for (const point of overlay.points) validatePosition(errors, overlay.id, point);
  }
  for (const annotation of project.annotations) {
    validateSceneLayerRef(annotation.id, annotation.sceneId, annotation.layerId);
    for (const point of annotation.points) validatePosition(errors, annotation.id, point);
  }

  for (const scene of project.scenes) {
    if (!Number.isInteger(scene.startMs) || scene.startMs < 0) {
      errors.push(`Scene ${scene.id} start must be a non-negative integer millisecond value.`);
    }
    if (!Number.isInteger(scene.durationMs) || scene.durationMs < 0) {
      errors.push(`Scene ${scene.id} duration must be a non-negative integer millisecond value.`);
    }

    const layerIds = new Set(scene.layers.map((layer) => layer.id));
    for (const object of scene.objects) {
      if (!layerIds.has(object.layerId)) {
        errors.push(`Object ${object.id} references missing layer ${object.layerId}.`);
      }
      validatePosition(errors, object.id, object.position);
    }
  }

  for (const state of project.formationStates) {
    if (!Number.isInteger(state.timeMs) || state.timeMs < 0) {
      errors.push(`Formation state ${state.id} time must be a non-negative integer millisecond value.`);
    }
    for (const [playerId, point] of Object.entries(state.playerPositions)) {
      validatePosition(errors, playerId, point);
    }
  }

  for (const track of project.timeline.tracks) {
    for (const keyframe of track.keyframes) {
      if (!Number.isInteger(keyframe.timeMs) || keyframe.timeMs < 0) {
        errors.push(`Keyframe ${keyframe.id} time must be a non-negative integer millisecond value.`);
      }
      if (keyframe.position) validatePosition(errors, keyframe.id, keyframe.position);
    }
  }

  return errors;
}

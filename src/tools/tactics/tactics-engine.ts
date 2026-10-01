import type {
  NormalizedPoint,
  TacticalProject,
} from './tactics-types';
import { isNormalizedPoint, refreshStoredTrainingMarkings, trainingFormatProfiles } from './pitch-engine';
import { validateTacticalTimeline } from './timeline-engine';
import { createEmptyVideoReview, validateVideoReview } from './video-review-engine';
export {
  createCameraPresetState,
  normalizedPointToPitch3D,
  pitch3DToNormalizedPoint,
  sampleCameraState,
  upsertCameraState,
} from './presentation3d-engine';

export const TACTICS_SCHEMA_VERSION = 2 as const;

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
  const project: TacticalProject = {
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
    scenarios: [],
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
      possessionEvents: [],
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
    videoReview: createEmptyVideoReview(),
    importProvenance: [],
    exportPreferences: {
      aspect: 'landscape',
      width: 1920,
      height: 1080,
      frameRate: 30,
      quality: 0.9,
    },
  };
  return {
    ...project,
    pitch: refreshStoredTrainingMarkings(project.pitch),
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

  errors.push(...validateTacticalTimeline(project.timeline));

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

  const rosterStatuses = new Set(['active', 'substitute', 'neutral', 'coach']);
  for (const team of project.teams) {
    for (const player of team.roster) {
      if (!rosterStatuses.has(player.status)) {
        errors.push(`Roster player ${player.id} status must be active, substitute, neutral, or coach.`);
      }
    }
  }

  if (!Array.isArray(project.scenarios)) {
    errors.push('Scenarios must be an array.');
  } else {
    const scenarioIds = new Set<string>();
    for (const scenario of project.scenarios) {
      if (!scenario.id?.trim()) errors.push('Scenario id is required.');
      else if (scenarioIds.has(scenario.id)) errors.push(`Scenario id ${scenario.id} is duplicated.`);
      scenarioIds.add(scenario.id);
      if (!scenario.label?.trim()) errors.push(`Scenario ${scenario.id || 'record'} label is required.`);
      if (!sceneLayers.has(scenario.sceneId)) {
        errors.push(`Scenario ${scenario.id || 'record'} references missing scene ${scenario.sceneId}.`);
      }
      if (!Number.isInteger(scenario.capturedAtMs) || scenario.capturedAtMs < 0) {
        errors.push(`Scenario ${scenario.id || 'record'} time must be a non-negative integer millisecond value.`);
      }
      if (!Number.isFinite(scenario.ballElevationMeters) || scenario.ballElevationMeters < 0) {
        errors.push(`Scenario ${scenario.id || 'record'} ball elevation must be a non-negative finite metre value.`);
      }
      if (scenario.ballPosition) validatePosition(errors, scenario.id || 'scenario', scenario.ballPosition);
      else errors.push(`Scenario ${scenario.id || 'record'} is missing a ball position.`);
      for (const [tokenId, position] of Object.entries(scenario.tokenPositions ?? {})) {
        validatePosition(errors, `${scenario.id}:${tokenId}`, position);
      }
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

  const cameraIds = new Set<string>();
  const cameraTimes = new Set<number>();
  for (const camera of project.cameraStates) {
    if (!camera.id.trim()) errors.push('Camera state id is required.');
    if (cameraIds.has(camera.id)) errors.push(`Camera id ${camera.id} is duplicated.`);
    cameraIds.add(camera.id);
    if (!Number.isInteger(camera.timeMs) || camera.timeMs < 0) {
      errors.push(`Camera ${camera.id || 'state'} time must be a non-negative integer millisecond value.`);
    } else {
      if (cameraTimes.has(camera.timeMs)) errors.push(`Camera time ${camera.timeMs} is duplicated.`);
      cameraTimes.add(camera.timeMs);
      if (camera.timeMs > project.timeline.durationMs) {
        errors.push(`Camera ${camera.id} time ${camera.timeMs} exceeds timeline duration.`);
      }
    }
    if (![camera.position.x, camera.position.y, camera.position.z].every(Number.isFinite)) {
      errors.push(`Camera ${camera.id} position must use finite 3D coordinates.`);
    }
    if (![camera.target.x, camera.target.y, camera.target.z].every(Number.isFinite)) {
      errors.push(`Camera ${camera.id} target must use finite 3D coordinates.`);
    }
    if (!Number.isFinite(camera.fieldOfViewDeg) || camera.fieldOfViewDeg < 10 || camera.fieldOfViewDeg > 120) {
      errors.push(`Camera ${camera.id} field of view must be between 10 and 120 degrees.`);
    }
  }

  for (const track of project.timeline.tracks) {
    for (const keyframe of track.keyframes) {
      if (keyframe.position) validatePosition(errors, keyframe.id, keyframe.position);
      if (keyframe.elevationMeters !== undefined
        && (!Number.isFinite(keyframe.elevationMeters) || keyframe.elevationMeters < 0)) {
        errors.push(`Keyframe ${keyframe.id} elevation must be a non-negative finite metre value.`);
      }
      if (keyframe.event !== undefined && !keyframe.event.trim()) {
        errors.push(`Keyframe ${keyframe.id} event cannot be empty.`);
      }
    }
  }

  errors.push(...validateVideoReview(project));

  return errors;
}

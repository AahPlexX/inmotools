import type {
  NormalizedPoint,
  PitchDimensions,
  PitchRuleProfile,
  SourceProvenance,
  TacticalPitch,
  TacticalProject,
} from './tactics-types';

function assertFinitePositive(value: number, label: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${label} must be a positive finite number.`);
  }
}

function assertNormalized(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new RangeError(`${label} must be within [0, 1].`);
  }
}

function canonicalUnit(value: number): number {
  return Number(value.toFixed(12));
}

export function isNormalizedPoint(point: NormalizedPoint): boolean {
  return Number.isFinite(point.x)
    && Number.isFinite(point.y)
    && point.x >= 0
    && point.x <= 1
    && point.y >= 0
    && point.y <= 1;
}

export function createNormalizedPoint(x: number, y: number): NormalizedPoint {
  assertNormalized(x, 'x');
  assertNormalized(y, 'y');
  return { x: canonicalUnit(x), y: canonicalUnit(y) };
}

export function normalizedToMeters(
  point: NormalizedPoint,
  pitch: PitchDimensions,
): { xMeters: number; yMeters: number } {
  const normalized = createNormalizedPoint(point.x, point.y);
  assertFinitePositive(pitch.lengthMeters, 'Pitch length');
  assertFinitePositive(pitch.widthMeters, 'Pitch width');
  return {
    xMeters: normalized.x * pitch.lengthMeters,
    yMeters: normalized.y * pitch.widthMeters,
  };
}

export function metersToNormalized(
  point: { xMeters: number; yMeters: number },
  pitch: PitchDimensions,
): NormalizedPoint {
  assertFinitePositive(pitch.lengthMeters, 'Pitch length');
  assertFinitePositive(pitch.widthMeters, 'Pitch width');
  return createNormalizedPoint(
    point.xMeters / pitch.lengthMeters,
    point.yMeters / pitch.widthMeters,
  );
}

export function mirrorHorizontal(point: NormalizedPoint): NormalizedPoint {
  const normalized = createNormalizedPoint(point.x, point.y);
  return createNormalizedPoint(1 - normalized.x, normalized.y);
}

export function mirrorVertical(point: NormalizedPoint): NormalizedPoint {
  const normalized = createNormalizedPoint(point.x, point.y);
  return createNormalizedPoint(normalized.x, 1 - normalized.y);
}

export interface SnapOptions {
  gridStep?: number;
  xGuides?: number[];
  yGuides?: number[];
  threshold: number;
}

export interface SnapResult {
  point: NormalizedPoint;
  snappedX: boolean;
  snappedY: boolean;
}

function nearestSnap(
  value: number,
  guides: number[],
  gridStep: number | undefined,
  threshold: number,
): { value: number; snapped: boolean } {
  const candidates = guides.filter((guide) => Number.isFinite(guide) && guide >= 0 && guide <= 1);

  if (gridStep !== undefined) {
    if (!Number.isFinite(gridStep) || gridStep <= 0 || gridStep > 1) {
      throw new RangeError('Grid step must be within (0, 1].');
    }
    candidates.push(Math.min(1, Math.max(0, Math.round(value / gridStep) * gridStep)));
  }

  let nearest = value;
  let distance = Number.POSITIVE_INFINITY;
  for (const candidate of candidates) {
    const nextDistance = Math.abs(candidate - value);
    if (nextDistance < distance) {
      distance = nextDistance;
      nearest = candidate;
    }
  }

  if (distance <= threshold) {
    return { value: nearest, snapped: true };
  }
  return { value, snapped: false };
}

export function snapNormalizedPoint(point: NormalizedPoint, options: SnapOptions): SnapResult {
  const normalized = createNormalizedPoint(point.x, point.y);
  if (!Number.isFinite(options.threshold) || options.threshold < 0 || options.threshold > 1) {
    throw new RangeError('Snap threshold must be within [0, 1].');
  }

  const x = nearestSnap(normalized.x, options.xGuides ?? [], options.gridStep, options.threshold);
  const y = nearestSnap(normalized.y, options.yGuides ?? [], options.gridStep, options.threshold);

  return {
    point: createNormalizedPoint(x.value, y.value),
    snappedX: x.snapped,
    snappedY: y.snapped,
  };
}

export function createTrainingFormatProfile(teamSize: number): PitchRuleProfile {
  if (!Number.isInteger(teamSize) || teamSize < 1) {
    throw new RangeError('Training format team size must be a positive integer.');
  }
  return {
    id: `training-${teamSize}v${teamSize}`,
    label: `${teamSize}v${teamSize} training format`,
    format: `${teamSize}v${teamSize}`,
    teamSize,
    editable: true,
    provenance: {
      kind: 'tool-default',
      authoritative: false,
      sourceTitle: 'InMo Tools editable training starter',
      sourceDate: '2026-09-21',
      note: 'A neutral editable starter, not a governing-body ruleset.',
    },
  };
}

export const trainingFormatProfiles: PitchRuleProfile[] = [1, 2, 3, 4, 5, 7, 9, 11].map(createTrainingFormatProfile);

const TRAINING_MARKING_PROVENANCE: SourceProvenance = {
  kind: 'tool-default',
  authoritative: false,
  sourceTitle: 'InMo Tools fitted training markings',
  sourceDate: '2026-09-30',
  note: 'Geometric pitch lines fitted to this pitch. Full-size distances are used only when they fit. Not a governing-body ruling.',
};

function clampUnitInterval(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export function fittedTrainingMarkings(dimensions: PitchDimensions): TacticalPitch['overlays'] {
  assertFinitePositive(dimensions.lengthMeters, 'Pitch length');
  assertFinitePositive(dimensions.widthMeters, 'Pitch width');
  const length = dimensions.lengthMeters;
  const width = dimensions.widthMeters;
  const penaltyDepthRef = 16.5;
  const penaltyWidthRef = 40.32;
  const scale = Math.min(
    1,
    ((length / 2) * 0.72) / penaltyDepthRef,
    (width * 0.72) / penaltyWidthRef,
  );
  const provenance = { ...TRAINING_MARKING_PROVENANCE };

  const at = (xMeters: number, yMeters: number): NormalizedPoint => createNormalizedPoint(
    clampUnitInterval(xMeters / length),
    clampUnitInterval(yMeters / width),
  );
  const line = (
    id: string,
    label: string,
    meters: Array<[number, number]>,
  ): TacticalPitch['overlays'][number] => ({
    id,
    kind: 'line',
    label,
    points: meters.map(([xMeters, yMeters]) => at(xMeters, yMeters)),
    provenance: { ...provenance },
  });
  const box = (
    id: string,
    label: string,
    x0: number,
    x1: number,
    y0: number,
    y1: number,
  ) => line(id, label, [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]);

  const penaltyDepth = penaltyDepthRef * scale;
  const penaltyHalf = (penaltyWidthRef * scale) / 2;
  const goalAreaDepth = 5.5 * scale;
  const goalAreaHalf = ((7.32 / 2) + 5.5) * scale;
  const goalHalf = (7.32 * scale) / 2;
  const spot = 11 * scale;
  const midY = width / 2;
  const goalDepth = Math.min(length * 0.03, 2 * scale);
  const circleRadius = Math.min(9.15 * scale, width * 0.22, length * 0.12);
  const markings: TacticalPitch['overlays'] = [
    box('training-left-penalty-area', 'Training penalty area', 0, penaltyDepth, midY - penaltyHalf, midY + penaltyHalf),
    box('training-right-penalty-area', 'Training penalty area', length, length - penaltyDepth, midY - penaltyHalf, midY + penaltyHalf),
    box('training-left-goal-area', 'Training goal area', 0, goalAreaDepth, midY - goalAreaHalf, midY + goalAreaHalf),
    box('training-right-goal-area', 'Training goal area', length, length - goalAreaDepth, midY - goalAreaHalf, midY + goalAreaHalf),
    line('training-left-penalty-mark', 'Training penalty mark', [[spot, midY - 0.15 * scale], [spot, midY + 0.15 * scale]]),
    line('training-right-penalty-mark', 'Training penalty mark', [[length - spot, midY - 0.15 * scale], [length - spot, midY + 0.15 * scale]]),
    line('training-left-goal', 'Training goal', [[0, midY - goalHalf], [goalDepth, midY - goalHalf], [goalDepth, midY + goalHalf], [0, midY + goalHalf]]),
    line('training-right-goal', 'Training goal', [[length, midY - goalHalf], [length - goalDepth, midY - goalHalf], [length - goalDepth, midY + goalHalf], [length, midY + goalHalf]]),
  ];

  const circle: Array<[number, number]> = [];
  const segments = 24;
  for (let index = 0; index <= segments; index += 1) {
    const angle = (index / segments) * Math.PI * 2;
    circle.push([
      length / 2 + Math.cos(angle) * circleRadius,
      width / 2 + Math.sin(angle) * circleRadius,
    ]);
  }
  markings.push(line('training-centre-circle', 'Training centre circle', circle));

  const cornerRadius = Math.min(scale, length * 0.04, width * 0.04);
  if (cornerRadius >= 0.3) {
    const arc = (
      id: string,
      label: string,
      centerX: number,
      centerY: number,
      startAngle: number,
      endAngle: number,
    ) => {
      const points: Array<[number, number]> = [];
      const steps = 6;
      for (let index = 0; index <= steps; index += 1) {
        const angle = startAngle + ((endAngle - startAngle) * index) / steps;
        points.push([
          centerX + Math.cos(angle) * cornerRadius,
          centerY + Math.sin(angle) * cornerRadius,
        ]);
      }
      return line(id, label, points);
    };
    markings.push(
      arc('training-corner-top-left', 'Training corner arc', 0, 0, 0, Math.PI / 2),
      arc('training-corner-bottom-left', 'Training corner arc', 0, width, 0, -Math.PI / 2),
      arc('training-corner-top-right', 'Training corner arc', length, 0, Math.PI, Math.PI / 2),
      arc('training-corner-bottom-right', 'Training corner arc', length, width, Math.PI, (Math.PI * 3) / 2),
    );
  }

  return markings;
}

function pitchHasSourcedAreas(pitch: TacticalPitch): boolean {
  return pitch.overlays.some((overlay) => (
    /penalty|goal-area|goal area|six-metre|six metre/i.test(`${overlay.id} ${overlay.label}`)
  ));
}

export function displayPitchOverlays(pitch: TacticalPitch): TacticalPitch['overlays'] {
  if (pitch.overlays.some((overlay) => overlay.id.startsWith('training-'))) return pitch.overlays;
  if (pitchHasSourcedAreas(pitch)) return pitch.overlays;
  return [...pitch.overlays, ...fittedTrainingMarkings(pitch.dimensions)];
}

export function refreshStoredTrainingMarkings(pitch: TacticalPitch): TacticalPitch {
  const kept = pitch.overlays.filter((overlay) => !overlay.id.startsWith('training-'));
  const displayed = displayPitchOverlays({ ...pitch, overlays: kept });
  if (displayed === kept && kept.length === pitch.overlays.length) return pitch;
  return { ...pitch, overlays: displayed };
}

export function ensureStoredTrainingMarkings(pitch: TacticalPitch): TacticalPitch {
  if (pitch.overlays.some((overlay) => overlay.id.startsWith('training-'))) return pitch;
  const displayed = displayPitchOverlays(pitch);
  if (displayed === pitch.overlays) return pitch;
  return { ...pitch, overlays: displayed };
}

export type TacticalProjectTransform = 'horizontal' | 'vertical';

export function transformTacticalProject(
  project: TacticalProject,
  transform: TacticalProjectTransform,
): TacticalProject {
  const point = transform === 'horizontal' ? mirrorHorizontal : mirrorVertical;
  const rotation = (value: number) => transform === 'horizontal' ? 180 - value : -value;
  return {
    ...project,
    pitch: {
      ...project.pitch,
      direction: transform === 'horizontal'
        ? project.pitch.direction === 'left-to-right' ? 'right-to-left' : 'left-to-right'
        : project.pitch.direction,
      overlays: project.pitch.overlays.map((overlay) => ({
        ...overlay,
        points: overlay.points.map(point),
        provenance: overlay.provenance ? { ...overlay.provenance } : undefined,
      })),
    },
    playerTokens: project.playerTokens.map((token) => ({
      ...token,
      position: point(token.position),
      rotationDeg: rotation(token.rotationDeg),
    })),
    officials: project.officials.map((official) => ({ ...official, position: point(official.position) })),
    equipment: project.equipment.map((item) => ({
      ...item,
      position: point(item.position),
      rotationDeg: rotation(item.rotationDeg),
    })),
    scenes: project.scenes.map((scene) => ({
      ...scene,
      objects: scene.objects.map((object) => ({
        ...object,
        position: point(object.position),
        rotationDeg: rotation(object.rotationDeg),
      })),
    })),
    formationStates: project.formationStates.map((state) => ({
      ...state,
      playerPositions: Object.fromEntries(
        Object.entries(state.playerPositions).map(([id, position]) => [id, point(position)]),
      ),
    })),
    scenarios: (project.scenarios ?? []).map((scenario) => ({
      ...scenario,
      tokenPositions: Object.fromEntries(
        Object.entries(scenario.tokenPositions).map(([id, position]) => [id, point(position)]),
      ),
      ballPosition: point(scenario.ballPosition),
    })),
    ball: { ...project.ball, position: point(project.ball.position) },
    annotations: project.annotations.map((annotation) => ({
      ...annotation,
      points: annotation.points.map(point),
      provenance: annotation.provenance ? { ...annotation.provenance } : undefined,
    })),
    timeline: {
      ...project.timeline,
      tracks: project.timeline.tracks.map((track) => ({
        ...track,
        keyframes: track.keyframes.map((keyframe) => ({
          ...keyframe,
          position: keyframe.position ? point(keyframe.position) : undefined,
          rotationDeg: keyframe.rotationDeg === undefined ? undefined : rotation(keyframe.rotationDeg),
          motionPath: keyframe.motionPath
            ? { ...keyframe.motionPath, controlPoints: keyframe.motionPath.controlPoints.map(point) }
            : undefined,
        })),
      })),
    },
  };
}

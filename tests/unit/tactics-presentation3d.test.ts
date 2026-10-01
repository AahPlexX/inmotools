import { describe, expect, it } from 'vitest';
import {
  createStarterTacticalProject,
  validateTacticalProject,
} from '../../src/tools/tactics/tactics-engine';
import {
  createCameraPresetState,
  normalizedPointToPitch3D,
  pitch3DToNormalizedPoint,
  sampleCameraState,
  upsertCameraState,
} from '../../src/tools/tactics/presentation3d-engine';

describe('Tactical 3D presentation contracts', () => {
  it('round-trips normalized pitch positions through metre-based Three.js world coordinates', () => {
    const pitch = { lengthMeters: 105, widthMeters: 68 };
    const world = normalizedPointToPitch3D({ x: 0.75, y: 0.25 }, pitch, 1.8);
    expect(world).toEqual({ x: 26.25, y: 1.8, z: -17 });
    expect(pitch3DToNormalizedPoint(world, pitch)).toEqual({ x: 0.75, y: 0.25 });
    expect(() => normalizedPointToPitch3D({ x: 1.01, y: 0.5 }, pitch)).toThrow(/normalized/);
    expect(() => normalizedPointToPitch3D({ x: 0.5, y: 0.5 }, pitch, -0.1)).toThrow(/elevation/);
  });

  it('samples authored camera keyframes deterministically and replaces same-time keyframes', () => {
    const pitch = { lengthMeters: 105, widthMeters: 68 };
    const first = createCameraPresetState('broadcast', pitch, 0);
    const last = createCameraPresetState('goal-line', pitch, 1000);
    const sampled = sampleCameraState([last, first], 500, pitch);
    expect(sampled.timeMs).toBe(500);
    expect(sampled.position.x).toBeCloseTo((first.position.x + last.position.x) / 2, 12);
    expect(sampled.fieldOfViewDeg).toBeCloseTo((first.fieldOfViewDeg + last.fieldOfViewDeg) / 2, 12);
    const replacement = { ...createCameraPresetState('tactical', pitch, 500), id: 'camera-replacement' };
    const upserted = upsertCameraState([first, last], replacement);
    expect(upserted.map((state) => state.timeMs)).toEqual([0, 500, 1000]);
    expect(upsertCameraState(upserted, { ...replacement, fieldOfViewDeg: 60 })).toHaveLength(3);
  });

  it('falls back to a pitch-aware tactical camera when no authored camera exists', () => {
    const camera = sampleCameraState([], 750, { lengthMeters: 40, widthMeters: 30 });
    expect(camera.timeMs).toBe(750);
    expect(camera.position.y).toBeGreaterThan(30);
    expect(camera.target).toEqual({ x: 0, y: 0, z: 0 });
  });

  it('reports invalid or ambiguous camera keyframes during project validation', () => {
    const project = createStarterTacticalProject();
    project.cameraStates = [
      {
        id: 'camera-a',
        timeMs: 500,
        position: { x: 0, y: 20, z: 20 },
        target: { x: 0, y: 0, z: 0 },
        fieldOfViewDeg: 45,
      },
      {
        id: 'camera-b',
        timeMs: 500,
        position: { x: 0, y: Number.NaN, z: 20 },
        target: { x: 0, y: 0, z: 0 },
        fieldOfViewDeg: 140,
      },
    ];
    const errors = validateTacticalProject(project);
    expect(errors).toEqual(expect.arrayContaining([
      expect.stringMatching(/camera.*500.*duplicated/i),
      expect.stringMatching(/camera.*position.*finite/i),
      expect.stringMatching(/camera.*field of view/i),
    ]));
  });
});

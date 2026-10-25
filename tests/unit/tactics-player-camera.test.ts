import { describe, expect, it, vi } from 'vitest';
import fc from 'fast-check';
import * as THREE from 'three';
import * as presentation from '../../src/tools/tactics/presentation3d-engine';
import * as runtime from '../../src/tools/tactics/presentation3d-runtime';
import { buildBeginnerTacticalProject } from '../../src/tools/tactics/workspace-engine';
import { sampleTacticalProjectAtTime } from '../../src/tools/tactics/timeline-engine';
import { addTimelineSubstitutionEvent } from '../../src/tools/tactics/substitution-engine';
import { commitTacticalProject, createTacticalHistory, redoTacticalProject, undoTacticalProject } from '../../src/tools/tactics/editor-engine';
import { exportTacticalProjectJson, importTacticalProjectJson } from '../../src/tools/tactics/project-io';

function playerProject() {
  const project = buildBeginnerTacticalProject({
    title: 'Player camera contract', teamName: 'Team', primaryColor: '#154c79', secondaryColor: '#ffffff',
    formationId: 'ussf-4v4-1-2-1', pitchDimensions: { lengthMeters: 100, widthMeters: 50 }, direction: 'left-to-right',
  });
  project.playerTokens[0]!.position = { x: 0.25, y: 0.75 };
  project.playerTokens[0]!.rotationDeg = 0;
  return project;
}

const settings = { eyeHeightMeters: 1.7, fieldOfViewDeg: 70 };

function movingProject() {
  const project = playerProject();
  project.timeline.tracks.push({ id: 'viewer-motion', targetId: project.playerTokens[0]!.id, keyframes: [
    { id: 'viewer-start', timeMs: 0, position: { x: 0.25, y: 0.75 }, rotationDeg: 0, interpolation: 'linear' },
    { id: 'viewer-end', timeMs: 1000, position: { x: 0.75, y: 0.25 }, rotationDeg: 90, interpolation: 'hold' },
  ] });
  return project;
}

describe('TMS-R52 first-person player camera', () => {
  it('places the eye at the selected player in physical pitch coordinates without mutation', () => {
    const project = playerProject(); const token = project.playerTokens[0]!;
    const before = structuredClone(project);
    const camera = presentation.createPlayerCameraState(project, token.sceneId, token.id, 0)!;
    expect(presentation.DEFAULT_PLAYER_CAMERA_SETTINGS).toEqual(settings);
    expect(camera).toMatchObject({ timeMs: 0, position: { x: -25, y: 1.7, z: 12.5 }, target: { x: -15, y: 1.7, z: 12.5 }, fieldOfViewDeg: 70 });
    camera.position.x = 999;
    expect(project).toEqual(before);
    expect(presentation.createPlayerCameraState(project, token.sceneId, token.id, 0)!.position.x).toBe(-25);
    expect(project.cameraStates).toEqual([]);
  });

  it.each([
    { heading: 0, dx: 10, dz: 0 }, { heading: 90, dx: 0, dz: 10 },
    { heading: 180, dx: -10, dz: 0 }, { heading: 270, dx: 0, dz: -10 },
  ])('faces authored heading $heading without looking at the ball', ({ heading, dx, dz }) => {
    const project = playerProject(); const token = project.playerTokens[0]!;
    token.rotationDeg = heading; project.ball.position = { x: 0.1, y: 0.1 };
    const camera = presentation.createPlayerCameraState(project, token.sceneId, token.id, 123)!;
    expect(camera.target.x - camera.position.x).toBeCloseTo(dx, 10);
    expect(camera.target.z - camera.position.z).toBeCloseTo(dz, 10);
    expect(camera.target.y).toBe(camera.position.y);
    expect(camera.timeMs).toBe(123);
  });

  it('normalizes finite wrapped rotations and keeps an outward view at a pitch edge', () => {
    const project = playerProject(); const token = project.playerTokens[0]!;
    token.position = { x: 1, y: 0 };
    for (const heading of [-315, 45, 405, Number.MAX_VALUE]) {
      token.rotationDeg = heading;
      const camera = presentation.createPlayerCameraState(project, token.sceneId, token.id, 0)!;
      expect(camera.position).toEqual({ x: 50, y: 1.7, z: -25 });
      expect(Math.hypot(camera.target.x - 50, camera.target.z + 25)).toBeCloseTo(10, 10);
      if (heading !== Number.MAX_VALUE) {
        expect(camera.target.x).toBeCloseTo(50 + Math.sqrt(50), 10);
        expect(camera.target.z).toBeCloseTo(-25 + Math.sqrt(50), 10);
      }
    }
  });

  it('preserves eye and heading over 150 seeded non-square pitches and settings', () => {
    fc.assert(fc.property(
      fc.integer({ min: 10, max: 130 }), fc.integer({ min: 10, max: 80 }),
      fc.integer({ min: 0, max: 10000 }), fc.integer({ min: 0, max: 10000 }),
      fc.integer({ min: -360000, max: 360000 }), fc.integer({ min: 1, max: 30 }), fc.integer({ min: 10, max: 120 }),
      (length, width, x, y, heading, height, fov) => {
        const project = playerProject(); const token = project.playerTokens[0]!;
        project.pitch.dimensions = { lengthMeters: length, widthMeters: width };
        token.position = { x: x / 10000, y: y / 10000 }; token.rotationDeg = heading / 100;
        const camera = presentation.createPlayerCameraState(project, token.sceneId, token.id, 500, { eyeHeightMeters: height / 10, fieldOfViewDeg: fov })!;
        expect(presentation.pitch3DToNormalizedPoint(camera.position, project.pitch.dimensions)).toEqual(expect.objectContaining({ x: expect.closeTo(token.position.x, 10), y: expect.closeTo(token.position.y, 10) }));
        expect(camera.position.y).toBe(height / 10); expect(camera.fieldOfViewDeg).toBe(fov);
        const expected = new THREE.Vector3(1, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), -token.rotationDeg * Math.PI / 180);
        const actual = new THREE.Vector3(camera.target.x - camera.position.x, 0, camera.target.z - camera.position.z).normalize();
        expect(actual.distanceTo(expected)).toBeLessThan(1e-10);
      },
    ), { seed: 0x52, numRuns: 150 });
  });

  it('follows the already sampled position and rotation rather than a second motion clock', () => {
    const project = movingProject(); const before = structuredClone(project); const token = project.playerTokens[0]!;
    const sampled = sampleTacticalProjectAtTime(project, 500);
    const camera = presentation.createPlayerCameraState(sampled, token.sceneId, token.id, 500)!;
    expect(camera.position).toEqual({ x: 0, y: 1.7, z: 0 });
    expect(camera.target.x).toBeCloseTo(Math.sqrt(50), 10); expect(camera.target.z).toBeCloseTo(Math.sqrt(50), 10);
    expect(project).toEqual(before);
    sampled.playerTokens[0]!.rotationDeg = 180;
    expect(presentation.createPlayerCameraState(sampled, token.sceneId, token.id, 500)!.target.x).toBeCloseTo(-10, 10);
  });

  it('refuses missing, hidden, orphaned and wrong-scene selections instead of switching players', () => {
    const project = playerProject(); const token = project.playerTokens[0]!;
    expect(presentation.createPlayerCameraState(project, token.sceneId, undefined, 0)).toBeNull();
    expect(presentation.createPlayerCameraState(project, token.sceneId, 'ball', 0)).toBeNull();
    expect(presentation.createPlayerCameraState(project, 'another-scene', token.id, 0)).toBeNull();
    token.visible = false;
    expect(presentation.createPlayerCameraState(project, token.sceneId, token.id, 0)).toBeNull();
    token.visible = true; project.scenes[0]!.layers[0]!.visible = false;
    expect(presentation.createPlayerCameraState(project, token.sceneId, token.id, 0)).toBeNull();
    project.scenes[0]!.layers[0]!.visible = true; token.playerId = 'missing-roster-person';
    expect(presentation.createPlayerCameraState(project, token.sceneId, token.id, 0)).toBeNull();
  });

  it('allows visible roster-backed person tokens regardless of roster status', () => {
    const project = playerProject(); const token = project.playerTokens[0]!;
    const person = project.teams[0]!.roster.find(player => player.id === token.playerId)!;
    for (const status of ['active', 'substitute', 'neutral', 'coach'] as const) {
      person.status = status;
      expect(presentation.createPlayerCameraState(project, token.sceneId, token.id, 0)).not.toBeNull();
    }
  });

  it('obeys exact timed substitution and sampled layer visibility without rebinding selection', () => {
    const base = playerProject(); const outgoing = base.playerTokens[0]!; const incoming = base.playerTokens[1]!;
    incoming.visible = false;
    base.teams[0]!.roster.find(player => player.id === incoming.playerId)!.status = 'substitute';
    const project = addTimelineSubstitutionEvent(base, { id: 'camera-substitution', outgoingTargetId: outgoing.id, incomingTargetId: incoming.id, timeMs: 2000 });
    const before = sampleTacticalProjectAtTime(project, 1999); const after = sampleTacticalProjectAtTime(project, 2000);
    expect(presentation.createPlayerCameraState(before, outgoing.sceneId, outgoing.id, 1999)).not.toBeNull();
    expect(presentation.createPlayerCameraState(before, incoming.sceneId, incoming.id, 1999)).toBeNull();
    expect(presentation.createPlayerCameraState(after, outgoing.sceneId, outgoing.id, 2000)).toBeNull();
    expect(presentation.createPlayerCameraState(after, incoming.sceneId, incoming.id, 2000)).not.toBeNull();
    project.timeline.tracks.push({ id: 'hide-player-layer', targetId: project.scenes[0]!.layers[0]!.id, keyframes: [{ id: 'layer-hidden', timeMs: 2500, visible: false, interpolation: 'hold' }] });
    expect(presentation.createPlayerCameraState(sampleTacticalProjectAtTime(project, 2500), incoming.sceneId, incoming.id, 2500)).toBeNull();
  });

  it('validates eye height, field of view, pitch, time, pose and representable geometry', () => {
    const project = playerProject(); const token = project.playerTokens[0]!;
    for (const eyeHeightMeters of [0, -1, 0.09, 3.01, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => presentation.createPlayerCameraState(project, token.sceneId, token.id, 0, { ...settings, eyeHeightMeters })).toThrow(/eye height/i);
    }
    for (const fieldOfViewDeg of [9, 121, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => presentation.createPlayerCameraState(project, token.sceneId, token.id, 0, { ...settings, fieldOfViewDeg })).toThrow(/field of view/i);
    }
    for (const timeMs of [-1, 0.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => presentation.createPlayerCameraState(project, token.sceneId, token.id, timeMs)).toThrow(/time/i);
    }
    for (const lengthMeters of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      project.pitch.dimensions.lengthMeters = lengthMeters;
      expect(() => presentation.createPlayerCameraState(project, token.sceneId, token.id, 0)).toThrow(/dimensions/i);
    }
    project.pitch.dimensions.lengthMeters = 100;
    token.position.x = 1.01;
    expect(() => presentation.createPlayerCameraState(project, token.sceneId, token.id, 0)).toThrow(/normalized/i);
    token.position.x = 0.25; token.rotationDeg = Number.NaN;
    expect(() => presentation.createPlayerCameraState(project, token.sceneId, token.id, 0)).toThrow(/rotation/i);
    token.rotationDeg = 0; token.position = { x: 1, y: 1 }; project.pitch.dimensions.lengthMeters = Number.MAX_VALUE;
    expect(() => presentation.createPlayerCameraState(project, token.sceneId, token.id, 0)).toThrow(/represent/i);
  });

  it('applies a level real Three.js camera without OrbitControls moving the eye', () => {
    const project = playerProject(); const token = project.playerTokens[0]!; token.rotationDeg = 90;
    const state = presentation.createPlayerCameraState(project, token.sceneId, token.id, 0)!;
    const camera = new THREE.PerspectiveCamera();
    const controls = { enabled: true, target: new THREE.Vector3(), update: vi.fn(() => { camera.position.y += 50; return true; }) };
    runtime.applyTactical3DCamera(camera, controls, state, true);
    expect(controls.enabled).toBe(false); expect(controls.update).not.toHaveBeenCalled();
    expect(camera.position.toArray()).toEqual([-25, 1.7, 12.5]); expect(camera.fov).toBe(70);
    const direction = camera.getWorldDirection(new THREE.Vector3());
    expect(direction.x).toBeCloseTo(0, 10); expect(direction.y).toBeCloseTo(0, 10); expect(direction.z).toBeCloseTo(1, 10);
    expect(controls.target.toArray()).toEqual([state.target.x, state.target.y, state.target.z]);
  });

  it('restores orbit control updates when leaving the live player camera', () => {
    const project = playerProject(); const token = project.playerTokens[0]!;
    const camera = new THREE.PerspectiveCamera(); const controls = { enabled: true, target: new THREE.Vector3(), update: vi.fn(() => true) };
    runtime.applyTactical3DCamera(camera, controls, presentation.createPlayerCameraState(project, token.sceneId, token.id, 0)!, true);
    const preset = presentation.createCameraPresetState('broadcast', project.pitch.dimensions);
    runtime.applyTactical3DCamera(camera, controls, preset, false);
    expect(controls.enabled).toBe(true); expect(controls.update).toHaveBeenCalledOnce();
    expect(camera.position.toArray()).toEqual([preset.position.x, preset.position.y, preset.position.z]); expect(camera.fov).toBe(preset.fieldOfViewDeg);
  });

  it('captures only existing canonical camera fields with undo redo and JSON round-trip', () => {
    const project = playerProject(); const token = project.playerTokens[0]!;
    const camera = presentation.createPlayerCameraState(project, token.sceneId, token.id, 0, { eyeHeightMeters: 1.2, fieldOfViewDeg: 90 })!;
    const history = commitTacticalProject(createTacticalHistory(project), 'Capture player view', current => ({ ...current, cameraStates: presentation.upsertCameraState(current.cameraStates, camera) }));
    expect(undoTacticalProject(history).present.cameraStates).toEqual([]);
    const restored = redoTacticalProject(undoTacticalProject(history)).present;
    const json = exportTacticalProjectJson(restored); const imported = importTacticalProjectJson(json);
    expect(imported.cameraStates).toEqual([camera]); expect(imported.playerTokens).toEqual(project.playerTokens);
    expect(Object.keys(imported.cameraStates[0]!).sort()).toEqual(['fieldOfViewDeg', 'id', 'position', 'target', 'timeMs']);
    expect(json).not.toMatch(/playerView|eyeHeightMeters|firstPerson/);
  });
});

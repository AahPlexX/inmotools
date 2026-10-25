import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { createDefenderInterceptionCones } from '../../src/tools/tactics/analysis-engine';
import { DEFAULT_ANALYSIS_DISPLAY_SETTINGS, deriveTacticalAnalysis } from '../../src/tools/tactics/TacticalAnalysisPanel';
import { sampleTacticalProjectAtTime } from '../../src/tools/tactics/timeline-engine';
import { buildBeginnerTacticalProject, placeMirroredOpposition } from '../../src/tools/tactics/workspace-engine';
import type { NormalizedPoint, TacticalProject } from '../../src/tools/tactics/tactics-types';

const pitch = { lengthMeters: 100, widthMeters: 50 };
const from = { x: 0.1, y: 0.5 };
const to = { x: 0.9, y: 0.5 };
const defender = { id: 'defender', position: { x: 0.5, y: 0.3 } };
const settings = { ...DEFAULT_ANALYSIS_DISPLAY_SETTINGS, interceptionCones: true, defenderRadiusMeters: 12 };

function oppositionProject(): TacticalProject {
  const base = buildBeginnerTacticalProject({
    title: 'Interception geometry', teamName: 'Team', primaryColor: '#154c79', secondaryColor: '#ffffff',
    formationId: 'ussf-7v7-1-3-2-1', pitchDimensions: pitch, direction: 'left-to-right',
  });
  const project = placeMirroredOpposition(base, base.scenes[0]!.id, base.scenes[0]!.layers[0]!.id);
  project.playerTokens[0]!.position = { ...from };
  project.ball.position = { ...to };
  return project;
}

function metres(point: NormalizedPoint) {
  return { x: point.x * pitch.lengthMeters, y: point.y * pitch.widthMeters };
}

describe('TMS-R44 defender interception cones', () => {
  it('computes exact finite-lane reach in physical metres without mutating input', () => {
    const opponents = [structuredClone(defender)];
    const before = structuredClone({ from, to, opponents, pitch });
    const [cone] = createDefenderInterceptionCones(from, to, opponents, pitch, 12, 180);
    const halfChord = Math.sqrt(12 ** 2 - 10 ** 2);
    expect(cone).toMatchObject({ defenderId: 'defender', origin: defender.position, reachMeters: 12, angleDeg: 180 });
    expect(cone!.distanceToLaneMeters).toBeCloseTo(10, 10);
    expect(cone!.nearestLanePoint).toEqual({ x: 0.5, y: 0.5 });
    expect(cone!.reachableLane!.from.x).toBeCloseTo(0.5 - halfChord / 100, 10);
    expect(cone!.reachableLane!.to.x).toBeCloseTo(0.5 + halfChord / 100, 10);
    expect(cone!.reachableLane!.lengthMeters).toBeCloseTo(2 * halfChord, 10);
    expect(cone!.reachableLane!.from.y).toBeCloseTo(0.5, 10);
    expect({ from, to, opponents, pitch }).toEqual(before);
    expect(createDefenderInterceptionCones(from, to, opponents, pitch, 12, 180)).toEqual([cone]);
  });

  it('intersects the configured angular sector as well as the reach circle', () => {
    const [wide] = createDefenderInterceptionCones(from, to, [defender], pitch, 20, 180);
    const [narrow] = createDefenderInterceptionCones(from, to, [defender], pitch, 20, 30);
    expect(wide!.reachableLane!.lengthMeters).toBeCloseTo(2 * Math.sqrt(300), 9);
    expect(narrow!.reachableLane!.lengthMeters).toBeCloseTo(20 * Math.tan(Math.PI / 12), 9);
    expect(narrow!.reachableLane!.lengthMeters).toBeLessThan(wide!.reachableLane!.lengthMeters);
  });

  it('keeps unreachable cones visible and clips coverage to lane endpoints rather than an infinite line', () => {
    const opponent = { id: 'past-end', position: { x: 0.95, y: 0.5 } };
    const [short] = createDefenderInterceptionCones(from, to, [opponent], pitch, 3);
    expect(short!.distanceToLaneMeters).toBeCloseTo(5, 9);
    expect(short!.reachableLane).toBeUndefined();
    expect(short!.polygon.length).toBeGreaterThan(3);
    const [long] = createDefenderInterceptionCones(from, to, [opponent], pitch, 8);
    expect(long!.reachableLane!.from.x).toBeCloseTo(0.87, 9);
    expect(long!.reachableLane!.to).toEqual(to);
    expect(long!.reachableLane!.lengthMeters).toBeCloseTo(3, 9);
  });

  it('retains tangent contact and aims an on-lane defender toward the ball', () => {
    const [tangent] = createDefenderInterceptionCones(from, to, [defender], pitch, 10);
    expect(tangent!.reachableLane).toEqual({ from: { x: 0.5, y: 0.5 }, to: { x: 0.5, y: 0.5 }, lengthMeters: 0 });
    const [onLane] = createDefenderInterceptionCones(from, to, [{ id: 'on-lane', position: { x: 0.5, y: 0.5 } }], pitch, 10);
    expect(onLane!.rotationDeg).toBeCloseTo(0, 10);
    expect(onLane!.reachableLane!.from.x).toBeCloseTo(0.5, 10);
    expect(onLane!.reachableLane!.to.x).toBeCloseTo(0.6, 10);
    expect(onLane!.reachableLane!.lengthMeters).toBeCloseTo(10, 10);
  });

  it('clips sector polygons at pitch edges while keeping every point inside the physical reach', () => {
    const edge = { id: 'edge', position: { x: 0.01, y: 0.1 } };
    const [cone] = createDefenderInterceptionCones(from, to, [edge], pitch, 30, 180);
    expect(cone!.polygon.some(point => point.x === 0)).toBe(true);
    expect(cone!.polygon.some(point => point.y === 0)).toBe(true);
    for (const point of cone!.polygon) {
      expect(point.x).toBeGreaterThanOrEqual(0); expect(point.x).toBeLessThanOrEqual(1);
      expect(point.y).toBeGreaterThanOrEqual(0); expect(point.y).toBeLessThanOrEqual(1);
      const physical = metres(point); const origin = metres(edge.position);
      expect(Math.hypot(physical.x - origin.x, physical.y - origin.y)).toBeLessThanOrEqual(30 + 1e-8);
    }
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])('rejects invalid reach %s', radius => {
    expect(() => createDefenderInterceptionCones(from, to, [defender], pitch, radius)).toThrow(/reach|radius/i);
  });

  it.each([0, -1, 181, Number.NaN, Number.POSITIVE_INFINITY])('rejects invalid cone angle %s', angle => {
    expect(() => createDefenderInterceptionCones(from, to, [defender], pitch, 10, angle)).toThrow(/angle/i);
  });

  it('rejects invalid coordinates, dimensions and defender identities and explains a degenerate lane', () => {
    expect(() => createDefenderInterceptionCones(from, from, [defender], pitch, 10)).toThrow(/distinct.*endpoints/i);
    expect(() => createDefenderInterceptionCones(from, to, [defender], { ...pitch, widthMeters: 0 }, 10)).toThrow(/pitch width/i);
    expect(() => createDefenderInterceptionCones({ x: Number.NaN, y: 0 }, to, [defender], pitch, 10)).toThrow();
    expect(() => createDefenderInterceptionCones(from, to, [{ ...defender, position: { x: 2, y: 0 } }], pitch, 10)).toThrow();
    expect(() => createDefenderInterceptionCones(from, to, [{ ...defender, id: ' ' }], pitch, 10)).toThrow(/defender id/i);
    expect(() => createDefenderInterceptionCones(from, to, [defender, defender], pitch, 10)).toThrow(/unique/i);
    expect(createDefenderInterceptionCones(from, to, [], pitch, 10)).toEqual([]);
  });

  it('matches independent pointwise reach checks and keeps polygons bounded on non-square pitches', () => {
    fc.assert(fc.property(
      fc.record({
        length: fc.integer({ min: 20, max: 120 }), width: fc.integer({ min: 10, max: 90 }),
        x: fc.integer({ min: 0, max: 1000 }), y: fc.integer({ min: 0, max: 1000 }),
        radius: fc.integer({ min: 1, max: 1000 }), angle: fc.integer({ min: 1, max: 180 }),
        laneY: fc.integer({ min: 0, max: 1000 }),
      }),
      input => {
        const dimensions = { lengthMeters: input.length, widthMeters: input.width };
        const start = { x: 0.1, y: input.laneY / 1000 }; const end = { x: 0.9, y: input.laneY / 1000 };
        const opponent = { id: 'property-defender', position: { x: input.x / 1000, y: input.y / 1000 } };
        const radius = input.radius / 10;
        const [cone] = createDefenderInterceptionCones(start, end, [opponent], dimensions, radius, input.angle);
        for (const point of cone!.polygon) {
          expect(Number.isFinite(point.x) && Number.isFinite(point.y)).toBe(true);
          expect(point.x >= 0 && point.x <= 1 && point.y >= 0 && point.y <= 1).toBe(true);
          expect(Math.hypot((point.x - opponent.position.x) * input.length, (point.y - opponent.position.y) * input.width)).toBeLessThanOrEqual(radius + 1e-7);
        }
        const heading = cone!.rotationDeg * Math.PI / 180;
        for (let step = 0; step <= 40; step += 1) {
          const point = { x: 0.1 + 0.8 * step / 40, y: start.y };
          const dx = (point.x - opponent.position.x) * input.length;
          const dy = (point.y - opponent.position.y) * input.width;
          const distance = Math.hypot(dx, dy);
          const angle = Math.abs(Math.atan2(Math.sin(Math.atan2(dy, dx) - heading), Math.cos(Math.atan2(dy, dx) - heading)));
          if (Math.abs(distance - radius) < 1e-7 || distance < 1e-7 || Math.abs(angle - input.angle * Math.PI / 360) < 1e-7) continue;
          const expected = distance < radius && angle < input.angle * Math.PI / 360;
          const span = cone!.reachableLane;
          const actual = span !== undefined && point.x >= span.from.x - 1e-9 && point.x <= span.to.x + 1e-9;
          expect(actual).toBe(expected);
        }
      },
    ), { numRuns: 150, seed: 440025 });
  });

  it('derives cones only for visible opposing active players and respects goalkeeper and layer filters', () => {
    const project = oppositionProject();
    const opponents = project.playerTokens.filter(token => token.teamId !== project.playerTokens[0]!.teamId);
    const scene = project.scenes[0]!;
    scene.layers.push({ id: 'hidden-defenders', name: 'Hidden', visible: false, locked: false });
    opponents[1]!.layerId = 'hidden-defenders'; opponents[2]!.visible = false;
    const team = project.teams.find(team => team.id === opponents[0]!.teamId)!;
    for (const [index, status] of [[3, 'coach'], [4, 'neutral'], [5, 'substitute']] as const) {
      team.roster.find(player => player.id === opponents[index]!.playerId)!.status = status;
    }
    const snapshot = structuredClone(project);
    const view = deriveTacticalAnalysis(project, scene.id, project.playerTokens[0]!.id, settings);
    expect(view.interceptionCones.map(cone => cone.defenderId)).toEqual([opponents[0]!.id, opponents[6]!.id]);
    const withoutKeeper = deriveTacticalAnalysis(project, scene.id, project.playerTokens[0]!.id, { ...settings, includeGoalkeepers: false });
    expect(withoutKeeper.interceptionCones.map(cone => cone.defenderId)).toEqual([opponents[6]!.id]);
    expect(withoutKeeper.selectedToken?.id).toBe(project.playerTokens[0]!.id);
    expect(project).toEqual(snapshot);
  });

  it('uses the sampled presentation for cones without writing another motion or persistence model', () => {
    const project = oppositionProject();
    const opponent = project.playerTokens.find(token => token.teamId !== project.playerTokens[0]!.teamId)!;
    project.timeline.tracks.push({ id: 'defender-motion', targetId: opponent.id, keyframes: [
      { id: 'defender-start', timeMs: 0, position: { x: 0.5, y: 0.3 }, interpolation: 'linear' },
      { id: 'defender-end', timeMs: 1000, position: { x: 0.7, y: 0.5 }, interpolation: 'hold' },
    ] });
    const snapshot = structuredClone(project);
    const sampled = sampleTacticalProjectAtTime(project, 500);
    const view = deriveTacticalAnalysis(sampled, project.scenes[0]!.id, project.playerTokens[0]!.id, settings);
    const cone = view.interceptionCones.find(cone => cone.defenderId === opponent.id)!;
    expect(cone.origin.x).toBeCloseTo(0.6, 10);
    expect(cone.origin.y).toBeCloseTo(0.4, 10);
    expect(cone.distanceToLaneMeters).toBeCloseTo(5, 10);
    expect(project).toEqual(snapshot);
  });

  it('keeps cones opt-in and reports coincident lane endpoints without invalid geometry', () => {
    const project = oppositionProject(); const sceneId = project.scenes[0]!.id; const tokenId = project.playerTokens[0]!.id;
    expect(deriveTacticalAnalysis(project, sceneId, tokenId, DEFAULT_ANALYSIS_DISPLAY_SETTINGS).interceptionCones).toEqual([]);
    project.ball.position = { ...project.playerTokens[0]!.position };
    const view = deriveTacticalAnalysis(project, sceneId, tokenId, settings);
    expect(view.interceptionCones).toEqual([]);
    expect(view.interceptionWarning).toMatch(/distinct.*endpoints/i);
    project.playerTokens = [];
    expect(deriveTacticalAnalysis(project, sceneId, undefined, settings).interceptionCones).toEqual([]);
  });
});

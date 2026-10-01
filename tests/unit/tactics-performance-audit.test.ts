import { afterEach, describe, expect, it } from 'vitest';
import { IDBKeyRange, indexedDB } from 'fake-indexeddb';
import { deriveTacticalAnalysis, DEFAULT_ANALYSIS_DISPLAY_SETTINGS } from '../../src/tools/tactics/TacticalAnalysisPanel';
import { sampleAuthoredTrajectory } from '../../src/tools/tactics/analysis-engine';
import { serializeTacticalBoardSvg } from '../../src/tools/tactics/board-engine';
import { findPotentialPathConflicts } from '../../src/tools/tactics/conflict-engine';
import { addEquipment, addPlayerToken, addRosterPlayer, addTeam, commitTacticalProject, createTacticalHistory, undoTacticalProject } from '../../src/tools/tactics/editor-engine';
import { buildStandalonePlaybackHtml } from '../../src/tools/tactics/export-engine';
import { TacticalProjectVault } from '../../src/tools/tactics/persistence-engine';
import {
  applyTrajectoryImport,
  exportTacticalProjectZip,
  exportTrajectoryCsv,
  importTacticalProjectJson,
  importTacticalProjectZip,
  parseTrajectoryCsv,
} from '../../src/tools/tactics/project-io';
import { createStarterTacticalProject, validateTacticalProject } from '../../src/tools/tactics/tactics-engine';
import type { TacticalProject, TimelineTrack } from '../../src/tools/tactics/tactics-types';
import { addTimelineTrack, sampleTacticalProjectAtTime } from '../../src/tools/tactics/timeline-engine';
import { bindHiddenDocumentPause } from '../../src/tools/tactics/video-review-engine';
import { buildBeginnerTacticalProject } from '../../src/tools/tactics/workspace-engine';

const SIX_HOURS_MS = 6 * 60 * 60 * 1000;
const MAX_TRACKS = 256;
const MAX_KEYFRAMES_PER_TRACK = 100_000;
const MAX_MARKERS = 8_000;
const MAX_ZIP_ENTRIES = 256;
const MAX_NAMED_SNAPSHOTS = 40;

const databaseNames: string[] = [];

afterEach(async () => {
  for (const name of databaseNames.splice(0)) {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.deleteDatabase(name);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
      request.onblocked = () => resolve();
    });
  }
});

function beginnerProject(): TacticalProject {
  return buildBeginnerTacticalProject({
    title: 'Audit session',
    teamName: 'Audit FC',
    primaryColor: '#154c79',
    secondaryColor: '#ffffff',
    formationId: 'ussf-4v4-1-2-1',
    pitchDimensions: { lengthMeters: 40, widthMeters: 30 },
    direction: 'left-to-right',
  });
}

function complexSession(): TacticalProject {
  let project = createStarterTacticalProject();
  project = {
    ...project,
    metadata: { ...project.metadata, title: '11v11 phase' },
    timeline: { ...project.timeline, durationMs: 90_000 },
    scenes: project.scenes.map((scene) => ({ ...scene, durationMs: 90_000 })),
  };
  for (const team of [
    { id: 'home', name: 'Home', primaryColor: '#154c79', secondaryColor: '#ffffff', x: 0.28 },
    { id: 'away', name: 'Away', primaryColor: '#991b1b', secondaryColor: '#ffffff', x: 0.72 },
  ]) {
    project = addTeam(project, {
      id: team.id,
      name: team.name,
      primaryColor: team.primaryColor,
      secondaryColor: team.secondaryColor,
      roster: [],
    });
    for (let index = 0; index < 11; index += 1) {
      const playerId = `${team.id}-player-${index + 1}`;
      const tokenId = `${team.id}-token-${index + 1}`;
      project = addRosterPlayer(project, team.id, {
        id: playerId,
        displayName: `${team.name} ${index + 1}`,
        jerseyNumber: String(index + 1),
        role: index === 0 ? 'Goalkeeper' : 'Outfield',
        status: 'active',
      });
      project = addPlayerToken(project, {
        id: tokenId,
        playerId,
        teamId: team.id,
        sceneId: 'scene-1',
        layerId: 'layer-1',
        position: { x: team.x, y: (index + 1) / 12 },
        rotationDeg: team.id === 'home' ? 90 : 270,
        visible: true,
        locked: false,
      });
      project = {
        ...project,
        timeline: addTimelineTrack(project.timeline, {
          id: `track-${tokenId}`,
          targetId: tokenId,
          keyframes: Array.from({ length: 10 }, (_, step) => ({
            id: `${tokenId}-key-${step}`,
            timeMs: step * 10_000,
            position: {
              x: Math.min(0.98, Math.max(0.02, team.x + (step % 2 === 0 ? -0.03 : 0.03))),
              y: (index + 1) / 12,
            },
            interpolation: step === 9 ? 'hold' as const : 'linear' as const,
          })),
        }),
      };
    }
  }
  for (let index = 0; index < 30; index += 1) {
    project = addEquipment(project, {
      id: `cone-${index + 1}`,
      kind: 'cone',
      sceneId: 'scene-1',
      layerId: 'layer-1',
      position: { x: ((index % 10) + 0.5) / 10, y: 0.15 + Math.floor(index / 10) * 0.2 },
      rotationDeg: 0,
      scale: 1,
      visible: true,
      locked: false,
    });
  }
  return project;
}

function withTimeline(project: TacticalProject, timeline: TacticalProject['timeline']): TacticalProject {
  return { ...project, timeline };
}

describe('Tactical performance and adversarial audit', () => {
  it('keeps a realistic 11v11 session responsive to sample, draw, and analyze', () => {
    const project = complexSession();
    expect(validateTacticalProject(project)).toEqual([]);
    expect(project.playerTokens).toHaveLength(22);
    expect(project.equipment).toHaveLength(30);
    expect(project.timeline.tracks).toHaveLength(22);

    const playbackStarted = performance.now();
    for (let frame = 0; frame < 30; frame += 1) {
      const presentation = sampleTacticalProjectAtTime(project, frame * 3_000);
      expect(presentation.playerTokens).toHaveLength(22);
    }
    const playbackMs = performance.now() - playbackStarted;

    const svgStarted = performance.now();
    const svg = serializeTacticalBoardSvg(project, 'scene-1');
    const svgMs = performance.now() - svgStarted;
    expect(svg).toContain('data-tactical-kind="player"');
    expect(svg).toContain('data-tactical-kind="equipment"');

    const analysisStarted = performance.now();
    for (let frame = 0; frame < 30; frame += 1) {
      const presentation = sampleTacticalProjectAtTime(project, frame * 3_000);
      const view = deriveTacticalAnalysis(
        presentation,
        'scene-1',
        'home-token-1',
        DEFAULT_ANALYSIS_DISPLAY_SETTINGS,
      );
      expect(view.selectedToken?.id).toBe('home-token-1');
    }
    const analysisMs = performance.now() - analysisStarted;

    expect(playbackMs, `playback ${playbackMs.toFixed(1)} ms`).toBeLessThan(1_000);
    expect(svgMs, `svg ${svgMs.toFixed(1)} ms`).toBeLessThan(500);
    expect(analysisMs, `analysis ${analysisMs.toFixed(1)} ms`).toBeLessThan(1_000);
  });

  it('reuses authored-trajectory sampling when the same track is analyzed again', () => {
    const track: TimelineTrack = {
      id: 'track-token-1',
      targetId: 'token-1',
      keyframes: [
        { id: 'start', timeMs: 0, position: { x: 0.2, y: 0.4 }, interpolation: 'linear' },
        { id: 'finish', timeMs: 1_000, position: { x: 0.8, y: 0.6 }, interpolation: 'hold' },
      ],
    };
    const first = sampleAuthoredTrajectory(track, 0, 1_000, 250);
    const second = sampleAuthoredTrajectory(track, 0, 1_000, 250);
    expect(second).toBe(first);
    expect(first.at(-1)?.timeMs).toBe(1_000);
  });

  it('samples a dense authored trajectory from one forward pass', () => {
    const keyframes = Array.from({ length: 12_000 }, (_, index) => ({
      id: `dense-${index}`,
      timeMs: index * 10,
      position: { x: (index % 40) / 40, y: 0.5 },
      interpolation: 'linear' as const,
    }));
    const track: TimelineTrack = { id: 'dense', targetId: 'token-1', keyframes };
    const started = performance.now();
    const samples = sampleAuthoredTrajectory(track, 0, 119_990, 10);
    const elapsed = performance.now() - started;
    expect(samples).toHaveLength(12_000);
    expect(samples[0]?.position).toEqual({ x: 0, y: 0.5 });
    expect(samples.at(-1)?.timeMs).toBe(119_990);
    expect(elapsed, `dense sample ${elapsed.toFixed(1)} ms`).toBeLessThan(750);
  });

  it('keeps undo and redo stacks inside the history limit', () => {
    let history = createTacticalHistory(createStarterTacticalProject());
    for (let index = 0; index < 110; index += 1) {
      history = commitTacticalProject(history, `edit ${index}`, (project) => ({
        ...project,
        metadata: { ...project.metadata, title: `Project ${index}` },
      }));
    }
    expect(history.past.length).toBeLessThanOrEqual(100);
    for (let index = 0; index < 100; index += 1) history = undoTacticalProject(history);
    expect(history.past).toHaveLength(0);
    expect(history.future.length).toBeLessThanOrEqual(100);
    expect(history.past.length + history.future.length).toBeLessThanOrEqual(100);
  });

  it('rejects an oversized timeline before it can replace an open project', () => {
    const opened = createStarterTacticalProject();
    const hostile = withTimeline(opened, { ...opened.timeline, durationMs: SIX_HOURS_MS + 1 });
    let current = opened;
    expect(() => {
      current = importTacticalProjectJson(JSON.stringify(hostile), 'too-long.json');
    }).toThrow(/duration|limit/i);
    expect(current).toBe(opened);
    expect(opened.timeline.durationMs).toBe(5_000);

    const atLimit = withTimeline(createStarterTacticalProject(), {
      ...createStarterTacticalProject().timeline,
      durationMs: SIX_HOURS_MS,
    });
    expect(importTacticalProjectJson(JSON.stringify(atLimit), 'six-hours.json').timeline.durationMs).toBe(SIX_HOURS_MS);
  });

  it('rejects trajectory times that would stretch a valid project past the timeline limit', () => {
    const project = beginnerProject();
    const durationBefore = project.timeline.durationMs;
    const csv = [
      'timestamp_ms,entity_id,team_id,x,y,z,orientation_deg,event,coordinate_system',
      `0,token-1,${project.playerTokens[0]!.teamId},0.2,0.3,,,,normalized`,
      `${SIX_HOURS_MS + 1},token-1,${project.playerTokens[0]!.teamId},0.4,0.5,,,,normalized`,
    ].join('\n');
    expect(() => parseTrajectoryCsv(csv, 'too-long.csv', project.pitch.dimensions)).toThrow(/duration|limit/i);
    expect(() => applyTrajectoryImport(project, [{
      targetId: 'token-1',
      timeMs: SIX_HOURS_MS + 1,
      position: { x: 0.4, y: 0.5 },
      coordinateSystem: 'normalized',
    }], 'trajectory-json', 'too-long.json')).toThrow(/duration|limit/i);
    expect(project.timeline.durationMs).toBe(durationBefore);
    expect(project.timeline.tracks).toEqual([]);
  });

  it('stops conflict and analysis sampling before an unbounded time loop', () => {
    const timeline = {
      playheadMs: 0,
      durationMs: 120_000,
      loop: false,
      playbackRate: 1,
      markers: [],
      tracks: [
        {
          id: 'a-track',
          targetId: 'a',
          keyframes: [
            { id: 'a0', timeMs: 0, position: { x: 0.2, y: 0.5 }, interpolation: 'linear' as const },
            { id: 'a1', timeMs: 120_000, position: { x: 0.8, y: 0.5 }, interpolation: 'hold' as const },
          ],
        },
      ],
    };
    expect(() => findPotentialPathConflicts(
      timeline,
      { lengthMeters: 100, widthMeters: 60 },
      { stepMs: 1, thresholdMeters: 1 },
    )).toThrow(/sample|step|limit/i);

    const project = withTimeline(beginnerProject(), {
      ...beginnerProject().timeline,
      durationMs: 120_000,
      tracks: [{
        id: 'track-token-1',
        targetId: 'token-1',
        keyframes: [
          { id: 'start', timeMs: 0, position: { x: 0.2, y: 0.4 }, interpolation: 'linear' as const },
          { id: 'end', timeMs: 120_000, position: { x: 0.8, y: 0.6 }, interpolation: 'hold' as const },
        ],
      }],
    });
    const view = deriveTacticalAnalysis(project, 'scene-1', 'token-1', {
      ...DEFAULT_ANALYSIS_DISPLAY_SETTINGS,
      trajectoryStepMs: 1,
    });
    expect(view.trajectoryWarning).toMatch(/sample|step|limit/i);
    expect(view.selectedToken?.id).toBe('token-1');
  });

  it('rejects imported projects whose track, keyframe, or marker counts exceed the session bound', () => {
    const base = createStarterTacticalProject();
    const tooManyTracks = withTimeline(base, {
      ...base.timeline,
      tracks: Array.from({ length: MAX_TRACKS + 1 }, (_, index) => ({
        id: `track-${index}`,
        targetId: `target-${index}`,
        keyframes: [{ id: `key-${index}`, timeMs: 0, position: { x: 0.5, y: 0.5 }, interpolation: 'linear' as const }],
      })),
    });
    expect(() => importTacticalProjectJson(JSON.stringify(tooManyTracks), 'tracks.json')).toThrow(/track|limit/i);

    const denseKeyframes = withTimeline(createStarterTacticalProject(), {
      ...createStarterTacticalProject().timeline,
      durationMs: MAX_KEYFRAMES_PER_TRACK,
      tracks: [{
        id: 'dense-track',
        targetId: 'runner',
        keyframes: Array.from({ length: MAX_KEYFRAMES_PER_TRACK + 1 }, (_, index) => ({
          id: `key-${index}`,
          timeMs: index,
          position: { x: 0.4, y: 0.4 },
          interpolation: 'linear' as const,
        })),
      }],
    });
    expect(() => importTacticalProjectJson(JSON.stringify(denseKeyframes), 'keyframes.json')).toThrow(/keyframe|limit/i);

    const tooManyMarkers = withTimeline(createStarterTacticalProject(), {
      ...createStarterTacticalProject().timeline,
      durationMs: SIX_HOURS_MS,
      markers: Array.from({ length: MAX_MARKERS + 1 }, (_, index) => ({
        id: `marker-${index}`,
        timeMs: index,
        kind: 'coaching-cue' as const,
        label: `Cue ${index}`,
      })),
    });
    expect(() => importTacticalProjectJson(JSON.stringify(tooManyMarkers), 'markers.json')).toThrow(/marker|limit/i);
  });

  it('does not virtualize the timeline below the track bound because each track is one text row', () => {
    const base = createStarterTacticalProject();
    const atBound = withTimeline(base, {
      ...base.timeline,
      tracks: Array.from({ length: MAX_TRACKS }, (_, index) => ({
        id: `track-${index}`,
        targetId: `target-${index}`,
        keyframes: [{ id: `key-${index}`, timeMs: 0, position: { x: 0.5, y: 0.5 }, interpolation: 'linear' as const }],
      })),
    });
    expect(validateTacticalProject(atBound)).toEqual([]);
    expect(atBound.timeline.tracks).toHaveLength(MAX_TRACKS);
  });

  it('rejects a ZIP whose declared entry count or uncompressed size is hostile before expanding it', async () => {
    const bytes = Buffer.from(await exportTacticalProjectZip(beginnerProject()));
    const counted = new Uint8Array(bytes);
    let endOfDirectory = -1;
    for (let offset = counted.length - 22; offset >= 0; offset -= 1) {
      if (counted[offset] === 0x50 && counted[offset + 1] === 0x4b && counted[offset + 2] === 0x05 && counted[offset + 3] === 0x06) {
        endOfDirectory = offset;
        break;
      }
    }
    expect(endOfDirectory).toBeGreaterThanOrEqual(0);
    const hostileCount = MAX_ZIP_ENTRIES + 1;
    counted[endOfDirectory + 8] = hostileCount & 255;
    counted[endOfDirectory + 9] = (hostileCount >> 8) & 255;
    counted[endOfDirectory + 10] = hostileCount & 255;
    counted[endOfDirectory + 11] = (hostileCount >> 8) & 255;
    await expect(importTacticalProjectZip(counted, 'many-entries.zip')).rejects.toThrow(/too many|entry count/i);

    const inflated = Buffer.from(bytes);
    const name = Buffer.from('project.json');
    const nameAt: number[] = [];
    for (let offset = 0; offset <= inflated.length - name.length; offset += 1) {
      if (inflated.subarray(offset, offset + name.length).equals(name)) nameAt.push(offset);
    }
    expect(nameAt.length).toBeGreaterThanOrEqual(2);
    const declared = 30_000_000;
    for (const offset of nameAt) {
      const localSignature = offset - 30;
      const centralSignature = offset - 46;
      const local = inflated[localSignature] === 0x50
        && inflated[localSignature + 1] === 0x4b
        && inflated[localSignature + 2] === 0x03
        && inflated[localSignature + 3] === 0x04;
      const central = inflated[centralSignature] === 0x50
        && inflated[centralSignature + 1] === 0x4b
        && inflated[centralSignature + 2] === 0x01
        && inflated[centralSignature + 3] === 0x02;
      const sizeOffset = local ? offset - 8 : central ? offset - 22 : -1;
      expect(sizeOffset).toBeGreaterThanOrEqual(0);
      inflated[sizeOffset] = declared & 255;
      inflated[sizeOffset + 1] = (declared >> 8) & 255;
      inflated[sizeOffset + 2] = (declared >> 16) & 255;
      inflated[sizeOffset + 3] = (declared >> 24) & 255;
    }
    await expect(importTacticalProjectZip(new Uint8Array(inflated), 'huge-json.zip')).rejects.toThrow(/size limit|before decompression/i);
  });

  it('rejects central-directory entries that the end record undercounts', async () => {
    const bytes = Buffer.from(await exportTacticalProjectZip(beginnerProject()));
    let centralStart = -1;
    let centralEnd = -1;
    for (let offset = 0; offset + 46 < bytes.length; offset += 1) {
      if (bytes[offset] !== 0x50 || bytes[offset + 1] !== 0x4b || bytes[offset + 2] !== 0x01 || bytes[offset + 3] !== 0x02) continue;
      const nameLength = bytes[offset + 28]! | (bytes[offset + 29]! << 8);
      const extraLength = bytes[offset + 30]! | (bytes[offset + 31]! << 8);
      const commentLength = bytes[offset + 32]! | (bytes[offset + 33]! << 8);
      const recordEnd = offset + 46 + nameLength + extraLength + commentLength;
      if (centralStart < 0) centralStart = offset;
      centralEnd = recordEnd;
    }
    expect(centralStart).toBeGreaterThanOrEqual(0);
    expect(centralEnd).toBeGreaterThan(centralStart);
    const directory = bytes.subarray(centralStart, centralEnd);
    const copies = Buffer.concat(Array.from({ length: MAX_ZIP_ENTRIES }, () => directory));
    const undercounted = Buffer.concat([bytes.subarray(0, centralEnd), copies, bytes.subarray(centralEnd)]);
    await expect(importTacticalProjectZip(new Uint8Array(undercounted), 'undercounted.zip')).rejects.toThrow(/entry count/i);
  });

  it('neutralizes spreadsheet formulas in trajectory CSV text without changing the imported event', () => {
    const project = beginnerProject();
    const teamId = project.playerTokens[0]!.teamId;
    const withTrack = withTimeline(project, {
      ...project.timeline,
      durationMs: 1_000,
      tracks: [{
        id: 'track-token-1',
        targetId: 'token-1',
        keyframes: [
          { id: 'start', timeMs: 0, position: { x: 0.2, y: 0.3 }, event: '=press', interpolation: 'linear' },
          { id: 'end', timeMs: 1_000, position: { x: 0.7, y: 0.6 }, interpolation: 'hold' },
        ],
      }],
    });
    const csv = exportTrajectoryCsv(withTrack);
    const eventCell = csv.split('\n')[1]?.split(',')[7];
    expect(eventCell?.startsWith('=')).toBe(false);
    expect(eventCell).toContain('=press');
    const samples = parseTrajectoryCsv(csv, 'formula.csv', project.pitch.dimensions);
    expect(samples[0]).toMatchObject({ targetId: 'token-1', teamId, event: '=press' });
  });

  it('pauses standalone playback and local video review while the document is hidden', () => {
    const html = buildStandalonePlaybackHtml(beginnerProject(), 'scene-1', { maxFrames: 2, frameRate: 10 });
    expect(html).toContain('visibilitychange');
    expect(html).toContain('document.hidden');

    let visibilityState: 'visible' | 'hidden' = 'visible';
    const listeners = new Set<() => void>();
    const pause = viPause();
    const detach = bindHiddenDocumentPause({
      get visibilityState() { return visibilityState; },
      addEventListener(_type, listener) { listeners.add(listener); },
      removeEventListener(_type, listener) { listeners.delete(listener); },
    }, pause.fn);
    visibilityState = 'hidden';
    for (const listener of listeners) listener();
    expect(pause.calls).toBe(1);
    visibilityState = 'visible';
    for (const listener of listeners) listener();
    expect(pause.calls).toBe(1);
    detach();
    visibilityState = 'hidden';
    for (const listener of listeners) listener();
    expect(pause.calls).toBe(1);
  });

  it('refuses named snapshots after the local snapshot limit and keeps the saved project', async () => {
    const name = `inmotools-tactics-audit-${crypto.randomUUID()}`;
    databaseNames.push(name);
    const vault = new TacticalProjectVault({ databaseName: name, indexedDB, IDBKeyRange });
    const project = beginnerProject();
    await vault.saveProject(project);
    for (let index = 0; index < MAX_NAMED_SNAPSHOTS; index += 1) {
      await vault.createSnapshot(project, `Phase ${index + 1}`);
    }
    await expect(vault.createSnapshot(project, 'One past the limit')).rejects.toThrow(/snapshot limit/i);
    expect(await vault.listNamedSnapshots(project.id)).toHaveLength(MAX_NAMED_SNAPSHOTS);
    expect((await vault.getProject(project.id))?.metadata.title).toBe(project.metadata.title);
    await vault.close();
  });
});

function viPause(): { fn: () => void; calls: number } {
  const state = { calls: 0, fn: () => undefined };
  state.fn = () => { state.calls += 1; };
  return state;
}

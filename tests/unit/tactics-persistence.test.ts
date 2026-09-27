import { afterEach, describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { IDBKeyRange, indexedDB } from 'fake-indexeddb';
import { buildBeginnerTacticalProject } from '../../src/tools/tactics/workspace-engine';
import { TACTICS_SCHEMA_VERSION } from '../../src/tools/tactics/tactics-engine';
import {
  applyTrajectoryImport,
  exportTacticalProjectJson,
  exportTacticalProjectZip,
  exportTrajectoryCsv,
  exportTrajectoryJson,
  importTacticalProjectJson,
  importTacticalProjectZip,
  parseTrajectoryCsv,
  parseTrajectoryJson,
} from '../../src/tools/tactics/project-io';
import { TacticalProjectVault } from '../../src/tools/tactics/persistence-engine';
import { updateCoachingSessionPlan } from '../../src/tools/tactics/session-engine';

function projectFixture() {
  return buildBeginnerTacticalProject({
    title: 'Persistence test',
    teamName: 'Test team',
    primaryColor: '#154c79',
    secondaryColor: '#ffffff',
    formationId: 'ussf-4v4-1-2-1',
    pitchDimensions: { lengthMeters: 40, widthMeters: 30 },
    direction: 'left-to-right',
  });
}

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

describe('Tactical project interchange', () => {
  it('migrates every pre-persistence schema-v1 project to the current portable schema before validation', () => {
    const current = projectFixture();
    const legacy = structuredClone(current) as unknown as Record<string, unknown>;
    legacy.schemaVersion = 1;
    const timeline = legacy.timeline as Record<string, unknown>;
    delete timeline.possessionEvents;

    const imported = importTacticalProjectJson(JSON.stringify(legacy), 'legacy-board.json');

    expect(TACTICS_SCHEMA_VERSION).toBe(2);
    expect(imported.schemaVersion).toBe(2);
    expect(imported.timeline.possessionEvents).toEqual([]);
    expect(imported.importProvenance.at(-1)).toMatchObject({
      sourceType: 'project-json',
      sourceName: 'legacy-board.json',
    });
  });

  it('round-trips current JSON deterministically and rejects malformed or future-schema input', () => {
    const project = projectFixture();
    const first = exportTacticalProjectJson(project);
    const second = exportTacticalProjectJson(project);
    expect(first).toBe(second);

    const imported = importTacticalProjectJson(first, 'board.json');
    expect(imported.id).toBe(project.id);
    expect(imported.metadata.title).toBe(project.metadata.title);
    expect(imported.schemaVersion).toBe(TACTICS_SCHEMA_VERSION);

    expect(() => importTacticalProjectJson('{"schemaVersion":2}', 'broken.json')).toThrow(/project|invalid|missing/i);
    expect(() => importTacticalProjectJson(
      JSON.stringify({ ...project, schemaVersion: TACTICS_SCHEMA_VERSION + 1 }),
      'future.json',
    )).toThrow(/unsupported|future|schema/i);
  });

  it('round-trips deterministic ZIP bundles with Blob assets and rejects unsafe archive paths', async () => {
    const project = projectFixture();
    project.media = [{
      id: 'media-1',
      name: 'clip notes.txt',
      mimeType: 'text/plain',
      sizeBytes: 5,
      blob: new Blob(['hello'], { type: 'text/plain' }),
    }];

    const first = await exportTacticalProjectZip(project);
    const second = await exportTacticalProjectZip(project);
    expect([...first]).toEqual([...second]);

    const imported = await importTacticalProjectZip(first, 'board.zip');
    expect(imported.project.metadata.title).toBe('Persistence test');
    expect(imported.project.media).toHaveLength(1);
    expect(await imported.project.media[0]!.blob!.text()).toBe('hello');
    expect(imported.manifest.schemaVersion).toBe(TACTICS_SCHEMA_VERSION);

    const unsafe = new JSZip();
    unsafe.file('../project.json', exportTacticalProjectJson(project));
    const unsafeBytes = await unsafe.generateAsync({ type: 'uint8array' });
    await expect(importTacticalProjectZip(unsafeBytes, 'unsafe.zip')).rejects.toThrow(/unsafe|path/i);
  });
});

describe('Open tactical trajectory interchange', () => {
  it('round-trips authored trajectories through deterministic CSV and JSON', () => {
    const project = projectFixture();
    project.timeline.tracks = [{
      id: 'track-token-1',
      targetId: 'token-1',
      keyframes: [
        { id: 'start', timeMs: 0, position: { x: 0.2, y: 0.3 }, interpolation: 'linear' },
        { id: 'finish', timeMs: 1000, position: { x: 0.7, y: 0.6 }, interpolation: 'hold' },
      ],
    }];

    const csv = exportTrajectoryCsv(project);
    expect(csv.split('\n')[0]).toBe('targetId,timeMs,x,y');
    expect(parseTrajectoryCsv(csv, 'motion.csv')).toEqual([
      { targetId: 'token-1', timeMs: 0, position: { x: 0.2, y: 0.3 } },
      { targetId: 'token-1', timeMs: 1000, position: { x: 0.7, y: 0.6 } },
    ]);

    const json = exportTrajectoryJson(project);
    expect(parseTrajectoryJson(json, 'motion.json')).toEqual(parseTrajectoryCsv(csv, 'motion.csv'));
  });

  it('validates all imported samples before replacing target tracks or adding provenance', () => {
    const project = projectFixture();
    const before = JSON.stringify(project);
    const samples = [
      { targetId: 'token-1', timeMs: 0, position: { x: 0.2, y: 0.3 } },
      { targetId: 'token-1', timeMs: 1000, position: { x: 0.8, y: 0.6 } },
    ];

    const imported = applyTrajectoryImport(project, samples, 'trajectory-csv', 'motion.csv');
    expect(imported.timeline.tracks.find((track) => track.targetId === 'token-1')?.keyframes).toHaveLength(2);
    expect(imported.importProvenance.at(-1)).toMatchObject({
      sourceType: 'trajectory-csv',
      sourceName: 'motion.csv',
    });
    expect(JSON.stringify(project)).toBe(before);

    expect(() => applyTrajectoryImport(project, [
      ...samples,
      { targetId: 'missing-token', timeMs: 2000, position: { x: 2, y: 0.4 } },
    ], 'trajectory-json', 'bad.json')).toThrow(/target|position|normalized/i);
    expect(JSON.stringify(project)).toBe(before);
  });
});

describe('Coaching session planning', () => {
  it('updates structured drill/session data immutably and normalizes list input', () => {
    const project = projectFixture();
    const next = updateCoachingSessionPlan(project, {
      ageOrDevelopmentLevel: ' U9 ',
      playerCount: 8,
      objective: ' Create width ',
      setup: ' Four gates ',
      equipment: [' cones ', '', 'balls'],
      coachingCues: [' Scan first ', 'Play forward'],
      progressions: ['Add a defender'],
      regressions: ['Remove pressure'],
      durationMinutes: 25,
      notes: ' Keep groups moving. ',
    });

    expect(next).not.toBe(project);
    expect(next.sessionPlan).toMatchObject({
      ageOrDevelopmentLevel: 'U9',
      playerCount: 8,
      objective: 'Create width',
      setup: 'Four gates',
      equipment: ['cones', 'balls'],
      coachingCues: ['Scan first', 'Play forward'],
      durationMinutes: 25,
      notes: 'Keep groups moving.',
    });
    expect(project.sessionPlan.objective).toBe('');
    expect(() => updateCoachingSessionPlan(project, { playerCount: -1 })).toThrow(/player count/i);
    expect(() => updateCoachingSessionPlan(project, { durationMinutes: 1.5 })).toThrow(/duration/i);
  });
});

describe('Dexie tactical project vault', () => {
  it('saves current projects, bounded autosaves and named snapshots in one local database', async () => {
    const name = `inmotools-tactics-test-${crypto.randomUUID()}`;
    databaseNames.push(name);
    const vault = new TacticalProjectVault({
      databaseName: name,
      indexedDB,
      IDBKeyRange,
      autosaveLimit: 2,
    });
    const project = projectFixture();

    await vault.saveProject(project);
    expect((await vault.getProject(project.id))?.metadata.title).toBe('Persistence test');

    await vault.saveAutosave({ ...project, metadata: { ...project.metadata, title: 'Auto 1' } });
    await vault.saveAutosave({ ...project, metadata: { ...project.metadata, title: 'Auto 2' } });
    await vault.saveAutosave({ ...project, metadata: { ...project.metadata, title: 'Auto 3' } });
    expect((await vault.listAutosaves(project.id)).map((item) => item.project.metadata.title)).toEqual(['Auto 3', 'Auto 2']);
    expect((await vault.getLatestRecovery(project.id))?.project.metadata.title).toBe('Auto 3');

    const named = await vault.createSnapshot(project, 'Before press');
    expect(named.label).toBe('Before press');
    expect((await vault.listNamedSnapshots(project.id))).toHaveLength(1);

    await vault.close();
  });

  it('never replaces a valid stored project when imported JSON is corrupt', async () => {
    const name = `inmotools-tactics-test-${crypto.randomUUID()}`;
    databaseNames.push(name);
    const vault = new TacticalProjectVault({ databaseName: name, indexedDB, IDBKeyRange });
    const project = projectFixture();
    await vault.saveProject(project);

    await expect(vault.importJson('{"schemaVersion":2}', 'broken.json')).rejects.toThrow();
    expect((await vault.getProject(project.id))?.metadata.title).toBe('Persistence test');

    await vault.close();
  });
});

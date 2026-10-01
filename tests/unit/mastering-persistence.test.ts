import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { defaultMasterSettings } from '../../src/tools/music/dsp/master-chain';
import {
  MAX_SESSIONS,
  MasteringStore,
  buildProjectBackup,
  parseMasteringDocument,
  readProjectBackup,
} from '../../src/tools/music/mastering-persistence';
import { addSourceTracksRevision, appendAudioEditRevision, createMasteringDocument, type MasteringDocument } from '../../src/tools/music/mastering-project';

const source = (id: string) => ({ id, name: `${id}.wav`, sampleRate: 48_000, channelCount: 1, frameCount: 48_000, fileSize: 10, lastModified: 1, codec: 'pcm-s16' });

function sampleDocument(): MasteringDocument {
  let document = addSourceTracksRevision(createMasteringDocument(), [
    { source: source('a'), trackId: 't1', clipId: 'c1' },
    { source: source('b'), trackId: 't2', clipId: 'c2' },
  ]);
  document = appendAudioEditRevision({ ...document, activeClipId: 'c1' }, { type: 'gain', gainDb: -3 } as never);
  return { ...document, markers: [{ id: 'm', label: 'Drop', seconds: 0.5 }], regions: [{ id: 'r', label: 'Intro', startSeconds: 0, endSeconds: 0.5 }] };
}

// --- SECTION: validation ---

describe('parseMasteringDocument', () => {
  it('round-trips a real document through JSON unchanged', () => {
    const document = sampleDocument();
    expect(parseMasteringDocument(JSON.parse(JSON.stringify(document)))).toEqual(document);
  });

  it('clamps out-of-range values and drops unusable annotations', () => {
    const raw = JSON.parse(JSON.stringify(sampleDocument())) as Record<string, unknown> & { tracks: Array<Record<string, unknown>> };
    raw.tracks[0].gainDb = 400;
    raw.tracks[0].pan = -9;
    raw.playhead = -4;
    raw.selection = { startSeconds: 3, endSeconds: 1 };
    raw.regions = [{ id: 'bad', label: 'Backwards', startSeconds: 2, endSeconds: 1 }, 'nonsense'];
    raw.activeClipId = 'not-a-clip';
    raw.master = { outputGainDb: Number.NaN };
    const parsed = parseMasteringDocument(raw);
    expect(parsed.tracks[0]).toMatchObject({ gainDb: 24, pan: -1 });
    expect(parsed.playhead).toBe(0);
    expect(parsed.selection).toEqual({ startSeconds: 1, endSeconds: 3 });
    expect(parsed.regions).toEqual([]);
    expect(parsed.activeClipId).toBeNull();
    expect(parsed.master).toEqual(defaultMasterSettings());
  });

  it('refuses projects it cannot use, saying why', () => {
    expect(() => parseMasteringDocument({ version: 1 })).toThrow(/not an Audio Mastering project/);
    const raw = JSON.parse(JSON.stringify(sampleDocument())) as { tracks: Array<{ clips: Array<Record<string, unknown>> }>; sources: unknown[] };
    const unknownEdit = structuredClone(raw);
    unknownEdit.tracks[0].clips[0].edits = [{ type: 'teleport' }];
    expect(() => parseMasteringDocument(unknownEdit)).toThrow(/does not recognise/);
    const orphan = structuredClone(raw);
    orphan.sources = orphan.sources.slice(1);
    expect(() => parseMasteringDocument(orphan)).toThrow(/points to audio that is not in the project/);
    const duplicate = structuredClone(raw);
    duplicate.tracks[1].clips[0].id = duplicate.tracks[0].clips[0].id;
    expect(() => parseMasteringDocument(duplicate)).toThrow(/share one id/);
  });
});

// --- SECTION: IndexedDB sessions and presets ---

describe('MasteringStore', () => {
  const fresh = () => MasteringStore.open(new IDBFactory());

  it('saves and recovers a session with its source files, removing audio the project dropped', async () => {
    const store = await fresh();
    const document = sampleDocument();
    await store.saveSession('tab-1', document, new Map([['a', new Blob(['AAA'])], ['b', new Blob(['BB'])]]));
    const [session] = await store.listSessions();
    expect(session).toMatchObject({ id: 'tab-1', sourceNames: ['a.wav', 'b.wav'] });
    expect(session.document).toEqual(document);
    const sources = await store.loadSources('tab-1', ['a', 'b']);
    expect(await sources.get('a')!.text()).toBe('AAA');

    // Dropping source b removes its stored bytes; a later save need not resend a.
    const withoutB = { ...document, sources: document.sources.slice(0, 1), tracks: document.tracks.slice(0, 1) };
    await store.saveSession('tab-1', withoutB, new Map());
    expect([...(await store.loadSources('tab-1', ['a', 'b'])).keys()]).toEqual(['a']);
    store.close();
  });

  it('keeps sessions from different tabs apart and prunes the oldest', async () => {
    const store = await fresh();
    for (let index = 0; index < MAX_SESSIONS + 2; index += 1) {
      await store.saveSession(`tab-${index}`, sampleDocument(), new Map([['a', new Blob([String(index)])], ['b', new Blob(['b'])]]));
      await new Promise((resolve) => setTimeout(resolve, 2));
    }
    expect(await store.pruneSessions('tab-0')).toBe(2);
    const ids = (await store.listSessions()).map((session) => session.id);
    expect(ids).toHaveLength(MAX_SESSIONS);
    expect(ids).toContain('tab-0');
    expect(ids[0]).toBe(`tab-${MAX_SESSIONS + 1}`);
    await store.deleteSession('tab-0');
    expect((await store.loadSources('tab-0', ['a'])).size).toBe(0);
    store.close();
  });

  it('saves, renames by name, lists, and deletes master presets', async () => {
    const store = await fresh();
    const loud = defaultMasterSettings();
    loud.outputGainDb = 3;
    const first = await store.savePreset('  Loud  ', loud);
    expect(first.name).toBe('Loud');
    const replaced = await store.savePreset('loud', defaultMasterSettings());
    expect(replaced.id).toBe(first.id);
    await store.savePreset('Airy', loud);
    expect((await store.listPresets()).map((preset) => preset.name)).toEqual(['Airy', 'loud']);
    await expect(store.savePreset('   ', loud)).rejects.toThrow(/name/);
    await store.deletePreset(first.id);
    expect((await store.listPresets()).map((preset) => preset.name)).toEqual(['Airy']);
    store.close();
  });
});

// --- SECTION: backup files ---

describe('project backups', () => {
  it('round-trips the project and its original audio through one ZIP', async () => {
    const document = sampleDocument();
    const bytes = await buildProjectBackup(document, new Map([['a', new Blob(['alpha'])], ['b', new Blob(['beta'])]]), new Date('2026-09-27T12:00:00Z'));
    const restored = await readProjectBackup(bytes);
    expect(restored.document).toEqual(document);
    expect(restored.savedAt).toBe('2026-09-27T12:00:00.000Z');
    expect(await restored.sources.get('b')!.text()).toBe('beta');
  });

  it('explains what is wrong with files that are not usable backups', async () => {
    const document = sampleDocument();
    await expect(buildProjectBackup(document, new Map([['a', new Blob(['x'])]]))).rejects.toThrow(/b\.wav is not available/);
    await expect(readProjectBackup(new Uint8Array([1, 2, 3]))).rejects.toThrow(/not a ZIP/);
    const { default: JSZip } = await import('jszip');
    const other = new JSZip();
    other.file('project.json', JSON.stringify({ format: 'something-else' }));
    await expect(readProjectBackup(await other.generateAsync({ type: 'uint8array' }))).rejects.toThrow(/not an Audio Mastering project backup/);
    const newer = new JSZip();
    newer.file('project.json', JSON.stringify({ format: 'inmotools-audio-mastering', version: 99, document }));
    await expect(readProjectBackup(await newer.generateAsync({ type: 'uint8array' }))).rejects.toThrow(/newer version/);
    const missing = new JSZip();
    missing.file('project.json', JSON.stringify({ format: 'inmotools-audio-mastering', version: 1, document, files: {} }));
    await expect(readProjectBackup(await missing.generateAsync({ type: 'uint8array' }))).rejects.toThrow(/missing the audio for a\.wav/);
  });
});

import { describe, expect, it, vi } from 'vitest';
import {
  createDraftRecord,
  deleteDraft,
  estimateStorageUsage,
  listDrafts,
  saveDraft,
  updateDraftRecord,
  type DraftStore,
} from '../../src/tools/markdown/autosave-engine';
import type { DraftRecord } from '../../src/tools/markdown/markdown-types';

class MemoryDraftStore implements DraftStore {
  private records = new Map<string, DraftRecord>();
  async list() { return [...this.records.values()]; }
  async save(record: DraftRecord) { this.records.set(record.id, record); }
  async remove(id: string) { this.records.delete(id); }
}

describe('draft creation and update shaping', () => {
  it('creates a draft record with the given name, text, and timestamp', () => {
    const draft = createDraftRecord('My Draft', 'Some text', 1000);
    expect(draft.name).toBe('My Draft');
    expect(draft.text).toBe('Some text');
    expect(draft.updatedAt).toBe(1000);
    expect(draft.id).toBeTruthy();
  });

  it('generates a unique id for each new draft', () => {
    const a = createDraftRecord('A', 'x', 1);
    const b = createDraftRecord('B', 'y', 1);
    expect(a.id).not.toBe(b.id);
  });

  it('updates a draft in place, preserving its id and name but replacing text and timestamp', () => {
    const original = createDraftRecord('My Draft', 'v1', 1000);
    const updated = updateDraftRecord(original, 'v2', 2000);
    expect(updated.id).toBe(original.id);
    expect(updated.name).toBe('My Draft');
    expect(updated.text).toBe('v2');
    expect(updated.updatedAt).toBe(2000);
  });
});

describe('draft storage orchestration against an in-memory fake store', () => {
  it('saves a draft and lists it back', async () => {
    const store = new MemoryDraftStore();
    const draft = createDraftRecord('Draft One', 'hello', 100);
    await saveDraft(store, draft);
    const drafts = await listDrafts(store);
    expect(drafts).toHaveLength(1);
    expect(drafts[0]).toEqual(draft);
  });

  it('lists drafts most-recently-updated first', async () => {
    const store = new MemoryDraftStore();
    await saveDraft(store, createDraftRecord('Older', 'a', 100));
    await saveDraft(store, createDraftRecord('Newer', 'b', 200));
    const drafts = await listDrafts(store);
    expect(drafts.map((d) => d.name)).toEqual(['Newer', 'Older']);
  });

  it('removes a draft by id', async () => {
    const store = new MemoryDraftStore();
    const draft = createDraftRecord('Draft', 'x', 100);
    await saveDraft(store, draft);
    await deleteDraft(store, draft.id);
    expect(await listDrafts(store)).toHaveLength(0);
  });

  it('overwrites an existing draft when saved again with the same id', async () => {
    const store = new MemoryDraftStore();
    const draft = createDraftRecord('Draft', 'v1', 100);
    await saveDraft(store, draft);
    await saveDraft(store, updateDraftRecord(draft, 'v2', 200));
    const drafts = await listDrafts(store);
    expect(drafts).toHaveLength(1);
    expect(drafts[0].text).toBe('v2');
  });
});

describe('storage usage estimate', () => {
  it('reports usage and quota when the browser storage API is available', async () => {
    const originalNavigator = globalThis.navigator;
    Object.defineProperty(globalThis, 'navigator', {
      value: { storage: { estimate: vi.fn().mockResolvedValue({ usage: 4096, quota: 1048576 }) } },
      configurable: true,
    });
    const estimate = await estimateStorageUsage();
    expect(estimate).toEqual({ usageBytes: 4096, quotaBytes: 1048576 });
    Object.defineProperty(globalThis, 'navigator', { value: originalNavigator, configurable: true });
  });

  it('returns null fields, rather than throwing, when the storage API is unavailable', async () => {
    const originalNavigator = globalThis.navigator;
    Object.defineProperty(globalThis, 'navigator', { value: {}, configurable: true });
    const estimate = await estimateStorageUsage();
    expect(estimate).toEqual({ usageBytes: null, quotaBytes: null });
    Object.defineProperty(globalThis, 'navigator', { value: originalNavigator, configurable: true });
  });

  it('returns null fields, rather than throwing, when the storage API itself rejects', async () => {
    const originalNavigator = globalThis.navigator;
    Object.defineProperty(globalThis, 'navigator', {
      value: { storage: { estimate: vi.fn().mockRejectedValue(new Error('denied')) } },
      configurable: true,
    });
    const estimate = await estimateStorageUsage();
    expect(estimate).toEqual({ usageBytes: null, quotaBytes: null });
    Object.defineProperty(globalThis, 'navigator', { value: originalNavigator, configurable: true });
  });
});

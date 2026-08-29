import { describe, expect, it } from 'vitest';
import { createDefaultWorkspace, readWorkspace, touchRecent, writeWorkspace } from '../../src/lib/persistence';

class MemoryStorage {
  private values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}

describe('workspace persistence', () => {
  it('returns a clean versioned workspace for missing storage', () => {
    const storage = new MemoryStorage();
    expect(readWorkspace(storage)).toEqual(createDefaultWorkspace());
  });

  it('round-trips favorites and recent tools', () => {
    const storage = new MemoryStorage();
    const state = { ...createDefaultWorkspace(), favorites: ['subtitle-drift'], recent: ['subtitle-drift'] };
    writeWorkspace(storage, state);
    expect(readWorkspace(storage)).toEqual(state);
  });

  it('keeps recent tools unique and bounded', () => {
    const state = { ...createDefaultWorkspace(), recent: ['a', 'b', 'c'] };
    expect(touchRecent(state, 'b', 3).recent).toEqual(['b', 'a', 'c']);
    expect(touchRecent(state, 'd', 3).recent).toEqual(['d', 'a', 'b']);
  });
});

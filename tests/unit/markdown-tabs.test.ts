import { describe, expect, it } from 'vitest';
import {
  canAddTab,
  MAX_TABS,
  relabelTab,
  tabAfterClose,
  tabDisplayLabel,
  tabIdForDraft,
  withoutTab,
  type StashedTab,
  type TabEntry,
} from '../../src/tools/markdown/tab-engine';

const entries = (...ids: string[]): TabEntry[] => ids.map((id) => ({ id, label: id }));
const stashed = (draftId: string | null): StashedTab => ({
  documentName: '',
  history: { past: [], present: 'text', future: [] },
  draftId,
  persistedText: 'text',
  persistedName: '',
  openedFile: null,
  lastSavedAt: null,
});

describe('MDW-R70 document tabs', () => {
  it('limits the number of open tabs', () => {
    expect(canAddTab(entries(...Array.from({ length: MAX_TABS - 1 }, (_, i) => `t${i}`)))).toBe(true);
    expect(canAddTab(entries(...Array.from({ length: MAX_TABS }, (_, i) => `t${i}`)))).toBe(false);
  });

  it('shows the tab on the right after closing, else the one on the left', () => {
    const tabs = entries('a', 'b', 'c');
    expect(tabAfterClose(tabs, 'a')).toBe('b');
    expect(tabAfterClose(tabs, 'b')).toBe('c');
    expect(tabAfterClose(tabs, 'c')).toBe('b');
    expect(tabAfterClose(entries('a'), 'a')).toBeNull();
    expect(tabAfterClose(tabs, 'missing')).toBeNull();
  });

  it('removes and relabels tabs without changing the others', () => {
    const tabs = entries('a', 'b');
    expect(withoutTab(tabs, 'a').map((tab) => tab.id)).toEqual(['b']);
    const relabeled = relabelTab(tabs, 'b', 'Notes');
    expect(relabeled.map((tab) => tab.label)).toEqual(['a', 'Notes']);
    expect(relabeled[0]).toBe(tabs[0]);
    expect(relabelTab(tabs, 'b', 'b')).toEqual(tabs);
  });

  it('finds the tab that already shows a saved draft', () => {
    const map = new Map<string, StashedTab>([['t1', stashed('d1')], ['t2', stashed(null)]]);
    expect(tabIdForDraft(map, 'd1')).toBe('t1');
    expect(tabIdForDraft(map, 'd2')).toBeNull();
  });

  it('labels an unnamed tab Untitled', () => {
    expect(tabDisplayLabel('  ')).toBe('Untitled');
    expect(tabDisplayLabel(' Plan ')).toBe('Plan');
  });
});

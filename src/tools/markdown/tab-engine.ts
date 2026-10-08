import type { ProjectHistory } from './markdown-types';

// Open documents ("tabs") for one session. The active tab's live state stays in the workspace; a tab
// that is not active is kept here as a StashedTab so switching restores its text, undo history and
// draft link without a reload. Tabs are not remembered across reloads: every tab is saved as a local
// draft before it is left, so the draft list is what survives.

export const MAX_TABS = 10;

export interface StashedTab {
  readonly documentName: string;
  readonly history: ProjectHistory<string>;
  readonly draftId: string | null;
  readonly persistedText: string;
  readonly persistedName: string;
  readonly openedFile: { readonly name: string; readonly text: string } | null;
  readonly lastSavedAt: number | null;
}

export interface TabEntry {
  readonly id: string;
  readonly label: string;
}

export const canAddTab = (tabs: readonly TabEntry[]): boolean => tabs.length < MAX_TABS;

export const newTabId = (): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `tab-${Date.now()}-${Math.random().toString(36).slice(2)}`;

// The tab to show after closing `closedId`: the one to its right, else the one to its left.
export const tabAfterClose = (tabs: readonly TabEntry[], closedId: string): string | null => {
  const index = tabs.findIndex((tab) => tab.id === closedId);
  if (index < 0) return null;
  return (tabs[index + 1] ?? tabs[index - 1])?.id ?? null;
};

export const withoutTab = (tabs: readonly TabEntry[], id: string): TabEntry[] =>
  tabs.filter((tab) => tab.id !== id);

export const relabelTab = (tabs: readonly TabEntry[], id: string, label: string): TabEntry[] =>
  tabs.map((tab) => (tab.id === id && tab.label !== label ? { ...tab, label } : tab));

// A saved draft that another tab already shows is switched to instead of opened a second time.
export const tabIdForDraft = (
  stashed: ReadonlyMap<string, StashedTab>,
  draftId: string,
): string | null => {
  for (const [id, tab] of stashed) if (tab.draftId === draftId) return id;
  return null;
};

export const tabDisplayLabel = (label: string): string => label.trim() || 'Untitled';

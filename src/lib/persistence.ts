export interface WorkspaceState {
  version: 1;
  favorites: string[];
  recent: string[];
}

const STORAGE_KEY = 'inmotools.workspace.v1';

export function createDefaultWorkspace(): WorkspaceState {
  return { version: 1, favorites: [], recent: [] };
}

export function readWorkspace(storage: Pick<Storage, 'getItem'>): WorkspaceState {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return createDefaultWorkspace();
    const parsed = JSON.parse(raw) as Partial<WorkspaceState>;
    if (parsed.version !== 1 || !Array.isArray(parsed.favorites) || !Array.isArray(parsed.recent)) {
      return createDefaultWorkspace();
    }
    return { version: 1, favorites: [...new Set(parsed.favorites)], recent: [...new Set(parsed.recent)] };
  } catch {
    return createDefaultWorkspace();
  }
}

export function writeWorkspace(storage: Pick<Storage, 'setItem'>, state: WorkspaceState): void {
  storage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function touchRecent(state: WorkspaceState, slug: string, limit = 6): WorkspaceState {
  return { ...state, recent: [slug, ...state.recent.filter((item) => item !== slug)].slice(0, limit) };
}

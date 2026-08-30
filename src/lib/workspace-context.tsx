import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { createDefaultWorkspace, readWorkspace, touchRecent, writeWorkspace, type WorkspaceState } from './persistence';

interface WorkspaceContextValue {
  state: WorkspaceState;
  isFavorite: (slug: string) => boolean;
  toggleFavorite: (slug: string) => void;
  markRecent: (slug: string) => void;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<WorkspaceState>(() => {
    if (typeof window === 'undefined') return createDefaultWorkspace();
    return readWorkspace(window.localStorage);
  });

  useEffect(() => {
    writeWorkspace(window.localStorage, state);
  }, [state]);

  const isFavorite = useCallback((slug: string) => state.favorites.includes(slug), [state.favorites]);
  const toggleFavorite = useCallback((slug: string) => {
    setState((current) => ({
      ...current,
      favorites: current.favorites.includes(slug)
        ? current.favorites.filter((item) => item !== slug)
        : [...current.favorites, slug],
    }));
  }, []);
  const markRecent = useCallback((slug: string) => setState((current) => touchRecent(current, slug)), []);

  const value = useMemo(() => ({ state, isFavorite, toggleFavorite, markRecent }), [state, isFavorite, toggleFavorite, markRecent]);
  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace(): WorkspaceContextValue {
  const value = useContext(WorkspaceContext);
  if (!value) throw new Error('useWorkspace must be used inside WorkspaceProvider.');
  return value;
}

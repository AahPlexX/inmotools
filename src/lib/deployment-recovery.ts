const PRELOAD_RECOVERY_KEY = 'inmotools:preload-recovery-at';
const RECOVERY_COOLDOWN_MS = 30_000;
const RECOVERY_RESET_MS = 60_000;

interface PreloadRecoveryOptions {
  readonly now?: () => number;
  readonly reload?: () => void;
  readonly readMarker?: () => string | null;
  readonly writeMarker?: (value: string) => void;
}

export const createPreloadErrorRecoveryHandler = ({
  now = Date.now,
  reload = () => window.location.reload(),
  readMarker = () => window.sessionStorage.getItem(PRELOAD_RECOVERY_KEY),
  writeMarker = (value) => window.sessionStorage.setItem(PRELOAD_RECOVERY_KEY, value),
}: PreloadRecoveryOptions = {}) => (event: Event) => {
  const timestamp = now();
  const previous = Number(readMarker() ?? 0);
  if (Number.isFinite(previous) && previous > 0 && timestamp - previous < RECOVERY_COOLDOWN_MS) return;

  event.preventDefault();
  writeMarker(String(timestamp));
  reload();
};

export const installPreloadErrorRecovery = () => {
  if (typeof window === 'undefined') return () => undefined;

  const handler = createPreloadErrorRecoveryHandler();
  window.addEventListener('vite:preloadError', handler);
  const resetTimer = window.setTimeout(() => window.sessionStorage.removeItem(PRELOAD_RECOVERY_KEY), RECOVERY_RESET_MS);

  return () => {
    window.removeEventListener('vite:preloadError', handler);
    window.clearTimeout(resetTimer);
  };
};

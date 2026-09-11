const PRELOAD_RECOVERY_KEY = 'inmotools:preload-recovery-at';
const RECOVERY_COOLDOWN_MS = 30_000;
const RECOVERY_RESET_MS = 60_000;
const WORKER_STATE_TIMEOUT_MS = 4_000;

type RecoveryAction = () => void | Promise<void>;

interface PreloadRecoveryOptions {
  readonly now?: () => number;
  readonly recover?: RecoveryAction;
  readonly readMarker?: () => string | null;
  readonly writeMarker?: (value: string) => void;
}

const waitForWorkerState = (
  worker: ServiceWorker,
  terminalStates: readonly ServiceWorkerState[],
  timeoutMs = WORKER_STATE_TIMEOUT_MS,
) => new Promise<void>((resolve) => {
  if (terminalStates.includes(worker.state)) {
    resolve();
    return;
  }

  let settled = false;
  const finish = () => {
    if (settled) return;
    settled = true;
    worker.removeEventListener('statechange', onStateChange);
    window.clearTimeout(timeoutId);
    resolve();
  };
  const onStateChange = () => {
    if (terminalStates.includes(worker.state)) finish();
  };
  const timeoutId = window.setTimeout(finish, timeoutMs);
  worker.addEventListener('statechange', onStateChange);
});

export const recoverLatestDeployment = async () => {
  if (!('serviceWorker' in navigator)) {
    window.location.reload();
    return;
  }

  try {
    const registration = await navigator.serviceWorker.getRegistration(import.meta.env.BASE_URL);
    if (registration) {
      await registration.update();

      if (!registration.waiting && registration.installing) {
        await waitForWorkerState(registration.installing, ['installed', 'activated', 'redundant']);
      }

      const waiting = registration.waiting;
      if (waiting) {
        waiting.postMessage({ type: 'SKIP_WAITING' });
        await waitForWorkerState(waiting, ['activated', 'redundant']);
      }
    }
  } catch (error) {
    console.warn('Unable to activate the latest service worker before reload.', error);
  }

  window.location.reload();
};

export const createPreloadErrorRecoveryHandler = ({
  now = Date.now,
  recover = recoverLatestDeployment,
  readMarker = () => window.sessionStorage.getItem(PRELOAD_RECOVERY_KEY),
  writeMarker = (value) => window.sessionStorage.setItem(PRELOAD_RECOVERY_KEY, value),
}: PreloadRecoveryOptions = {}) => (event: Event) => {
  event.preventDefault();

  const timestamp = now();
  const previous = Number(readMarker() ?? 0);
  if (Number.isFinite(previous) && previous > 0 && timestamp - previous < RECOVERY_COOLDOWN_MS) return;

  writeMarker(String(timestamp));
  void Promise.resolve(recover()).catch((error) => {
    console.warn('Deployment recovery failed.', error);
    window.location.reload();
  });
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

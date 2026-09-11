import { useCallback, useEffect, useState } from 'react';
import './PwaUpdatePrompt.css';

export function PwaUpdatePrompt() {
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    let disposed = false;
    let detachRegistration = () => undefined;

    const watchRegistration = (registration: ServiceWorkerRegistration) => {
      const syncWaitingWorker = () => {
        if (!disposed) setWaitingWorker(registration.waiting);
      };
      const onUpdateFound = () => {
        const installing = registration.installing;
        if (!installing) return;

        const onStateChange = () => {
          if (installing.state === 'installed' || installing.state === 'activated') {
            syncWaitingWorker();
            installing.removeEventListener('statechange', onStateChange);
          } else if (installing.state === 'redundant') {
            installing.removeEventListener('statechange', onStateChange);
          }
        };
        installing.addEventListener('statechange', onStateChange);
      };

      syncWaitingWorker();
      registration.addEventListener('updatefound', onUpdateFound);
      return () => registration.removeEventListener('updatefound', onUpdateFound);
    };

    const inspectRegistration = async () => {
      const registration = await navigator.serviceWorker.getRegistration(import.meta.env.BASE_URL);
      if (!registration || disposed) return;
      detachRegistration();
      detachRegistration = watchRegistration(registration);
    };

    void inspectRegistration();
    const onLoad = () => void inspectRegistration();
    window.addEventListener('load', onLoad);

    return () => {
      disposed = true;
      window.removeEventListener('load', onLoad);
      detachRegistration();
    };
  }, []);

  const reloadLatest = useCallback(() => {
    if (!waitingWorker) {
      window.location.reload();
      return;
    }

    let reloaded = false;
    const reload = () => {
      if (reloaded) return;
      reloaded = true;
      window.location.reload();
    };

    navigator.serviceWorker.addEventListener('controllerchange', reload, { once: true });
    waitingWorker.postMessage({ type: 'SKIP_WAITING' });
    window.setTimeout(reload, 1_500);
  }, [waitingWorker]);

  if (!waitingWorker) return null;

  return (
    <aside className="pwa-update-prompt" role="status" aria-live="polite" aria-label="Application update available">
      <div className="pwa-update-copy">
        <strong>Update ready</strong>
        <span>A newer InMo Tools build is available. Reload before opening another tool.</span>
      </div>
      <div className="pwa-update-actions">
        <button type="button" className="pwa-update-primary" onClick={reloadLatest}>
          Reload latest
        </button>
        <button type="button" className="pwa-update-secondary" onClick={() => setWaitingWorker(null)}>
          Not now
        </button>
      </div>
    </aside>
  );
}

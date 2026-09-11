import { useRegisterSW } from 'virtual:pwa-register/react';
import './PwaUpdatePrompt.css';

export function PwaUpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW();

  if (!needRefresh) return null;

  return (
    <aside className="pwa-update-prompt" role="status" aria-live="polite" aria-label="Application update available">
      <div className="pwa-update-copy">
        <strong>Update ready</strong>
        <span>A newer InMo Tools build is available. Reload before opening another tool.</span>
      </div>
      <div className="pwa-update-actions">
        <button type="button" className="pwa-update-primary" onClick={() => void updateServiceWorker(true)}>
          Reload latest
        </button>
        <button type="button" className="pwa-update-secondary" onClick={() => setNeedRefresh(false)}>
          Not now
        </button>
      </div>
    </aside>
  );
}

const reloadCurrentRoute = () => window.location.reload();

const waitForWaitingWorker = (registration) => new Promise((resolve) => {
  if (registration.waiting) {
    resolve(registration.waiting);
    return;
  }

  let settled = false;
  let installing = registration.installing;

  const finish = (worker = null) => {
    if (settled) return;
    settled = true;
    registration.removeEventListener('updatefound', onUpdateFound);
    if (installing) installing.removeEventListener('statechange', onStateChange);
    window.clearTimeout(timeoutId);
    resolve(worker ?? registration.waiting ?? null);
  };

  const onStateChange = () => {
    if (!installing) return;
    if (installing.state === 'installed') finish(registration.waiting ?? installing);
    if (installing.state === 'redundant') finish(null);
  };

  const watchInstalling = () => {
    installing = registration.installing;
    if (!installing) return;
    installing.addEventListener('statechange', onStateChange);
    onStateChange();
  };

  const onUpdateFound = () => watchInstalling();
  registration.addEventListener('updatefound', onUpdateFound);
  watchInstalling();

  const timeoutId = window.setTimeout(() => finish(registration.waiting), 5_000);
});

const recoverPreFixMarkdownClient = async () => {
  if (!('serviceWorker' in navigator)) {
    reloadCurrentRoute();
    return;
  }

  try {
    const registration = await navigator.serviceWorker.getRegistration('/inmotools/');
    if (!registration) {
      reloadCurrentRoute();
      return;
    }

    const waitingPromise = waitForWaitingWorker(registration);
    await registration.update().catch(() => undefined);
    const waitingWorker = registration.waiting ?? await waitingPromise;

    if (!waitingWorker) {
      reloadCurrentRoute();
      return;
    }

    let reloaded = false;
    const reload = () => {
      if (reloaded) return;
      reloaded = true;
      reloadCurrentRoute();
    };

    navigator.serviceWorker.addEventListener('controllerchange', reload, { once: true });
    waitingWorker.postMessage({ type: 'SKIP_WAITING' });
    window.setTimeout(reload, 2_000);
  } catch {
    reloadCurrentRoute();
  }
};

void recoverPreFixMarkdownClient();

export default function MarkdownWorkspaceRecovery() {
  return null;
}

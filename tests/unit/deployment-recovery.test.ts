import { afterEach, describe, expect, it, vi } from 'vitest';
import { createPreloadErrorRecoveryHandler, recoverLatestDeployment, registerPreloadRecoveryGuard } from '../../src/lib/deployment-recovery';

const fakeEvent = () => ({ preventDefault: vi.fn() }) as unknown as Event;

describe('deployment recovery', () => {
  it('leaves a guarded importer failure observable and restores ordinary recovery after cleanup', () => {
    const recover = vi.fn();
    const event = fakeEvent();
    const remove = registerPreloadRecoveryGuard(() => true);
    const handler = createPreloadErrorRecoveryHandler({ recover, readMarker: () => null, writeMarker: vi.fn() });
    try {
      handler(event);
      expect(event.preventDefault).not.toHaveBeenCalled();
      expect(recover).not.toHaveBeenCalled();
    } finally { remove(); }
    handler(event);
    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(recover).toHaveBeenCalledOnce();
  });

  it('keeps recovery enabled when an optional guard does not match or throws', () => {
    const recover = vi.fn();
    const event = fakeEvent();
    const removeFalse = registerPreloadRecoveryGuard(() => false);
    const removeBroken = registerPreloadRecoveryGuard(() => { throw new Error('Synthetic guard fault'); });
    try {
      createPreloadErrorRecoveryHandler({ recover, readMarker: () => null, writeMarker: vi.fn() })(event);
      expect(event.preventDefault).toHaveBeenCalledOnce();
      expect(recover).toHaveBeenCalledOnce();
    } finally { removeFalse(); removeBroken(); }
  });
  it('suppresses the preload error and starts one recovery attempt', async () => {
    const recover = vi.fn(() => Promise.resolve());
    const writeMarker = vi.fn();
    const event = fakeEvent();
    const handler = createPreloadErrorRecoveryHandler({
      now: () => 50_000,
      recover,
      readMarker: () => null,
      writeMarker,
    });

    handler(event);
    await Promise.resolve();

    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(writeMarker).toHaveBeenCalledWith('50000');
    expect(recover).toHaveBeenCalledOnce();
  });

  it('prevents repeated preload exceptions during the recovery cooldown without looping reloads', async () => {
    const recover = vi.fn(() => Promise.resolve());
    const event = fakeEvent();
    const handler = createPreloadErrorRecoveryHandler({
      now: () => 55_000,
      recover,
      readMarker: () => '50000',
      writeMarker: vi.fn(),
    });

    handler(event);
    await Promise.resolve();

    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(recover).not.toHaveBeenCalled();
  });

  describe('recoverLatestDeployment', () => {
    afterEach(() => vi.unstubAllGlobals());

    const stubBrowser = (controller: object | null) => {
      const reload = vi.fn();
      const getRegistration = vi.fn(() => Promise.resolve(undefined));
      vi.stubGlobal('window', { location: { reload }, setTimeout, clearTimeout });
      vi.stubGlobal('navigator', { serviceWorker: { controller, getRegistration } });
      return { reload, getRegistration };
    };

    it('reloads immediately when no service worker controls the page', async () => {
      // A first visit has an installing worker but no controller; waiting on
      // its precache delayed recovery past the point users see a blank tool.
      const { reload, getRegistration } = stubBrowser(null);
      await recoverLatestDeployment();
      expect(getRegistration).not.toHaveBeenCalled();
      expect(reload).toHaveBeenCalledOnce();
    });

    it('checks for an updated worker before reloading a controlled page', async () => {
      const { reload, getRegistration } = stubBrowser({});
      await recoverLatestDeployment();
      expect(getRegistration).toHaveBeenCalledOnce();
      expect(reload).toHaveBeenCalledOnce();
    });
  });
});

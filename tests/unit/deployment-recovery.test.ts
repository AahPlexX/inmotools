import { describe, expect, it, vi } from 'vitest';
import { createPreloadErrorRecoveryHandler } from '../../src/lib/deployment-recovery';

const fakeEvent = () => ({ preventDefault: vi.fn() }) as unknown as Event;

describe('deployment recovery', () => {
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
});

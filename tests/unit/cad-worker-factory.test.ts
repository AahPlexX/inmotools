import { describe, expect, it, vi } from 'vitest';
import { createBrowserCadKernelWorker } from '../../src/tools/cad/cad-worker-factory';

const fakeWorker = {
  postMessage: vi.fn(),
  terminate: vi.fn(),
  onmessage: null,
  onerror: null,
};

describe('CAD browser worker factory', () => {
  it('uses a dedicated module worker with a stable diagnostic name', () => {
    const createWorker = vi.fn(() => fakeWorker);

    const worker = createBrowserCadKernelWorker({ createWorker });

    expect(worker).toBe(fakeWorker);
    expect(createWorker).toHaveBeenCalledTimes(1);
    const [url, options] = createWorker.mock.calls[0]!;
    expect(url).toBeInstanceOf(URL);
    expect(url.pathname).toMatch(/cad\.worker\.ts$/);
    expect(options).toEqual({ type: 'module', name: 'inmotools-cad-kernel' });
  });

  it('fails explicitly when browser workers are unavailable', () => {
    expect(() => createBrowserCadKernelWorker({ workerSupported: false })).toThrow(/browser workers/i);
  });
});

import { describe, expect, it, vi } from 'vitest';
import { probeOcctWasmCapabilities } from '../../src/tools/cad/browser-capabilities';

describe('CAD concrete browser capability probe', () => {
  it('short-circuits all feature detectors when WebAssembly is unavailable', async () => {
    const detectors = {
      simd: vi.fn(async () => true),
      tailCalls: vi.fn(async () => true),
      exceptions: vi.fn(async () => true),
    };

    await expect(probeOcctWasmCapabilities(detectors, () => false)).resolves.toEqual({
      webAssembly: false,
      simd: false,
      tailCalls: false,
      exceptions: false,
    });
    expect(detectors.simd).not.toHaveBeenCalled();
    expect(detectors.tailCalls).not.toHaveBeenCalled();
    expect(detectors.exceptions).not.toHaveBeenCalled();
  });

  it('runs the three occt-wasm feature detectors and preserves each result', async () => {
    const detectors = {
      simd: vi.fn(async () => true),
      tailCalls: vi.fn(async () => false),
      exceptions: vi.fn(async () => true),
    };

    await expect(probeOcctWasmCapabilities(detectors, () => true)).resolves.toEqual({
      webAssembly: true,
      simd: true,
      tailCalls: false,
      exceptions: true,
    });
    expect(detectors.simd).toHaveBeenCalledTimes(1);
    expect(detectors.tailCalls).toHaveBeenCalledTimes(1);
    expect(detectors.exceptions).toHaveBeenCalledTimes(1);
  });
});

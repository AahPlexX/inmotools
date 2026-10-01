import { describe, expect, it, vi } from 'vitest';
import {
  assertOcctWasmCapabilities,
  createOcctWasmInitializer,
  requiredOcctWasmCapabilities,
  type CadKernelCapabilityReport,
} from '../../src/tools/cad/kernel-capabilities';
import { CadKernelRuntimeError } from '../../src/tools/cad/kernel-worker-runtime';

const supported: CadKernelCapabilityReport = {
  webAssembly: true,
  simd: true,
  tailCalls: true,
  exceptions: true,
};

describe('CAD OCCT browser capability policy', () => {
  it('declares the exact browser features required by occt-wasm 5.0.0', () => {
    expect(requiredOcctWasmCapabilities).toEqual(['webAssembly', 'simd', 'tailCalls', 'exceptions']);
    expect(() => assertOcctWasmCapabilities(supported)).not.toThrow();
  });

  it('reports every missing capability in one non-recoverable unsupported-browser error', () => {
    const report: CadKernelCapabilityReport = {
      webAssembly: true,
      simd: false,
      tailCalls: false,
      exceptions: true,
    };

    try {
      assertOcctWasmCapabilities(report);
      throw new Error('expected capability assertion to fail');
    } catch (error) {
      expect(error).toBeInstanceOf(CadKernelRuntimeError);
      const runtimeError = error as CadKernelRuntimeError;
      expect(runtimeError.code).toBe('unsupported-browser');
      expect(runtimeError.recoverable).toBe(false);
      expect(runtimeError.message).toMatch(/SIMD/i);
      expect(runtimeError.message).toMatch(/tail calls/i);
      expect(runtimeError.message).not.toMatch(/exception handling is unavailable/i);
    }
  });

  it('runs the capability probe before kernel initialization and skips initialization when unsupported', async () => {
    const probe = vi.fn(async () => ({ ...supported, tailCalls: false }));
    const initialize = vi.fn(async () => vi.fn());
    const initializer = createOcctWasmInitializer(probe, initialize);

    await expect(initializer()).rejects.toMatchObject({
      code: 'unsupported-browser',
      recoverable: false,
    });
    expect(probe).toHaveBeenCalledTimes(1);
    expect(initialize).not.toHaveBeenCalled();
  });

  it('initializes only after the probe confirms every required feature', async () => {
    const executor = vi.fn();
    const probe = vi.fn(async () => supported);
    const initialize = vi.fn(async () => executor);
    const initializer = createOcctWasmInitializer(probe, initialize);

    await expect(initializer()).resolves.toBe(executor);
    expect(probe).toHaveBeenCalledTimes(1);
    expect(initialize).toHaveBeenCalledTimes(1);
  });
});

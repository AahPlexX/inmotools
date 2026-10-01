import { CadKernelRuntimeError } from './kernel-worker-runtime';

export const requiredOcctWasmCapabilities = [
  'webAssembly',
  'simd',
  'tailCalls',
  'exceptions',
] as const;

export type OcctWasmCapability = (typeof requiredOcctWasmCapabilities)[number];

export interface CadKernelCapabilityReport {
  webAssembly: boolean;
  simd: boolean;
  tailCalls: boolean;
  exceptions: boolean;
}

export type CadKernelCapabilityProbe = () =>
  | CadKernelCapabilityReport
  | Promise<CadKernelCapabilityReport>;

const capabilityLabels: Record<OcctWasmCapability, string> = {
  webAssembly: 'WebAssembly',
  simd: 'SIMD',
  tailCalls: 'tail calls',
  exceptions: 'exception handling',
};

export function missingOcctWasmCapabilities(
  report: CadKernelCapabilityReport,
): OcctWasmCapability[] {
  return requiredOcctWasmCapabilities.filter((capability) => !report[capability]);
}

/**
 * Enforces the exact browser feature floor required by occt-wasm 5.0.0.
 * Capability detection itself is injected so this policy stays deterministic
 * in tests and the eventual package-specific probe can evolve independently.
 */
export function assertOcctWasmCapabilities(report: CadKernelCapabilityReport): void {
  const missing = missingOcctWasmCapabilities(report);
  if (missing.length === 0) return;

  const labels = missing.map((capability) => capabilityLabels[capability]);
  throw new CadKernelRuntimeError(
    'unsupported-browser',
    `CAD Studio cannot start the exact geometry kernel because this browser is missing: ${labels.join(', ')}.`,
    false,
  );
}

/**
 * Wraps exact-kernel initialization with a mandatory capability gate. The
 * kernel initializer is never invoked for an unsupported environment.
 */
export function createOcctWasmInitializer<T>(
  probe: CadKernelCapabilityProbe,
  initialize: () => T | Promise<T>,
): () => Promise<T> {
  return async () => {
    const report = await probe();
    assertOcctWasmCapabilities(report);
    return initialize();
  };
}

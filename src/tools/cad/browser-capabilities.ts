import { exceptions, simd, tailCall } from 'wasm-feature-detect';
import type { CadKernelCapabilityReport } from './kernel-capabilities';

export interface OcctWasmFeatureDetectors {
  simd: () => Promise<boolean>;
  tailCalls: () => Promise<boolean>;
  exceptions: () => Promise<boolean>;
}

const defaultDetectors: OcctWasmFeatureDetectors = {
  simd,
  tailCalls: tailCall,
  exceptions,
};

/**
 * Concrete browser probe for the exact occt-wasm 5.0.0 feature floor.
 * WebAssembly absence short-circuits the proposal-specific detectors so old
 * environments fail predictably without invoking unsupported APIs.
 */
export async function probeOcctWasmCapabilities(
  detectors: OcctWasmFeatureDetectors = defaultDetectors,
  hasWebAssembly: () => boolean = () => typeof WebAssembly !== 'undefined',
): Promise<CadKernelCapabilityReport> {
  if (!hasWebAssembly()) {
    return {
      webAssembly: false,
      simd: false,
      tailCalls: false,
      exceptions: false,
    };
  }

  const [simdSupported, tailCallsSupported, exceptionsSupported] = await Promise.all([
    detectors.simd(),
    detectors.tailCalls(),
    detectors.exceptions(),
  ]);

  return {
    webAssembly: true,
    simd: simdSupported,
    tailCalls: tailCallsSupported,
    exceptions: exceptionsSupported,
  };
}

import { getElementReference } from './element-data';
import type { CrystalDocument } from './crystal-types';
import type { MillerIndex } from './reciprocal-engine';

const TWO_PI = Math.PI * 2;

export interface StructureFactor {
  readonly real: number;
  readonly imag: number;
}

// Matches diffraction-engine.ts's RadiationType by value (not imported, to
// avoid a circular import — diffraction-engine.ts imports from this module).
export type ScatteringRadiation = 'xray' | 'neutron' | 'electron';

function assertMiller(hkl: MillerIndex): void {
  if (!hkl.every(Number.isSafeInteger)) throw new RangeError('Miller indices must be integers.');
  if (hkl[0] === 0 && hkl[1] === 0 && hkl[2] === 0) throw new RangeError('Miller index (0 0 0) does not define a reflection.');
}

/**
 * Per-element scattering amplitude for the given radiation.
 * X-ray/electron: atomic number Z (valid at sinθ/λ → 0; a provenance-honest
 * first-order model — electron-density form factors are a documented
 * follow-up, not silently guessed here).
 * Neutron: bound coherent scattering length b (fm), which does NOT track Z
 * (e.g. H is negative) — using Z for neutrons would be physically wrong.
 */
function scatteringAmplitude(element: string, radiation: ScatteringRadiation): number {
  const reference = getElementReference(element);
  if (!reference) throw new RangeError(`No verified scattering factor for element "${element}".`);
  if (radiation === 'neutron') {
    if (reference.coherentScatteringLength === null) {
      throw new RangeError(`No verified neutron coherent scattering length for element "${element}".`);
    }
    return reference.coherentScatteringLength;
  }
  if (reference.atomicNumber <= 0) {
    throw new RangeError(`No verified scattering factor for element "${element}".`);
  }
  return reference.atomicNumber;
}

/**
 * Kinematic structure factor F(hkl) = Σ_j occ_j · f_j · e^{2πi(h·x_j + k·y_j + l·z_j)}.
 * `radiation` selects the per-element amplitude model (default 'xray', the
 * historical Z-based behavior — existing callers are unaffected).
 */
export function structureFactor(document: CrystalDocument, hkl: MillerIndex, radiation: ScatteringRadiation = 'xray'): StructureFactor {
  assertMiller(hkl);
  let real = 0;
  let imag = 0;
  for (const site of document.sites) {
    if (!Number.isFinite(site.occupancy) || site.occupancy <= 0) continue;
    const phase = TWO_PI * (hkl[0] * site.fractional[0] + hkl[1] * site.fractional[1] + hkl[2] * site.fractional[2]);
    const amplitude = site.occupancy * scatteringAmplitude(site.element, radiation);
    real += amplitude * Math.cos(phase);
    imag += amplitude * Math.sin(phase);
  }
  return { real, imag };
}

/** |F(hkl)|² — the observable kinematic intensity before multiplicity/Lorentz factors. */
export function structureFactorIntensity(document: CrystalDocument, hkl: MillerIndex, radiation: ScatteringRadiation = 'xray'): number {
  const f = structureFactor(document, hkl, radiation);
  return f.real * f.real + f.imag * f.imag;
}

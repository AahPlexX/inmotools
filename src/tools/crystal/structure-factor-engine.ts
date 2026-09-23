import { getElementReference } from './element-data';
import type { CrystalDocument } from './crystal-types';
import type { MillerIndex } from './reciprocal-engine';

const TWO_PI = Math.PI * 2;

export interface StructureFactor {
  readonly real: number;
  readonly imag: number;
}

function assertMiller(hkl: MillerIndex): void {
  if (!hkl.every(Number.isSafeInteger)) throw new RangeError('Miller indices must be integers.');
  if (hkl[0] === 0 && hkl[1] === 0 && hkl[2] === 0) throw new RangeError('Miller index (0 0 0) does not define a reflection.');
}

/**
 * Kinematic structure factor F(hkl) = Σ_j occ_j · f_j · e^{2πi(h·x_j + k·y_j + l·z_j)}.
 * Atomic scattering factor f_j is approximated by the element's atomic number
 * (valid at sinθ/λ → 0; a provenance-honest first-order model — electron-density
 * form factors are a documented follow-up, not silently guessed here).
 */
export function structureFactor(document: CrystalDocument, hkl: MillerIndex): StructureFactor {
  assertMiller(hkl);
  let real = 0;
  let imag = 0;
  for (const site of document.sites) {
    if (!Number.isFinite(site.occupancy) || site.occupancy <= 0) continue;
    const reference = getElementReference(site.element);
    if (!reference || reference.atomicNumber <= 0) {
      throw new RangeError(`No verified scattering factor for element "${site.element}".`);
    }
    const phase = TWO_PI * (hkl[0] * site.fractional[0] + hkl[1] * site.fractional[1] + hkl[2] * site.fractional[2]);
    const amplitude = site.occupancy * reference.atomicNumber;
    real += amplitude * Math.cos(phase);
    imag += amplitude * Math.sin(phase);
  }
  return { real, imag };
}

/** |F(hkl)|² — the observable kinematic intensity before multiplicity/Lorentz factors. */
export function structureFactorIntensity(document: CrystalDocument, hkl: MillerIndex): number {
  const f = structureFactor(document, hkl);
  return f.real * f.real + f.imag * f.imag;
}

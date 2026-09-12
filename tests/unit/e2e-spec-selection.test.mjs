import { describe, expect, it } from 'vitest';
import { selectE2eSpecs } from '../../scripts/select-e2e-specs.mjs';

describe('focused E2E spec selection', () => {
  it('routes Crystal source changes to the Crystal Lattice Studio browser spec', () => {
    expect(selectE2eSpecs(['src/tools/crystal/CrystalViewport.tsx'])).toEqual([
      'tests/e2e/crystal-lattice-studio.spec.ts',
    ]);
    expect(selectE2eSpecs(['src/tools/crystal/crystal-workspace.css'])).toEqual([
      'tests/e2e/crystal-lattice-studio.spec.ts',
    ]);
  });

  it('keeps direct E2E files and established tool mappings focused', () => {
    expect(selectE2eSpecs(['tests/e2e/crystal-lattice-studio.spec.ts'])).toEqual([
      'tests/e2e/crystal-lattice-studio.spec.ts',
    ]);
    expect(selectE2eSpecs(['src/tools/photo/PhotoWorkspace.tsx'])).toEqual([
      'tests/e2e/photo.spec.ts',
    ]);
  });
});

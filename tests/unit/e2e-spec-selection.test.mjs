import { describe, expect, it } from 'vitest';
import { selectE2eSpecs } from '../../scripts/select-e2e-specs.mjs';

describe('focused E2E spec selection', () => {
  it('routes Crystal source changes to both Crystal Lattice Studio browser specs', () => {
    expect(selectE2eSpecs(['src/tools/crystal/CrystalViewport.tsx'])).toEqual([
      'tests/e2e/crystal-lattice-studio.spec.ts',
      'tests/e2e/crystal-lattice-studio-phase2.spec.ts',
    ]);
    expect(selectE2eSpecs(['src/tools/crystal/crystal-workspace.css'])).toEqual([
      'tests/e2e/crystal-lattice-studio.spec.ts',
      'tests/e2e/crystal-lattice-studio-phase2.spec.ts',
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

  it('routes Tactical Matchboard source changes to its focused browser contract', () => {
    expect(selectE2eSpecs(['src/tools/tactics/TacticalBoard.tsx'])).toEqual([
      'tests/e2e/tactical-matchboard-studio.spec.ts',
    ]);
  });
});

import { describe, expect, it } from 'vitest';
import { selectE2eSpecs } from '../../scripts/select-e2e-specs.mjs';

describe('focused E2E spec selection', () => {
  it('routes Crystal source changes to all Crystal Lattice Studio browser specs', () => {
    expect(selectE2eSpecs(['src/tools/crystal/CrystalViewport.tsx'])).toEqual([
      'tests/e2e/crystal-lattice-studio.spec.ts',
      'tests/e2e/crystal-lattice-studio-phase2.spec.ts',
      'tests/e2e/crystal-lattice-studio-phase3.spec.ts',
    ]);
    expect(selectE2eSpecs(['src/tools/crystal/crystal-workspace.css'])).toEqual([
      'tests/e2e/crystal-lattice-studio.spec.ts',
      'tests/e2e/crystal-lattice-studio-phase2.spec.ts',
      'tests/e2e/crystal-lattice-studio-phase3.spec.ts',
    ]);
  });

  it('routes glTF source changes, including the worker, to the glTF browser spec', () => {
    // The worker and client live outside the workspace file, so a mapping keyed only to the workspace would miss them.
    for (const changed of ['src/tools/gltf/GltfWorkspace.tsx', 'src/tools/gltf/gltf-engine.ts', 'src/tools/gltf/gltf.worker.ts', 'src/tools/gltf/gltf-worker-client.ts', 'src/tools/gltf/GltfViewport.tsx']) {
      expect(selectE2eSpecs([changed]), changed).toEqual(['tests/e2e/gltf.spec.ts']);
    }
  });

  it('keeps direct E2E files and established tool mappings focused', () => {
    expect(selectE2eSpecs(['tests/e2e/crystal-lattice-studio.spec.ts'])).toEqual([
      'tests/e2e/crystal-lattice-studio.spec.ts',
    ]);
    expect(selectE2eSpecs(['src/tools/photo/PhotoWorkspace.tsx'])).toEqual([
      'tests/e2e/photo.spec.ts',
      'tests/e2e/photo-controls.spec.ts',
      'tests/e2e/photo-geometry.spec.ts',
      'tests/e2e/photo-compare.spec.ts',
      'tests/e2e/photo-copy-paste.spec.ts',
      'tests/e2e/photo-import.spec.ts',
      'tests/e2e/photo-project.spec.ts',
      'tests/e2e/photo-merge.spec.ts',
      'tests/e2e/photo-workflow.spec.ts',
      'tests/e2e/photo-editing-extras.spec.ts',
    ]);
    expect(selectE2eSpecs(['src/tools/music/MasteringWorkspace.tsx'])).toEqual([
      'tests/e2e/music.spec.ts',
      'tests/e2e/mastering.spec.ts',
    ]);
    expect(selectE2eSpecs(['src/tools/svg/VectorCanvas.tsx'])).toEqual([
      'tests/e2e/svg.spec.ts',
      'tests/e2e/vector-nested-composition.spec.ts',
    ]);
    expect(selectE2eSpecs(['src/tools/fiber-craft/FiberCraftWorkspace.tsx'])).toEqual([
      'tests/e2e/fiber-craft.spec.ts',
    ]);
  });

  it('routes Tactical Matchboard source changes to its focused browser contract', () => {
    expect(selectE2eSpecs(['src/tools/tactics/TacticalBoard.tsx'])).toEqual([
      'tests/e2e/tactical-matchboard-studio.spec.ts',
    ]);
  });
});

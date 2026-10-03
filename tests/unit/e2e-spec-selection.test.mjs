import { describe, expect, it } from 'vitest';
import { CATALOG_SPECS, FULL_SUITE, selectE2eSpecs, specsByFolder } from '../../scripts/select-e2e-specs.mjs';

const select = (paths) => selectE2eSpecs(paths).sort();
const e2e = (...names) => names.map((name) => `tests/e2e/${name}.spec.ts`).sort();

describe('focused E2E spec selection', () => {
  it('routes Crystal source changes to all Crystal Lattice Studio browser specs', () => {
    const crystal = e2e('crystal-lattice-studio', 'crystal-lattice-studio-phase2', 'crystal-lattice-studio-phase3', 'crystal-lattice-studio-phase4');
    expect(select(['src/tools/crystal/CrystalViewport.tsx'])).toEqual(crystal);
    expect(select(['src/tools/crystal/crystal-workspace.css'])).toEqual(crystal);
  });

  it('routes glTF source changes, including the worker, to the glTF browser spec', () => {
    // The worker and client live outside the workspace file, so a mapping keyed only to the workspace would miss them.
    for (const changed of ['src/tools/gltf/GltfWorkspace.tsx', 'src/tools/gltf/gltf-engine.ts', 'src/tools/gltf/gltf.worker.ts', 'src/tools/gltf/gltf-worker-client.ts', 'src/tools/gltf/GltfViewport.tsx']) {
      expect(select([changed]), changed).toEqual(e2e('gltf'));
    }
  });

  it('keeps direct E2E files and established tool mappings focused', () => {
    expect(select(['tests/e2e/crystal-lattice-studio.spec.ts'])).toEqual(e2e('crystal-lattice-studio'));
    expect(select(['src/tools/photo/PhotoWorkspace.tsx'])).toEqual(e2e('photo', 'photo-controls', 'photo-geometry', 'photo-compare', 'photo-copy-paste', 'photo-import', 'photo-project', 'photo-merge', 'photo-workflow', 'photo-editing-extras'));
    // The music folder hosts two tools; the audit spec opens one of them.
    expect(select(['src/tools/music/MasteringWorkspace.tsx'])).toEqual(e2e('music', 'mastering', 'audit-hardening'));
    expect(select(['src/tools/svg/VectorCanvas.tsx'])).toEqual(e2e('svg', 'vector-nested-composition'));
    expect(select(['src/tools/fiber-craft/FiberCraftWorkspace.tsx'])).toEqual(e2e('fiber-craft'));
    expect(select(['src/tools/pdf/PdfWorkspace.tsx'])).toContain('tests/e2e/pdf-renderer.spec.ts');
  });

  it('routes Tactical Matchboard source changes to its focused browser contract', () => {
    expect(select(['src/tools/tactics/TacticalBoard.tsx'])).toEqual(e2e('tactical-matchboard-studio'));
  });

  it('matches legacy alias routes as well as #/tools/<slug>', () => {
    expect(select(['src/tools/regex/RegexWorkspace.tsx'])).toEqual(e2e('regex-matrix', 'regex-matrix-audit'));
  });

  it('adds the catalog-wide specs when a meta file changes', () => {
    expect(select(['src/tools/typing/typing-workstation.meta.ts'])).toEqual([...e2e('typing'), ...CATALOG_SPECS].sort());
  });

  it('falls back to the catalog-wide specs for a tool folder with no spec of its own', () => {
    const uncovered = [...specsByFolder()].filter(([, specs]) => specs.length === 0).map(([folder]) => folder);
    for (const folder of uncovered) expect(select([`src/tools/${folder}/x.ts`]), folder).toEqual([...CATALOG_SPECS].sort());
  });

  it('runs the full suite for shared client and registry files', () => {
    for (const path of ['src/catalog.ts', 'src/tool-meta.ts', 'scripts/tool-registry.mjs', 'src/components/ToolLayout.tsx']) {
      expect(selectE2eSpecs([path]), path).toEqual([FULL_SUITE]);
    }
  });
});

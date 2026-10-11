import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { FULL_SUITE, selectE2eSpecs } from '../../scripts/select-e2e-specs.mjs';

const roots = [];
afterEach(() => roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true })));
function fixture(extra = {}) {
  const root = mkdtempSync(join(tmpdir(), 'inmotools-impact-'));
  roots.push(root);
  const files = {
    'src/tools/alpha/alpha.meta.ts': 'export default { load: () => import("./Workspace") };',
    'src/tools/alpha/Workspace.tsx': 'export const value = 1;',
    'src/tools/beta/beta.meta.ts': 'export default { load: () => import("./Workspace") };',
    'src/tools/beta/Workspace.tsx': 'export const value = 2;',
    'src/tools/gamma/gamma.meta.ts': 'export default { load: () => import("./Workspace") };',
    'src/tools/gamma/Workspace.tsx': 'export const value = 3;',
    'tests/e2e/alpha.spec.ts': 'const route = "#/tools/alpha";',
    'tests/e2e/beta.spec.ts': 'const route = "#/tools/beta";',
    'tests/e2e/gamma.spec.ts': 'const route = "#/tools/gamma";',
    ...extra,
  };
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  return root;
}
const specs = (...names) => names.map((name) => `tests/e2e/${name}.spec.ts`).sort();
const select = (root, paths) => selectE2eSpecs(paths, root).sort();

describe('dependency-aware browser scope', () => {
  it('includes transitive cross-tool consumers while excluding an independent tool', () => {
    const root = fixture({
      'src/tools/beta/Workspace.tsx': 'export { value } from "../alpha/Workspace";',
      'src/tools/gamma/Workspace.tsx': 'const load = () => import("../beta/Workspace");',
    });
    expect(select(root, ['src/tools/alpha/Workspace.tsx'])).toEqual(specs('alpha', 'beta', 'gamma'));
    expect(select(root, ['src/tools/beta/Workspace.tsx'])).toEqual(specs('beta', 'gamma'));
  });

  it('selects shared-helper consumers through barrels, workers and CSS imports', () => {
    const root = fixture({
      'src/lib/helper.ts': 'export const value = 1;',
      'src/lib/barrel.ts': 'export { value } from "./helper";',
      'src/tools/alpha/Workspace.tsx': 'const worker = new Worker(new URL("./alpha.worker.ts", import.meta.url));',
      'src/tools/alpha/alpha.worker.ts': 'import { value } from "../../lib/barrel";',
      'src/tools/beta/Workspace.tsx': 'import "./panel.css";',
      'src/tools/beta/panel.css': '@import "../../lib/shared.css";',
      'src/lib/shared.css': 'button { color: red; }',
    });
    expect(select(root, ['src/lib/helper.ts'])).toEqual(specs('alpha'));
    expect(select(root, ['src/lib/shared.css'])).toEqual(specs('beta'));
  });

  it('retains consumers of deleted modules and tool files', () => {
    const root = fixture({ 'src/tools/beta/Workspace.tsx': 'import "../alpha/deleted";' });
    expect(select(root, ['src/tools/alpha/deleted.ts'])).toEqual(specs('alpha', 'beta'));
  });

  it('selects every spec importing a shared E2E helper transitively', () => {
    const root = fixture({
      'tests/e2e/helper.ts': 'export const value = 1;',
      'tests/e2e/barrel.ts': 'export { value } from "./helper";',
      'tests/e2e/alpha.spec.ts': 'import { value } from "./barrel"; const route = "#/tools/alpha";',
      'tests/e2e/beta.spec.ts': 'import { value } from "./helper"; const route = "#/tools/beta";',
    });
    expect(select(root, ['tests/e2e/helper.ts'])).toEqual(specs('alpha', 'beta'));
  });

  it('does not mistake imports in comments or string content for dependencies', () => {
    const root = fixture({ 'src/tools/beta/Workspace.tsx': '// import "../alpha/Workspace";\nconst text = `import("../alpha/Workspace")`;' });
    expect(select(root, ['src/tools/alpha/Workspace.tsx'])).toEqual(specs('alpha'));
  });

  it('falls back to full on unknown runtime files, fixtures, deleted specs and shell consumers', () => {
    const root = fixture({
      'src/lib/helper.ts': 'export const value = 1;',
      'src/App.tsx': 'import { value } from "./lib/helper";',
    });
    for (const path of ['src/unknown.ts', 'public/asset.wasm', 'tests/fixtures/specimen.pdf', 'tests/e2e/deleted.spec.ts', 'src/lib/helper.ts', 'scripts/copy-runtime-assets.mjs', 'unknown-build.config.ts']) {
      expect(select(root, [path]), path).toEqual([FULL_SUITE]);
    }
  });

  it('fails closed when syntax or computed module loading prevents reliable impact analysis', () => {
    for (const text of ['export const broken = ;', 'const path = "../alpha/Workspace"; const load = import(path);']) {
      const root = fixture({ 'src/tools/beta/Workspace.tsx': text });
      expect(select(root, ['src/tools/alpha/Workspace.tsx'])).toEqual([FULL_SUITE]);
    }
  });

  it('keeps docs and unit/policy-only changes out of browser validation', () => {
    const root = fixture();
    expect(select(root, ['docs/VALIDATION_POLICY.md', 'tests/unit/validation-dependencies.test.mjs', 'scripts/select-e2e-specs.mjs', '.github/workflows/pages.yml'])).toEqual([]);
  });

  it('invalidates cached ownership after a same-length import rewrite', () => {
    const root = fixture({ 'src/tools/beta/Workspace.tsx': 'import "../alpha/Workspace";' });
    expect(select(root, ['src/tools/alpha/Workspace.tsx'])).toEqual(specs('alpha', 'beta'));
    writeFileSync(join(root, 'src/tools/beta/Workspace.tsx'), 'import "../gamma/Workspace";');
    expect(select(root, ['src/tools/alpha/Workspace.tsx'])).toEqual(specs('alpha'));
    expect(select(root, ['src/tools/gamma/Workspace.tsx'])).toEqual(specs('beta', 'gamma'));
  });

  it('includes runtime Markdown data while skipping canonical source records', () => {
    const root = fixture({ 'src/tools/alpha/Workspace.tsx': 'import text from "./data.md?raw";' });
    expect(select(root, ['src/tools/alpha/data.md'])).toEqual(specs('alpha'));
    expect(select(root, ['src/tools/alpha/TRACKER.md'])).toEqual([]);
  });

  it('terminates dependency cycles and falls back for unsupported aliases or ambiguous paths', () => {
    const root = fixture({
      'src/tools/alpha/Workspace.tsx': 'import "../beta/Workspace";',
      'src/tools/beta/Workspace.tsx': 'import "../alpha/Workspace";',
    });
    expect(select(root, ['src/tools/alpha/Workspace.tsx'])).toEqual(specs('alpha', 'beta'));
    expect(select(root, ['src/lib/helper.ts '])).toEqual([FULL_SUITE]);
    writeFileSync(join(root, 'src/tools/beta/Workspace.tsx'), 'import "@/tools/alpha/Workspace";');
    expect(select(root, ['src/tools/alpha/Workspace.tsx'])).toEqual([FULL_SUITE]);
  });
});

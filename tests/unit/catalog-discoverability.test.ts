import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { TOOLS } from '../../src/catalog';

describe('tool discoverability', () => {
  it('registers every workspace directory in the catalog and route loader', () => {
    const toolsRoot = join(process.cwd(), 'src/tools');
    const registry = readFileSync(join(toolsRoot, 'workspaces.tsx'), 'utf8');
    const entries = [...registry.matchAll(/^  '([^']+)': \(\) => import\('\.\/([^']+)\/[^']+Workspace'\),?$/gm)];
    const catalogSlugs = TOOLS.map(({ slug }) => slug);
    const loaderSlugs = entries.map(([, slug]) => slug);
    const loaderDirectories = new Set(entries.map(([, , directory]) => directory));
    const workspaceDirectories = readdirSync(toolsRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .filter((entry) => readdirSync(join(toolsRoot, entry.name)).some((file) => file.endsWith('Workspace.tsx')))
      .map((entry) => entry.name);

    expect(new Set(catalogSlugs).size).toBe(catalogSlugs.length);
    expect(new Set(loaderSlugs).size).toBe(loaderSlugs.length);
    expect(loaderSlugs.sort()).toEqual(catalogSlugs.sort());
    expect([...loaderDirectories].sort()).toEqual(workspaceDirectories.sort());
  });
});

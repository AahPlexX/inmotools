import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { compareTools, TOOL_BY_ALIAS, TOOL_CATEGORIES, TOOLS } from '../../src/catalog';
import { listMetaFiles, SLUG_PATTERN, TOOLS_DIR } from '../../scripts/tool-registry.mjs';

const toolsRoot = join(process.cwd(), TOOLS_DIR);
const metaFiles = listMetaFiles();

describe('tool registry', () => {
  it('collects exactly one record per meta file, named after its slug', () => {
    expect(TOOLS.map((tool) => tool.slug).sort()).toEqual(metaFiles.map(({ slug }) => slug).sort());
    expect(new Set(TOOLS.map((tool) => tool.slug)).size).toBe(TOOLS.length);
    for (const { slug } of metaFiles) expect(slug).toMatch(SLUG_PATTERN);
  });

  it('gives every workspace folder a meta file whose loader points at a file in that folder', () => {
    const workspaceFolders = readdirSync(toolsRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .filter((entry) => readdirSync(join(toolsRoot, entry.name)).some((file) => file.endsWith('Workspace.tsx')))
      .map((entry) => entry.name);
    expect([...new Set(metaFiles.map(({ folder }) => folder))].sort()).toEqual(workspaceFolders.sort());
    for (const { folder, path } of metaFiles) {
      const target = /load: \(\) => import\('\.\/([^'/]+)'\)/.exec(readFileSync(path, 'utf8'))?.[1];
      expect(target, path).toBeTruthy();
      expect(existsSync(join(toolsRoot, folder, `${target}.tsx`)), `${path} → ${target}`).toBe(true);
    }
  });

  it('orders the home page by category, then short title', () => {
    expect([...TOOLS].sort(compareTools).map((tool) => tool.slug)).toEqual(TOOLS.map((tool) => tool.slug));
    const ids = TOOL_CATEGORIES.map(({ id }) => id as string);
    for (const tool of TOOLS) expect(ids, tool.slug).toContain(tool.category);
  });

  it('keeps legacy aliases unique and outside the #/tools/ namespace', () => {
    const aliases = TOOLS.flatMap((tool) => tool.aliases ?? []);
    expect(new Set(aliases).size).toBe(aliases.length);
    for (const alias of aliases) {
      expect(alias).toMatch(/^#\/[a-z0-9-]+$/);
      expect(alias.startsWith('#/tools/')).toBe(false);
    }
    expect(TOOL_BY_ALIAS.get('#/regex-matrix')?.slug).toBe('regex-matrix');
  });
});

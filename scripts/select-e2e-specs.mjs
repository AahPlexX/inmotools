#!/usr/bin/env node
// Picks the Playwright specs for a list of changed paths. Nothing here names a tool:
// a spec belongs to a tool when it opens that tool's route (`#/tools/<slug>`) or one
// of its legacy aliases, both read from the tool's `<slug>.meta.ts`.

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { listMetaFiles, META_SUFFIX } from './tool-registry.mjs';

export const FULL_SUITE = '__FULL_SUITE__';
const E2E_DIR = 'tests/e2e';
/** Specs that loop over the whole catalog; run when any catalog record changes. */
export const CATALOG_SPECS = [`${E2E_DIR}/app.spec.ts`, `${E2E_DIR}/accessibility.spec.ts`, `${E2E_DIR}/responsive.spec.ts`];

const GLOBAL_CLIENT_PATHS = [
  'index.html',
  'package.json',
  'pnpm-lock.yaml',
  'vite.config.ts',
  'playwright.config.ts',
  'scripts/tool-registry.mjs',
  'src/App.tsx',
  'src/catalog.ts',
  'src/tool-meta.ts',
  'src/styles.css',
  'src/overlay-fixes.css',
  'src/components/',
  'src/lib/',
  'src/tools/workspaces.tsx',
];

const escape = (text) => text.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');

/** Map of tool folder → its browser specs, derived from routes used in each spec. */
export function specsByFolder(root = process.cwd()) {
  const routesByFolder = new Map();
  for (const { folder, slug, path } of listMetaFiles(root)) {
    const aliases = /aliases: \[([^\]]*)\]/.exec(readFileSync(join(root, path), 'utf8'))?.[1].match(/#\/[a-z0-9-]+/g) ?? [];
    routesByFolder.set(folder, [...(routesByFolder.get(folder) ?? []), `#/tools/${slug}`, ...aliases]);
  }
  const specs = readdirSync(join(root, E2E_DIR))
    .filter((file) => file.endsWith('.spec.ts'))
    .map((file) => `${E2E_DIR}/${file}`)
    .filter((spec) => !CATALOG_SPECS.includes(spec))
    .sort()
    .map((spec) => [spec, readFileSync(join(root, spec), 'utf8')]);
  const result = new Map();
  for (const [folder, routes] of routesByFolder) {
    const patterns = routes.map((route) => new RegExp(`${escape(route)}(?![a-z0-9-])`));
    result.set(folder, specs.filter(([, source]) => patterns.some((pattern) => pattern.test(source))).map(([spec]) => spec));
  }
  return result;
}

export function selectE2eSpecs(paths, root = process.cwd()) {
  const normalized = paths.map((path) => path.trim()).filter(Boolean);
  if (normalized.some((path) => GLOBAL_CLIENT_PATHS.some((globalPath) =>
    globalPath.endsWith('/') ? path.startsWith(globalPath) : path === globalPath,
  ))) return [FULL_SUITE];

  let byFolder;
  const specs = new Set();
  for (const path of normalized) {
    if (/^tests\/e2e\/.+\.spec\.ts$/.test(path)) specs.add(path);

    const folder = path.match(/^src\/tools\/([^/]+)\//)?.[1];
    if (!folder) continue;
    byFolder ??= specsByFolder(root);
    const toolSpecs = byFolder.get(folder) ?? [];
    for (const spec of toolSpecs) specs.add(spec);
    // Catalog copy appears on the home page and in the tool layout; a folder with
    // no spec of its own is covered by the catalog-wide specs.
    if (path.endsWith(META_SUFFIX) || toolSpecs.length === 0) for (const spec of CATALOG_SPECS) specs.add(spec);
  }

  return [...specs];
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const inputPath = process.argv[2];
  const input = inputPath ? readFileSync(inputPath, 'utf8') : readFileSync(0, 'utf8');
  process.stdout.write(selectE2eSpecs(input.split(/\r?\n/)).join('\n'));
}

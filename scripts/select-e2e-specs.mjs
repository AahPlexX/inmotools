#!/usr/bin/env node
// Picks the Playwright specs for a list of changed paths. Nothing here names a tool:
// a spec belongs to a tool when it opens that tool's route (`#/tools/<slug>`) or one
// of its legacy aliases, both read from the tool's `<slug>.meta.ts`.

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { listMetaFiles, META_SUFFIX } from './tool-registry.mjs';
import { clientDependencies, consumersOf } from './client-dependencies.mjs';

export const FULL_SUITE = '__FULL_SUITE__';
const E2E_DIR = 'tests/e2e';
/** Specs that loop over the whole catalog; run when any catalog record changes. */
export const CATALOG_SPECS = [`${E2E_DIR}/app.spec.ts`, `${E2E_DIR}/accessibility.spec.ts`, `${E2E_DIR}/responsive.spec.ts`];

const GLOBAL_CLIENT_PATHS = [
  'index.html',
  'package.json',
  'pnpm-lock.yaml',
  'pnpm-workspace.yaml',
  'vite.config.ts',
  'playwright.config.ts',
  'tsconfig.app.json',
  'tsconfig.json',
  'scripts/tool-registry.mjs',
  'src/App.tsx',
  'src/catalog.ts',
  'src/tool-meta.ts',
  'src/styles.css',
  'src/overlay-fixes.css',
  'src/components/',
  'src/tools/workspaces.tsx',
];

const POLICY_SCRIPTS = new Set([
  'scripts/select-e2e-specs.mjs', 'scripts/client-dependencies.mjs', 'scripts/run-browser-validation.mjs',
  'scripts/docs-sync.mjs', 'scripts/check-doc-links.mjs', 'scripts/tool-docs.mjs',
  'scripts/tool-check.mjs', 'scripts/branch-check.mjs', 'scripts/task-start.mjs',
]);

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
  if (paths.some((path) => path !== path.trim() || /[\r\n]/.test(path))) return [FULL_SUITE];
  const normalized = paths.map((path) => path.trim()).filter(Boolean);
  if (normalized.some((path) => GLOBAL_CLIENT_PATHS.some((globalPath) =>
    globalPath.endsWith('/') ? path.startsWith(globalPath) : path === globalPath,
  ))) return [FULL_SUITE];

  let byFolder;
  let graph;
  const specs = new Set();
  const folders = new Set(listMetaFiles(root).map((meta) => meta.folder));
  const addFolder = (folder) => {
    byFolder ??= specsByFolder(root);
    const owned = byFolder.get(folder) ?? [];
    for (const spec of owned.length ? owned : CATALOG_SPECS) specs.add(spec);
  };
  for (const path of normalized) {
    if (path.startsWith('public/') || path.startsWith('tests/fixtures/')) return [FULL_SUITE];
    const isSpec = /^tests\/e2e\/.+\.spec\.ts$/.test(path);
    if (isSpec) {
      if (!existsSync(join(root, path))) return [FULL_SUITE];
      specs.add(path);
      continue;
    }
    const folder = path.match(/^src\/tools\/([^/]+)\//)?.[1];
    // Records do not execute in the client; fixtures/public assets are handled
    // above and unknown source files below cannot silently select zero tests.
    if (path.endsWith('.md') && (!path.startsWith('src/') || /\/(?:README|TRACKER|[A-Z_]+_TRACKER|VERIFICATION|HANDOFF|STATUS|WORK_LOG)\.md$/.test(path))) continue;
    if (!folder && !path.startsWith('src/lib/') && !path.startsWith('tests/e2e/')) {
      if (path.startsWith('tests/unit/') || path.startsWith('docs/') || path.startsWith('.tasks/') || POLICY_SCRIPTS.has(path) || /^\.github\/workflows\/[^/]+\.yml$/.test(path)) continue;
      return [FULL_SUITE];
    }
    if (folder && !folders.has(folder)) return [FULL_SUITE];
    graph ??= clientDependencies(root);
    if (graph.uncertain || (path.startsWith('tests/e2e/') && graph.uncertainTests)) return [FULL_SUITE];
    const seeds = folder ? [path, ...graph.files.filter((file) => file.startsWith(`src/tools/${folder}/`))] : [path];
    const affected = consumersOf(graph, seeds);
    if (folder) addFolder(folder);
    let found = Boolean(folder);
    for (const consumer of affected) {
      if (consumer === path) continue;
      const dependent = consumer.match(/^src\/tools\/([^/]+)\//)?.[1];
      if (dependent) { addFolder(dependent); found = true; }
      else if (/^tests\/e2e\/.+\.spec\.ts$/.test(consumer)) { specs.add(consumer); found = true; }
      else if (consumer.startsWith('src/') && !consumer.startsWith('src/lib/')) return [FULL_SUITE];
    }
    if (!found) return [FULL_SUITE];
    if (path.endsWith(META_SUFFIX)) for (const spec of CATALOG_SPECS) specs.add(spec);
  }

  return [...specs];
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const inputPath = process.argv[2];
  const input = inputPath ? readFileSync(inputPath, 'utf8') : readFileSync(0, 'utf8');
  process.stdout.write(selectE2eSpecs(input.split(/\r?\n/)).join('\n'));
}

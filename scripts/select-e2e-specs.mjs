#!/usr/bin/env node

import { readFileSync } from 'node:fs';

const TOOL_SPECS = new Map([
  ['aethercast', ['tests/e2e/aethercast.spec.ts']],
  ['audio', ['tests/e2e/audio.spec.ts']],
  ['contrast', ['tests/e2e/contrast.spec.ts']],
  ['cron', ['tests/e2e/cron.spec.ts']],
  ['crystal', ['tests/e2e/crystal-lattice-studio.spec.ts']],
  ['dedupe', ['tests/e2e/dedupe.spec.ts']],
  ['duckdb', ['tests/e2e/duckdb.spec.ts']],
  ['exif', ['tests/e2e/exif.spec.ts']],
  ['floorplan', ['tests/e2e/floorplan.spec.ts']],
  ['font', ['tests/e2e/font.spec.ts']],
  ['geo', ['tests/e2e/geo.spec.ts']],
  ['gltf', ['tests/e2e/gltf.spec.ts']],
  ['har', ['tests/e2e/har.spec.ts']],
  ['hardware', ['tests/e2e/hardware.spec.ts']],
  ['lattice', ['tests/e2e/lattice.spec.ts']],
  ['logs', ['tests/e2e/audit-hardening.spec.ts']],
  ['markdown', ['tests/e2e/markdown-workbench.spec.ts', 'tests/e2e/markdown-workbench-ux.spec.ts']],
  ['music', ['tests/e2e/music.spec.ts']],
  ['nutrition', ['tests/e2e/nutrition.spec.ts']],
  ['otel', ['tests/e2e/otel.spec.ts']],
  ['pdf', ['tests/e2e/pdf.spec.ts']],
  ['photo', ['tests/e2e/photo.spec.ts']],
  ['regex', ['tests/e2e/regex-matrix.spec.ts', 'tests/e2e/regex-matrix-audit.spec.ts']],
  ['shader', ['tests/e2e/shader.spec.ts']],
  ['subtitles', ['tests/e2e/subtitles.spec.ts']],
  ['svg', ['tests/e2e/svg.spec.ts']],
  ['typography', ['tests/e2e/typography.spec.ts']],
  ['video', ['tests/e2e/video.spec.ts']],
]);

const GLOBAL_CLIENT_PATHS = [
  'index.html',
  'package.json',
  'pnpm-lock.yaml',
  'vite.config.ts',
  'playwright.config.ts',
  'src/App.tsx',
  'src/catalog.ts',
  'src/styles.css',
  'src/overlay-fixes.css',
  'src/components/',
  'src/lib/',
  'src/tools/workspaces.tsx',
];

export function selectE2eSpecs(paths) {
  const normalized = paths.map((path) => path.trim()).filter(Boolean);
  if (normalized.some((path) => GLOBAL_CLIENT_PATHS.some((globalPath) =>
    globalPath.endsWith('/') ? path.startsWith(globalPath) : path === globalPath,
  ))) return ['__FULL_SUITE__'];

  const specs = new Set();
  for (const path of normalized) {
    const directSpec = path.match(/^tests\/e2e\/(.+\.spec\.ts)$/);
    if (directSpec) specs.add(`tests/e2e/${directSpec[1]}`);

    const tool = path.match(/^src\/tools\/([^/]+)\//)?.[1];
    if (!tool) continue;
    for (const spec of TOOL_SPECS.get(tool) ?? ['tests/e2e/app.spec.ts', 'tests/e2e/accessibility.spec.ts']) specs.add(spec);
  }

  return [...specs];
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const inputPath = process.argv[2];
  const input = inputPath ? readFileSync(inputPath, 'utf8') : readFileSync(0, 'utf8');
  process.stdout.write(selectE2eSpecs(input.split(/\r?\n/)).join('\n'));
}

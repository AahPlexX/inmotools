import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

describe('deployment and bundler contracts', () => {
  it('uses Vite 8 Rolldown-native build configuration without Rollup aliases', () => {
    const config = read('vite.config.ts');
    expect(config).toContain('rolldownOptions');
    expect(config).not.toContain('rollupOptions');
  });

  it('does not aggressively replace the active service worker during an open lazy-loaded session', () => {
    const config = read('vite.config.ts');
    expect(config).toContain("registerType: 'prompt'");
    expect(config).not.toContain("registerType: 'autoUpdate'");
  });

  it('keeps DuckDB WebAssembly out of the install-time precache and caches it on first use', () => {
    const config = read('vite.config.ts');
    expect(config).toContain("'**/duckdb-*.wasm'");
    expect(config).toContain('runtimeCaching');
    expect(config).toContain("handler: 'CacheFirst'");
    expect(config).toContain("cacheName: 'duckdb-wasm'");
  });

  it('does not publish production source maps with the Pages artifact', () => {
    const config = read('vite.config.ts');
    expect(config).toContain('sourcemap: false');
    expect(config).not.toContain('sourcemap: true');
  });

  it('installs Vite preload-error recovery before rendering the application', () => {
    const entry = read('src/main.tsx');
    expect(entry).toContain('installPreloadErrorRecovery');
  });

  it('ships a transitional rescue module for the stranded pre-fix Markdown chunk', () => {
    const rescue = read('public/assets/MarkdownWorkspace-ybsZj5Uw.js');
    expect(rescue).toContain("postMessage({ type: 'SKIP_WAITING' })");
    expect(rescue).toContain("addEventListener('controllerchange'");
    expect(rescue).toContain("getRegistration('/inmotools/')");
  });

  it('keeps Pages deployment independent from browser validation while limiting deploys to main', () => {
    const workflow = read('.github/workflows/pages.yml');
    expect(workflow).toContain('validate:');
    expect(workflow).toContain('build-pages:');
    expect(workflow).toContain('needs: build-pages');
    expect(workflow).toContain("github.ref == 'refs/heads/main'");
    expect(workflow).not.toContain('needs: validate');
  });

  it('does not cancel per-commit validation and queues every main deployment', () => {
    const workflow = read('.github/workflows/pages.yml');
    expect(workflow).not.toContain('cancel-in-progress: true');
    expect(workflow).toContain('group: pages');
    expect(workflow).toContain('queue: max');
  });

  it('selects PR browser specs from the PR base/head diff instead of synthetic merge-ref noise', () => {
    const workflow = read('.github/workflows/pages.yml');
    expect(workflow).toContain('HEAD_SHA: ${{ github.event.pull_request.head.sha }}');
    expect(workflow).toContain('git diff --name-only "$BASE_SHA"..."$HEAD_SHA"');
    expect(workflow).not.toContain('git diff --name-only "$BASE_SHA"...HEAD');
  });
});

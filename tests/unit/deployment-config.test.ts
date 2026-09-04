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
});

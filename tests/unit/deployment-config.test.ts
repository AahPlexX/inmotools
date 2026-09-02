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

  it('installs Vite preload-error recovery before rendering the application', () => {
    const entry = read('src/main.tsx');
    expect(entry).toContain('installPreloadErrorRecovery');
  });
});

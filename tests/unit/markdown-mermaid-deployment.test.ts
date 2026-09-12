import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const readJson = <T>(relativeUrl: string): T =>
  JSON.parse(readFileSync(new URL(relativeUrl, import.meta.url), 'utf8')) as T;

const readText = (relativeUrl: string): string =>
  readFileSync(new URL(relativeUrl, import.meta.url), 'utf8');

describe('Mermaid dependency policy', () => {
  it('pins the current stable Mermaid release exactly', () => {
    const packageJson = readJson<{ dependencies: Record<string, string> }>('../../package.json');
    expect(packageJson.dependencies.mermaid).toBe('12.0.0');
  });

  it('overrides Mermaid parser transitive lodash-es to the current patched stable release', () => {
    const packageJson = readJson<{
      pnpm?: { overrides?: Record<string, string> };
    }>('../../package.json');
    expect(packageJson.pnpm?.overrides?.['lodash-es']).toBe('4.18.1');
  });
});

describe('Mermaid offline chunk recovery', () => {
  it('runtime-caches lazy Mermaid diagram chunks that are intentionally excluded from precache', () => {
    const viteConfig = readText('../../vite.config.ts');
    expect(viteConfig).toContain("cacheName: 'mermaid-diagram-chunks'");
    expect(viteConfig).toContain('mermaid-parser\\.core-');
    expect(viteConfig).toContain('cytoscape\\.esm-');
    expect(viteConfig).toContain('Diagram-');
  });
});

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const toolDir = fileURLToPath(new URL('../../src/tools/site-intel/', import.meta.url));

const sourceFiles = (dir: string): string[] => readdirSync(dir).flatMap((name) => {
  const path = join(dir, name);
  if (statSync(path).isDirectory()) return sourceFiles(path);
  return /\.(ts|tsx)$/.test(name) ? [path] : [];
});

describe('site intelligence analyzer credentials', () => {
  it('has no API key field, key storage or key-bearing request in its source', () => {
    const files = sourceFiles(toolDir);
    expect(files.length).toBeGreaterThan(10);
    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      expect(source, file).not.toMatch(/[?&]key=|api[_-]?key=|\bX-API-Key|Authorization|type="password"/i);
      expect(source, file).not.toMatch(/chromeuxreport\.googleapis\.com|pagespeedonline/i);
      expect(source, file).not.toMatch(/setSetting\(\s*['"]crux-api-key/);
    }
  });

  it('lists the retired CrUX key setting for removal', async () => {
    const { RETIRED_CREDENTIAL_SETTINGS } = await import('../../src/tools/site-intel/vault-db');
    expect(RETIRED_CREDENTIAL_SETTINGS).toContain('crux-api-key');
  });
});

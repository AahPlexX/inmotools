// Node-side view of the tool catalog for scripts and Playwright specs, which run
// outside Vite and so cannot use `import.meta.glob`. Reads the same
// `src/tools/<folder>/<slug>.meta.ts` files that `src/catalog.ts` collects.
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

export const TOOLS_DIR = 'src/tools';
export const META_SUFFIX = '.meta.ts';
export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Meta file locations: `{ folder, slug, path }`, without importing them. */
export function listMetaFiles(root = process.cwd()) {
  const toolsRoot = join(root, TOOLS_DIR);
  return readdirSync(toolsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .flatMap((entry) =>
      readdirSync(join(toolsRoot, entry.name))
        .filter((file) => file.endsWith(META_SUFFIX))
        .map((file) => ({ folder: entry.name, slug: file.slice(0, -META_SUFFIX.length), path: `${TOOLS_DIR}/${entry.name}/${file}` })),
    );
}

/** Every tool record in home-page order, each with its `folder` and meta `path`. */
export async function loadTools(root = process.cwd()) {
  const { compareTools } = await import(pathToFileURL(join(root, 'src/tool-meta.ts')).href);
  const tools = await Promise.all(
    listMetaFiles(root).map(async ({ folder, path }) => {
      const { default: meta } = await import(pathToFileURL(join(root, path)).href);
      return { ...meta, folder, path };
    }),
  );
  return tools.sort(compareTools);
}

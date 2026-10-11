// Tooling-only impact graph using the repository's pinned TypeScript parser.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, posix } from 'node:path';
import { parsers } from 'prettier/plugins/babel';

const CODE = /\.[cm]?[jt]sx?$/;
const EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.mts', '.css', '/index.ts', '/index.tsx', '/index.js'];
const cache = new Map();
function filesUnder(root, folder) {
  if (!existsSync(join(root, folder))) return [];
  return readdirSync(join(root, folder), { withFileTypes: true }).flatMap((entry) => {
    const path = `${folder}/${entry.name}`;
    return entry.isDirectory() ? filesUnder(root, path) : [path];
  });
}

function references(source, path) {
  const refs = [];
  let uncertain = false;
  if (path.endsWith('.css')) {
    const imports = [...source.matchAll(/@import\s+(?:url\(\s*)?["']([^"']+)["']/g)];
    imports.forEach((match) => refs.push(match[1]));
    return { refs, uncertain: imports.length !== [...source.matchAll(/@import\b/g)].length || refs.some((ref) => ref.includes('\\')) };
  }
  const ast = parsers['babel-ts'].parse(source, { filepath: path });
  const literal = (node) => ['Literal', 'StringLiteral'].includes(node?.type) && typeof node.value === 'string' ? node.value : null;
  function add(node) {
    const value = literal(node);
    if (value === null) uncertain = true;
    else refs.push(value);
  }
  function walk(node) {
    if (!node || typeof node !== 'object' || typeof node.type !== 'string') return;
    if (['ImportDeclaration', 'ExportNamedDeclaration', 'ExportAllDeclaration'].includes(node.type) && node.source) add(node.source);
    if (node.type === 'ImportExpression') add(node.source);
    if (node.type === 'CallExpression' && node.callee?.name === 'require') add(node.arguments[0]);
    if (node.type === 'CallExpression' && ['glob', 'globEager'].includes(node.callee?.property?.name)) uncertain = true;
    if (node.type === 'NewExpression' && node.callee?.name === 'URL' && node.arguments[1]?.object?.type === 'MetaProperty') add(node.arguments[0]);
    for (const [key, value] of Object.entries(node)) {
      if (['comments', 'tokens', 'loc', 'range'].includes(key)) continue;
      if (Array.isArray(value)) value.forEach(walk);
      else walk(value);
    }
  }
  walk(ast);
  return { refs, uncertain };
}

export function clientDependencies(root) {
  const files = [...filesUnder(root, 'src'), ...filesUnder(root, 'tests/e2e')];
  const sources = new Map(files.filter((file) => CODE.test(file) || file.endsWith('.css')).map((file) => [file, readFileSync(join(root, file), 'utf8')]));
  const hash = createHash('sha256');
  for (const file of files) hash.update(file + '\0').update(sources.get(file) ?? '').update('\0');
  const digest = hash.digest('hex');
  if (cache.get(root)?.digest === digest) return cache.get(root).graph;
  const reverse = new Map();
  let uncertain = false;
  let uncertainTests = false;
  const uncertainFiles = [];
  for (const path of files.filter((file) => CODE.test(file) || file.endsWith('.css'))) {
    // Catalog discovery is global by contract and selected separately; it must
    // not turn every lazy-loaded tool into a consumer of every other tool.
    if (path === 'src/catalog.ts') continue;
    let parsed;
    try { parsed = references(sources.get(path), path); }
    catch (error) { uncertain = true; uncertainFiles.push({ path, reason: error.message.split('\n')[0] }); continue; }
    if (path.startsWith('tests/')) uncertainTests ||= parsed.uncertain;
    else uncertain ||= parsed.uncertain;
    if (parsed.uncertain) uncertainFiles.push({ path, reason: 'computed loading or unsupported CSS import' });
    for (const ref of parsed.refs) {
      if (!ref.startsWith('.')) {
        if (/^(?:\/|@\/|~\/|#)/.test(ref)) uncertain = true;
        continue;
      }
      const target = posix.normalize(posix.join(posix.dirname(path), ref.split(/[?#]/)[0]));
      if (target.startsWith('../')) { uncertain = true; continue; }
      const candidates = [target, ...EXTENSIONS.map((extension) => target + extension)];
      if (/\.js$/.test(target)) candidates.push(target.slice(0, -3) + '.ts', target.slice(0, -3) + '.tsx');
      const existing = candidates.find((candidate) => existsSync(join(root, candidate)) && files.includes(candidate));
      // Keep every candidate for a deleted target, so its consumers survive
      // deletion/rename analysis and cannot quietly disappear from coverage.
      for (const dependency of existing ? [existing] : candidates) {
        if (!reverse.has(dependency)) reverse.set(dependency, new Set());
        reverse.get(dependency).add(path);
      }
    }
  }
  const graph = { files, reverse, uncertain, uncertainTests, uncertainFiles };
  cache.set(root, { digest, graph });
  return graph;
}

export function consumersOf(graph, seeds) {
  const visited = new Set();
  const queue = [...seeds];
  while (queue.length) {
    const path = queue.pop();
    if (visited.has(path)) continue;
    visited.add(path);
    // A meta file's generic catalog loader is not an additional tool consumer.
    if (path.endsWith('.meta.ts')) continue;
    queue.push(...(graph.reverse.get(path) ?? []));
  }
  return visited;
}

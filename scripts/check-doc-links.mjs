// Checks the standard documents:
//  - every relative link points to an existing file;
//  - every `tool:` header names a catalog slug (src/tools/*/<slug>.meta.ts);
//  - the universal rule files name no tool (their rules apply to every tool).
// Standard documents: AGENTS.md, GOVERNANCE.md, docs/TOOL_INDEX.md,
// docs/DOCUMENTATION_STANDARD.md, docs/DECISIONS.md, and any Markdown file that starts
// with the standard header block (`tool:` or `doc:`).
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { loadTools } from './tool-registry.mjs';

const UNIVERSAL = ['GOVERNANCE.md', 'AGENTS.md'];
const fixed = new Set([...UNIVERSAL, 'docs/TOOL_INDEX.md', 'docs/DOCUMENTATION_STANDARD.md', 'docs/DECISIONS.md']);
const tracked = execFileSync('git', ['ls-files', '*.md'], { encoding: 'utf8' }).split('\n').filter(Boolean);
const standard = tracked.filter((file) => {
  if (fixed.has(file)) return existsSync(file);
  const head = readFileSync(file, 'utf8').slice(0, 400);
  return /^---\n(?:[\s\S]*?\n)?(?:tool|doc): /.test(head);
});

const tools = await loadTools();
const slugs = new Set(tools.map((tool) => tool.slug));
const problems = [];
for (const file of standard) {
  const raw = readFileSync(file, 'utf8');
  const tool = /^---\n[\s\S]*?^tool: (\S+)$/m.exec(raw.slice(0, 600))?.[1];
  if (tool && !slugs.has(tool)) problems.push(`${file}: header "tool: ${tool}" is not a catalog slug`);
  const text = raw.replace(/```[\s\S]*?```/g, '');
  for (const match of text.matchAll(/\]\(([^)\s]+)\)/g)) {
    const target = match[1].split('#')[0];
    if (!target || /^[a-z]+:/i.test(target)) continue;
    if (!existsSync(resolve(dirname(file), decodeURI(target)))) problems.push(`${file} -> ${match[1]} (broken link)`);
  }
}

for (const file of UNIVERSAL.filter(existsSync)) {
  const text = readFileSync(file, 'utf8');
  for (const tool of tools) {
    for (const name of [tool.slug, tool.shortTitle]) {
      if (new RegExp(`(?<![\\w-])${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\w-])`).test(text)) problems.push(`${file}: names the tool "${name}"; tool-specific facts belong in the tool's spec, tracker or docs/DECISIONS.md`);
    }
  }
}

// Every spec has an "Architecture and engine" section; libraries named in it as `name@version`
// must be dependencies in package.json at exactly that version.
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const deps = { ...pkg.dependencies, ...pkg.devDependencies };
for (const file of standard) {
  const text = readFileSync(file, 'utf8');
  if (!/^---\n[\s\S]*?\ndoc: spec\n/.test(text.slice(0, 600))) continue;
  const section = /^## Architecture and engine\n([\s\S]*?)(?=^## )/m.exec(text)?.[1];
  if (!section || !section.trim()) { problems.push(`${file}: missing the "## Architecture and engine" section`); continue; }
  for (const [, name, version] of section.matchAll(/`((?:@[a-z0-9._-]+\/)?[a-z0-9._-]+)@(\d[^`\s]*)`/g)) {
    const declared = deps[name];
    if (!declared) problems.push(`${file}: architecture names ${name}@${version}, which is not a dependency in package.json`);
    else if (declared !== version && !declared.endsWith(`@${version}`) && !declared.includes(`/${name}-${version}`)) problems.push(`${file}: architecture says ${name}@${version}, package.json has ${declared}`);
  }
}

if (problems.length) {
  console.error(`Standard document problems:\n${problems.join('\n')}`);
  process.exit(1);
}
console.log(`Checked ${standard.length} standard documents; links resolve, tool headers match the catalog, universal rules name no tool, specs name only pinned dependencies.`);

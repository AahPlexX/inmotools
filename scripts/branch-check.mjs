#!/usr/bin/env node
// pnpm branch:check [<branch>] [--start]   (default: the current branch)
// Branch names allowed besides main: feature/<slug> (a new tool), expand/<slug> and
// fix/<slug> (an existing tool), and dependabot/* (bot security updates).
// Default (integration) mode: the slug must be in the catalog of the checked-out tree
// and not a removed tool's slug. --start (used by task:start) checks against
// origin/main instead: feature/ needs a new slug, expand/ and fix/ an existing one.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { listMetaFiles, SLUG_PATTERN } from './tool-registry.mjs';

export const KINDS = { new: 'feature', expand: 'expand', fix: 'fix' };

const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();

/** Catalog slugs and removed slugs as they are on `ref` (default origin/main). */
export function slugsOn(ref = 'origin/main') {
  const files = git('ls-tree', '-r', '--name-only', ref, 'src/tools').split('\n');
  const catalog = files.map((path) => /^src\/tools\/[^/]+\/([a-z0-9-]+)\.meta\.ts$/.exec(path)?.[1]).filter(Boolean);
  let index = '';
  try { index = git('show', `${ref}:docs/TOOL_INDEX.md`); } catch { index = readFileSync('docs/TOOL_INDEX.md', 'utf8'); }
  const removed = [...(index.split('\n## Removed tools')[1] ?? '').matchAll(/^\| `([a-z0-9-]+)` \|/gm)].map((match) => match[1]);
  return { catalog, removed };
}

/** `{ ok, kind?, slug?, reason? }` for a branch name. */
export function validateBranch(name, { catalog, removed }, { start = true } = {}) {
  if (name === 'main' || name.startsWith('dependabot/')) return { ok: true };
  const match = /^(feature|expand|fix)\/(.+)$/.exec(name);
  if (!match) return { ok: false, reason: `"${name}" is not main, feature/<slug>, expand/<slug>, fix/<slug> or dependabot/*` };
  const [, prefix, slug] = match;
  if (!SLUG_PATTERN.test(slug)) return { ok: false, reason: `"${slug}" is not a slug (lowercase words joined by hyphens)` };
  if (removed.includes(slug)) return { ok: false, reason: `"${slug}" is a removed tool's slug and cannot be reused` };
  const exists = catalog.includes(slug);
  if (!start) {
    return exists ? { ok: true, slug } : { ok: false, reason: `"${slug}" has no src/tools/*/${slug}.meta.ts in this tree` };
  }
  if (prefix === 'feature' && exists) return { ok: false, reason: `"${slug}" is already in the catalog; use expand/${slug} or fix/${slug}` };
  if (prefix !== 'feature' && !exists) return { ok: false, reason: `"${slug}" is not in the catalog on main; a new tool uses feature/${slug}` };
  return { ok: true, kind: Object.keys(KINDS).find((kind) => KINDS[kind] === prefix), slug };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const start = args.includes('--start');
  const name = args.find((arg) => !arg.startsWith('--')) ?? git('branch', '--show-current');
  const context = start ? slugsOn() : { ...slugsOn('HEAD'), catalog: listMetaFiles().map(({ slug }) => slug) };
  const result = validateBranch(name, context, { start });
  if (result.ok) console.log(`ok: ${name}`);
  else console.error(`invalid branch: ${result.reason}`);
  process.exit(result.ok ? 0 : 1);
}

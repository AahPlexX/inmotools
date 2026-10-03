#!/usr/bin/env node
// pnpm task:start <slug> <new|expand|fix> ["<title>"]
// Claims a tool for one agent and gives it an isolated checkout:
//  1. validates the branch name (feature|expand|fix)/<slug> against origin/main;
//  2. if that branch already exists on origin, it is someone's claim: resumes it in a
//     worktree instead of starting over (another tool's branch is never touched);
//  3. otherwise creates the branch from origin/main in ../<repo>-<slug>, writes a task
//     file in .tasks/items/, commits it and pushes, so the claim is visible to others.
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { KINDS, slugsOn, validateBranch } from './branch-check.mjs';
import { ITEMS_DIR } from './docs-sync.mjs';

const git = (args, cwd) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] }).trim();
const today = () => new Date().toISOString().slice(0, 10);

export function taskId(slug, date = today(), hash = randomBytes(2).toString('hex')) {
  return `T-${slug}-${date.replace(/-/g, '')}-${hash}`;
}

export function taskFile({ id, slug, kind, branch, title, date = today() }) {
  return `---
task: ${id}
tool: ${slug}
doc: task
kind: ${kind}
state: active
branch: ${branch}
created: ${date}
updated: ${date}
---

# ${title}

## Request
The request as given, verbatim.

## Resume here
Started; next: write or update the spec's requirements, then the tracker.

## Log
- ${date}: claimed \`${branch}\`.
`;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [slug, kind, ...rest] = process.argv.slice(2);
  if (!slug || !KINDS[kind]) {
    console.error('usage: pnpm task:start <slug> <new|expand|fix> ["<title>"]');
    process.exit(2);
  }
  const branch = `${KINDS[kind]}/${slug}`;
  git(['fetch', '--quiet', '--prune', 'origin']);
  const check = validateBranch(branch, slugsOn());
  if (!check.ok) { console.error(`cannot start: ${check.reason}`); process.exit(1); }

  const root = git(['rev-parse', '--show-toplevel']);
  const tree = resolve(root, '..', `${basename(root)}-${slug}`);
  const claimed = git(['ls-remote', '--heads', 'origin', branch]);
  if (existsSync(tree)) {
    console.log(`worktree already exists: ${tree} (cd there and continue)`);
    process.exit(0);
  }
  if (claimed) {
    git(['worktree', 'add', '--quiet', '-B', branch, tree, `origin/${branch}`]);
    git(['branch', '--quiet', '--set-upstream-to', `origin/${branch}`, branch], tree);
    console.log(`resumed existing ${branch} in ${tree}; read its task file in ${ITEMS_DIR}/ and the tracker's "Resume here"`);
    process.exit(0);
  }
  git(['worktree', 'add', '--quiet', '-b', branch, tree, 'origin/main']);
  const id = taskId(slug);
  const title = rest.join(' ') || `${kind} ${slug}`;
  mkdirSync(resolve(tree, ITEMS_DIR), { recursive: true });
  writeFileSync(resolve(tree, ITEMS_DIR, `${id}.md`), taskFile({ id, slug, kind, branch, title }));
  git(['add', `${ITEMS_DIR}/${id}.md`], tree);
  git(['commit', '--quiet', '-m', `chore(tasks): start ${id}`], tree);
  git(['push', '--quiet', '-u', 'origin', branch], tree);
  console.log(`started ${branch} in ${tree}\ntask file: ${ITEMS_DIR}/${id}.md (fill in "Request" first)`);
}

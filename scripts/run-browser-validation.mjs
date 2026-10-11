#!/usr/bin/env node
// Single validation owner for direct pushes, PRs, and explicit checkpoints.
import { execFileSync, spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { FULL_SUITE, selectE2eSpecs } from './select-e2e-specs.mjs';

export function validationPlan({ root = process.cwd(), eventName, beforeSha, baseSha, headSha, baseRef, scope = 'affected' } = {}) {
  const full = (reason) => ({ specs: [FULL_SUITE], paths: [], reason });
  if (scope === 'full') return full('Explicit stable-batch/full checkpoint');
  if (scope !== 'affected') return full('Unknown validation scope');
  const base = eventName === 'pull_request' ? baseSha : eventName === 'push' ? beforeSha : eventName === 'workflow_dispatch' ? baseRef : null;
  if (!base || !headSha || /^0+$/.test(base)) return full('No reliable comparison base');
  try {
    const resolve = (ref) => execFileSync('git', ['rev-parse', '--verify', '--end-of-options', `${ref}^{commit}`], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
    const resolvedBase = resolve(base);
    const resolvedHead = resolve(headSha);
    const revisions = eventName === 'pull_request' ? [`${resolvedBase}...${resolvedHead}`] : [resolvedBase, resolvedHead];
    const paths = execFileSync('git', ['diff', '--name-only', '--no-renames', '-z', ...revisions, '--'], { cwd: root, encoding: 'utf8' }).split('\0').filter(Boolean);
    const specs = selectE2eSpecs(paths, root);
    return { specs, paths, base: resolvedBase, head: resolvedHead, reason: specs[0] === FULL_SUITE ? 'Broad or uncertain impact' : 'Affected scope' };
  } catch {
    return full('Comparison or impact analysis could not be completed');
  }
}

export function runBrowserValidation(plan, run = (args) => spawnSync('pnpm', args, { stdio: 'inherit' }).status ?? 1) {
  if (!plan.specs.length) { console.log('No affected browser scope; browser installation and execution skipped.'); return 0; }
  const installed = run(['exec', 'playwright', 'install', '--with-deps', 'chromium']);
  if (installed !== 0) return installed;
  return run(plan.specs[0] === FULL_SUITE ? ['test:e2e'] : ['exec', 'playwright', 'test', ...plan.specs]);
}

export function canReuseBrowserValidation(plan) {
  return plan.specs.length === 0 && plan.paths.every((path) => path.endsWith('.md'));
}

export function runValidation(plan, { build = false, run = (args) => spawnSync('pnpm', args, { stdio: 'inherit' }).status ?? 1 } = {}) {
  if (build && (plan.specs.length || plan.paths.some((path) => !path.endsWith('.md')))) {
    const built = run(['build']);
    if (built !== 0) return built;
  }
  return runBrowserValidation(plan, run);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const plan = validationPlan({ eventName: process.env.EVENT_NAME, beforeSha: process.env.BEFORE_SHA, baseSha: process.env.BASE_SHA, headSha: process.env.HEAD_SHA, baseRef: process.env.BASE_REF, scope: process.env.BROWSER_SCOPE || 'affected' });
  console.log(JSON.stringify(plan, null, 2));
  const summary = process.argv.indexOf('--summary-file');
  if (summary >= 0) writeFileSync(process.argv[summary + 1], JSON.stringify(plan));
  process.exitCode = runValidation(plan, { build: process.argv.includes('--build') });
}

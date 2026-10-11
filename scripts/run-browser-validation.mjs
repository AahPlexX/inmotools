#!/usr/bin/env node
// Single validation owner for direct pushes, PRs, and explicit checkpoints.
import { execFileSync, spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { parseAllDocuments } from 'yaml';
import { FULL_SUITE, selectE2eSpecs } from './select-e2e-specs.mjs';

// Only additive, isolated lint tooling qualifies. All existing lock records and
// every package field except the two lint devDependencies and lint script match.
export function lintOnlyDependencyChange(paths, readBase, readHead) {
  const allowed = new Set(['package.json', 'pnpm-lock.yaml', '.oxlintrc.json', 'tsconfig.lint.json', '.github/workflows/lint.yml', 'scripts/run-browser-validation.mjs', 'tests/unit/validation-runner.test.mjs']);
  if (!paths.includes('package.json') || !paths.includes('pnpm-lock.yaml') || paths.some(path => !allowed.has(path) && !(path.endsWith('.md') && (path.startsWith('docs/') || path.startsWith('.tasks/') || !path.includes('/') || /^src\/tools\/.+\/(?:README|TRACKER|VERIFICATION|HANDOFF|STATUS|WORK_LOG)\.md$/.test(path))))) return false;
  try {
    const stripPackage = text => {
      const value = JSON.parse(text);
      delete value.devDependencies?.oxlint;
      delete value.devDependencies?.['oxlint-tsgolint'];
      delete value.scripts?.lint;
      return value;
    };
    const basePackage = readBase('package.json');
    const headPackage = readHead('package.json');
    const old = JSON.parse(basePackage); const next = JSON.parse(headPackage);
    if (old.devDependencies?.oxlint || old.devDependencies?.['oxlint-tsgolint'] || old.scripts?.lint) return false;
    if (next.devDependencies?.oxlint !== '1.87.0' || next.devDependencies?.['oxlint-tsgolint'] !== '7.0.2004' || next.scripts?.lint !== 'oxlint --type-aware --tsconfig tsconfig.lint.json src tests scripts') return false;
    if (!isDeepStrictEqual(stripPackage(basePackage), stripPackage(headPackage))) return false;
    const parse = text => parseAllDocuments(text).map(doc => { if (doc.errors.length) throw doc.errors[0]; return doc.toJSON(); });
    const oldLocks = parse(readBase('pnpm-lock.yaml')); const newLocks = parse(readHead('pnpm-lock.yaml'));
    if (oldLocks.length !== newLocks.length || !oldLocks.length) return false;
    for (let i = 0; i < oldLocks.length; i++) {
      const before = oldLocks[i]; const after = newLocks[i];
      delete after.importers?.['.']?.devDependencies?.oxlint;
      delete after.importers?.['.']?.devDependencies?.['oxlint-tsgolint'];
      for (const section of ['packages', 'snapshots']) {
        for (const key of Object.keys(after[section] ?? {})) {
          if (Object.hasOwn(before[section] ?? {}, key)) continue;
          if (!/^(?:oxlint(?:-tsgolint)?@|@oxlint(?:-tsgolint)?\/)/.test(key)) return false;
          delete after[section][key];
        }
      }
      if (!isDeepStrictEqual(before, after)) return false;
    }
    return true;
  } catch { return false; }
}

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
    const show = (ref, path) => execFileSync('git', ['show', `${ref}:${path}`], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    const comparisonBase = eventName === 'pull_request' ? execFileSync('git', ['merge-base', resolvedBase, resolvedHead], { cwd: root, encoding: 'utf8' }).trim() : resolvedBase;
    if (lintOnlyDependencyChange(paths, path => show(comparisonBase, path), path => show(resolvedHead, path))) return { specs: [], paths, base: comparisonBase, head: resolvedHead, reason: 'Verified additive lint-only dependencies; browser inputs unchanged' };
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

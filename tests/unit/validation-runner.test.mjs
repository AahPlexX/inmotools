import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { validationPlan, runBrowserValidation, runValidation, canReuseBrowserValidation, lintOnlyDependencyChange } from '../../scripts/run-browser-validation.mjs';
import { stringify } from 'yaml';
import { FULL_SUITE } from '../../scripts/select-e2e-specs.mjs';

const roots = [];
afterEach(() => roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true })));
function repository() {
  const root = mkdtempSync(join(tmpdir(), 'inmotools-validation-'));
  roots.push(root);
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
  git('init', '-q'); git('config', 'user.name', 'Validation fixture'); git('config', 'user.email', 'fixture@example.invalid');
  const write = (path, text) => { mkdirSync(dirname(join(root, path)), { recursive: true }); writeFileSync(join(root, path), text); };
  for (const tool of ['alpha', 'beta']) {
    write(`src/tools/${tool}/${tool}.meta.ts`, 'export default {};');
    write(`src/tools/${tool}/Workspace.tsx`, 'export const value = 1;');
    write(`tests/e2e/${tool}.spec.ts`, `const route = "#/tools/${tool}";`);
  }
  git('add', '.'); git('commit', '-qm', 'baseline');
  return { root, git, write, base: git('rev-parse', 'HEAD'), commit: () => { git('add', '-A'); git('commit', '-qm', 'change'); return git('rev-parse', 'HEAD'); } };
}

describe('validation event behavior', () => {
  it('reuses merge-race browser evidence only for records with no runtime impact', () => {
    const r = repository();
    r.write('docs/STATUS.md', 'Current checkpoint'); const docs = r.commit();
    expect(canReuseBrowserValidation(validationPlan({ root: r.root, eventName: 'push', beforeSha: r.base, headSha: docs }))).toBe(true);
    r.write('src/tools/alpha/data.md', 'Imported runtime content'); const runtime = r.commit();
    expect(canReuseBrowserValidation(validationPlan({ root: r.root, eventName: 'push', beforeSha: docs, headSha: runtime }))).toBe(false);
    expect(canReuseBrowserValidation({ paths: [], specs: [FULL_SUITE] })).toBe(false);
    expect(canReuseBrowserValidation({ paths: ['tests/unit/example.test.ts'], specs: [] })).toBe(false);
  });
  it('selects all affected tools in a multi-commit push', () => {
    const r = repository();
    r.write('src/tools/alpha/Workspace.tsx', 'export const value = 2;'); r.commit();
    r.write('src/tools/beta/Workspace.tsx', 'export const value = 3;'); const head = r.commit();
    expect(validationPlan({ root: r.root, eventName: 'push', beforeSha: r.base, headSha: head }).specs.sort()).toEqual(['tests/e2e/alpha.spec.ts', 'tests/e2e/beta.spec.ts']);
  });

  it('uses PR merge-base scope without unrelated base-branch changes', () => {
    const r = repository(); r.git('branch', 'base-branch');
    r.write('src/tools/alpha/Workspace.tsx', 'export const value = 2;'); const head = r.commit();
    r.git('checkout', '-q', 'base-branch'); r.write('src/tools/beta/Workspace.tsx', 'export const value = 4;'); const base = r.commit();
    r.git('checkout', '-q', head);
    expect(validationPlan({ root: r.root, eventName: 'pull_request', baseSha: base, headSha: head }).specs).toEqual(['tests/e2e/alpha.spec.ts']);
  });

  it('includes both sides of a rename and does not try running a deleted browser file', () => {
    const r = repository(); r.git('mv', 'tests/e2e/alpha.spec.ts', 'tests/e2e/renamed.spec.ts'); const head = r.commit();
    const plan = validationPlan({ root: r.root, eventName: 'push', beforeSha: r.base, headSha: head });
    expect(plan.paths).toContain('tests/e2e/alpha.spec.ts'); expect(plan.paths).toContain('tests/e2e/renamed.spec.ts');
    expect(plan.specs).toEqual([FULL_SUITE]);
  });

  it('supports explicit full checkpoints and falls back to full for untrusted or missing bases', () => {
    const r = repository();
    for (const input of [{ scope: 'full' }, { eventName: 'push', beforeSha: '0'.repeat(40) }, { eventName: 'workflow_dispatch' }, { eventName: 'workflow_dispatch', baseRef: '--output=unexpected' }]) {
      expect(validationPlan({ root: r.root, headSha: r.base, ...input }).specs).toEqual([FULL_SUITE]);
    }
    expect(validationPlan({ root: r.root, eventName: 'workflow_dispatch', baseRef: r.base, headSha: r.base }).specs).toEqual([]);
  });

  it('runs no browser install for empty scope, one selected matrix for affected scope and one full for checkpoint scope', () => {
    const commands = [];
    const runner = (args) => { commands.push(args); return 0; };
    expect(runBrowserValidation({ specs: [] }, runner)).toBe(0); expect(commands).toEqual([]);
    expect(runBrowserValidation({ specs: ['tests/e2e/alpha.spec.ts', 'tests/e2e/beta.spec.ts'] }, runner)).toBe(0);
    expect(commands).toEqual([['exec', 'playwright', 'install', '--with-deps', 'chromium'], ['exec', 'playwright', 'test', 'tests/e2e/alpha.spec.ts', 'tests/e2e/beta.spec.ts']]);
    commands.length = 0;
    expect(runBrowserValidation({ specs: [FULL_SUITE] }, runner)).toBe(0);
    expect(commands.at(-1)).toEqual(['test:e2e']);
  });

  it('propagates install/test failures without suppressing or retrying them', () => {
    let count = 0;
    expect(runBrowserValidation({ specs: [FULL_SUITE] }, () => { count++; return 17; })).toBe(17); expect(count).toBe(1);
    count = 0;
    expect(runBrowserValidation({ specs: [FULL_SUITE] }, () => ++count === 1 ? 0 : 9)).toBe(9); expect(count).toBe(2);
  });

  it('builds runtime Markdown before its tests and skips record-only build/install', () => {
    const commands = [];
    const run = (args) => { commands.push(args); return 0; };
    expect(runValidation({ paths: ['docs/VALIDATION_POLICY.md'], specs: [] }, { build: true, run })).toBe(0);
    expect(commands).toEqual([]);
    expect(runValidation({ paths: ['src/tools/alpha/data.md'], specs: ['tests/e2e/alpha.spec.ts'] }, { build: true, run })).toBe(0);
    expect(commands[0]).toEqual(['build']);
    expect(commands.at(-1)).toEqual(['exec', 'playwright', 'test', 'tests/e2e/alpha.spec.ts']);
    commands.length = 0;
    expect(runValidation({ paths: ['src/App.tsx'], specs: [FULL_SUITE] }, { build: true, run: (args) => { commands.push(args); return 7; } })).toBe(7);
    expect(commands).toEqual([['build']]);
  });
});


describe('isolated lint dependency browser scope', () => {
  function fixture() {
    const oldPackage = { dependencies: { runtime: '1' }, devDependencies: { vitest: '5' }, scripts: { build: 'tsc && vite build' } };
    const newPackage = structuredClone(oldPackage);
    Object.assign(newPackage.devDependencies, { oxlint: '1.87.0', 'oxlint-tsgolint': '7.0.2004' });
    newPackage.scripts.lint = 'oxlint --type-aware --tsconfig tsconfig.lint.json src tests scripts';
    const oldLock = { importers: { '.': { dependencies: { runtime: { version: '1' } }, devDependencies: { vitest: { version: '5' } } } }, packages: { 'runtime@1': { integrity: 'original' } }, snapshots: { 'runtime@1': {} } };
    const newLock = structuredClone(oldLock);
    Object.assign(newLock.importers['.'].devDependencies, { oxlint: { version: '1.87.0' }, 'oxlint-tsgolint': { version: '7.0.2004' } });
    Object.assign(newLock.packages, { 'oxlint@1.87.0': {}, '@oxlint/binding-linux-x64-gnu@1.87.0': {} });
    newLock.snapshots['oxlint@1.87.0'] = {};
    const paths = ['package.json', 'pnpm-lock.yaml', '.oxlintrc.json'];
    const check = (extra = []) => lintOnlyDependencyChange([...paths, ...extra], path => path === 'package.json' ? JSON.stringify(oldPackage) : stringify(oldLock), path => path === 'package.json' ? JSON.stringify(newPackage) : stringify(newLock));
    return { oldPackage, newPackage, oldLock, newLock, check };
  }
  it('accepts only isolated additive lint tooling and record changes', () => {
    expect(fixture().check(['docs/VALIDATION_POLICY.md'])).toBe(true);
  });
  it('retains full scope for changed runtime versions, scripts or existing compiler tools', () => {
    for (const change of [f => { f.newPackage.dependencies.runtime = '2'; }, f => { f.newPackage.scripts.build = 'different'; }, f => { f.newPackage.devDependencies.vitest = '6'; }]) {
      const f = fixture(); change(f); expect(f.check()).toBe(false);
    }
  });
  it('retains full scope for changed existing lock records or unknown new packages', () => {
    for (const change of [f => { f.newLock.packages['runtime@1'].integrity = 'changed'; }, f => { f.newLock.packages['unexpected@1'] = {}; }, f => { delete f.newLock.snapshots['runtime@1']; }]) {
      const f = fixture(); change(f); expect(f.check()).toBe(false);
    }
  });
  it('retains full scope for runtime, fixtures, unclassified config and runtime Markdown', () => {
    for (const path of ['src/App.tsx', 'tests/fixtures/input.md', 'src/tools/alpha/data.md', 'vite.config.ts', '.github/workflows/pages.yml']) expect(fixture().check([path])).toBe(false);
  });
  it('does not generalize the initial rollout exception to later lint upgrades', () => {
    const f = fixture(); f.oldPackage.devDependencies.oxlint = '1.87.0'; expect(f.check()).toBe(false);
    f.newPackage.devDependencies.oxlint = '1.88.0'; expect(f.check()).toBe(false);
  });
  it('falls back safely on missing or malformed metadata', () => {
    expect(lintOnlyDependencyChange(['package.json', 'pnpm-lock.yaml'], () => '{', () => '{')).toBe(false);
    expect(lintOnlyDependencyChange(['package.json'], () => '{}', () => '{}')).toBe(false);
  });
});

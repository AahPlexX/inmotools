import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { validationPlan, runBrowserValidation, runValidation, canReuseBrowserValidation } from '../../scripts/run-browser-validation.mjs';
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

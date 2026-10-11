import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { describe, expect, it } from 'vitest';

const workflow = (name) => parse(readFileSync(new URL(`../../.github/workflows/${name}.yml`, import.meta.url), 'utf8'));

describe('one automatic browser-validation owner', () => {
  it('routes Pages pushes and PRs through affected selection and retains explicit full/deploy-only inputs', () => {
    const pages = workflow('pages');
    expect(pages.on.push.branches).toContain('main');
    expect(pages.on.push['paths-ignore']).not.toContain('**/*.md');
    expect(pages.on.push['paths-ignore']).toContain('src/tools/**/TRACKER.md');
    expect(pages.on.workflow_dispatch.inputs.scope.options).toEqual(['affected', 'full']);
    expect(pages.on.workflow_dispatch.inputs.base_ref.type).toBe('string');
    expect(pages.jobs.validate.if).toContain('inputs.validate');
    const browser = pages.jobs.validate.steps.find((step) => step.name === 'Browser tests');
    expect(browser.run.trim()).toBe('node scripts/run-browser-validation.mjs');
    expect(browser.env.BEFORE_SHA).toBe('${{ github.event.before }}');
    expect(browser.env.BASE_SHA).toBe('${{ github.event.pull_request.base.sha }}');
    expect(browser.env.HEAD_SHA).toBe('${{ github.event.pull_request.head.sha || github.sha }}');
    expect(browser.env.BROWSER_SCOPE).toBe("${{ inputs.scope || 'affected' }}");
    expect(pages.jobs['build-pages'].if).toContain("github.ref == 'refs/heads/main'");
    expect(pages.jobs.deploy.needs).toBe('build-pages');
  });

  it('retains custom validation workflows manually without duplicate push/PR runs', () => {
    for (const name of ['focused-tool', 'typing-workstation', 'web-layout', 'sightline']) {
      const custom = workflow(name);
      expect(custom.on, name).toHaveProperty('workflow_dispatch');
      expect(custom.on.push, name).toBeUndefined();
      expect(custom.on.pull_request, name).toBeUndefined();
      expect(Object.values(custom.jobs).flatMap((job) => job.steps).some((step) => step.run?.includes('playwright test')), name).toBe(true);
    }
  });

  it('makes integration own the same selector and defers browser installation until needed', () => {
    const steps = workflow('integrate').jobs.integrate.steps;
    const install = steps.find((step) => step.name === 'Install dependencies');
    expect(install.run).not.toContain('playwright');
    const integrate = steps.find((step) => step.name === 'Merge, check and push to main').run;
    expect(integrate).toContain('node scripts/run-browser-validation.mjs');
    expect(integrate).toContain('canReuseBrowserValidation(validationPlan(');
    expect(integrate).toContain('BEFORE_SHA="$(git rev-parse origin/main)"');
    expect(integrate).toContain('HEAD_SHA="$(git rev-parse HEAD)"');
    expect(integrate).toContain('gh workflow run pages.yml --ref main -f validate=false');
  });
});

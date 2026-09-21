/**
 * Wiring tests for the Sightline Velocity Studio tool entry.
 *
 * The engines and the exporters have their own suites. What this file protects
 * is the part that makes the tool reachable at all: the catalog record, the
 * lazy workspace loader, the focused browser-spec mapping, and the agreement
 * between the export ids the interface offers, the ids the export plan knows,
 * and the ids the browser spec downloads. A typo in any of those is invisible
 * to the engine suites and expensive in CI.
 */

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { TOOLS, TOOL_BY_SLUG } from '../../src/catalog';
import { EXPORT_DEFINITIONS } from '../../src/tools/sightline/export-plan';
import { selectE2eSpecs } from '../../scripts/select-e2e-specs.mjs';

const read = (path: string): string => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

const WORKSPACE = 'src/tools/sightline/SightlineWorkspace.tsx';
const PANELS = 'src/tools/sightline/SightlinePanels.tsx';
const SPEC = 'tests/e2e/sightline.spec.ts';
const SLUG = 'sightline-velocity';

const matchAll = (source: string, pattern: RegExp): string[] =>
  [...source.matchAll(pattern)].map((match) => match[1]!).filter(Boolean);

describe('catalog entry', () => {
  const tool = TOOL_BY_SLUG.get(SLUG);

  it('is listed once and resolvable by slug', () => {
    expect(TOOLS.filter((entry) => entry.slug === SLUG)).toHaveLength(1);
    expect(tool).toBeDefined();
  });

  it('describes the tool in the catalog vocabulary', () => {
    expect(tool?.shortTitle).toBe('Sightline Velocity Studio');
    expect(tool?.title).toContain('Sightline Velocity Studio —');
    expect(tool?.audience).toMatch(/students|readers|researchers/i);
    expect(tool?.accepts).toMatch(/PDF/);
    expect(tool?.outputs).toMatch(/EPUB/);
    expect(tool?.steps.length).toBeGreaterThanOrEqual(3);
    expect(tool?.privacy).toMatch(/browser/i);
  });

  it('states the honest limit rather than promising a multiplier', () => {
    const hint = tool?.hint ?? '';
    expect(hint).toMatch(/comprehension/i);
    expect(hint).not.toMatch(/bionic reading|spritz|beeline/i);
    expect(`${tool?.summary} ${tool?.hint}`).not.toMatch(/bionic/i);
  });

  it('is registered for the lazy workspace loader', () => {
    const registry = read('src/tools/workspaces.tsx');
    expect(registry).toContain(`'${SLUG}': () => import('./sightline/SightlineWorkspace')`);
  });
});

describe('browser spec selection', () => {
  it('routes Sightline source changes to the Sightline browser spec', () => {
    expect(selectE2eSpecs([`${WORKSPACE}`])).toEqual(['tests/e2e/sightline.spec.ts']);
    expect(selectE2eSpecs(['src/tools/sightline/sightline-workspace.css'])).toEqual(['tests/e2e/sightline.spec.ts']);
  });

  it('routes the spec file itself to the same spec', () => {
    expect(selectE2eSpecs([SPEC])).toEqual([SPEC]);
  });

  it('still forces the full suite for shared client files', () => {
    expect(selectE2eSpecs(['src/catalog.ts'])).toEqual(['__FULL_SUITE__']);
  });
});

describe('interface and export plan agree', () => {
  it('offers a control panel and an engine tab for every id the surface claims', () => {
    const workspace = read(WORKSPACE);
    const panelIds = matchAll(workspace, /\{ id: '([a-z]+)', label: '[^']+' \}/g);
    const engineIds = matchAll(workspace, /\{ id: '([a-z]+)', label: '[^']+', hint:/g);
    expect(panelIds).toEqual(expect.arrayContaining(['pace', 'look', 'drill', 'bank', 'data', 'export']));
    expect(engineIds).toEqual(expect.arrayContaining(['rsvp', 'chunk', 'page', 'peripheral', 'drill']));

    const panels = read(PANELS);
    for (const name of ['PacePanel', 'LookPanel', 'DrillPanel', 'BankPanel', 'DataPanel', 'ExportPanel']) {
      expect(panels, `${name} must exist`).toContain(`export function ${name}`);
    }
  });

  it('renders one download control per planned export', () => {
    const panels = read(PANELS);
    const workspace = read(WORKSPACE);
    expect(panels).toContain('data-testid={`sightline-export-${row.id}`}');
    expect(workspace).toContain('describeExports');
    expect(workspace).toContain('planExport');
    // The rows come from the plan, so the two cannot drift apart.
    expect(EXPORT_DEFINITIONS.map((definition) => definition.id)).toContain('weighted-docx');
  });

  it('only downloads export ids the plan defines', () => {
    const spec = read(SPEC);
    const ids = new Set(EXPORT_DEFINITIONS.map((definition) => definition.id));
    const requested = matchAll(spec, /downloadFile\(page, '([a-z-]+)'\)/g);
    expect(requested.length).toBeGreaterThanOrEqual(10);
    for (const id of requested) {
      expect(ids.has(id as (typeof EXPORT_DEFINITIONS)[number]['id']), `${id} is not an export id`).toBe(true);
    }
  });

  it('drives the panels and engines through ids the workspace actually renders', () => {
    const workspace = read(WORKSPACE);
    const spec = read(SPEC);
    const panels = matchAll(spec, /sightline-panel-([a-z]+)/g);
    const engines = matchAll(spec, /sightline-engine-([a-z]+)/g);
    const panelIds = matchAll(workspace, /\{ id: '([a-z]+)', label: '[^']+' \}/g);
    const engineIds = matchAll(workspace, /\{ id: '([a-z]+)', label: '[^']+', hint:/g);
    for (const panel of panels) expect(panelIds).toContain(panel);
    for (const engine of engines) expect(engineIds).toContain(engine);
  });
});

describe('browser spec scope', () => {
  const spec = read(SPEC);

  it('covers the paths the completion goal names', () => {
    expect(spec).toContain('AxeBuilder');
    expect(spec).toContain('sightline-scrub');
    expect(spec).toMatch(/keyboard/i);
    expect(spec).toMatch(/download/i);
    expect(spec).toMatch(/overflow/i);
  });

  it('checks export content rather than only file names', () => {
    expect(spec).toContain('%PDF-');
    expect(spec).toContain('word/document.xml');
    expect(spec).toContain('OEBPS/nav.xhtml');
    expect(spec).toContain('startedAt,document,format,wordsRead');
  });

  it('checks three viewport widths', () => {
    expect(spec).toContain("name: 'desktop', width: 1440");
    expect(spec).toContain("name: 'tablet', width: 900");
    expect(spec).toContain("name: 'phone', width: 390");
  });
});

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { TOOLS, TOOL_BY_SLUG } from '../../src/catalog';
import { selectE2eSpecs } from '../../scripts/select-e2e-specs.mjs';

const read = (path: string): string => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const SLUG = 'geo-intelligence-hub';

describe('geo intelligence hub wiring', () => {
  it('registers exactly one catalog entry with the ToolMeta shape', () => {
    expect(TOOLS.filter((tool) => tool.slug === SLUG)).toHaveLength(1);
    const tool = TOOL_BY_SLUG.get(SLUG);
    expect(Object.keys(tool ?? {}).sort()).toEqual(['accepts', 'audience', 'category', 'hint', 'load', 'outputs', 'privacy', 'shortTitle', 'slug', 'steps', 'summary', 'title', 'workspaceFirst'].sort());
    expect(tool?.shortTitle).toBe('Geo Intelligence Hub');
    // Interactive map tool: open on the workspace, not below the intro.
    expect(tool?.workspaceFirst).toBe(true);
    expect(tool?.steps.length).toBeGreaterThanOrEqual(3);
    expect(tool?.privacy).toMatch(/IndexedDB/);
    expect(tool?.privacy).toMatch(/keyless/);
    const copy = `${tool?.summary} ${tool?.hint} ${tool?.steps.join(' ')}`;
    expect(copy).not.toMatch(/seamless|robust|empower|unlock|delve/i);
  });

  it('lazy-loads its own workspace and leaves the GeoJSON simplifier untouched', () => {
    expect(read(`src/tools/geo-intel/${SLUG}.meta.ts`)).toContain("load: () => import('./GeoIntelWorkspace')");
    expect(read('src/tools/geo/geojson-simplifier.meta.ts')).toContain("load: () => import('./GeoWorkspace')");
    expect(read('src/tools/geo-intel/GeoIntelWorkspace.tsx')).toContain("import './geo-intel.css'");
  });

  it('runs the full browser suite when the catalog changes', () => {
    expect(selectE2eSpecs(['src/catalog.ts'])).toEqual(['__FULL_SUITE__']);
    expect(selectE2eSpecs(['src/tools/geo-intel/GeoIntelWorkspace.tsx'])).toEqual(['tests/e2e/geo-intel.spec.ts']);
  });

  it('never requests credentials: no API keys, tokens or signup-gated hosts in source', () => {
    const files = ['adapters/postal.ts', 'adapters/statistics.ts', 'adapters/boundaries.ts', 'adapters/geocoders.ts', 'adapters/environment.ts', 'net/http.ts'];
    for (const file of files) {
      const source = read(`src/tools/geo-intel/${file}`);
      expect(source, file).not.toMatch(/api[_-]?key=|apikey|access_token|X-API-Key|Authorization/i);
      expect(source, file).not.toMatch(/open-meteo|geoapify|locationiq|opencagedata|ipinfo|timezonedb|mapbox|googleapis|arcgis|what3words|restcountries|opentopodata/i);
    }
  });
});

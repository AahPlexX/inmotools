import { describe, expect, it } from 'vitest';
import { createStarterStructure, updateCrystalSite } from '../../src/tools/crystal/document-engine';
import type { Vec3 } from '../../src/tools/crystal/crystal-types';
import {
  buildCrystalRenderModel,
  defaultRenderOptions,
} from '../../src/tools/crystal/viewport-model';

describe('Crystal Lattice Studio viewport model', () => {
  it('builds one atom instance per visible site and twelve unit-cell edges', () => {
    const document = createStarterStructure('nacl');
    const model = buildCrystalRenderModel(document, defaultRenderOptions);

    expect(model.atoms).toHaveLength(document.sites.length);
    expect(model.cellEdges).toHaveLength(12);
    expect(model.modelKey).toContain(document.id);
    expect(model.atoms.every((atom) => atom.position.every(Number.isFinite))).toBe(true);
  });

  it('keeps stable site IDs and carries selection into the render model', () => {
    const document = createStarterStructure('bcc');
    const selected = new Set([document.sites[0]!.id]);
    const model = buildCrystalRenderModel(document, { ...defaultRenderOptions, selectedSiteIds: selected });

    expect(model.atoms[0]!.siteId).toBe(document.sites[0]!.id);
    expect(model.atoms[0]!.selected).toBe(true);
    expect(model.atoms.filter((atom) => atom.selected)).toHaveLength(1);
  });

  it('includes bounded periodic bonds for bond-based representations and omits them for points/space-fill', () => {
    const document = createStarterStructure('bcc');
    const ballStick = buildCrystalRenderModel(document, { ...defaultRenderOptions, representation: 'ball-stick' });
    const points = buildCrystalRenderModel(document, { ...defaultRenderOptions, representation: 'points' });
    const spaceFill = buildCrystalRenderModel(document, { ...defaultRenderOptions, representation: 'space-fill' });

    expect(ballStick.bonds.length).toBeGreaterThan(0);
    expect(points.bonds).toHaveLength(0);
    expect(spaceFill.bonds).toHaveLength(0);
    expect(ballStick.bonds.every((bond) => bond.start.every(Number.isFinite) && bond.end.every(Number.isFinite))).toBe(true);
  });

  it('produces deterministic keys and changes the key when structure or representation changes', () => {
    const document = createStarterStructure('nacl');
    const first = buildCrystalRenderModel(document, defaultRenderOptions);
    const second = buildCrystalRenderModel(document, defaultRenderOptions);
    const sticks = buildCrystalRenderModel(document, { ...defaultRenderOptions, representation: 'sticks' });
    const changedDocument = { ...document, id: `${document.id}-changed` };
    const changed = buildCrystalRenderModel(changedDocument, defaultRenderOptions);

    expect(second.modelKey).toBe(first.modelKey);
    expect(sticks.modelKey).not.toBe(first.modelKey);
    expect(changed.modelKey).not.toBe(first.modelKey);
  });

  it('uses element reference colors/radii with a bounded visual fallback for unknown pseudo-elements', () => {
    const known = buildCrystalRenderModel(createStarterStructure('nacl'), defaultRenderOptions);
    expect(known.atoms.every((atom) => /^#[0-9a-f]{6}$/i.test(atom.color))).toBe(true);
    expect(known.atoms.every((atom) => atom.radius > 0)).toBe(true);

    const illustrative = buildCrystalRenderModel(createStarterStructure('sc'), defaultRenderOptions);
    expect(illustrative.atoms[0]!.element).toBe('X');
    expect(illustrative.atoms[0]!.radius).toBeGreaterThan(0);
    expect(illustrative.diagnostics.some((message) => /visual fallback|unknown|reference/i.test(message))).toBe(true);
  });
});

describe('Crystal Lattice Studio advanced render model', () => {
  it('builds a coordination polyhedron for a requested center', () => {
    const document = createStarterStructure('bcc');
    const center = document.sites[0]!;
    const model = buildCrystalRenderModel(document, {
      ...defaultRenderOptions,
      polyhedronCenterIds: new Set([center.id]),
    });

    expect(model.polyhedra).toHaveLength(1);
    expect(model.polyhedra[0]!.centerSiteId).toBe(center.id);
    expect(model.polyhedra[0]!.vertices).toHaveLength(8);
    expect(model.polyhedra[0]!.vertices.every((vertex) => vertex.every(Number.isFinite))).toBe(true);
    expect(model.polyhedra[0]!.distortion).not.toBeNull();
    expect(Number.isFinite(model.polyhedra[0]!.distortion!)).toBe(true);
  });

  it('derives finite ellipsoids only for positive-definite ADPs', () => {
    const document = createStarterStructure('bcc');
    expect(buildCrystalRenderModel(document, defaultRenderOptions).ellipsoids).toHaveLength(0);

    const invalid = updateCrystalSite(document, document.sites[0]!.id, { uAniso: [0, 0, 0, 0, 0, 0] });
    expect(buildCrystalRenderModel(invalid, defaultRenderOptions).ellipsoids).toHaveLength(0);

    const valid = updateCrystalSite(document, document.sites[1]!.id, { uAniso: [0.01, 0.02, 0.03, 0, 0, 0] });
    const ellipsoids = buildCrystalRenderModel(valid, defaultRenderOptions).ellipsoids;
    expect(ellipsoids).toHaveLength(1);
    expect(ellipsoids[0]!.siteId).toBe(document.sites[1]!.id);
    expect(ellipsoids[0]!.axes.every((value) => Number.isFinite(value) && value > 0)).toBe(true);
    expect(ellipsoids[0]!.orientation.every((row) => row.every(Number.isFinite))).toBe(true);
    expect(ellipsoids[0]!.probability).toBeCloseTo(0.5, 12);
  });

  it('filters clipped and hidden primitives deterministically', () => {
    const document = createStarterStructure('bcc');
    const options = {
      ...defaultRenderOptions,
      clip: { normal: [1, 0, 0] as Vec3, offset: document.cell.a * 0.4 },
    };
    const first = buildCrystalRenderModel(document, options);
    const second = buildCrystalRenderModel(document, options);

    expect(first.atoms.map((atom) => atom.siteId)).toEqual(second.atoms.map((atom) => atom.siteId));
    expect(first.atoms).toHaveLength(1);
    expect(first.atoms[0]!.siteId).toBe(document.sites[0]!.id);

    const hidden = buildCrystalRenderModel(document, {
      ...defaultRenderOptions,
      hiddenSiteIds: new Set([document.sites[0]!.id]),
      elementFilter: new Set(['Fe']),
    });
    expect(hidden.atoms).toHaveLength(1);
    expect(hidden.atoms[0]!.siteId).toBe(document.sites[1]!.id);
  });

  it('renders magnetic vectors only when imported vectors are supplied', () => {
    const document = createStarterStructure('bcc');
    expect(buildCrystalRenderModel(document, defaultRenderOptions).vectors).toHaveLength(0);

    const site = document.sites[0]!;
    const imported = [
      { siteId: site.id, start: [0, 0, 0] as Vec3, end: [0, 0, 0.5] as Vec3, label: 'Fe moment' },
    ];
    const withVectors = buildCrystalRenderModel(document, { ...defaultRenderOptions, magneticVectors: imported });
    expect(withVectors.vectors).toHaveLength(1);
    expect(withVectors.vectors[0]!.label).toBe('Fe moment');
  });
});
import { describe, expect, it } from 'vitest';
import { createStarterStructure } from '../../src/tools/crystal/document-engine';
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
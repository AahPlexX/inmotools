import { describe, expect, it } from 'vitest';
import {
  addCrystalSite,
  constrainCell,
  createEmptyCrystal,
  createStarterStructure,
  deleteCrystalSite,
  duplicateCrystalSite,
  setCrystalCell,
  updateCrystalSite,
  wrapCrystalSites,
} from '../../src/tools/crystal/document-engine';
import {
  commitCrystalHistory,
  createCrystalHistory,
  redoCrystalHistory,
  resetCrystalHistory,
  undoCrystalHistory,
} from '../../src/tools/crystal/history-engine';

const STARTERS = ['sc','bcc','fcc','diamond','nacl','cscl','zincblende','graphite','perovskite','rutile','fluorite','wurtzite','molecular'] as const;

describe('crystal document engine', () => {
  it('creates every starter with a valid cell, nonempty sites, and stable unique ids', () => {
    for (const id of STARTERS) {
      const first = createStarterStructure(id);
      const second = createStarterStructure(id);
      expect(first.sites.length, id).toBeGreaterThan(0);
      expect(new Set(first.sites.map((site) => site.id)).size, id).toBe(first.sites.length);
      expect(second.sites.map((site) => site.id), id).toEqual(first.sites.map((site) => site.id));
      expect(first.importedSnapshot?.sites).toEqual(first.sites);
    }
  });

  it('creates an empty editable crystal with a valid default cell', () => {
    const empty = createEmptyCrystal('My structure');
    expect(empty.name).toBe('My structure');
    expect(empty.sites).toEqual([]);
    expect(empty.cell).toEqual({ a: 10, b: 10, c: 10, alpha: 90, beta: 90, gamma: 90 });
  });

  it('wraps edited fractional sites into the reference cell without mutating the source', () => {
    const nacl = createStarterStructure('nacl');
    const siteId = nacl.sites[0]!.id;
    const shifted = updateCrystalSite(nacl, siteId, { fractional: [1.25, -0.1, 0.5] });
    const wrapped = wrapCrystalSites(shifted);
    expect(wrapped.sites[0]!.fractional[0]).toBeCloseTo(0.25, 12);
    expect(wrapped.sites[0]!.fractional[1]).toBeCloseTo(0.9, 12);
    expect(wrapped.sites[0]!.fractional[2]).toBeCloseTo(0.5, 12);
    expect(nacl.sites[0]!.fractional).not.toEqual(wrapped.sites[0]!.fractional);
  });

  it('adds, duplicates, updates, and deletes sites with immutable stable identities', () => {
    const start = createEmptyCrystal();
    const added = addCrystalSite(start, { label: 'C1', element: 'C', fractional: [0.1, 0.2, 0.3], occupancy: 1 });
    expect(start.sites).toHaveLength(0);
    expect(added.sites).toHaveLength(1);
    expect(added.sites[0]!.id).toBe('user-site-1');

    const duplicated = duplicateCrystalSite(added, added.sites[0]!.id);
    expect(duplicated.sites).toHaveLength(2);
    expect(duplicated.sites[1]!.id).toBe('user-site-2');

    const updated = updateCrystalSite(duplicated, duplicated.sites[1]!.id, { label: 'C2', occupancy: 0.5 });
    expect(updated.sites[1]!.label).toBe('C2');
    expect(updated.sites[1]!.occupancy).toBe(0.5);
    expect(duplicated.sites[1]!.label).toBe('C1');

    const deleted = deleteCrystalSite(updated, added.sites[0]!.id);
    expect(deleted.sites.map((site) => site.id)).toEqual(['user-site-2']);
  });

  it('rejects invalid cell and site edits without replacing the valid document', () => {
    const start = createStarterStructure('bcc');
    expect(() => setCrystalCell(start, { ...start.cell, a: 0 })).toThrow(/cell|length/i);
    expect(() => updateCrystalSite(start, start.sites[0]!.id, { occupancy: 1.5 })).toThrow(/occupancy/i);
    expect(() => updateCrystalSite(start, start.sites[0]!.id, { fractional: [Number.NaN, 0, 0] })).toThrow(/coordinate/i);
    expect(start.cell.a).toBeGreaterThan(0);
    expect(start.sites[0]!.occupancy).toBe(1);
  });

  it('keeps cubic lengths equal and angles orthogonal when a constrained length changes', () => {
    expect(constrainCell({ a:4, b:5, c:6, alpha:80, beta:90, gamma:100 }, 'cubic', 'a'))
      .toEqual({ a:4, b:4, c:4, alpha:90, beta:90, gamma:90 });
  });

  it('enforces hexagonal and conventional unique-b monoclinic metrics without changing unconstrained values', () => {
    expect(constrainCell({ a:3, b:4, c:5, alpha:88, beta:92, gamma:119 }, 'hexagonal', 'b'))
      .toEqual({ a:4, b:4, c:5, alpha:90, beta:90, gamma:120 });
    expect(constrainCell({ a:3, b:4, c:5, alpha:88, beta:102, gamma:91 }, 'monoclinic', 'beta'))
      .toEqual({ a:3, b:4, c:5, alpha:90, beta:102, gamma:90 });
  });

  it('uses rhombohedral axes for the trigonal constraint and leaves triclinic cells unchanged', () => {
    const source = { a:4, b:5, c:6, alpha:75, beta:80, gamma:85 } as const;
    expect(constrainCell(source, 'trigonal', 'gamma'))
      .toEqual({ a:4, b:4, c:4, alpha:85, beta:85, gamma:85 });
    expect(constrainCell(source, 'triclinic', 'gamma')).toEqual(source);
  });
});

describe('crystal history engine', () => {
  it('undoes, redoes, and resets to the imported snapshot', () => {
    const start = createStarterStructure('bcc');
    const history = createCrystalHistory(start);
    const changedDocument = setCrystalCell(start, { ...start.cell, a: start.cell.a + 1 });
    const changed = commitCrystalHistory(history, changedDocument);
    const undone = undoCrystalHistory(changed);
    const redone = redoCrystalHistory(undone);

    expect(undone.present.cell.a).toBe(start.cell.a);
    expect(redone.present.cell.a).toBe(start.cell.a + 1);
    expect(resetCrystalHistory(changed).present.cell).toEqual(start.cell);
  });

  it('caps history at 100 snapshots and clears redo after a new edit', () => {
    const start = createEmptyCrystal();
    let history = createCrystalHistory(start);
    for (let index = 1; index <= 105; index += 1) {
      history = commitCrystalHistory(history, setCrystalCell(history.present, { ...history.present.cell, a: 10 + index / 10 }));
    }
    expect(history.past).toHaveLength(100);

    const undone = undoCrystalHistory(history);
    expect(undone.future.length).toBeGreaterThan(0);
    const branched = commitCrystalHistory(undone, setCrystalCell(undone.present, { ...undone.present.cell, b: 12 }));
    expect(branched.future).toHaveLength(0);
  });
});
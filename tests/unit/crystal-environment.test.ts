import { describe, expect, it } from 'vitest';
import {
  addCrystalSite,
  createEmptyCrystal,
  createStarterStructure,
  setCrystalCell,
} from '../../src/tools/crystal/document-engine';
import {
  coordinationEnvironment,
  findHydrogenBondCandidates,
  findShortContacts,
  pairDistanceHistogram,
} from '../../src/tools/crystal/local-environment-engine';

function hydrogenBondFixture() {
  let document = setCrystalCell(createEmptyCrystal('Hydrogen bond fixture'), {
    a: 10,
    b: 10,
    c: 10,
    alpha: 90,
    beta: 90,
    gamma: 90,
  });
  document = addCrystalSite(document, {
    label: 'O1', element: 'O', fractional: [0.1, 0.5, 0.5], occupancy: 1,
  });
  document = addCrystalSite(document, {
    label: 'H1', element: 'H', fractional: [0.2, 0.5, 0.5], occupancy: 1,
  });
  return addCrystalSite(document, {
    label: 'O2', element: 'O', fractional: [0.42, 0.5, 0.5], occupancy: 1,
  });
}

function shortContactFixture() {
  let document = setCrystalCell(createEmptyCrystal('Short contact fixture'), {
    a: 10,
    b: 10,
    c: 10,
    alpha: 90,
    beta: 90,
    gamma: 90,
  });
  document = addCrystalSite(document, {
    label: 'C1', element: 'C', fractional: [0.1, 0.1, 0.1], occupancy: 1,
  });
  return addCrystalSite(document, {
    label: 'C2', element: 'C', fractional: [0.15, 0.1, 0.1], occupancy: 1,
  });
}

describe('Crystal local environment analysis', () => {
  it('reports eight first-shell neighbors for either BCC site', () => {
    const bcc = createStarterStructure('bcc');
    const environment = coordinationEnvironment(bcc, bcc.sites[1]!.id);

    expect(environment.coordinationNumber).toBe(8);
    expect(environment.shells[0]!.members).toHaveLength(8);
    expect(environment.shells[0]!.meanDistance).toBeCloseTo(environment.neighbors[0]!.distance, 8);
  });

  it('finds periodic short contacts from an explicit radius scale', () => {
    const contacts = findShortContacts(shortContactFixture(), 0.75);

    expect(contacts).toHaveLength(1);
    expect(contacts[0]!.distance).toBeCloseTo(0.5, 10);
    expect(contacts[0]!.threshold).toBeCloseTo((0.76 + 0.76) * 0.75, 10);
  });

  it('finds an O-H...O candidate only when distance and angle pass', () => {
    const document = hydrogenBondFixture();
    const accepted = findHydrogenBondCandidates(document, { maxHADistance: 2.5, minDhaAngle: 150 });
    const rejectedByAngle = findHydrogenBondCandidates(document, { maxHADistance: 2.5, minDhaAngle: 181 });

    expect(accepted).toHaveLength(1);
    expect(accepted[0]!.donorId).toBe(document.sites[0]!.id);
    expect(accepted[0]!.hydrogenId).toBe(document.sites[1]!.id);
    expect(accepted[0]!.acceptorId).toBe(document.sites[2]!.id);
    expect(accepted[0]!.hADistance).toBeCloseTo(2.2, 10);
    expect(accepted[0]!.dhaAngle).toBeCloseTo(180, 8);
    expect(rejectedByAngle).toEqual([]);
  });

  it('builds a bounded element-pair histogram without nonfinite bins', () => {
    const bins = pairDistanceHistogram(createStarterStructure('nacl'), {
      maxDistance: 5,
      binWidth: 0.1,
      pair: ['Na', 'Cl'],
    });

    expect(bins.length).toBe(50);
    expect(bins.reduce((sum, bin) => sum + bin.count, 0)).toBeGreaterThan(0);
    expect(bins.every((bin) => Number.isFinite(bin.center) && Number.isFinite(bin.count) && bin.count >= 0)).toBe(true);
  });

  it('rejects invalid analysis controls instead of silently coercing them', () => {
    const document = createStarterStructure('bcc');
    expect(() => coordinationEnvironment(document, 'missing-site')).toThrow(/site/i);
    expect(() => findShortContacts(document, 0)).toThrow(/scale/i);
    expect(() => findHydrogenBondCandidates(document, { maxHADistance: -1 })).toThrow(/distance/i);
    expect(() => pairDistanceHistogram(document, { maxDistance: 5, binWidth: 0 })).toThrow(/bin/i);
  });
});
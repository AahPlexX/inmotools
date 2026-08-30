import { describe, expect, it } from 'vitest';
import {
  findDuplicateClusters,
  jaroWinkler,
  levenshteinSimilarity,
  mergeCluster,
  phoneticKeys,
} from '../../src/tools/dedupe/dedupe-engine';

const rows = [
  { name: 'Steven Smith', company: 'North Shore Health', email: 'steven@example.com' },
  { name: 'Stephen Smith', company: 'Northshore Health', email: 'steven@example.com' },
  { name: 'Maria Gonzales', company: 'Acme Logistics', email: 'maria@acme.test' },
  { name: 'Marya Gonzalez', company: 'Acme Logistics', email: 'maria@acme.test' },
  { name: 'Completely Different', company: 'Elsewhere', email: 'other@example.test' },
];

describe('fuzzy deduplication engine', () => {
  it('provides bounded deterministic similarity scores', () => {
    expect(jaroWinkler('alpha', 'alpha')).toBe(1);
    expect(levenshteinSimilarity('alpha', 'alpha')).toBe(1);
    expect(jaroWinkler('martha', 'marhta')).toBeGreaterThan(0.9);
    expect(levenshteinSimilarity('kitten', 'sitting')).toBeGreaterThan(0.5);
    expect(jaroWinkler('alpha', 'zulu')).toBeLessThan(0.6);
  });

  it('uses Double Metaphone-compatible phonetic keys for equivalent-sounding names', () => {
    const steven = phoneticKeys('Steven');
    const stephen = phoneticKeys('Stephen');
    expect(steven.length).toBeGreaterThan(0);
    expect(steven.some((key) => stephen.includes(key))).toBe(true);
  });

  it('blocks candidates before scoring and returns stable duplicate clusters', () => {
    const config = {
      columns: [
        { column: 'name', weight: 0.45 },
        { column: 'company', weight: 0.25 },
        { column: 'email', weight: 0.3 },
      ],
      threshold: 0.82,
    };
    const first = findDuplicateClusters(rows, config);
    const second = findDuplicateClusters(rows, config);
    expect(first).toEqual(second);
    expect(first).toHaveLength(2);
    expect(first.map((cluster) => cluster.members.map((member) => member.index))).toEqual([[0, 1], [2, 3]]);
    expect(first.every((cluster) => cluster.confidence >= config.threshold)).toBe(true);
  });

  it('merges canonical values deterministically without mutating source rows', () => {
    const [cluster] = findDuplicateClusters(rows, {
      columns: [{ column: 'name', weight: 1 }],
      threshold: 0.8,
    });
    const before = structuredClone(rows);
    const merged = mergeCluster(cluster, { name: 1, company: 0, email: 0 });
    expect(merged).toMatchObject({ name: 'Stephen Smith', company: 'North Shore Health', email: 'steven@example.com' });
    expect(rows).toEqual(before);
  });
});

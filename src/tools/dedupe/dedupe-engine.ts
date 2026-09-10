import { doubleMetaphone } from 'double-metaphone';

export type DedupeRow = Record<string, unknown>;
export type DedupeColumn = { column: string; weight: number };
export type DedupeConfig = { columns: DedupeColumn[]; threshold: number };
export type DedupeMember = { index: number; row: DedupeRow };
export type DedupeCluster = { members: DedupeMember[]; confidence: number };

const normalize = (value: unknown) => String(value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');

export function levenshteinSimilarity(left: string, right: string): number {
  const a = normalize(left);
  const b = normalize(right);
  if (a === b) return 1;
  if (!a.length || !b.length) return 0;

  const previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= b.length; j += 1) {
      current[j] = Math.min(
        current[j - 1] + 1,
        previous[j] + 1,
        previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    for (let j = 0; j < current.length; j += 1) previous[j] = current[j];
  }
  return 1 - previous[b.length] / Math.max(a.length, b.length);
}

export function jaroWinkler(left: string, right: string): number {
  const a = normalize(left);
  const b = normalize(right);
  if (a === b) return 1;
  if (!a.length || !b.length) return 0;

  const range = Math.max(0, Math.floor(Math.max(a.length, b.length) / 2) - 1);
  const aMatches = new Array(a.length).fill(false);
  const bMatches = new Array(b.length).fill(false);
  let matches = 0;

  for (let i = 0; i < a.length; i += 1) {
    for (let j = Math.max(0, i - range); j < Math.min(i + range + 1, b.length); j += 1) {
      if (bMatches[j] || a[i] !== b[j]) continue;
      aMatches[i] = true;
      bMatches[j] = true;
      matches += 1;
      break;
    }
  }
  if (!matches) return 0;

  const matchedA = a.split('').filter((_, index) => aMatches[index]);
  const matchedB = b.split('').filter((_, index) => bMatches[index]);
  let transpositions = 0;
  for (let i = 0; i < matchedA.length; i += 1) if (matchedA[i] !== matchedB[i]) transpositions += 1;

  const jaro = (matches / a.length + matches / b.length + (matches - transpositions / 2) / matches) / 3;
  let prefix = 0;
  while (prefix < Math.min(4, a.length, b.length) && a[prefix] === b[prefix]) prefix += 1;
  return Math.min(1, jaro + prefix * 0.1 * (1 - jaro));
}

export function phoneticKeys(value: string): string[] {
  const keys = new Set<string>();
  for (const word of normalize(value).match(/[a-z]+/g) ?? []) {
    for (const key of doubleMetaphone(word)) if (key) keys.add(key);
  }
  return [...keys].sort();
}

function phoneticSimilarity(left: unknown, right: unknown): number {
  const rightKeys = new Set(phoneticKeys(String(right ?? '')));
  return phoneticKeys(String(left ?? '')).some((key) => rightKeys.has(key)) ? 1 : 0;
}

export function fieldSimilarity(column: string, left: unknown, right: unknown): number {
  const a = normalize(left);
  const b = normalize(right);
  if (!a && !b) return 0;
  if (!a || !b) return 0;
  const lexical = Math.max(jaroWinkler(a, b), levenshteinSimilarity(a, b));
  return /name/i.test(column) ? Math.max(lexical, phoneticSimilarity(a, b)) : lexical;
}

function isCandidate(left: DedupeRow, right: DedupeRow, config: DedupeConfig) {
  return config.columns.some(({ column, weight }) => (
    weight > 0
    && normalize(left[column])
    && normalize(right[column])
    && fieldSimilarity(column, left[column], right[column]) >= config.threshold
  ));
}

export function pairScore(left: DedupeRow, right: DedupeRow, config: DedupeConfig) {
  const totalWeight = config.columns.reduce((sum, item) => sum + Math.max(0, item.weight), 0) || 1;
  return config.columns.reduce(
    (sum, item) => sum + fieldSimilarity(item.column, left[item.column], right[item.column]) * Math.max(0, item.weight) / totalWeight,
    0,
  );
}

export function findDuplicateClusters(rows: DedupeRow[], config: DedupeConfig): DedupeCluster[] {
  const threshold = Math.max(0, Math.min(1, config.threshold));
  const normalizedConfig = { ...config, threshold };
  const parent = rows.map((_, index) => index);

  const find = (index: number): number => parent[index] === index ? index : (parent[index] = find(parent[index]));
  const union = (a: number, b: number) => {
    const rootA = find(a);
    const rootB = find(b);
    if (rootA !== rootB) parent[Math.max(rootA, rootB)] = Math.min(rootA, rootB);
  };

  for (let i = 0; i < rows.length; i += 1) {
    for (let j = i + 1; j < rows.length; j += 1) {
      if (!isCandidate(rows[i], rows[j], normalizedConfig)) continue;
      if (pairScore(rows[i], rows[j], normalizedConfig) >= threshold) union(i, j);
    }
  }

  const groups = new Map<number, number[]>();
  rows.forEach((_, index) => {
    const root = find(index);
    groups.set(root, [...(groups.get(root) ?? []), index]);
  });

  return [...groups.values()]
    .filter((indices) => indices.length > 1)
    .sort((a, b) => a[0] - b[0])
    .map((indices) => {
      const allPairScores: number[] = [];
      for (let i = 0; i < indices.length; i += 1) {
        for (let j = i + 1; j < indices.length; j += 1) {
          allPairScores.push(pairScore(rows[indices[i]], rows[indices[j]], normalizedConfig));
        }
      }
      return {
        members: indices.map((index) => ({ index, row: rows[index] })),
        // A cluster can be connected transitively. Report the weakest relationship
        // inside the whole cluster rather than only the links that formed it.
        confidence: Math.min(...allPairScores),
      };
    });
}

export function mergeCluster(cluster: DedupeCluster, choices: Record<string, number>): DedupeRow {
  const merged: DedupeRow = {};
  const keys = new Set(cluster.members.flatMap((member) => Object.keys(member.row)));
  for (const key of keys) {
    const explicit = choices[key];
    let position = Number.isInteger(explicit)
      ? Math.max(0, Math.min(cluster.members.length - 1, explicit))
      : cluster.members.findIndex((member) => normalize(member.row[key]).length > 0);
    if (position < 0) position = 0;
    merged[key] = cluster.members[position]?.row[key];
  }
  return merged;
}

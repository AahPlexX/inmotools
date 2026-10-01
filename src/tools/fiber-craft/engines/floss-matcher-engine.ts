import { differenceCiede2000, parse } from 'culori';

export interface FlossCatalogEntry {
  readonly brand: string;
  readonly code: string;
  readonly name: string;
  readonly hex: string;
}

export interface FlossMatch extends FlossCatalogEntry {
  readonly deltaE: number;
}

const difference = differenceCiede2000();

export const matchNearestFloss = (
  targetHex: string,
  catalog: readonly FlossCatalogEntry[],
): FlossMatch => {
  if (!parse(targetHex)) throw new Error('Target color is not a valid CSS color.');
  if (catalog.length === 0) throw new Error('Floss catalog is empty.');

  let best: FlossMatch | null = null;
  for (const entry of catalog) {
    if (!parse(entry.hex)) continue;
    const deltaE = difference(targetHex, entry.hex);
    if (!Number.isFinite(deltaE)) continue;
    if (!best || deltaE < best.deltaE) best = { ...entry, deltaE };
  }
  if (!best) throw new Error('Floss catalog has no valid colors.');
  return best;
};
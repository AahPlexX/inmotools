/**
 * Pure, framework-independent Boolean minimization: the Quine-McCluskey
 * method with exact prime-implicant selection (essential primes, then
 * Petrick's method for the rest), for functions of 2 to 5 variables, plus the
 * Karnaugh-map layout and grouping-loop geometry that visualizes the result.
 *
 * Bit convention: minterm index bit `i` is the value of `variables[i]`, the
 * same order the truth-table generator walks its rows in, so a table row's
 * mask *is* its minterm index.
 */

export const MIN_MINIMIZE_VARIABLES = 2;
export const MAX_MINIMIZE_VARIABLES = 5;

/**
 * A product term. `dash` marks the variables the term does not depend on
 * (eliminated by merging), `bits` gives the required value of every other
 * variable (dash positions are 0).
 */
export interface Implicant {
  readonly bits: number;
  readonly dash: number;
  /** Every minterm the term covers, including any don't-cares. */
  readonly covers: readonly number[];
}

export interface MinimizedForm {
  /** Every prime implicant found, in a stable order. */
  readonly primes: readonly Implicant[];
  /** Indexes into `primes` of the essential primes (the only cover of some required minterm). */
  readonly essential: readonly number[];
  /** Indexes into `primes` of the chosen cover, ascending. */
  readonly selected: readonly number[];
  readonly literalCount: number;
  /** False only if Petrick's expansion had to be truncated, in which case the cover is valid but not proven minimal. */
  readonly exact: boolean;
}

export interface MinimizationResult {
  readonly variables: readonly string[];
  /** Minterms where the function is 1. */
  readonly onset: readonly number[];
  /** Minterms where the function is 0. */
  readonly offset: readonly number[];
  readonly dontCares: readonly number[];
  /** Set when the function is constant over every specified row, so there is nothing to minimize. */
  readonly constant: 0 | 1 | undefined;
  readonly sop: MinimizedForm;
  readonly pos: MinimizedForm;
}

const popcount = (value: number): number => {
  let count = 0;
  for (let rest = value >>> 0; rest !== 0; rest &= rest - 1) count += 1;
  return count;
};

const literalsOf = (implicant: Implicant, variableCount: number): number => variableCount - popcount(implicant.dash);

const implicantKey = (bits: number, dash: number): string => `${dash}:${bits}`;

const coversOf = (bits: number, dash: number, variableCount: number): number[] => {
  const covers: number[] = [];
  for (let minterm = 0; minterm < 1 << variableCount; minterm += 1) {
    if ((minterm & ~dash) === bits) covers.push(minterm);
  }
  return covers;
};

// --- SECTION: prime implicants (Quine-McCluskey) ---

/**
 * Repeatedly merges terms that differ in exactly one variable (same dashes,
 * bit patterns one apart). A term that never merges is prime. Don't-cares take
 * part in merging, which is what lets them enlarge the groups.
 */
export const primeImplicants = (variableCount: number, minterms: readonly number[], dontCares: readonly number[] = []): Implicant[] => {
  let current = new Map<string, { bits: number; dash: number }>();
  for (const minterm of [...minterms, ...dontCares]) current.set(implicantKey(minterm, 0), { bits: minterm, dash: 0 });

  const primes = new Map<string, { bits: number; dash: number }>();
  while (current.size > 0) {
    const terms = [...current.values()];
    const merged = new Map<string, { bits: number; dash: number }>();
    const used = new Set<string>();
    for (let a = 0; a < terms.length; a += 1) {
      for (let b = a + 1; b < terms.length; b += 1) {
        const first = terms[a]!;
        const second = terms[b]!;
        if (first.dash !== second.dash) continue;
        const difference = first.bits ^ second.bits;
        if (popcount(difference) !== 1) continue;
        const dash = first.dash | difference;
        const bits = first.bits & ~difference;
        merged.set(implicantKey(bits, dash), { bits, dash });
        used.add(implicantKey(first.bits, first.dash));
        used.add(implicantKey(second.bits, second.dash));
      }
    }
    for (const term of terms) {
      const key = implicantKey(term.bits, term.dash);
      if (!used.has(key)) primes.set(key, term);
    }
    current = merged;
  }

  return [...primes.values()]
    .map((term) => ({ bits: term.bits, dash: term.dash, covers: coversOf(term.bits, term.dash, variableCount) }))
    .sort((left, right) => left.dash - right.dash || left.bits - right.bits);
};

// --- SECTION: exact cover selection ---

/** Petrick's expansion stops keeping every product beyond this many, falling back to the smallest ones. */
const PETRICK_PRODUCT_LIMIT = 4000;

interface CoverChoice {
  readonly selected: number[];
  readonly exact: boolean;
}

/**
 * Chooses which primes to use. Essential primes are forced; the leftover
 * minterms are covered by Petrick's method, which enumerates every minimal
 * combination so the true optimum (fewest terms, then fewest literals) can be
 * picked. Ties break toward lower prime indexes so the answer is deterministic.
 */
const chooseCover = (variableCount: number, primes: readonly Implicant[], required: readonly number[]): CoverChoice & { essential: number[] } => {
  const coveringPrimes = new Map<number, number[]>();
  for (const minterm of required) coveringPrimes.set(minterm, []);
  primes.forEach((prime, index) => {
    for (const minterm of prime.covers) coveringPrimes.get(minterm)?.push(index);
  });

  const essential = new Set<number>();
  for (const candidates of coveringPrimes.values()) {
    if (candidates.length === 1) essential.add(candidates[0]!);
  }

  const covered = new Set<number>();
  for (const index of essential) for (const minterm of primes[index]!.covers) covered.add(minterm);
  const remaining = required.filter((minterm) => !covered.has(minterm));
  if (remaining.length === 0) return { essential: [...essential].sort((a, b) => a - b), selected: [...essential].sort((a, b) => a - b), exact: true };

  // Petrick: the cover must satisfy, for every remaining minterm, "one of the primes covering it".
  // Each product is a bitmask over prime indexes; absorption drops any product that contains another.
  let products: bigint[] = [0n];
  let exact = true;
  for (const minterm of remaining) {
    const options = (coveringPrimes.get(minterm) ?? []).filter((index) => !essential.has(index));
    const next = new Set<bigint>();
    for (const product of products) {
      for (const option of options) next.add(product | (1n << BigInt(option)));
    }
    let expanded = [...next];
    expanded.sort((left, right) => bitCount(left) - bitCount(right) || (left < right ? -1 : left > right ? 1 : 0));
    const kept: bigint[] = [];
    for (const product of expanded) {
      if (!kept.some((existing) => (existing & product) === existing)) kept.push(product);
    }
    if (kept.length > PETRICK_PRODUCT_LIMIT) {
      exact = false;
      kept.length = PETRICK_PRODUCT_LIMIT;
    }
    expanded = kept;
    products = expanded;
  }

  let best: number[] | undefined;
  let bestScore: readonly [number, number] | undefined;
  for (const product of products) {
    const indexes = [...essential, ...bitIndexes(product)].sort((a, b) => a - b);
    const score: readonly [number, number] = [indexes.length, indexes.reduce((total, index) => total + literalsOf(primes[index]!, variableCount), 0)];
    if (!bestScore || score[0] < bestScore[0] || (score[0] === bestScore[0] && score[1] < bestScore[1])) {
      best = indexes;
      bestScore = score;
    }
  }
  return { essential: [...essential].sort((a, b) => a - b), selected: best ?? [...essential].sort((a, b) => a - b), exact };
};

const bitCount = (value: bigint): number => {
  let count = 0;
  for (let rest = value; rest > 0n; rest &= rest - 1n) count += 1;
  return count;
};

const bitIndexes = (value: bigint): number[] => {
  const indexes: number[] = [];
  for (let index = 0; value >> BigInt(index) > 0n; index += 1) {
    if ((value >> BigInt(index)) & 1n) indexes.push(index);
  }
  return indexes;
};

const minimizeForm = (variableCount: number, required: readonly number[], dontCares: readonly number[]): MinimizedForm => {
  if (required.length === 0) return { primes: [], essential: [], selected: [], literalCount: 0, exact: true };
  const primes = primeImplicants(variableCount, required, dontCares);
  const choice = chooseCover(variableCount, primes, required);
  return {
    primes,
    essential: choice.essential,
    selected: choice.selected,
    literalCount: choice.selected.reduce((total, index) => total + literalsOf(primes[index]!, variableCount), 0),
    exact: choice.exact,
  };
};

/**
 * Minimizes a function given as a list of 1-minterms (and optional
 * don't-cares) over 2-5 named variables. Both the sum-of-products and the
 * product-of-sums forms are produced: the product of sums minimizes the
 * function's zeros and complements the result.
 */
export const minimize = (variables: readonly string[], minterms: readonly number[], dontCares: readonly number[] = []): MinimizationResult => {
  const count = variables.length;
  if (count < MIN_MINIMIZE_VARIABLES || count > MAX_MINIMIZE_VARIABLES) {
    throw new RangeError(`Minimization supports ${MIN_MINIMIZE_VARIABLES} to ${MAX_MINIMIZE_VARIABLES} variables; this function has ${count}.`);
  }
  const size = 1 << count;
  const valid = (value: number): boolean => Number.isInteger(value) && value >= 0 && value < size;
  if (![...minterms, ...dontCares].every(valid)) throw new RangeError(`Minterm indexes must be integers from 0 to ${size - 1}.`);

  const dontCareSet = new Set(dontCares);
  const onset = [...new Set(minterms)].filter((minterm) => !dontCareSet.has(minterm)).sort((a, b) => a - b);
  const onsetSet = new Set(onset);
  const offset = Array.from({ length: size }, (_, index) => index).filter((index) => !onsetSet.has(index) && !dontCareSet.has(index));
  const dontCareList = [...dontCareSet].sort((a, b) => a - b);

  const constant: 0 | 1 | undefined = onset.length === 0 ? 0 : offset.length === 0 ? 1 : undefined;
  const sop = constant === undefined ? minimizeForm(count, onset, dontCareList) : { primes: [], essential: [], selected: [], literalCount: 0, exact: true };
  const pos = constant === undefined ? minimizeForm(count, offset, dontCareList) : { primes: [], essential: [], selected: [], literalCount: 0, exact: true };
  return { variables: [...variables], onset, offset, dontCares: dontCareList, constant, sop, pos };
};

// --- SECTION: text forms ---

export interface Literal {
  readonly variable: string;
  readonly negated: boolean;
}

/** The literals of a product term of the function, in variable order: a 0 bit is a complemented variable. */
export const productLiterals = (variables: readonly string[], implicant: Implicant): Literal[] =>
  variables.flatMap((variable, index) => ((implicant.dash >> index) & 1 ? [] : [{ variable, negated: ((implicant.bits >> index) & 1) === 0 }]));

/**
 * The literals of a sum term of the function. The implicant here is a term of
 * the complement, so each literal flips: a variable that is 1 in the
 * complement's product appears complemented in the sum.
 */
export const sumLiterals = (variables: readonly string[], implicant: Implicant): Literal[] =>
  variables.flatMap((variable, index) => ((implicant.dash >> index) & 1 ? [] : [{ variable, negated: ((implicant.bits >> index) & 1) === 1 }]));

const literalText = (literal: Literal): string => (literal.negated ? `${literal.variable}'` : literal.variable);

export const formatSopMinimized = (result: MinimizationResult, outputLabel: string): string => {
  if (result.constant !== undefined) return `${outputLabel} = ${result.constant}`;
  const terms = result.sop.selected.map((index) => productLiterals(result.variables, result.sop.primes[index]!).map(literalText).join(''));
  return `${outputLabel} = ${terms.join(' + ')}`;
};

export const formatPosMinimized = (result: MinimizationResult, outputLabel: string): string => {
  if (result.constant !== undefined) return `${outputLabel} = ${result.constant}`;
  const terms = result.pos.selected.map((index) => `(${sumLiterals(result.variables, result.pos.primes[index]!).map(literalText).join(' + ')})`);
  return `${outputLabel} = ${terms.join('')}`;
};

/** Evaluates a chosen cover at one minterm, for callers that want to prove it equals the original function. */
export const evaluateCover = (form: MinimizedForm, minterm: number): boolean => form.selected.some((index) => form.primes[index]!.covers.includes(minterm));

// --- SECTION: Karnaugh map layout ---

/** Gray-code order of `bits` bits, so neighbouring rows and columns differ in one variable. */
export const grayCodes = (bits: number): number[] => Array.from({ length: 1 << bits }, (_, index) => index ^ (index >> 1));

export interface KarnaughLayout {
  readonly variableCount: number;
  readonly layers: number;
  readonly rows: number;
  readonly cols: number;
  /**
   * Variable indexes (into `variables`) that vary down the rows, and across the columns, most
   * significant first: the first listed variable is the leftmost character of a header code, so
   * a header reads `AB = 00, 01, 11, 10` the way a textbook map does.
   */
  readonly rowVariables: readonly number[];
  readonly colVariables: readonly number[];
  /** The fifth variable selecting the layer, when there are five. */
  readonly layerVariable: number | undefined;
  readonly rowCodes: readonly number[];
  readonly colCodes: readonly number[];
}

/**
 * Variables are dealt across columns first, then rows, then a layer: the
 * columns take variables 0-1, the rows take 2-3, and a fifth variable picks
 * one of two 4x4 layers, so any variable count from 2 to 5 has a layout in
 * which each cell's neighbours differ in exactly one variable.
 */
export const karnaughLayout = (variableCount: number): KarnaughLayout => {
  if (variableCount < MIN_MINIMIZE_VARIABLES || variableCount > MAX_MINIMIZE_VARIABLES) {
    throw new RangeError(`A Karnaugh map covers ${MIN_MINIMIZE_VARIABLES} to ${MAX_MINIMIZE_VARIABLES} variables; got ${variableCount}.`);
  }
  const colBits = Math.min(2, Math.ceil(variableCount / 2));
  const rowBits = Math.min(2, variableCount - colBits);
  const colVariables = Array.from({ length: colBits }, (_, index) => index);
  const rowVariables = Array.from({ length: rowBits }, (_, index) => colBits + index);
  return {
    variableCount,
    layers: variableCount === 5 ? 2 : 1,
    rows: 1 << rowBits,
    cols: 1 << colBits,
    rowVariables,
    colVariables,
    layerVariable: variableCount === 5 ? 4 : undefined,
    rowCodes: grayCodes(rowBits),
    colCodes: grayCodes(colBits),
  };
};

/** The header text of a row or column code: one character per variable, most significant first. */
export const codeLabel = (code: number, variableCount: number): string =>
  Array.from({ length: variableCount }, (_, position) => String((code >> (variableCount - 1 - position)) & 1)).join('');

/** The minterm index shown in a map cell. */
export const cellMinterm = (layout: KarnaughLayout, layer: number, row: number, col: number): number => {
  let minterm = 0;
  const colBits = layout.colVariables.length;
  const rowBits = layout.rowVariables.length;
  layout.colVariables.forEach((variable, position) => {
    if ((layout.colCodes[col]! >> (colBits - 1 - position)) & 1) minterm |= 1 << variable;
  });
  layout.rowVariables.forEach((variable, position) => {
    if ((layout.rowCodes[row]! >> (rowBits - 1 - position)) & 1) minterm |= 1 << variable;
  });
  if (layout.layerVariable !== undefined && layer === 1) minterm |= 1 << layout.layerVariable;
  return minterm;
};

export interface KarnaughCell {
  readonly layer: number;
  readonly row: number;
  readonly col: number;
  readonly minterm: number;
}

export const karnaughCells = (layout: KarnaughLayout): KarnaughCell[] => {
  const cells: KarnaughCell[] = [];
  for (let layer = 0; layer < layout.layers; layer += 1) {
    for (let row = 0; row < layout.rows; row += 1) {
      for (let col = 0; col < layout.cols; col += 1) cells.push({ layer, row, col, minterm: cellMinterm(layout, layer, row, col) });
    }
  }
  return cells;
};

/**
 * One rectangular piece of a grouping loop. A loop that wraps around a map
 * edge is drawn as two pieces; the `open*` flags mark the sides where the loop
 * continues off the edge, so they can be drawn without a border there.
 */
export interface LoopPiece {
  readonly layer: number;
  readonly row: number;
  readonly col: number;
  readonly rowSpan: number;
  readonly colSpan: number;
  readonly openTop: boolean;
  readonly openBottom: boolean;
  readonly openLeft: boolean;
  readonly openRight: boolean;
}

/** The cyclic interval of `size` positions that exactly matches `positions`, as (start, length). */
const cyclicInterval = (positions: readonly number[], size: number): { start: number; length: number } => {
  const set = new Set(positions);
  if (set.size === size) return { start: 0, length: size };
  for (let start = 0; start < size; start += 1) {
    let ok = true;
    for (let offset = 0; offset < set.size; offset += 1) {
      if (!set.has((start + offset) % size)) {
        ok = false;
        break;
      }
    }
    if (ok) return { start, length: set.size };
  }
  return { start: Math.min(...positions), length: set.size };
};

/** The rectangles (per layer, split at map edges) that outline one implicant on the map. */
export const loopPieces = (layout: KarnaughLayout, implicant: Implicant): LoopPiece[] => {
  const byLayer = new Map<number, { rows: Set<number>; cols: Set<number> }>();
  for (const cell of karnaughCells(layout)) {
    if (!implicant.covers.includes(cell.minterm)) continue;
    const entry = byLayer.get(cell.layer) ?? { rows: new Set<number>(), cols: new Set<number>() };
    entry.rows.add(cell.row);
    entry.cols.add(cell.col);
    byLayer.set(cell.layer, entry);
  }

  const pieces: LoopPiece[] = [];
  for (const [layer, { rows, cols }] of [...byLayer.entries()].sort((a, b) => a[0] - b[0])) {
    const rowInterval = cyclicInterval([...rows], layout.rows);
    const colInterval = cyclicInterval([...cols], layout.cols);
    const rowSegments = splitInterval(rowInterval.start, rowInterval.length, layout.rows);
    const colSegments = splitInterval(colInterval.start, colInterval.length, layout.cols);
    for (const rowSegment of rowSegments) {
      for (const colSegment of colSegments) {
        pieces.push({
          layer,
          row: rowSegment.start,
          col: colSegment.start,
          rowSpan: rowSegment.length,
          colSpan: colSegment.length,
          openTop: rowSegments.length === 2 && rowSegment.start !== rowInterval.start,
          openBottom: rowSegments.length === 2 && rowSegment.start === rowInterval.start,
          openLeft: colSegments.length === 2 && colSegment.start !== colInterval.start,
          openRight: colSegments.length === 2 && colSegment.start === colInterval.start,
        });
      }
    }
  }
  return pieces;
};

/** Splits a cyclic interval into one or two linear pieces at the map edge. */
const splitInterval = (start: number, length: number, size: number): { start: number; length: number }[] => {
  if (start + length <= size) return [{ start, length }];
  const head = size - start;
  return [{ start, length: head }, { start: 0, length: length - head }];
};

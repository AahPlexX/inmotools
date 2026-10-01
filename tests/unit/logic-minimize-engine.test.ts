import { describe, expect, it } from 'vitest';
import {
  cellMinterm,
  codeLabel,
  evaluateCover,
  formatPosMinimized,
  formatSopMinimized,
  grayCodes,
  karnaughCells,
  karnaughLayout,
  loopPieces,
  minimize,
  primeImplicants,
  productLiterals,
  sumLiterals,
  type Implicant,
  type MinimizationResult,
} from '../../src/tools/logic/minimize-engine';

const names = (count: number): string[] => ['A', 'B', 'C', 'D', 'E'].slice(0, count);

/** A small deterministic generator so the randomized checks are reproducible. */
const lcg = (seed: number) => {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
};

const truthFrom = (count: number, mask: number): number[] => Array.from({ length: 1 << count }, (_, index) => index).filter((index) => (mask >> index) & 1);

const assertExact = (result: MinimizationResult) => {
  const size = 1 << result.variables.length;
  for (let minterm = 0; minterm < size; minterm += 1) {
    if (result.dontCares.includes(minterm)) continue;
    const wanted = result.onset.includes(minterm);
    expect(evaluateCover(result.sop, minterm), `SOP at ${minterm}`).toBe(wanted);
    // The product of sums is 1 wherever the complement's cover is 0.
    expect(!evaluateCover(result.pos, minterm), `POS at ${minterm}`).toBe(wanted);
  }
};

/** The fewest terms (then literals) over every subset of primes that covers the onset. */
const bruteForceBest = (result: MinimizationResult): readonly [number, number] | undefined => {
  const { primes } = result.sop;
  if (primes.length > 14) return undefined;
  let best: [number, number] | undefined;
  for (let subset = 1; subset < 1 << primes.length; subset += 1) {
    const chosen = primes.filter((_, index) => (subset >> index) & 1);
    if (!result.onset.every((minterm) => chosen.some((prime) => prime.covers.includes(minterm)))) continue;
    const cost: [number, number] = [chosen.length, chosen.reduce((total, prime) => total + result.variables.length - Math.log2(prime.covers.length), 0)];
    if (!best || cost[0] < best[0] || (cost[0] === best[0] && cost[1] < best[1])) best = cost;
  }
  return best;
};

describe('Quine-McCluskey prime implicants', () => {
  it('finds the prime implicants of a textbook 4-variable function', () => {
    // f(A,B,C,D) = sum(0,1,2,5,6,7,8,9,10,14)
    const primes = primeImplicants(4, [0, 1, 2, 5, 6, 7, 8, 9, 10, 14]);
    const shapes = primes.map((prime) => [...prime.covers].join(','));
    expect(shapes).toContain('0,1,8,9');
    expect(shapes).toContain('0,2,8,10');
    expect(shapes).toContain('2,6,10,14');
    expect(shapes).toContain('1,5');
    expect(shapes).toContain('5,7');
    expect(shapes).toContain('6,7');
    expect(primes).toHaveLength(6);
  });

  it('lets a don\'t-care merge into a larger group without becoming required', () => {
    const withoutDc = primeImplicants(3, [1]);
    const withDc = primeImplicants(3, [1], [3]);
    expect(withoutDc[0]!.covers).toEqual([1]);
    expect(withDc.some((prime) => prime.covers.join(',') === '1,3')).toBe(true);
  });

  it('returns nothing for an empty function and one full-cube prime for a tautology', () => {
    expect(primeImplicants(3, [])).toEqual([]);
    const all = primeImplicants(3, [0, 1, 2, 3, 4, 5, 6, 7]);
    expect(all).toHaveLength(1);
    expect(all[0]!.covers).toHaveLength(8);
  });
});

describe('minimization', () => {
  it('reduces XOR to its two irredundant terms and gives the matching product of sums', () => {
    const result = minimize(['A', 'B'], [1, 2]);
    expect(formatSopMinimized(result, 'Y').split(' = ')[1]!.split(' + ').sort()).toEqual(["A'B", "AB'"]);
    const product = formatPosMinimized(result, 'Y').split(' = ')[1]!;
    expect(product.match(/\([^)]*\)/g)!.sort()).toEqual(["(A + B)", "(A' + B')"]);
  });

  it('reduces the 3-input majority function to three 2-literal terms', () => {
    const result = minimize(names(3), [3, 5, 6, 7]);
    expect(result.sop.selected).toHaveLength(3);
    expect(result.sop.literalCount).toBe(6);
    expect(formatSopMinimized(result, 'M').split(' = ')[1]!.split(' + ').sort()).toEqual(['AB', 'AC', 'BC']);
  });

  it('marks essential primes and chooses the minimum cover for the textbook function', () => {
    const result = minimize(names(4), [0, 1, 2, 5, 6, 7, 8, 9, 10, 14]);
    expect(result.sop.essential.length).toBeGreaterThan(0);
    // B'C' + CD' + A'BD: three terms, seven literals.
    expect(result.sop.selected).toHaveLength(3);
    expect(result.sop.literalCount).toBe(7);
    expect(result.sop.exact).toBe(true);
    assertExact(result);
  });

  it('breaks a cyclic (no-essential-prime) cover with Petrick\'s method to the true minimum', () => {
    // A 3-variable cycle: every minterm has two covering primes, so nothing is essential.
    const result = minimize(names(3), [0, 1, 3, 7, 6, 4]);
    expect(result.sop.essential).toHaveLength(0);
    expect(result.sop.selected).toHaveLength(3);
    assertExact(result);
  });

  it('uses don\'t-cares to shrink the cover and never requires covering them', () => {
    const without = minimize(names(4), [4, 8, 10, 11, 12, 15]);
    const withDc = minimize(names(4), [4, 8, 10, 11, 12, 15], [9, 14]);
    expect(withDc.sop.literalCount).toBeLessThanOrEqual(without.sop.literalCount);
    expect(withDc.dontCares).toEqual([9, 14]);
    assertExact(withDc);
  });

  it('reports a constant function instead of minimizing', () => {
    const zero = minimize(names(3), []);
    expect(zero.constant).toBe(0);
    expect(formatSopMinimized(zero, 'Y')).toBe('Y = 0');
    expect(formatPosMinimized(zero, 'Y')).toBe('Y = 0');
    const one = minimize(names(3), [0, 1, 2, 3, 4, 5, 6, 7]);
    expect(one.constant).toBe(1);
    expect(formatSopMinimized(one, 'Y')).toBe('Y = 1');
    // A single specified 1 with everything else don't-care is also constant 1.
    expect(minimize(names(2), [3], [0, 1, 2]).constant).toBe(1);
  });

  it('ignores duplicate minterms and treats a don\'t-care listed as a minterm as a don\'t-care', () => {
    const result = minimize(names(3), [1, 1, 3, 3], [3]);
    expect(result.onset).toEqual([1]);
    expect(result.dontCares).toEqual([3]);
  });

  it('rejects unsupported variable counts and out-of-range minterms', () => {
    expect(() => minimize(['A'], [1])).toThrow(RangeError);
    expect(() => minimize(names(5).concat('F'), [1])).toThrow(RangeError);
    expect(() => minimize(names(3), [8])).toThrow(RangeError);
    expect(() => minimize(names(3), [-1])).toThrow(RangeError);
    expect(() => minimize(names(3), [1.5])).toThrow(RangeError);
  });

  it('is exactly correct and minimal for every 2- and 3-variable function', () => {
    for (const count of [2, 3]) {
      for (let mask = 0; mask < 1 << (1 << count); mask += 1) {
        const result = minimize(names(count), truthFrom(count, mask));
        if (result.constant !== undefined) continue;
        assertExact(result);
        const best = bruteForceBest(result);
        if (best) expect([result.sop.selected.length, result.sop.literalCount]).toEqual(best);
      }
    }
  });

  it('is exactly correct for seeded random 4- and 5-variable functions, with and without don\'t-cares', () => {
    const random = lcg(20260929);
    for (const count of [4, 5]) {
      for (let trial = 0; trial < (count === 4 ? 150 : 60); trial += 1) {
        const size = 1 << count;
        const onset: number[] = [];
        const dontCares: number[] = [];
        for (let minterm = 0; minterm < size; minterm += 1) {
          const roll = random();
          if (roll < 0.4) onset.push(minterm);
          else if (trial % 3 === 0 && roll < 0.55) dontCares.push(minterm);
        }
        const result = minimize(names(count), onset, dontCares);
        if (result.constant !== undefined) continue;
        assertExact(result);
        expect(result.sop.exact).toBe(true);
        if (count === 4) {
          const best = bruteForceBest(result);
          if (best) expect([result.sop.selected.length, result.sop.literalCount]).toEqual(best);
        }
      }
    }
  });

  it('selects only primes that exist and lists them in ascending index order', () => {
    const result = minimize(names(4), [0, 1, 2, 5, 6, 7, 8, 9, 10, 14]);
    const { selected, primes } = result.sop;
    expect(selected.every((index) => index >= 0 && index < primes.length)).toBe(true);
    expect([...selected].sort((a, b) => a - b)).toEqual(selected);
    expect(new Set(selected).size).toBe(selected.length);
  });

  it('builds product and sum literals in variable order', () => {
    const implicant: Implicant = { bits: 0b010, dash: 0b100, covers: [2, 6] };
    expect(productLiterals(names(3), implicant)).toEqual([{ variable: 'A', negated: true }, { variable: 'B', negated: false }]);
    expect(sumLiterals(names(3), implicant)).toEqual([{ variable: 'A', negated: false }, { variable: 'B', negated: true }]);
  });
});

describe('Karnaugh map layout', () => {
  it('produces Gray-code orderings', () => {
    expect(grayCodes(1)).toEqual([0, 1]);
    expect(grayCodes(2)).toEqual([0, 1, 3, 2]);
    expect(grayCodes(3)).toEqual([0, 1, 3, 2, 6, 7, 5, 4]);
  });

  it.each([[2, 1, 2, 2], [3, 1, 2, 4], [4, 1, 4, 4], [5, 2, 4, 4]])('sizes the %i-variable map', (count, layers, rows, cols) => {
    const layout = karnaughLayout(count);
    expect([layout.layers, layout.rows, layout.cols]).toEqual([layers, rows, cols]);
    expect(layout.layerVariable).toBe(count === 5 ? 4 : undefined);
  });

  it.each([2, 3, 4, 5])('places every minterm of a %i-variable function in exactly one cell', (count) => {
    const layout = karnaughLayout(count);
    const minterms = karnaughCells(layout).map((cell) => cell.minterm).sort((a, b) => a - b);
    expect(minterms).toEqual(Array.from({ length: 1 << count }, (_, index) => index));
  });

  it.each([2, 3, 4, 5])('makes neighbouring cells (including across the map edge) differ in one variable for %i variables', (count) => {
    const layout = karnaughLayout(count);
    const differsByOneBit = (a: number, b: number) => {
      const x = a ^ b;
      return x !== 0 && (x & (x - 1)) === 0;
    };
    for (let layer = 0; layer < layout.layers; layer += 1) {
      for (let row = 0; row < layout.rows; row += 1) {
        for (let col = 0; col < layout.cols; col += 1) {
          const here = cellMinterm(layout, layer, row, col);
          if (layout.cols > 1) expect(differsByOneBit(here, cellMinterm(layout, layer, row, (col + 1) % layout.cols))).toBe(true);
          if (layout.rows > 1) expect(differsByOneBit(here, cellMinterm(layout, layer, (row + 1) % layout.rows, col))).toBe(true);
        }
      }
    }
    if (layout.layers === 2) expect(cellMinterm(layout, 0, 1, 1) ^ cellMinterm(layout, 1, 1, 1)).toBe(16);
  });

  it('labels headers most significant variable first, in the textbook Gray order', () => {
    const layout = karnaughLayout(4);
    expect(layout.colCodes.map((code) => codeLabel(code, layout.colVariables.length))).toEqual(['00', '01', '11', '10']);
    expect(codeLabel(0b10, 2)).toBe('10');
    expect(codeLabel(1, 1)).toBe('1');
    // Column 01 means A=0, B=1, so with C=D=0 that cell is minterm 2 (B is variable 1).
    expect(cellMinterm(layout, 0, 0, 1)).toBe(2);
    // Row 01 means C=0, D=1: minterm 8 (D is variable 3) in column 00.
    expect(cellMinterm(layout, 0, 1, 0)).toBe(8);
  });

  it('rejects unsupported variable counts', () => {
    expect(() => karnaughLayout(1)).toThrow(RangeError);
    expect(() => karnaughLayout(6)).toThrow(RangeError);
  });
});

describe('grouping loops', () => {
  const cellsOf = (pieces: ReturnType<typeof loopPieces>) => {
    const seen: string[] = [];
    for (const piece of pieces) {
      for (let row = piece.row; row < piece.row + piece.rowSpan; row += 1) {
        for (let col = piece.col; col < piece.col + piece.colSpan; col += 1) seen.push(`${piece.layer}:${row}:${col}`);
      }
    }
    return seen;
  };
  const expectedCells = (count: number, implicant: Implicant) => {
    const layout = karnaughLayout(count);
    return karnaughCells(layout).filter((cell) => implicant.covers.includes(cell.minterm)).map((cell) => `${cell.layer}:${cell.row}:${cell.col}`);
  };

  it('outlines a plain rectangle as one closed piece', () => {
    // Minterms 0, 2, 8, 10 vary B and D, which are adjacent in Gray order on both axes: one solid block.
    const implicant = primeImplicants(4, [0, 2, 8, 10]).find((prime) => prime.covers.length === 4)!;
    const pieces = loopPieces(karnaughLayout(4), implicant);
    expect(pieces).toHaveLength(1);
    expect([pieces[0]!.openTop, pieces[0]!.openBottom, pieces[0]!.openLeft, pieces[0]!.openRight]).toEqual([false, false, false, false]);
  });

  it('splits a loop that wraps the map edge into pieces that together cover exactly its cells', () => {
    // The four corners of a 4-variable map are one loop: minterms 0, 1, 4, 5 (A and C varying).
    const corners = primeImplicants(4, [0, 1, 4, 5]).find((prime) => prime.covers.length === 4)!;
    const pieces = loopPieces(karnaughLayout(4), corners);
    expect(pieces).toHaveLength(4);
    expect(cellsOf(pieces).sort()).toEqual(expectedCells(4, corners).sort());
    expect(pieces.some((piece) => piece.openLeft || piece.openRight)).toBe(true);
    expect(pieces.some((piece) => piece.openTop || piece.openBottom)).toBe(true);
  });

  it('draws a group that spans both layers of a 5-variable map on each layer', () => {
    const implicant = primeImplicants(5, [1, 17]).find((prime) => prime.covers.length === 2)!;
    const pieces = loopPieces(karnaughLayout(5), implicant);
    expect(new Set(pieces.map((piece) => piece.layer))).toEqual(new Set([0, 1]));
    expect(cellsOf(pieces).sort()).toEqual(expectedCells(5, implicant).sort());
  });

  it('never overlaps its own pieces, whatever the group', () => {
    for (const count of [2, 3, 4, 5]) {
      const size = 1 << count;
      const all = Array.from({ length: size }, (_, index) => index);
      for (const prime of primeImplicants(count, all)) {
        const cells = cellsOf(loopPieces(karnaughLayout(count), prime));
        expect(new Set(cells).size).toBe(cells.length);
      }
    }
    for (const prime of primeImplicants(4, [0, 1, 2, 5, 6, 7, 8, 9, 10, 14])) {
      const cells = cellsOf(loopPieces(karnaughLayout(4), prime));
      expect(cells.sort()).toEqual(expectedCells(4, prime).sort());
    }
  });
});

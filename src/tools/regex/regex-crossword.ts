export interface RegexCrosswordPuzzle {
  readonly id: string;
  readonly title: string;
  readonly size: number;
  readonly rowPatterns: readonly string[];
  readonly columnPatterns: readonly string[];
  readonly solution: readonly string[];
}

export interface RegexCrosswordAxisResult {
  readonly index: number;
  readonly pattern: string;
  readonly value: string;
  readonly passed: boolean;
}

export interface RegexCrosswordResult {
  readonly complete: boolean;
  readonly rows: readonly RegexCrosswordAxisResult[];
  readonly columns: readonly RegexCrosswordAxisResult[];
}

const PUZZLES: readonly RegexCrosswordPuzzle[] = [
  { id:'word-square-1', title:'Three-way word square', size:3, rowPatterns:['^C[AO]T$','^A[RL]E$','^R[EA]D$'], columnPatterns:['^CAR$','^ARE$','^TED$'], solution:['C','A','T','A','R','E','R','E','D'] },
  { id:'word-square-2', title:'Animals and actions', size:3, rowPatterns:['^D[OA]G$','^O[NM]E$','^G[EA]T$'], columnPatterns:['^DOG$','^ONE$','^GET$'], solution:['D','O','G','O','N','E','G','E','T'] },
  { id:'word-square-3', title:'Symmetric words', size:3, rowPatterns:['^S[AO]T$','^A[RL]E$','^T[EA]N$'], columnPatterns:['^SAT$','^ARE$','^TEN$'], solution:['S','A','T','A','R','E','T','E','N'] },
];

export const buildRegexCrossword = (seed = 0): RegexCrosswordPuzzle => PUZZLES[Math.abs(Math.trunc(seed)) % PUZZLES.length]!;

const matches = (pattern: string, value: string) => {
  try { return new RegExp(pattern).test(value); } catch { return false; }
};

export const validateRegexCrossword = (puzzle: RegexCrosswordPuzzle, rawCells: readonly string[]): RegexCrosswordResult => {
  const count = puzzle.size * puzzle.size;
  const cells = Array.from({ length: count }, (_, index) => (rawCells[index] ?? '').slice(0, 1).toUpperCase());
  const rows = puzzle.rowPatterns.map((pattern, index) => {
    const value = cells.slice(index * puzzle.size, (index + 1) * puzzle.size).join('');
    return { index, pattern, value, passed: value.length === puzzle.size && matches(pattern, value) };
  });
  const columns = puzzle.columnPatterns.map((pattern, index) => {
    const value = Array.from({ length: puzzle.size }, (_, row) => cells[row * puzzle.size + index] ?? '').join('');
    return { index, pattern, value, passed: value.length === puzzle.size && matches(pattern, value) };
  });
  return { complete: cells.every(Boolean) && rows.every((row) => row.passed) && columns.every((column) => column.passed), rows, columns };
};

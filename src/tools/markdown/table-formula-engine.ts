import type { FormulaCellValue, TableFormulaGrid, TableFormulaResult } from './markdown-types';

// A hand-rolled, dependency-ordered spreadsheet-style formula evaluator for
// GFM pipe tables. Cells beginning with `=` are tokenized and parsed into an
// expression tree, then evaluated in dependency order after a cycle check.
//
// This deliberately never uses `eval()` or the `Function()` constructor -
// introducing a dynamic code-execution surface for what is fundamentally a
// small, closed arithmetic grammar is an unnecessary and avoidable risk.

type ArithmeticOperator = '+' | '-' | '*' | '/' | '^';

type Token =
  | { readonly kind: 'num'; readonly value: number }
  | { readonly kind: 'cellref'; readonly col: number; readonly row: number }
  | { readonly kind: 'ident'; readonly name: string }
  | { readonly kind: 'op'; readonly value: ArithmeticOperator }
  | { readonly kind: 'lparen' }
  | { readonly kind: 'rparen' }
  | { readonly kind: 'comma' }
  | { readonly kind: 'colon' };

type CellPos = { readonly col: number; readonly row: number };

type Expr =
  | { readonly kind: 'num'; readonly value: number }
  | { readonly kind: 'cellref'; readonly col: number; readonly row: number }
  | { readonly kind: 'range'; readonly from: CellPos; readonly to: CellPos }
  | { readonly kind: 'neg'; readonly value: Expr }
  | { readonly kind: 'binop'; readonly op: ArithmeticOperator; readonly left: Expr; readonly right: Expr }
  | { readonly kind: 'call'; readonly name: string; readonly args: Expr[] };

class FormulaParseError extends Error {}

const isDigit = (char: string): boolean => char >= '0' && char <= '9';
const isLetter = (char: string): boolean => (char >= 'A' && char <= 'Z') || (char >= 'a' && char <= 'z');

// A1-style column letters to a 0-indexed column number ('A' -> 0, 'Z' -> 25, 'AA' -> 26).
const columnLettersToIndex = (letters: string): number => {
  let result = 0;
  for (const char of letters.toUpperCase()) {
    result = result * 26 + (char.charCodeAt(0) - 64);
  }
  return result - 1;
};

const tokenize = (source: string): Token[] => {
  const tokens: Token[] = [];
  let index = 0;
  while (index < source.length) {
    const char = source[index];
    if (char === ' ' || char === '\t') {
      index += 1;
      continue;
    }
    if (isDigit(char) || char === '.') {
      let end = index;
      while (end < source.length && (isDigit(source[end]) || source[end] === '.')) end += 1;
      const numeric = Number(source.slice(index, end));
      if (Number.isNaN(numeric)) throw new FormulaParseError('Malformed number literal.');
      tokens.push({ kind: 'num', value: numeric });
      index = end;
      continue;
    }
    if (isLetter(char)) {
      let end = index;
      while (end < source.length && isLetter(source[end])) end += 1;
      const letters = source.slice(index, end);
      let digitsEnd = end;
      while (digitsEnd < source.length && isDigit(source[digitsEnd])) digitsEnd += 1;
      if (digitsEnd > end) {
        tokens.push({ kind: 'cellref', col: columnLettersToIndex(letters), row: Number(source.slice(end, digitsEnd)) });
        index = digitsEnd;
      } else {
        tokens.push({ kind: 'ident', name: letters.toUpperCase() });
        index = end;
      }
      continue;
    }
    if (char === '+' || char === '-' || char === '*' || char === '/' || char === '^') {
      tokens.push({ kind: 'op', value: char });
      index += 1;
      continue;
    }
    if (char === '(') { tokens.push({ kind: 'lparen' }); index += 1; continue; }
    if (char === ')') { tokens.push({ kind: 'rparen' }); index += 1; continue; }
    if (char === ',') { tokens.push({ kind: 'comma' }); index += 1; continue; }
    if (char === ':') { tokens.push({ kind: 'colon' }); index += 1; continue; }
    throw new FormulaParseError(`Unexpected character "${char}".`);
  }
  return tokens;
};

class Parser {
  private position = 0;

  constructor(private readonly tokens: Token[]) {}

  private peek(): Token | undefined {
    return this.tokens[this.position];
  }

  private advance(): Token {
    const token = this.tokens[this.position];
    if (!token) throw new FormulaParseError('Unexpected end of formula.');
    this.position += 1;
    return token;
  }

  parseAndConsumeAll(): Expr {
    const expr = this.parseExpression();
    if (this.position !== this.tokens.length) throw new FormulaParseError('Unexpected trailing tokens.');
    return expr;
  }

  // Precedence, lowest to highest: expression (+ -) > term (* /) > power (^, right-assoc) > unary (-) > primary.
  private parseExpression(): Expr {
    let left = this.parseTerm();
    while (this.peekOperator('+') || this.peekOperator('-')) {
      const op = this.advance();
      if (op.kind !== 'op') throw new FormulaParseError('Expected an operator.');
      left = { kind: 'binop', op: op.value, left, right: this.parseTerm() };
    }
    return left;
  }

  private parseTerm(): Expr {
    let left = this.parsePower();
    while (this.peekOperator('*') || this.peekOperator('/')) {
      const op = this.advance();
      if (op.kind !== 'op') throw new FormulaParseError('Expected an operator.');
      left = { kind: 'binop', op: op.value, left, right: this.parsePower() };
    }
    return left;
  }

  private parsePower(): Expr {
    const base = this.parseUnary();
    if (this.peekOperator('^')) {
      this.advance();
      return { kind: 'binop', op: '^', left: base, right: this.parsePower() };
    }
    return base;
  }

  private parseUnary(): Expr {
    if (this.peekOperator('-')) {
      this.advance();
      return { kind: 'neg', value: this.parseUnary() };
    }
    return this.parsePrimary();
  }

  private parsePrimary(): Expr {
    const token = this.advance();
    if (token.kind === 'num') return { kind: 'num', value: token.value };

    if (token.kind === 'cellref') {
      if (this.peek()?.kind === 'colon') {
        this.advance();
        const to = this.advance();
        if (to.kind !== 'cellref') throw new FormulaParseError('Expected a cell reference after ":".');
        return { kind: 'range', from: { col: token.col, row: token.row }, to: { col: to.col, row: to.row } };
      }
      return { kind: 'cellref', col: token.col, row: token.row };
    }

    if (token.kind === 'lparen') {
      const inner = this.parseExpression();
      const closing = this.advance();
      if (closing.kind !== 'rparen') throw new FormulaParseError('Expected a closing parenthesis.');
      return inner;
    }

    if (token.kind === 'ident') {
      const open = this.advance();
      if (open.kind !== 'lparen') throw new FormulaParseError(`Expected "(" after function name "${token.name}".`);
      const args: Expr[] = [];
      if (this.peek()?.kind !== 'rparen') {
        args.push(this.parseExpression());
        while (this.peek()?.kind === 'comma') {
          this.advance();
          args.push(this.parseExpression());
        }
      }
      const closing = this.advance();
      if (closing.kind !== 'rparen') throw new FormulaParseError('Expected a closing parenthesis.');
      return { kind: 'call', name: token.name, args };
    }

    throw new FormulaParseError('Unexpected token.');
  }

  private peekOperator(value: ArithmeticOperator): boolean {
    const token = this.peek();
    return token?.kind === 'op' && token.value === value;
  }
}

const parseFormula = (source: string): Expr => new Parser(tokenize(source)).parseAndConsumeAll();

const cellKey = (row: number, col: number): string => `${row}:${col}`;

const collectDependencies = (expr: Expr, deps: Set<string>): void => {
  switch (expr.kind) {
    case 'num':
      return;
    case 'cellref':
      deps.add(cellKey(expr.row - 1, expr.col));
      return;
    case 'range': {
      const rowStart = Math.min(expr.from.row, expr.to.row) - 1;
      const rowEnd = Math.max(expr.from.row, expr.to.row) - 1;
      const colStart = Math.min(expr.from.col, expr.to.col);
      const colEnd = Math.max(expr.from.col, expr.to.col);
      for (let row = rowStart; row <= rowEnd; row += 1) {
        for (let col = colStart; col <= colEnd; col += 1) deps.add(cellKey(row, col));
      }
      return;
    }
    case 'neg':
      collectDependencies(expr.value, deps);
      return;
    case 'binop':
      collectDependencies(expr.left, deps);
      collectDependencies(expr.right, deps);
      return;
    case 'call':
      expr.args.forEach((arg) => collectDependencies(arg, deps));
      return;
  }
};

const parseStaticCellValue = (raw: string): FormulaCellValue => {
  const trimmed = raw.trim();
  if (trimmed === '') return '';
  const numeric = Number(trimmed);
  return Number.isNaN(numeric) ? raw : numeric;
};

const toNumber = (value: FormulaCellValue): number => (typeof value === 'number' ? value : Number(value));

const AGGREGATE_FUNCTIONS = new Set(['SUM', 'AVERAGE', 'MIN', 'MAX', 'COUNT', 'ROUND']);

export const evaluateTableFormulas = (grid: TableFormulaGrid): TableFormulaResult => {
  const rows = grid.rows;

  const asts = new Map<string, Expr>();
  const errors = new Map<string, 'CYCLE' | 'PARSE' | 'REF'>();

  rows.forEach((row, rowIndex) => {
    row.forEach((raw, colIndex) => {
      if (!raw.trim().startsWith('=')) return;
      const key = cellKey(rowIndex, colIndex);
      try {
        asts.set(key, parseFormula(raw.trim().slice(1)));
      } catch {
        errors.set(key, 'PARSE');
      }
    });
  });

  const dependencies = new Map<string, Set<string>>();
  for (const [key, ast] of asts) {
    const deps = new Set<string>();
    collectDependencies(ast, deps);
    dependencies.set(key, deps);
  }

  // Topological order via DFS, marking every cell on a discovered cycle.
  const visitState = new Map<string, 'visiting' | 'done'>();
  const order: string[] = [];
  const cyclic = new Set<string>();

  const visit = (key: string, stack: string[]): void => {
    if (visitState.get(key) === 'done') return;
    if (visitState.get(key) === 'visiting') {
      const cycleStart = stack.indexOf(key);
      for (let index = cycleStart; index < stack.length; index += 1) cyclic.add(stack[index]);
      cyclic.add(key);
      return;
    }
    visitState.set(key, 'visiting');
    for (const dep of dependencies.get(key) ?? []) {
      if (asts.has(dep)) visit(dep, [...stack, key]);
    }
    visitState.set(key, 'done');
    order.push(key);
  };

  for (const key of asts.keys()) visit(key, []);

  const resolved = new Map<string, FormulaCellValue>();
  for (const key of cyclic) {
    resolved.set(key, '#REF! Cyclic Dependency');
    errors.set(key, 'CYCLE');
  }
  for (const key of errors.keys()) {
    if (!resolved.has(key)) resolved.set(key, '#ERROR');
  }

  const staticValues = new Map<string, FormulaCellValue>();
  rows.forEach((row, rowIndex) => {
    row.forEach((raw, colIndex) => {
      const key = cellKey(rowIndex, colIndex);
      if (!asts.has(key)) staticValues.set(key, parseStaticCellValue(raw));
    });
  });

  const getCellValue = (key: string): FormulaCellValue => {
    if (resolved.has(key)) return resolved.get(key) as FormulaCellValue;
    if (staticValues.has(key)) return staticValues.get(key) as FormulaCellValue;
    // A reference to a cell outside the populated grid is treated as blank,
    // matching the common spreadsheet convention of empty-cell-as-zero.
    return 0;
  };

  const expandRangeToNumbers = (range: Extract<Expr, { kind: 'range' }>): number[] => {
    const rowStart = Math.min(range.from.row, range.to.row) - 1;
    const rowEnd = Math.max(range.from.row, range.to.row) - 1;
    const colStart = Math.min(range.from.col, range.to.col);
    const colEnd = Math.max(range.from.col, range.to.col);
    const values: number[] = [];
    for (let row = rowStart; row <= rowEnd; row += 1) {
      for (let col = colStart; col <= colEnd; col += 1) {
        const numeric = toNumber(getCellValue(cellKey(row, col)));
        if (!Number.isNaN(numeric)) values.push(numeric);
      }
    }
    return values;
  };

  const evaluateExpr = (expr: Expr): number => {
    switch (expr.kind) {
      case 'num':
        return expr.value;
      case 'cellref': {
        const numeric = toNumber(getCellValue(cellKey(expr.row - 1, expr.col)));
        if (Number.isNaN(numeric)) throw new FormulaParseError('Referenced cell is not numeric.');
        return numeric;
      }
      case 'range':
        // A bare range (outside an aggregate function argument) has no
        // single scalar value.
        throw new FormulaParseError('A cell range cannot be used as a plain value.');
      case 'neg':
        return -evaluateExpr(expr.value);
      case 'binop': {
        const left = evaluateExpr(expr.left);
        const right = evaluateExpr(expr.right);
        if (expr.op === '+') return left + right;
        if (expr.op === '-') return left - right;
        if (expr.op === '*') return left * right;
        if (expr.op === '/') {
          if (right === 0) throw new FormulaParseError('Division by zero.');
          return left / right;
        }
        return Math.pow(left, right);
      }
      case 'call':
        return evaluateCall(expr);
    }
  };

  const expandArgToNumbers = (expr: Expr): number[] =>
    expr.kind === 'range' ? expandRangeToNumbers(expr) : [evaluateExpr(expr)];

  const evaluateCall = (call: Extract<Expr, { kind: 'call' }>): number => {
    if (!AGGREGATE_FUNCTIONS.has(call.name)) {
      throw new FormulaParseError(`Unknown function "${call.name}".`);
    }
    if (call.name === 'ROUND') {
      if (call.args.length < 1) throw new FormulaParseError('ROUND requires at least one argument.');
      const value = evaluateExpr(call.args[0]);
      const digits = call.args[1] ? evaluateExpr(call.args[1]) : 0;
      const factor = Math.pow(10, digits);
      return Math.round(value * factor) / factor;
    }
    const values = call.args.flatMap((arg) => expandArgToNumbers(arg));
    if (call.name === 'SUM') return values.reduce((total, value) => total + value, 0);
    if (call.name === 'AVERAGE') return values.length ? values.reduce((total, value) => total + value, 0) / values.length : 0;
    if (call.name === 'MIN') return values.length ? Math.min(...values) : 0;
    if (call.name === 'MAX') return values.length ? Math.max(...values) : 0;
    return values.length; // COUNT
  };

  for (const key of order) {
    if (resolved.has(key)) continue;
    try {
      resolved.set(key, evaluateExpr(asts.get(key) as Expr));
    } catch {
      resolved.set(key, '#ERROR');
      errors.set(key, 'PARSE');
    }
  }

  const outputRows: FormulaCellValue[][] = rows.map((row, rowIndex) =>
    row.map((raw, colIndex) => {
      const key = cellKey(rowIndex, colIndex);
      return asts.has(key) ? (resolved.get(key) as FormulaCellValue) : (staticValues.get(key) as FormulaCellValue);
    }),
  );

  return { rows: outputRows, errors };
};

// --- Markdown-table <-> grid conversion helpers ---
//
// These bridge evaluateTableFormulas' abstract row/column grid to and from
// the literal text of a GFM pipe table, so the preview pipeline can
// evaluate formulas found in a document's tables without the caller having
// to hand-parse pipe syntax itself.

const splitTableRowCells = (line: string): string[] => {
  let trimmed = line.trim();
  if (trimmed.startsWith('|')) trimmed = trimmed.slice(1);
  if (trimmed.endsWith('|')) trimmed = trimmed.slice(0, -1);
  const cells: string[] = [];
  let current = '';
  for (let index = 0; index < trimmed.length; index += 1) {
    const char = trimmed[index];
    if (char === '\\' && trimmed[index + 1] === '|') {
      current += '|';
      index += 1;
    } else if (char === '|') {
      cells.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  cells.push(current.trim());
  return cells;
};

const isDelimiterRow = (line: string): boolean => /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/.test(line);

export interface MarkdownTableBlock {
  readonly startLine: number;
  readonly endLine: number;
  readonly headerRow: string[];
  readonly delimiterLine: string;
  readonly bodyRows: string[][];
}

// Finds every GFM pipe table in a markdown source (a header row, a
// delimiter row, and zero or more body rows) and returns each one's raw
// cell text alongside its 1-indexed source line range.
export const findMarkdownTables = (source: string): MarkdownTableBlock[] => {
  const lines = source.split('\n');
  const tables: MarkdownTableBlock[] = [];

  for (let index = 0; index < lines.length - 1; index += 1) {
    const headerLine = lines[index];
    const delimiterLine = lines[index + 1];
    if (!headerLine.includes('|') || !isDelimiterRow(delimiterLine)) continue;

    const headerRow = splitTableRowCells(headerLine);
    const bodyRows: string[][] = [];
    let endIndex = index + 1;
    for (let bodyIndex = index + 2; bodyIndex < lines.length; bodyIndex += 1) {
      if (!lines[bodyIndex].includes('|') || lines[bodyIndex].trim() === '') break;
      bodyRows.push(splitTableRowCells(lines[bodyIndex]));
      endIndex = bodyIndex;
    }

    tables.push({
      startLine: index + 1,
      endLine: endIndex + 1,
      headerRow,
      delimiterLine,
      bodyRows,
    });
    index = endIndex;
  }

  return tables;
};

// Evaluates every formula cell across every table found in a markdown
// source, returning a flattened map from "tableIndex:row:col" to its
// evaluated value, so the render/preview layer can substitute computed
// values into the corresponding rendered table cells without needing its
// own copy of the evaluation logic.
export const evaluateAllMarkdownTables = (
  source: string,
): { tables: MarkdownTableBlock[]; results: TableFormulaResult[] } => {
  const tables = findMarkdownTables(source);
  const results = tables.map((table) =>
    evaluateTableFormulas({ rows: [table.headerRow, ...table.bodyRows] }),
  );
  return { tables, results };
};



// Rebuilds a markdown source string with every table formula cell replaced
// by its computed value, leaving every other line of the document (and any
// non-formula table cell) exactly as-is. This lets the preview pipeline
// render GFM tables normally through the standard renderer while still
// showing computed values, without needing any special-cased table
// rendering of its own.
export const substituteFormulaValues = (source: string): string => {
  const { tables, results } = evaluateAllMarkdownTables(source);
  if (tables.length === 0) return source;

  const lines = source.split('\n');
  tables.forEach((table, tableIndex) => {
    const result = results[tableIndex];
    // Body rows start at table.startLine + 1 (0-indexed: startLine is the
    // header line, startLine+1 is the delimiter line already handled by
    // findMarkdownTables, so body rows begin at lines index startLine+1).
    table.bodyRows.forEach((_row, bodyRowIndex) => {
      const lineIndex = table.startLine + 1 + bodyRowIndex;
      const resultRowIndex = bodyRowIndex + 1; // +1 because row 0 is the header row.
      const values = result.rows[resultRowIndex];
      if (!values) return;
      lines[lineIndex] = `| ${values.map((value) => String(value)).join(' | ')} |`;
    });
  });

  return lines.join('\n');
};

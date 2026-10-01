import { callFormulaJs, hasFormulaJsFunction, isoDate, jsErrorCode, storedPrimitive, toJsPrimitive } from './sheets-formula-js';
import { findPivotContaining, lookupGetPivotData, pivotSourceCoords } from './sheets-pivot';
import { applySpill, isSpillMatrix, type SpillMatrix } from './sheets-spill';
import { cellKey, type CellPrimitive, type NamedRange, type PortableSheet, type PortableWorkbook, type SheetCell } from './sheets-types';

export interface A1Ref {
  sheetName: string | null;
  col: number;
  row: number;
  colAbs: boolean;
  rowAbs: boolean;
}

export interface FormulaError {
  kind: 'error';
  code: '#REF!' | '#DIV/0!' | '#VALUE!' | '#NAME?' | '#CYCLE!' | '#N/A' | '#SPILL!' | '#CALC!' | '#NUM!';
  message: string;
}

export type FormulaValue = CellPrimitive | null | Date | FormulaError;
export type FormulaMatrix = FormulaValue[][];
export type FormulaResult = FormulaValue | FormulaMatrix;

const ERROR_CODES = new Set<FormulaError['code']>([
  '#REF!', '#DIV/0!', '#VALUE!', '#NAME?', '#CYCLE!', '#N/A', '#SPILL!', '#CALC!', '#NUM!',
]);

export interface DagNode {
  sheetId: string;
  row: number;
  col: number;
  formula: string;
  dependsOn: string[];
}

export interface DagResult {
  nodes: DagNode[];
  order: string[];
  cycles: string[][];
}

const COL_LETTERS = /^[A-Za-z]+$/;

export function columnIndex(letters: string): number {
  let result = 0;
  for (const char of letters.toUpperCase()) {
    if (char < 'A' || char > 'Z') throw new Error(`Invalid column letters: ${letters}`);
    result = result * 26 + (char.charCodeAt(0) - 64);
  }
  return result - 1;
}

export function columnLetters(index: number): string {
  if (!Number.isInteger(index) || index < 0) throw new Error('Column index must be a non-negative integer.');
  let n = index + 1;
  let out = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

export function a1FromParts(row: number, col: number, colAbs = false, rowAbs = false, sheetName?: string | null): string {
  const cell = `${colAbs ? '$' : ''}${columnLetters(col)}${rowAbs ? '$' : ''}${row + 1}`;
  if (!sheetName) return cell;
  const quoted = /[^A-Za-z0-9_]/.test(sheetName) ? `'${sheetName.replaceAll("'", "''")}'` : sheetName;
  return `${quoted}!${cell}`;
}

const REF_RE = /(?:(?:'((?:[^']|'')+)'|([A-Za-z0-9_]+))!)?(\$?)([A-Za-z]+)(\$?)(\d+)/g;

export function parseA1Ref(token: string): A1Ref | null {
  const match = /^(?:(?:'((?:[^']|'')+)'|([A-Za-z0-9_]+))!)?(\$?)([A-Za-z]+)(\$?)(\d+)$/.exec(token.trim());
  if (!match || !COL_LETTERS.test(match[4] ?? '')) return null;
  const quoted = match[1]?.replaceAll("''", "'") ?? null;
  return {
    sheetName: quoted ?? match[2] ?? null,
    colAbs: match[3] === '$',
    col: columnIndex(match[4] ?? 'A'),
    rowAbs: match[5] === '$',
    row: Number(match[6]) - 1,
  };
}

export function extractRefs(formula: string): A1Ref[] {
  const refs: A1Ref[] = [];
  const source = formula.startsWith('=') ? formula.slice(1) : formula;
  REF_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = REF_RE.exec(source))) {
    const parsed = parseA1Ref(match[0]);
    if (parsed) refs.push(parsed);
  }
  return refs;
}

const RANGE_TOKEN_RE = /(?:(?:'((?:[^']|'')+)'|([A-Za-z0-9_]+))!)?(\$?[A-Za-z]+\$?\d+):(\$?[A-Za-z]+\$?\d+)/g;

export function extractRangeCells(formula: string): A1Ref[] {
  const refs: A1Ref[] = [];
  const source = formula.startsWith('=') ? formula.slice(1) : formula;
  RANGE_TOKEN_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = RANGE_TOKEN_RE.exec(source))) {
    const start = parseA1Ref(match[3] ?? '');
    const end = parseA1Ref(match[4] ?? '');
    if (!start || !end) continue;
    const sheetName = match[1]?.replaceAll("''", "'") ?? match[2] ?? start.sheetName ?? end.sheetName;
    const r1 = Math.min(start.row, end.row);
    const r2 = Math.max(start.row, end.row);
    const c1 = Math.min(start.col, end.col);
    const c2 = Math.max(start.col, end.col);
    const area = (r2 - r1 + 1) * (c2 - c1 + 1);
    if (area > 20000) {
      refs.push({ ...start, sheetName }, { ...end, sheetName });
      continue;
    }
    for (let row = r1; row <= r2; row += 1) {
      for (let col = c1; col <= c2; col += 1) {
        refs.push({ sheetName, col, row, colAbs: false, rowAbs: false });
      }
    }
  }
  return refs;
}

export function rewriteRelative(formula: string, dRow: number, dCol: number): string {
  const prefix = formula.startsWith('=') ? '=' : '';
  const body = prefix ? formula.slice(1) : formula;
  REF_RE.lastIndex = 0;
  const rewritten = body.replace(REF_RE, (token) => {
    const ref = parseA1Ref(token);
    if (!ref) return token;
    const nextCol = ref.colAbs ? ref.col : ref.col + dCol;
    const nextRow = ref.rowAbs ? ref.row : ref.row + dRow;
    if (nextCol < 0 || nextRow < 0) return '#REF!';
    return a1FromParts(nextRow, nextCol, ref.colAbs, ref.rowAbs, ref.sheetName);
  });
  return `${prefix}${rewritten}`;
}

function nodeId(sheetId: string, row: number, col: number): string {
  return `${sheetId}:${row},${col}`;
}

function sheetByName(book: PortableWorkbook, name: string | null, fallbackId: string): PortableSheet | undefined {
  if (!name) return book.sheets.find((sheet) => sheet.id === fallbackId);
  const lowered = name.toLowerCase();
  return book.sheets.find((sheet) => sheet.name.toLowerCase() === lowered);
}

export function buildFormulaDag(book: PortableWorkbook): DagResult {
  const nodes: DagNode[] = [];
  const edges = new Map<string, Set<string>>();
  for (const sheet of book.sheets) {
    for (const [key, cell] of Object.entries(sheet.cells)) {
      if (!cell.f || !cell.f.startsWith('=')) continue;
      const parsed = key.split(',').map(Number);
      const row = parsed[0];
      const col = parsed[1];
      if (row === undefined || col === undefined || Number.isNaN(row) || Number.isNaN(col)) continue;
      const id = nodeId(sheet.id, row, col);
      const dependsOn: string[] = [];
      const deps = [...extractRefs(cell.f), ...extractRangeCells(cell.f)];
      for (const ref of deps) {
        const targetSheet = sheetByName(book, ref.sheetName, sheet.id);
        if (!targetSheet) continue;
        dependsOn.push(nodeId(targetSheet.id, ref.row, ref.col));
      }
      for (const named of book.namedRanges) {
        if (!new RegExp(`\\b${named.name}\\b`, 'i').test(cell.f)) continue;
        const namedRef = parseA1Ref(named.a1);
        if (!namedRef) continue;
        dependsOn.push(nodeId(named.sheetId, namedRef.row, namedRef.col));
      }
      for (const coord of getPivotDataSourceDeps(cell.f, book, sheet.id)) {
        dependsOn.push(nodeId(coord.sheetId, coord.row, coord.col));
      }
      nodes.push({ sheetId: sheet.id, row, col, formula: cell.f, dependsOn });
      edges.set(id, new Set(dependsOn));
    }
  }

  const formulaIds = new Set(nodes.map((node) => nodeId(node.sheetId, node.row, node.col)));
  const incoming = new Map<string, number>();
  const dependents = new Map<string, Set<string>>();
  for (const node of nodes) {
    const id = nodeId(node.sheetId, node.row, node.col);
    const deps = [...(edges.get(id) ?? new Set())].filter((dep) => formulaIds.has(dep));
    incoming.set(id, deps.length);
    for (const dep of deps) {
      const bucket = dependents.get(dep) ?? new Set<string>();
      bucket.add(id);
      dependents.set(dep, bucket);
    }
  }

  const queue = [...incoming.entries()].filter(([, count]) => count === 0).map(([id]) => id);
  const order: string[] = [];
  while (queue.length) {
    const id = queue.shift();
    if (!id) break;
    order.push(id);
    for (const dependent of dependents.get(id) ?? []) {
      const next = (incoming.get(dependent) ?? 0) - 1;
      incoming.set(dependent, next);
      if (next === 0) queue.push(dependent);
    }
  }

  const leftover = nodes.map((node) => nodeId(node.sheetId, node.row, node.col)).filter((id) => !order.includes(id));
  const cycles: string[][] = leftover.length ? [leftover] : [];
  return { nodes, order, cycles };
}

function isError(value: FormulaResult | FormulaValue): value is FormulaError {
  return !Array.isArray(value) && typeof value === 'object' && value !== null && !(value instanceof Date) && 'kind' in value && value.kind === 'error';
}

function isNumberListError(value: number[] | FormulaError): value is FormulaError {
  return !Array.isArray(value);
}

export function isFormulaMatrix(value: FormulaResult): value is FormulaMatrix {
  return Array.isArray(value);
}

export function firstScalar(value: FormulaResult): FormulaValue {
  if (isFormulaMatrix(value)) {
    const first = value[0]?.[0];
    return first === undefined ? null : first;
  }
  return value;
}

function excelSerial(value: Date): number {
  return (Date.UTC(value.getFullYear(), value.getMonth(), value.getDate()) - Date.UTC(1899, 11, 30)) / 86400000;
}

function asNumber(value: FormulaResult): number | FormulaError {
  const scalar = firstScalar(value);
  if (isError(scalar)) return scalar;
  if (scalar === null || scalar === '') return 0;
  if (scalar instanceof Date) return excelSerial(scalar);
  if (typeof scalar === 'number' && Number.isFinite(scalar)) return scalar;
  if (typeof scalar === 'boolean') return scalar ? 1 : 0;
  if (typeof scalar === 'string' && scalar.trim() !== '' && Number.isFinite(Number(scalar))) return Number(scalar);
  return { kind: 'error', code: '#VALUE!', message: 'Expected a number.' };
}

function storedCellValue(value: FormulaResult): CellPrimitive | null {
  const scalar = firstScalar(value);
  if (isError(scalar)) return scalar.code;
  return storedPrimitive(scalar);
}

function displayText(value: FormulaValue): string {
  if (isError(value)) return value.code;
  if (value instanceof Date) return isoDate(value);
  return String(value ?? '');
}

type Token =
  | { kind: 'num'; value: number }
  | { kind: 'str'; value: string }
  | { kind: 'ident'; value: string }
  | { kind: 'ref'; value: string }
  | { kind: 'op'; value: string }
  | { kind: 'lparen' }
  | { kind: 'rparen' }
  | { kind: 'comma' }
  | { kind: 'colon' };

function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < source.length) {
    const char = source[i];
    if (!char || /\s/.test(char)) {
      i += 1;
      continue;
    }
    if (char === '"') {
      let end = i + 1;
      let text = '';
      while (end < source.length) {
        const next = source[end];
        if (next === '"' && source[end + 1] === '"') {
          text += '"';
          end += 2;
          continue;
        }
        if (next === '"') break;
        text += next;
        end += 1;
      }
      tokens.push({ kind: 'str', value: text });
      i = end + 1;
      continue;
    }
    if (/[0-9.]/.test(char)) {
      let end = i;
      while (end < source.length && /[0-9.]/.test(source[end] ?? '')) end += 1;
      tokens.push({ kind: 'num', value: Number(source.slice(i, end)) });
      i = end;
      continue;
    }
    if (char === "'") {
      let end = i + 1;
      while (end < source.length && !(source[end] === "'" && source[end + 1] !== "'")) end += 1;
      const sheet = source.slice(i, end + 1);
      if (source[end + 1] === '!') {
        let cellEnd = end + 2;
        while (cellEnd < source.length && /[$A-Za-z0-9]/.test(source[cellEnd] ?? '')) cellEnd += 1;
        tokens.push({ kind: 'ref', value: source.slice(i, cellEnd) });
        i = cellEnd;
        continue;
      }
      tokens.push({ kind: 'ident', value: sheet });
      i = end + 1;
      continue;
    }
    if (/[A-Za-z$]/.test(char)) {
      let end = i;
      while (end < source.length && /[A-Za-z0-9_$!']/.test(source[end] ?? '')) end += 1;
      const raw = source.slice(i, end);
      tokens.push(parseA1Ref(raw) ? { kind: 'ref', value: raw } : { kind: 'ident', value: raw });
      i = end;
      continue;
    }
    if ('+-*/^&=<>'.includes(char)) {
      if ((char === '<' || char === '>') && source[i + 1] === '=') {
        tokens.push({ kind: 'op', value: `${char}=` });
        i += 2;
        continue;
      }
      if (char === '<' && source[i + 1] === '>') {
        tokens.push({ kind: 'op', value: '<>' });
        i += 2;
        continue;
      }
      tokens.push({ kind: 'op', value: char });
      i += 1;
      continue;
    }
    if (char === '(') {
      tokens.push({ kind: 'lparen' });
      i += 1;
      continue;
    }
    if (char === ')') {
      tokens.push({ kind: 'rparen' });
      i += 1;
      continue;
    }
    if (char === ',') {
      tokens.push({ kind: 'comma' });
      i += 1;
      continue;
    }
    if (char === ':') {
      tokens.push({ kind: 'colon' });
      i += 1;
      continue;
    }
    throw new Error(`Unexpected character in formula: ${char}`);
  }
  return tokens;
}

type Expr =
  | { kind: 'num'; value: number }
  | { kind: 'str'; value: string }
  | { kind: 'ref'; value: A1Ref }
  | { kind: 'range'; from: A1Ref; to: A1Ref }
  | { kind: 'name'; value: string }
  | { kind: 'call'; name: string; args: Expr[] }
  | { kind: 'unary'; op: '-' | '+'; value: Expr }
  | { kind: 'bin'; op: string; left: Expr; right: Expr };

class Parser {
  private index = 0;
  constructor(private readonly tokens: Token[]) {}
  parse(): Expr {
    const expr = this.parseComparison();
    if (this.index !== this.tokens.length) throw new Error('Trailing formula tokens.');
    return expr;
  }
  private peek(): Token | undefined {
    return this.tokens[this.index];
  }
  private eat(kind?: Token['kind'], value?: string): Token {
    const token = this.tokens[this.index];
    if (!token || (kind && token.kind !== kind) || (value && !('value' in token && token.value === value))) {
      throw new Error('Unexpected formula token.');
    }
    this.index += 1;
    return token;
  }
  private parseComparison(): Expr {
    let left = this.parseConcat();
    while (this.peek()?.kind === 'op' && ['=', '<>', '<', '>', '<=', '>='].includes((this.peek() as { value: string }).value)) {
      const op = this.eat('op') as { value: string };
      left = { kind: 'bin', op: op.value, left, right: this.parseConcat() };
    }
    return left;
  }
  private parseConcat(): Expr {
    let left = this.parseAdd();
    while (this.peek()?.kind === 'op' && (this.peek() as { value: string }).value === '&') {
      this.eat('op');
      left = { kind: 'bin', op: '&', left, right: this.parseAdd() };
    }
    return left;
  }
  private parseAdd(): Expr {
    let left = this.parseMul();
    while (this.peek()?.kind === 'op' && ['+', '-'].includes((this.peek() as { value: string }).value)) {
      const op = this.eat('op') as { value: string };
      left = { kind: 'bin', op: op.value, left, right: this.parseMul() };
    }
    return left;
  }
  private parseMul(): Expr {
    let left = this.parsePower();
    while (this.peek()?.kind === 'op' && ['*', '/'].includes((this.peek() as { value: string }).value)) {
      const op = this.eat('op') as { value: string };
      left = { kind: 'bin', op: op.value, left, right: this.parsePower() };
    }
    return left;
  }
  private parsePower(): Expr {
    let left = this.parseUnary();
    while (this.peek()?.kind === 'op' && (this.peek() as { value: string }).value === '^') {
      this.eat('op');
      left = { kind: 'bin', op: '^', left, right: this.parseUnary() };
    }
    return left;
  }
  private parseUnary(): Expr {
    if (this.peek()?.kind === 'op' && ['+', '-'].includes((this.peek() as { value: string }).value)) {
      const op = this.eat('op') as { value: '+' | '-' };
      return { kind: 'unary', op: op.value, value: this.parseUnary() };
    }
    return this.parsePrimary();
  }
  private parsePrimary(): Expr {
    const token = this.peek();
    if (!token) throw new Error('Incomplete formula.');
    if (token.kind === 'num') {
      this.index += 1;
      return { kind: 'num', value: token.value };
    }
    if (token.kind === 'str') {
      this.index += 1;
      return { kind: 'str', value: token.value };
    }
    if (token.kind === 'ref') {
      this.index += 1;
      const first = parseA1Ref(token.value);
      if (!first) throw new Error(`Invalid reference ${token.value}`);
      if (this.peek()?.kind === 'colon') {
        this.eat('colon');
        const next = this.eat('ref') as { value: string };
        const second = parseA1Ref(next.value);
        if (!second) throw new Error(`Invalid reference ${next.value}`);
        return { kind: 'range', from: first, to: second };
      }
      return { kind: 'ref', value: first };
    }
    if (token.kind === 'ident') {
      this.index += 1;
      if (this.peek()?.kind === 'lparen') {
        this.eat('lparen');
        const args: Expr[] = [];
        if (this.peek()?.kind !== 'rparen') {
          args.push(this.parseComparison());
          while (this.peek()?.kind === 'comma') {
            this.eat('comma');
            args.push(this.parseComparison());
          }
        }
        this.eat('rparen');
        return { kind: 'call', name: token.value.toUpperCase(), args };
      }
      return { kind: 'name', value: token.value };
    }
    if (token.kind === 'lparen') {
      this.eat('lparen');
      const inner = this.parseComparison();
      this.eat('rparen');
      return inner;
    }
    throw new Error('Unable to parse formula primary.');
  }
}

const evaluationStack = new Set<string>();

function flatten(expr: Expr, book: PortableWorkbook, sheetId: string, named: NamedRange[]): FormulaValue[] {
  if (expr.kind === 'range') {
    const values: FormulaValue[] = [];
    const sheet = sheetByName(book, expr.from.sheetName, sheetId);
    if (!sheet) return [{ kind: 'error', code: '#REF!', message: 'Missing sheet.' }];
    const r1 = Math.min(expr.from.row, expr.to.row);
    const r2 = Math.max(expr.from.row, expr.to.row);
    const c1 = Math.min(expr.from.col, expr.to.col);
    const c2 = Math.max(expr.from.col, expr.to.col);
    for (let row = r1; row <= r2; row += 1) {
      for (let col = c1; col <= c2; col += 1) {
        values.push(readCell(book, sheet.id, row, col, named));
      }
    }
    return values;
  }
  const value = evalExpr(expr, book, sheetId, named);
  if (isFormulaMatrix(value)) return value.flat();
  return [value];
}

function readCell(book: PortableWorkbook, sheetId: string, row: number, col: number, named: NamedRange[]): FormulaValue {
  const id = nodeId(sheetId, row, col);
  if (evaluationStack.has(id)) return { kind: 'error', code: '#CYCLE!', message: 'Circular formula reference.' };
  const sheet = book.sheets.find((item) => item.id === sheetId);
  const cell = sheet?.cells[cellKey(row, col)];
  if (!cell) return null;
  if (cell.f && cell.f.startsWith('=') && (cell.v === null || cell.v === undefined)) {
    evaluationStack.add(id);
    try {
      return firstScalar(evaluateFormulaResult(cell.f, book, sheetId, named));
    } finally {
      evaluationStack.delete(id);
    }
  }
  if (typeof cell.v === 'string' && ERROR_CODES.has(cell.v as FormulaError['code'])) {
    return { kind: 'error', code: cell.v as FormulaError['code'], message: cell.v };
  }
  return cell.v ?? null;
}

function resolveName(name: string, book: PortableWorkbook, named: NamedRange[]): FormulaValue {
  const found = named.find((item) => item.name.toLowerCase() === name.toLowerCase());
  if (!found) return { kind: 'error', code: '#NAME?', message: `Unknown name ${name}` };
  const ref = parseA1Ref(found.a1);
  if (!ref) return { kind: 'error', code: '#REF!', message: `Invalid named range ${name}` };
  return readCell(book, found.sheetId, ref.row, ref.col, named);
}

function evalExpr(expr: Expr, book: PortableWorkbook, sheetId: string, named: NamedRange[]): FormulaResult {
  switch (expr.kind) {
    case 'num':
      return expr.value;
    case 'str':
      return expr.value;
    case 'ref': {
      const sheet = sheetByName(book, expr.value.sheetName, sheetId);
      if (!sheet) return { kind: 'error', code: '#REF!', message: 'Missing sheet.' };
      return readCell(book, sheet.id, expr.value.row, expr.value.col, named);
    }
    case 'name': {
      const token = expr.value.toUpperCase();
      if (token === 'TRUE') return true;
      if (token === 'FALSE') return false;
      return resolveName(expr.value, book, named);
    }
    case 'unary': {
      const inner = asNumber(evalExpr(expr.value, book, sheetId, named));
      if (isError(inner)) return inner;
      return expr.op === '-' ? -inner : inner;
    }
    case 'bin': {
      if (expr.op === '&') {
        const left = firstScalar(evalExpr(expr.left, book, sheetId, named));
        const right = firstScalar(evalExpr(expr.right, book, sheetId, named));
        if (isError(left)) return left;
        if (isError(right)) return right;
        return `${displayText(left)}${displayText(right)}`;
      }
      const left = firstScalar(evalExpr(expr.left, book, sheetId, named));
      const right = firstScalar(evalExpr(expr.right, book, sheetId, named));
      if (['=', '<>', '<', '>', '<=', '>='].includes(expr.op)) {
        const eq = String(left ?? '') === String(right ?? '');
        if (expr.op === '=') return eq;
        if (expr.op === '<>') return !eq;
        const ln = asNumber(left);
        const rn = asNumber(right);
        if (isError(ln) || isError(rn)) return { kind: 'error', code: '#VALUE!', message: 'Comparison needs numbers.' };
        if (expr.op === '<') return ln < rn;
        if (expr.op === '>') return ln > rn;
        if (expr.op === '<=') return ln <= rn;
        return ln >= rn;
      }
      const ln = asNumber(left);
      const rn = asNumber(right);
      if (isError(ln)) return ln;
      if (isError(rn)) return rn;
      if (expr.op === '+') return ln + rn;
      if (expr.op === '-') return ln - rn;
      if (expr.op === '*') return ln * rn;
      if (expr.op === '/') return rn === 0 ? { kind: 'error', code: '#DIV/0!', message: 'Division by zero.' } : ln / rn;
      return ln ** rn;
    }
    case 'call':
      return evalCall(expr.name, expr.args, book, sheetId, named);
    case 'range':
      return flatten(expr, book, sheetId, named)[0] ?? null;
  }
}

function walkExpr(expr: Expr, visit: (item: Expr) => void): void {
  visit(expr);
  if (expr.kind === 'call') {
    for (const arg of expr.args) walkExpr(arg, visit);
    return;
  }
  if (expr.kind === 'unary') {
    walkExpr(expr.value, visit);
    return;
  }
  if (expr.kind === 'bin') {
    walkExpr(expr.left, visit);
    walkExpr(expr.right, visit);
  }
}

function getPivotDataSourceDeps(formula: string, book: PortableWorkbook, sheetId: string): Array<{ sheetId: string; row: number; col: number }> {
  if (!/\bGETPIVOTDATA\s*\(/i.test(formula)) return [];
  try {
    const body = formula.startsWith('=') ? formula.slice(1) : formula;
    const expr = new Parser(tokenize(body)).parse();
    const coords: Array<{ sheetId: string; row: number; col: number }> = [];
    walkExpr(expr, (item) => {
      if (item.kind !== 'call' || item.name !== 'GETPIVOTDATA') return;
      const pivotArg = item.args[1];
      if (!pivotArg || (pivotArg.kind !== 'ref' && pivotArg.kind !== 'range')) return;
      const from = pivotArg.kind === 'ref' ? pivotArg.value : pivotArg.from;
      const sheet = sheetByName(book, from.sheetName, sheetId);
      if (!sheet) return;
      const pivot = findPivotContaining(book, sheet.id, from.row, from.col);
      if (!pivot) return;
      coords.push(...pivotSourceCoords(book, pivot));
    });
    return coords;
  } catch {
    return [];
  }
}

function evalGetPivotData(args: Expr[], book: PortableWorkbook, sheetId: string, named: NamedRange[]): FormulaResult {
  if (!args[0] || !args[1]) return { kind: 'error', code: '#N/A', message: 'GETPIVOTDATA needs a value field and a pivot cell.' };
  const dataField = firstScalar(evalExpr(args[0], book, sheetId, named));
  if (isError(dataField)) return dataField;
  const pivotArg = args[1];
  if (pivotArg.kind !== 'ref' && pivotArg.kind !== 'range') {
    return { kind: 'error', code: '#REF!', message: 'GETPIVOTDATA needs a cell inside a local PivotTable.' };
  }
  const from = pivotArg.kind === 'ref' ? pivotArg.value : pivotArg.from;
  const sheet = sheetByName(book, from.sheetName, sheetId);
  if (!sheet) return { kind: 'error', code: '#REF!', message: 'GETPIVOTDATA pivot cell sheet is missing.' };
  const pivot = findPivotContaining(book, sheet.id, from.row, from.col);
  if (!pivot) return { kind: 'error', code: '#REF!', message: 'GETPIVOTDATA needs a cell inside a local PivotTable.' };
  if ((args.length - 2) % 2 !== 0) {
    return { kind: 'error', code: '#REF!', message: 'GETPIVOTDATA field/item arguments must come in pairs.' };
  }
  const pairs: Array<[string, string]> = [];
  for (let index = 2; index < args.length; index += 2) {
    const field = firstScalar(evalExpr(args[index]!, book, sheetId, named));
    const item = firstScalar(evalExpr(args[index + 1]!, book, sheetId, named));
    if (isError(field)) return field;
    if (isError(item)) return item;
    pairs.push([displayText(field), displayText(item)]);
  }
  return lookupGetPivotData(book, pivot, displayText(dataField), pairs);
}

function numbers(args: Expr[], book: PortableWorkbook, sheetId: string, named: NamedRange[]): number[] | FormulaError {
  const out: number[] = [];
  for (const arg of args) {
    for (const value of flatten(arg, book, sheetId, named)) {
      if (isError(value)) return value;
      if (value === null || value === '') continue;
      const num = asNumber(value);
      if (isError(num)) continue;
      out.push(num);
    }
  }
  return out;
}

export function criteriaMatches(value: FormulaValue, criteria: FormulaValue): boolean {
  if (isError(value) || isError(criteria)) return false;
  const test = String(criteria ?? '');
  if (test === '') return value === null || value === '';
  const compare = /^(<=|>=|<>|=|<|>)(.*)$/.exec(test);
  if (compare) {
    const op = compare[1] ?? '=';
    const raw = compare[2] ?? '';
    const rightNum = Number(raw);
    const leftNum = typeof value === 'number' ? value : Number(value);
    if (Number.isFinite(leftNum) && Number.isFinite(rightNum)) {
      if (op === '=') return leftNum === rightNum;
      if (op === '<>') return leftNum !== rightNum;
      if (op === '<') return leftNum < rightNum;
      if (op === '>') return leftNum > rightNum;
      if (op === '<=') return leftNum <= rightNum;
      return leftNum >= rightNum;
    }
    const left = String(value ?? '').toLocaleLowerCase();
    const right = raw.toLocaleLowerCase();
    if (op === '=') return left === right;
    if (op === '<>') return left !== right;
    return false;
  }
  const left = String(value ?? '').toLocaleLowerCase();
  const right = test.toLocaleLowerCase();
  if (right.includes('*')) {
    const escaped = right.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
    return new RegExp(`^${escaped}$`, 'i').test(String(value ?? ''));
  }
  return left === right || (typeof value === 'number' && Number(test) === value);
}

function rangeMatrix(expr: Expr, book: PortableWorkbook, sheetId: string, named: NamedRange[]): FormulaValue[][] | FormulaError {
  if (expr.kind !== 'range' && expr.kind !== 'ref') {
    const value = evalExpr(expr, book, sheetId, named);
    if (isError(value)) return value;
    if (isFormulaMatrix(value)) return value;
    return [[value]];
  }
  const from = expr.kind === 'ref' ? expr.value : expr.from;
  const to = expr.kind === 'ref' ? expr.value : expr.to;
  const sheet = sheetByName(book, from.sheetName, sheetId);
  if (!sheet) return { kind: 'error', code: '#REF!', message: 'Missing sheet.' };
  const r1 = Math.min(from.row, to.row);
  const r2 = Math.max(from.row, to.row);
  const c1 = Math.min(from.col, to.col);
  const c2 = Math.max(from.col, to.col);
  const rows: FormulaValue[][] = [];
  for (let row = r1; row <= r2; row += 1) {
    const line: FormulaValue[] = [];
    for (let col = c1; col <= c2; col += 1) line.push(readCell(book, sheet.id, row, col, named));
    rows.push(line);
  }
  return rows;
}

function evalCall(name: string, args: Expr[], book: PortableWorkbook, sheetId: string, named: NamedRange[]): FormulaResult {
  const first = args[0];
  switch (name) {
    case 'SUM': {
      const nums = numbers(args, book, sheetId, named);
      return isNumberListError(nums) ? nums : nums.reduce((sum, value) => sum + value, 0);
    }
    case 'AVERAGE': {
      const nums = numbers(args, book, sheetId, named);
      if (isNumberListError(nums)) return nums;
      return nums.length ? nums.reduce((sum, value) => sum + value, 0) / nums.length : { kind: 'error', code: '#DIV/0!', message: 'AVERAGE of empty range.' };
    }
    case 'MIN': {
      const nums = numbers(args, book, sheetId, named);
      return isNumberListError(nums) ? nums : nums.length ? Math.min(...nums) : 0;
    }
    case 'MAX': {
      const nums = numbers(args, book, sheetId, named);
      return isNumberListError(nums) ? nums : nums.length ? Math.max(...nums) : 0;
    }
    case 'COUNT': {
      const nums = numbers(args, book, sheetId, named);
      return isNumberListError(nums) ? nums : nums.length;
    }
    case 'COUNTA':
      return args.flatMap((arg) => flatten(arg, book, sheetId, named)).filter((value) => value !== null && value !== '').length;
    case 'PRODUCT': {
      const nums = numbers(args, book, sheetId, named);
      return isNumberListError(nums) ? nums : nums.reduce((prod, value) => prod * value, 1);
    }
    case 'ABS':
    case 'INT':
    case 'SQRT': {
      if (!first) return { kind: 'error', code: '#N/A', message: `${name} needs a value.` };
      const num = asNumber(evalExpr(first, book, sheetId, named));
      if (isError(num)) return num;
      if (name === 'ABS') return Math.abs(num);
      if (name === 'INT') return Math.trunc(num);
      return num < 0 ? { kind: 'error', code: '#VALUE!', message: 'SQRT of a negative.' } : Math.sqrt(num);
    }
    case 'ROUND': {
      const value = first ? asNumber(evalExpr(first, book, sheetId, named)) : { kind: 'error' as const, code: '#N/A' as const, message: 'ROUND needs a value.' };
      const digits = args[1] ? asNumber(evalExpr(args[1], book, sheetId, named)) : 0;
      if (isError(value)) return value;
      if (isError(digits)) return digits;
      const factor = 10 ** digits;
      return Math.round(value * factor) / factor;
    }
    case 'IF': {
      const cond = first ? firstScalar(evalExpr(first, book, sheetId, named)) : false;
      const truthy = cond === true || (typeof cond === 'number' && cond !== 0) || (typeof cond === 'string' && cond !== '');
      const chosen = truthy ? args[1] : args[2];
      return chosen ? evalExpr(chosen, book, sheetId, named) : truthy;
    }
    case 'AND':
      return args.every((arg) => {
        const value = firstScalar(evalExpr(arg, book, sheetId, named));
        return value === true || (typeof value === 'number' && value !== 0);
      });
    case 'OR':
      return args.some((arg) => {
        const value = firstScalar(evalExpr(arg, book, sheetId, named));
        return value === true || (typeof value === 'number' && value !== 0);
      });
    case 'NOT': {
      const value = first ? firstScalar(evalExpr(first, book, sheetId, named)) : false;
      return !(value === true || (typeof value === 'number' && value !== 0));
    }
    case 'CONCAT':
    case 'CONCATENATE':
      return args.map((arg) => {
        const value = firstScalar(evalExpr(arg, book, sheetId, named));
        return isError(value) ? '' : displayText(value);
      }).join('');
    case 'LEN': {
      const value = first ? firstScalar(evalExpr(first, book, sheetId, named)) : '';
      return isError(value) ? value : displayText(value).length;
    }
    case 'UPPER':
    case 'LOWER':
    case 'TRIM': {
      const value = first ? firstScalar(evalExpr(first, book, sheetId, named)) : '';
      if (isError(value)) return value;
      const text = displayText(value);
      if (name === 'UPPER') return text.toUpperCase();
      if (name === 'LOWER') return text.toLowerCase();
      return text.trim();
    }
    case 'IFERROR': {
      const value = first ? firstScalar(evalExpr(first, book, sheetId, named)) : null;
      if (isError(value)) return args[1] ? evalExpr(args[1], book, sheetId, named) : '';
      return value;
    }
    case 'ISNUMBER': {
      const value = first ? firstScalar(evalExpr(first, book, sheetId, named)) : null;
      return typeof value === 'number' && Number.isFinite(value);
    }
    case 'ISTEXT': {
      const value = first ? firstScalar(evalExpr(first, book, sheetId, named)) : null;
      return typeof value === 'string';
    }
    case 'ISBLANK': {
      const value = first ? firstScalar(evalExpr(first, book, sheetId, named)) : null;
      return value === null || value === '';
    }
    case 'PI':
      return Math.PI;
    case 'TRUE':
      return true;
    case 'FALSE':
      return false;
    case 'TEXTJOIN': {
      const delimiter = first ? displayText(firstScalar(evalExpr(first, book, sheetId, named))) : '';
      const ignoreEmpty = args[1] ? firstScalar(evalExpr(args[1], book, sheetId, named)) : true;
      const skipBlank = ignoreEmpty !== false && ignoreEmpty !== 0;
      const parts = args.slice(2).flatMap((arg) => flatten(arg, book, sheetId, named))
        .filter((value) => !isError(value) && (!skipBlank || (value !== null && value !== '')))
        .map((value) => String(value ?? ''));
      return parts.join(delimiter);
    }
    case 'COUNTIF': {
      if (!first || !args[1]) return { kind: 'error', code: '#N/A', message: 'COUNTIF needs a range and a test.' };
      const values = flatten(first, book, sheetId, named);
      const criteria = firstScalar(evalExpr(args[1], book, sheetId, named));
      return values.filter((value) => criteriaMatches(value, criteria)).length;
    }
    case 'SUMIF': {
      if (!first || !args[1]) return { kind: 'error', code: '#N/A', message: 'SUMIF needs a range and a test.' };
      const tests = flatten(first, book, sheetId, named);
      const criteria = firstScalar(evalExpr(args[1], book, sheetId, named));
      const sums = args[2] ? flatten(args[2], book, sheetId, named) : tests;
      let total = 0;
      tests.forEach((value, index) => {
        if (!criteriaMatches(value, criteria)) return;
        const num = asNumber(sums[index] ?? null);
        if (!isError(num)) total += num;
      });
      return total;
    }
    case 'VLOOKUP': {
      if (!first || !args[1] || !args[2]) return { kind: 'error', code: '#N/A', message: 'VLOOKUP needs a lookup, range, and column.' };
      const lookup = evalExpr(first, book, sheetId, named);
      const table = rangeMatrix(args[1], book, sheetId, named);
      if (!Array.isArray(table)) return table;
      const colIndex = asNumber(evalExpr(args[2], book, sheetId, named));
      if (isError(colIndex)) return colIndex;
      const column = Math.trunc(colIndex) - 1;
      if (column < 0) return { kind: 'error', code: '#VALUE!', message: 'VLOOKUP column must be 1 or greater.' };
      for (const row of table) {
        const key = row[0] ?? null;
        if (String(key ?? '') !== String(lookup ?? '')) continue;
        return row[column] ?? { kind: 'error', code: '#REF!', message: 'VLOOKUP column is outside the range.' };
      }
      return { kind: 'error', code: '#N/A', message: 'VLOOKUP found no match.' };
    }
    case 'XLOOKUP': {
      if (!first || !args[1] || !args[2]) return { kind: 'error', code: '#N/A', message: 'XLOOKUP needs a lookup, lookup range, and return range.' };
      const lookup = evalExpr(first, book, sheetId, named);
      const keys = flatten(args[1], book, sheetId, named);
      const values = flatten(args[2], book, sheetId, named);
      const index = keys.findIndex((value) => String(value ?? '') === String(lookup ?? ''));
      if (index < 0) return { kind: 'error', code: '#N/A', message: 'XLOOKUP found no match.' };
      return values[index] ?? null;
    }
    case 'INDEX': {
      if (!first || !args[1]) return { kind: 'error', code: '#N/A', message: 'INDEX needs a range and a row.' };
      const table = rangeMatrix(first, book, sheetId, named);
      if (!Array.isArray(table)) return table;
      const rowNum = asNumber(evalExpr(args[1], book, sheetId, named));
      const colNum = args[2] ? asNumber(evalExpr(args[2], book, sheetId, named)) : 1;
      if (isError(rowNum)) return rowNum;
      if (isError(colNum)) return colNum;
      const row = table[Math.trunc(rowNum) - 1];
      if (!row) return { kind: 'error', code: '#REF!', message: 'INDEX row is outside the range.' };
      return row[Math.trunc(colNum) - 1] ?? { kind: 'error', code: '#REF!', message: 'INDEX column is outside the range.' };
    }
    case 'MATCH': {
      if (!first || !args[1]) return { kind: 'error', code: '#N/A', message: 'MATCH needs a lookup and a range.' };
      const lookup = firstScalar(evalExpr(first, book, sheetId, named));
      const values = flatten(args[1], book, sheetId, named);
      const index = values.findIndex((value) => displayText(value) === displayText(lookup));
      return index < 0 ? { kind: 'error', code: '#N/A', message: 'MATCH found no match.' } : index + 1;
    }
    case 'FILTER':
      return evalFilter(args, book, sheetId, named);
    case 'SORT':
      return evalSort(args, book, sheetId, named);
    case 'UNIQUE':
      return evalUnique(args, book, sheetId, named);
    case 'GETPIVOTDATA':
      return evalGetPivotData(args, book, sheetId, named);
    default: {
      if (!hasFormulaJsFunction(name)) {
        return { kind: 'error', code: '#NAME?', message: `Unknown function ${name}` };
      }
      try {
        const jsArgs = args.map((arg) => exprToFormulaJs(arg, book, sheetId, named));
        return fromFormulaJsResult(callFormulaJs(name, jsArgs));
      } catch (error) {
        if (error instanceof Error) {
          return { kind: 'error', code: jsErrorCode(error), message: error.message };
        }
        return { kind: 'error', code: '#VALUE!', message: 'Formula.js evaluation failed.' };
      }
    }
  }
}

function truthyCell(value: FormulaValue): boolean {
  if (isError(value) || value === null || value === '') return false;
  if (value === false) return false;
  if (typeof value === 'number') return value !== 0;
  return true;
}

function compareOp(left: FormulaValue, right: FormulaValue, op: string): boolean {
  if (op === '=' || op === '<>') {
    const eq = displayText(left).toLocaleLowerCase() === displayText(right).toLocaleLowerCase()
      || (typeof left === 'number' && typeof right === 'number' && left === right);
    return op === '=' ? eq : !eq;
  }
  const ln = asNumber(left);
  const rn = asNumber(right);
  if (isError(ln) || isError(rn)) return false;
  if (op === '<') return ln < rn;
  if (op === '>') return ln > rn;
  if (op === '<=') return ln <= rn;
  if (op === '>=') return ln >= rn;
  return false;
}

function includeMask(expr: Expr, book: PortableWorkbook, sheetId: string, named: NamedRange[]): boolean[][] | FormulaError {
  if (expr.kind === 'bin' && (expr.left.kind === 'range' || expr.left.kind === 'ref')) {
    const table = rangeMatrix(expr.left, book, sheetId, named);
    if (!Array.isArray(table)) return table;
    const right = firstScalar(evalExpr(expr.right, book, sheetId, named));
    if (isError(right)) return right;
    return table.map((row) => row.map((cell) => compareOp(cell, right, expr.op)));
  }
  const table = rangeMatrix(expr, book, sheetId, named);
  if (!Array.isArray(table)) return table;
  return table.map((row) => row.map((cell) => truthyCell(cell)));
}

function evalFilter(args: Expr[], book: PortableWorkbook, sheetId: string, named: NamedRange[]): FormulaResult {
  if (!args[0] || !args[1]) return { kind: 'error', code: '#N/A', message: 'FILTER needs an array and a test.' };
  const table = rangeMatrix(args[0], book, sheetId, named);
  if (!Array.isArray(table)) return table;
  const mask = includeMask(args[1], book, sheetId, named);
  if (!Array.isArray(mask)) return mask;
  const height = table.length;
  const width = table[0]?.length ?? 0;
  const maskHeight = mask.length;
  const maskWidth = mask[0]?.length ?? 0;
  let rows: FormulaValue[][] = [];
  if (maskHeight === height && (maskWidth === 1 || maskWidth === width)) {
    rows = table.filter((_, index) => mask[index]?.some((flag) => flag));
  } else if (maskWidth === width && (maskHeight === 1 || maskHeight === height)) {
    rows = table.map((row) => row.filter((_, index) => mask.some((line) => line[index])));
    rows = rows.filter((row) => row.length > 0);
  } else {
    return { kind: 'error', code: '#VALUE!', message: 'FILTER include range must match the array.' };
  }
  if (rows.length === 0) {
    if (!args[2]) return { kind: 'error', code: '#CALC!', message: 'FILTER found no rows.' };
    const fallback = evalExpr(args[2], book, sheetId, named);
    return isFormulaMatrix(fallback) ? fallback : [[firstScalar(fallback)]];
  }
  return rows;
}

function evalSort(args: Expr[], book: PortableWorkbook, sheetId: string, named: NamedRange[]): FormulaResult {
  if (!args[0]) return { kind: 'error', code: '#N/A', message: 'SORT needs an array.' };
  const table = rangeMatrix(args[0], book, sheetId, named);
  if (!Array.isArray(table)) return table;
  const indexRaw = args[1] ? asNumber(evalExpr(args[1], book, sheetId, named)) : 1;
  const orderRaw = args[2] ? asNumber(evalExpr(args[2], book, sheetId, named)) : 1;
  const byCol = args[3] ? truthyCell(firstScalar(evalExpr(args[3], book, sheetId, named))) : false;
  if (isError(indexRaw)) return indexRaw;
  if (isError(orderRaw)) return orderRaw;
  const sortIndex = Math.trunc(indexRaw) - 1;
  const direction = orderRaw < 0 ? -1 : 1;
  const copy = table.map((row) => [...row]);
  const target = byCol
    ? copy[0]?.map((_, col) => copy.map((row) => row[col] ?? null)) ?? []
    : copy;
  target.sort((left, right) => {
    const a = left[sortIndex] ?? null;
    const b = right[sortIndex] ?? null;
    const an = asNumber(a);
    const bn = asNumber(b);
    if (!isError(an) && !isError(bn)) return (an - bn) * direction;
    return displayText(a).localeCompare(displayText(b)) * direction;
  });
  if (!byCol) return target;
  const height = target[0]?.length ?? 0;
  const restored: FormulaValue[][] = [];
  for (let row = 0; row < height; row += 1) {
    restored.push(target.map((column) => column[row] ?? null));
  }
  return restored;
}

function evalUnique(args: Expr[], book: PortableWorkbook, sheetId: string, named: NamedRange[]): FormulaResult {
  if (!args[0]) return { kind: 'error', code: '#N/A', message: 'UNIQUE needs an array.' };
  const table = rangeMatrix(args[0], book, sheetId, named);
  if (!Array.isArray(table)) return table;
  const byCol = args[1] ? truthyCell(firstScalar(evalExpr(args[1], book, sheetId, named))) : false;
  const exactlyOnce = args[2] ? truthyCell(firstScalar(evalExpr(args[2], book, sheetId, named))) : false;
  const rows = byCol
    ? (table[0]?.map((_, col) => table.map((row) => row[col] ?? null)) ?? [])
    : table.map((row) => [...row]);
  const counts = new Map<string, number>();
  const keys = rows.map((row) => row.map((cell) => displayText(cell)).join('\u0000'));
  for (const key of keys) counts.set(key, (counts.get(key) ?? 0) + 1);
  const unique = rows.filter((_, index) => {
    const key = keys[index] ?? '';
    const count = counts.get(key) ?? 0;
    if (exactlyOnce) return count === 1;
    return keys.indexOf(key) === index;
  });
  if (!byCol) return unique;
  const height = unique[0]?.length ?? 0;
  const restored: FormulaValue[][] = [];
  for (let row = 0; row < height; row += 1) restored.push(unique.map((column) => column[row] ?? null));
  return restored;
}

function exprToFormulaJs(expr: Expr, book: PortableWorkbook, sheetId: string, named: NamedRange[]): unknown {
  if (expr.kind === 'range' || expr.kind === 'ref') {
    const table = rangeMatrix(expr, book, sheetId, named);
    if (!Array.isArray(table)) return new Error(table.code);
    const js = table.map((row) => row.map((cell) => formulaValueToJs(cell)));
    return expr.kind === 'ref' ? js[0]?.[0] ?? null : js;
  }
  return formulaValueToJs(firstScalar(evalExpr(expr, book, sheetId, named)));
}

function formulaValueToJs(value: FormulaValue): unknown {
  if (isError(value)) return new Error(value.code);
  if (value instanceof Date) return value;
  return toJsPrimitive(value);
}

function fromFormulaJsResult(value: unknown): FormulaResult {
  if (value instanceof Error) return { kind: 'error', code: jsErrorCode(value), message: value.message };
  if (isSpillMatrix(value)) {
    return value.map((row) => row.map((cell) => fromFormulaJsScalar(cell)));
  }
  if (Array.isArray(value)) {
    return value.map((item) => {
      if (Array.isArray(item)) return item.map((cell) => fromFormulaJsScalar(cell));
      return [fromFormulaJsScalar(item)];
    });
  }
  return fromFormulaJsScalar(value);
}

function fromFormulaJsScalar(value: unknown): FormulaValue {
  if (value instanceof Error) return { kind: 'error', code: jsErrorCode(value), message: value.message };
  if (value instanceof Date) return value;
  if (value === null || value === undefined) return null;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
  return String(value);
}

function toSpillMatrix(value: FormulaMatrix): SpillMatrix {
  return value.map((row) => row.map((cell) => {
    if (isError(cell) || cell === undefined) return null;
    if (cell instanceof Date) return isoDate(cell);
    return cell;
  }));
}

function writeEvaluatedCell(
  book: PortableWorkbook,
  sheetId: string,
  row: number,
  col: number,
  formula: string,
  result: FormulaResult,
): void {
  const sheet = book.sheets.find((item) => item.id === sheetId);
  if (!sheet) return;
  const cell = sheet.cells[cellKey(row, col)];
  if (!cell) return;
  if (isError(result)) {
    applySpill(book, sheetId, row, col, [[null]]);
    sheet.cells[cellKey(row, col)] = { ...cell, f: formula, v: result.code };
    return;
  }
  if (isFormulaMatrix(result)) {
    const spill = applySpill(book, sheetId, row, col, toSpillMatrix(result));
    if (!spill.ok) {
      sheet.cells[cellKey(row, col)] = { ...cell, f: formula, v: spill.code };
      return;
    }
    sheet.cells[cellKey(row, col)] = { ...cell, f: formula, v: storedCellValue(result) };
    return;
  }
  applySpill(book, sheetId, row, col, [[null]]);
  sheet.cells[cellKey(row, col)] = { ...cell, f: formula, v: storedCellValue(result) };
}

export function evaluateFormulaResult(
  formula: string,
  book: PortableWorkbook,
  sheetId: string,
  named = book.namedRanges,
  stack = new Set<string>(),
): FormulaResult {
  try {
    const body = formula.startsWith('=') ? formula.slice(1) : formula;
    const dag = buildFormulaDag(book);
    if (dag.cycles.some((cycle) => cycle.some((id) => stack.has(id) || id.startsWith(`${sheetId}:`)))) {
      const self = [...stack][0];
      if (self && dag.cycles.some((cycle) => cycle.includes(self))) {
        return { kind: 'error', code: '#CYCLE!', message: 'Circular formula reference.' };
      }
    }
    const expr = new Parser(tokenize(body)).parse();
    return evalExpr(expr, book, sheetId, named);
  } catch (error) {
    return { kind: 'error', code: '#VALUE!', message: error instanceof Error ? error.message : 'Formula failed.' };
  }
}

export function evaluateFormula(
  formula: string,
  book: PortableWorkbook,
  sheetId: string,
  named = book.namedRanges,
  stack = new Set<string>(),
): FormulaValue {
  return firstScalar(evaluateFormulaResult(formula, book, sheetId, named, stack));
}

export function evaluateWorkbook(book: PortableWorkbook): PortableWorkbook {
  const dag = buildFormulaDag(book);
  const next: PortableWorkbook = {
    ...book,
    sheets: book.sheets.map((sheet) => ({ ...sheet, cells: { ...sheet.cells } })),
    namedRanges: [...book.namedRanges],
    validations: [...book.validations],
    conditionalFormats: [...book.conditionalFormats],
    comments: [...book.comments],
    pivots: [...(book.pivots ?? [])],
  };
  if (dag.cycles.length > 0) {
    for (const id of dag.cycles.flat()) {
      const [sheetId, coord] = id.split(':');
      const parts = coord?.split(',').map(Number);
      const row = parts?.[0];
      const col = parts?.[1];
      const sheet = next.sheets.find((item) => item.id === sheetId);
      if (!sheet || row === undefined || col === undefined) continue;
      const cell = sheet.cells[cellKey(row, col)];
      if (cell) sheet.cells[cellKey(row, col)] = { ...cell, v: '#CYCLE!' };
    }
  }
  const evaluateOrder = () => {
    for (const id of dag.order) {
      const [sheetId, coord] = id.split(':');
      const parts = coord?.split(',').map(Number);
      const row = parts?.[0];
      const col = parts?.[1];
      const sheet = next.sheets.find((item) => item.id === sheetId);
      if (!sheet || row === undefined || col === undefined) continue;
      const cell = sheet.cells[cellKey(row, col)];
      if (!cell?.f) continue;
      const value = evaluateFormulaResult(cell.f, next, sheet.id);
      writeEvaluatedCell(next, sheet.id, row, col, cell.f, value);
    }
  };
  evaluateOrder();
  evaluateOrder();
  return next;
}

export function parseA1Range(a1: string): { r1: number; c1: number; r2: number; c2: number } | null {
  const [startToken, endToken] = a1.trim().split(':');
  const start = startToken ? parseA1Ref(startToken) : null;
  if (!start) return null;
  const end = endToken ? parseA1Ref(endToken) : start;
  if (!end) return null;
  return {
    r1: Math.min(start.row, end.row),
    c1: Math.min(start.col, end.col),
    r2: Math.max(start.row, end.row),
    c2: Math.max(start.col, end.col),
  };
}

export function a1CoversCell(a1: string, row: number, col: number): boolean {
  const range = parseA1Range(a1);
  if (!range) return false;
  return row >= range.r1 && row <= range.r2 && col >= range.c1 && col <= range.c2;
}

export function displayCell(cell: SheetCell | undefined): string {
  if (!cell) return '';
  if (cell.f && (cell.v === null || cell.v === undefined)) return cell.f;
  if (cell.v === null || cell.v === undefined) return cell.f ?? '';
  return String(cell.v);
}

export function selectionAggregates(values: FormulaValue[]): { count: number; sum: number | null; average: number | null; min: number | null; max: number | null } {
  const nums = values.flatMap((value) => {
    if (typeof value === 'number' && Number.isFinite(value)) return [value];
    if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) return [Number(value)];
    return [];
  });
  const count = values.filter((value) => value !== null && value !== '').length;
  if (nums.length === 0) return { count, sum: null, average: null, min: null, max: null };
  const sum = nums.reduce((total, value) => total + value, 0);
  return { count, sum, average: sum / nums.length, min: Math.min(...nums), max: Math.max(...nums) };
}

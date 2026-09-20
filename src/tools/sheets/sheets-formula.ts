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
  code: '#REF!' | '#DIV/0!' | '#VALUE!' | '#NAME?' | '#CYCLE!' | '#N/A';
  message: string;
}

export type FormulaValue = CellPrimitive | null | FormulaError;

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
      for (const ref of extractRefs(cell.f)) {
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

function isError(value: FormulaValue): value is FormulaError {
  return typeof value === 'object' && value !== null && 'kind' in value && value.kind === 'error';
}

function isNumberListError(value: number[] | FormulaError): value is FormulaError {
  return !Array.isArray(value);
}

function asNumber(value: FormulaValue): number | FormulaError {
  if (isError(value)) return value;
  if (value === null || value === '') return 0;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) return Number(value);
  return { kind: 'error', code: '#VALUE!', message: 'Expected a number.' };
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
  return [evalExpr(expr, book, sheetId, named)];
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
      return evaluateFormula(cell.f, book, sheetId, named);
    } finally {
      evaluationStack.delete(id);
    }
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

function evalExpr(expr: Expr, book: PortableWorkbook, sheetId: string, named: NamedRange[]): FormulaValue {
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
    case 'name':
      return resolveName(expr.value, book, named);
    case 'unary': {
      const inner = asNumber(evalExpr(expr.value, book, sheetId, named));
      if (isError(inner)) return inner;
      return expr.op === '-' ? -inner : inner;
    }
    case 'bin': {
      if (expr.op === '&') {
        const left = evalExpr(expr.left, book, sheetId, named);
        const right = evalExpr(expr.right, book, sheetId, named);
        if (isError(left)) return left;
        if (isError(right)) return right;
        return `${left ?? ''}${right ?? ''}`;
      }
      const left = evalExpr(expr.left, book, sheetId, named);
      const right = evalExpr(expr.right, book, sheetId, named);
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

function evalCall(name: string, args: Expr[], book: PortableWorkbook, sheetId: string, named: NamedRange[]): FormulaValue {
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
      const cond = first ? evalExpr(first, book, sheetId, named) : false;
      const truthy = cond === true || (typeof cond === 'number' && cond !== 0) || (typeof cond === 'string' && cond !== '');
      const chosen = truthy ? args[1] : args[2];
      return chosen ? evalExpr(chosen, book, sheetId, named) : truthy;
    }
    case 'AND':
      return args.every((arg) => {
        const value = evalExpr(arg, book, sheetId, named);
        return value === true || (typeof value === 'number' && value !== 0);
      });
    case 'OR':
      return args.some((arg) => {
        const value = evalExpr(arg, book, sheetId, named);
        return value === true || (typeof value === 'number' && value !== 0);
      });
    case 'NOT': {
      const value = first ? evalExpr(first, book, sheetId, named) : false;
      return !(value === true || (typeof value === 'number' && value !== 0));
    }
    case 'CONCAT':
    case 'CONCATENATE':
      return args.map((arg) => {
        const value = evalExpr(arg, book, sheetId, named);
        return isError(value) ? '' : String(value ?? '');
      }).join('');
    case 'LEN': {
      const value = first ? evalExpr(first, book, sheetId, named) : '';
      return isError(value) ? value : String(value ?? '').length;
    }
    case 'UPPER':
    case 'LOWER':
    case 'TRIM': {
      const value = first ? evalExpr(first, book, sheetId, named) : '';
      if (isError(value)) return value;
      const text = String(value ?? '');
      if (name === 'UPPER') return text.toUpperCase();
      if (name === 'LOWER') return text.toLowerCase();
      return text.trim();
    }
    case 'IFERROR': {
      const value = first ? evalExpr(first, book, sheetId, named) : null;
      if (isError(value)) return args[1] ? evalExpr(args[1], book, sheetId, named) : '';
      return value;
    }
    case 'ISNUMBER': {
      const value = first ? evalExpr(first, book, sheetId, named) : null;
      return typeof value === 'number' && Number.isFinite(value);
    }
    case 'ISTEXT': {
      const value = first ? evalExpr(first, book, sheetId, named) : null;
      return typeof value === 'string';
    }
    case 'ISBLANK': {
      const value = first ? evalExpr(first, book, sheetId, named) : null;
      return value === null || value === '';
    }
    case 'PI':
      return Math.PI;
    case 'TRUE':
      return true;
    case 'FALSE':
      return false;
    default:
      return { kind: 'error', code: '#NAME?', message: `Unknown function ${name}` };
  }
}

export function evaluateFormula(
  formula: string,
  book: PortableWorkbook,
  sheetId: string,
  named = book.namedRanges,
  stack = new Set<string>(),
): FormulaValue {
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

export function evaluateWorkbook(book: PortableWorkbook): PortableWorkbook {
  const dag = buildFormulaDag(book);
  const next: PortableWorkbook = {
    ...book,
    sheets: book.sheets.map((sheet) => ({ ...sheet, cells: { ...sheet.cells } })),
    namedRanges: [...book.namedRanges],
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
  for (const id of dag.order) {
    const [sheetId, coord] = id.split(':');
    const parts = coord?.split(',').map(Number);
    const row = parts?.[0];
    const col = parts?.[1];
    const sheet = next.sheets.find((item) => item.id === sheetId);
    if (!sheet || row === undefined || col === undefined) continue;
    const cell = sheet.cells[cellKey(row, col)];
    if (!cell?.f) continue;
    const value = evaluateFormula(cell.f, next, sheet.id);
    sheet.cells[cellKey(row, col)] = {
      ...cell,
      v: isError(value) ? value.code : value,
    };
  }
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

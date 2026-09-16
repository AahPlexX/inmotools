import { toMillimeters, toRadians, type AngleUnit, type LengthUnit } from './units';

export type CadDimension = 'scalar' | 'length' | 'angle';

export interface CadParameterValue {
  dimension: CadDimension;
  value: number;
}

export interface CadParameterDefinition {
  id: string;
  name: string;
  expression: string;
  dimension: CadDimension;
}

type Token =
  | { type: 'number'; value: number }
  | { type: 'identifier'; value: string }
  | { type: 'operator'; value: '+' | '-' | '*' | '/' | '(' | ')' }
  | { type: 'eof' };

const LENGTH_UNITS = new Set<LengthUnit>(['mm', 'cm', 'm', 'in', 'ft']);
const ANGLE_UNITS = new Set<AngleUnit>(['rad', 'deg']);

function ensureFinite(value: number): number {
  if (!Number.isFinite(value)) throw new Error('Parameter expression produced a non-finite value.');
  return value;
}

function tokenize(expression: string): Token[] {
  const tokens: Token[] = [];
  let index = 0;
  while (index < expression.length) {
    const char = expression[index]!;
    if (/\s/.test(char)) {
      index += 1;
      continue;
    }
    if ('+-*/()'.includes(char)) {
      tokens.push({ type: 'operator', value: char as '+' | '-' | '*' | '/' | '(' | ')' });
      index += 1;
      continue;
    }
    if (/[0-9.]/.test(char)) {
      const start = index;
      let dots = 0;
      while (index < expression.length && /[0-9.eE+-]/.test(expression[index]!)) {
        const current = expression[index]!;
        if (current === '.') dots += 1;
        if ((current === '+' || current === '-') && index > start && !/[eE]/.test(expression[index - 1]!)) break;
        if ((current === 'e' || current === 'E') && !/[0-9.]/.test(expression[index - 1]!)) break;
        index += 1;
      }
      const raw = expression.slice(start, index);
      if (dots > 1 || raw === '.' || !Number.isFinite(Number(raw))) throw new Error(`Invalid number '${raw}'.`);
      tokens.push({ type: 'number', value: Number(raw) });
      continue;
    }
    if (/[A-Za-z_]/.test(char)) {
      const start = index;
      index += 1;
      while (index < expression.length && /[A-Za-z0-9_]/.test(expression[index]!)) index += 1;
      tokens.push({ type: 'identifier', value: expression.slice(start, index) });
      continue;
    }
    throw new Error(`Unsupported token '${char}' in parameter expression.`);
  }
  tokens.push({ type: 'eof' });
  return tokens;
}

function literalWithUnit(value: number, unit: string): CadParameterValue | null {
  if (LENGTH_UNITS.has(unit as LengthUnit)) {
    return { dimension: 'length', value: toMillimeters(value, unit as LengthUnit) };
  }
  if (ANGLE_UNITS.has(unit as AngleUnit)) {
    return { dimension: 'angle', value: toRadians(value, unit as AngleUnit) };
  }
  return null;
}

function add(left: CadParameterValue, right: CadParameterValue, subtract = false): CadParameterValue {
  if (left.dimension !== right.dimension) {
    throw new Error(`Dimension mismatch: cannot ${subtract ? 'subtract' : 'add'} ${left.dimension} and ${right.dimension}.`);
  }
  return { dimension: left.dimension, value: ensureFinite(left.value + (subtract ? -right.value : right.value)) };
}

function multiply(left: CadParameterValue, right: CadParameterValue): CadParameterValue {
  if (left.dimension === 'scalar') return { dimension: right.dimension, value: ensureFinite(left.value * right.value) };
  if (right.dimension === 'scalar') return { dimension: left.dimension, value: ensureFinite(left.value * right.value) };
  throw new Error(`Unsupported dimension multiplication: ${left.dimension} × ${right.dimension}.`);
}

function divide(left: CadParameterValue, right: CadParameterValue): CadParameterValue {
  if (right.value === 0) throw new Error('Parameter expression cannot divide by zero.');
  if (right.dimension === 'scalar') return { dimension: left.dimension, value: ensureFinite(left.value / right.value) };
  if (left.dimension === right.dimension) return { dimension: 'scalar', value: ensureFinite(left.value / right.value) };
  throw new Error(`Unsupported dimension division: ${left.dimension} ÷ ${right.dimension}.`);
}

class Parser {
  private index = 0;

  constructor(
    private readonly tokens: Token[],
    private readonly variables: Readonly<Record<string, CadParameterValue>>,
  ) {}

  parse(): CadParameterValue {
    const value = this.parseAdditive();
    if (this.peek().type !== 'eof') throw new Error('Unexpected trailing parameter expression input.');
    return value;
  }

  private peek(): Token {
    return this.tokens[this.index] ?? { type: 'eof' };
  }

  private take(): Token {
    const token = this.peek();
    this.index += 1;
    return token;
  }

  private matchOperator(operator: '+' | '-' | '*' | '/' | '(' | ')'): boolean {
    const token = this.peek();
    if (token.type !== 'operator' || token.value !== operator) return false;
    this.index += 1;
    return true;
  }

  private parseAdditive(): CadParameterValue {
    let value = this.parseMultiplicative();
    while (true) {
      if (this.matchOperator('+')) value = add(value, this.parseMultiplicative());
      else if (this.matchOperator('-')) value = add(value, this.parseMultiplicative(), true);
      else return value;
    }
  }

  private parseMultiplicative(): CadParameterValue {
    let value = this.parseUnary();
    while (true) {
      if (this.matchOperator('*')) value = multiply(value, this.parseUnary());
      else if (this.matchOperator('/')) value = divide(value, this.parseUnary());
      else return value;
    }
  }

  private parseUnary(): CadParameterValue {
    if (this.matchOperator('+')) return this.parseUnary();
    if (this.matchOperator('-')) {
      const value = this.parseUnary();
      return { ...value, value: -value.value };
    }
    return this.parsePrimary();
  }

  private parsePrimary(): CadParameterValue {
    if (this.matchOperator('(')) {
      const value = this.parseAdditive();
      if (!this.matchOperator(')')) throw new Error('Missing closing parenthesis in parameter expression.');
      return value;
    }

    const token = this.take();
    if (token.type === 'number') {
      const unitToken = this.peek();
      if (unitToken.type === 'identifier') {
        const literal = literalWithUnit(token.value, unitToken.value);
        if (literal) {
          this.take();
          return literal;
        }
      }
      return { dimension: 'scalar', value: token.value };
    }

    if (token.type === 'identifier') {
      const value = this.variables[token.value];
      if (!value) throw new Error(`Unknown parameter '${token.value}'.`);
      return value;
    }

    throw new Error('Expected a number, parameter name, or parenthesized expression.');
  }
}

export function evaluateParameterExpression(
  expression: string,
  variables: Readonly<Record<string, CadParameterValue>>,
): CadParameterValue {
  if (!expression.trim()) throw new Error('Parameter expression cannot be empty.');
  return new Parser(tokenize(expression), variables).parse();
}

export function evaluateParameterDefinitions(definitions: readonly CadParameterDefinition[]): Map<string, CadParameterValue> {
  const byName = new Map<string, CadParameterDefinition>();
  for (const definition of definitions) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(definition.name)) throw new Error(`Invalid parameter name '${definition.name}'.`);
    if (byName.has(definition.name)) throw new Error(`Duplicate parameter name '${definition.name}'.`);
    byName.set(definition.name, definition);
  }

  const resolved = new Map<string, CadParameterValue>();
  const active: string[] = [];

  const resolve = (name: string): CadParameterValue => {
    const cached = resolved.get(name);
    if (cached) return cached;
    const definition = byName.get(name);
    if (!definition) throw new Error(`Unknown parameter '${name}'.`);
    const cycleAt = active.indexOf(name);
    if (cycleAt >= 0) {
      throw new Error(`Parameter dependency cycle: ${[...active.slice(cycleAt), name].join(' -> ')}.`);
    }

    active.push(name);
    try {
      const variables = new Proxy({} as Record<string, CadParameterValue>, {
        get: (_target, property) => typeof property === 'string' && byName.has(property) ? resolve(property) : undefined,
        has: (_target, property) => typeof property === 'string' && byName.has(property),
      });
      const value = evaluateParameterExpression(definition.expression, variables);
      if (value.dimension !== definition.dimension) {
        throw new Error(`Parameter '${name}' declared ${definition.dimension} but expression evaluates to ${value.dimension}.`);
      }
      resolved.set(name, value);
      return value;
    } finally {
      active.pop();
    }
  };

  for (const definition of definitions) resolve(definition.name);
  return resolved;
}

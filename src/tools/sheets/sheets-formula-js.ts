import * as FormulaJS from '@formulajs/formulajs';
import type { CellPrimitive } from './sheets-types';

export const FORMULAJS_PACKAGE = '@formulajs/formulajs';
export const FORMULAJS_VERSION = '4.6.1';

type FormulaJsFunction = (...args: unknown[]) => unknown;

function isFn(value: unknown): value is FormulaJsFunction {
  return typeof value === 'function';
}

function formulaJsTable(): Record<string, unknown> {
  return FormulaJS as unknown as Record<string, unknown>;
}

export function formulaJsFunctionNames(): string[] {
  const names: string[] = [];
  for (const [key, value] of Object.entries(formulaJsTable())) {
    if (key === 'default' || !isFn(value)) continue;
    if (!/^[A-Z][A-Z0-9]*$/.test(key)) continue;
    names.push(key);
  }
  return names.sort();
}

export function hasFormulaJsFunction(name: string): boolean {
  return isFn(formulaJsTable()[name]);
}

export function callFormulaJs(name: string, args: unknown[]): unknown {
  const fn = formulaJsTable()[name];
  if (!isFn(fn)) {
    throw new Error(`Unknown Formula.js function ${name}`);
  }
  return fn(...args);
}

export function jsErrorCode(error: Error): '#REF!' | '#DIV/0!' | '#VALUE!' | '#NAME?' | '#CYCLE!' | '#N/A' | '#SPILL!' | '#CALC!' | '#NUM!' {
  const text = error.message.trim().toUpperCase();
  if (text.startsWith('#DIV/0')) return '#DIV/0!';
  if (text.startsWith('#REF')) return '#REF!';
  if (text.startsWith('#NAME')) return '#NAME?';
  if (text.startsWith('#N/A')) return '#N/A';
  if (text.startsWith('#SPILL')) return '#SPILL!';
  if (text.startsWith('#CALC')) return '#CALC!';
  if (text.startsWith('#CYCLE')) return '#CYCLE!';
  if (text.startsWith('#NUM')) return '#NUM!';
  return '#VALUE!';
}

export function isoDate(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function toJsPrimitive(value: unknown): unknown {
  if (value instanceof Error) return value;
  if (value instanceof Date) return value;
  if (value === null || value === undefined) return null;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
  return value;
}

export function storedPrimitive(value: unknown): CellPrimitive | null {
  if (value === null || value === undefined || value === '') return null;
  if (value instanceof Date) return isoDate(value);
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
  return String(value);
}

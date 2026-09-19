export const TOOL_ID = 'inmotools-tabular-sheet-workstation';
export const SCHEMA_VERSION = 1 as const;

export type CellPrimitive = string | number | boolean;

export interface CellStyle {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  color?: string;
  fill?: string;
  align?: 'left' | 'center' | 'right';
  wrap?: boolean;
}

export interface SheetCell {
  v?: CellPrimitive | null;
  f?: string | null;
  z?: string;
  s?: CellStyle;
  hyperlink?: string;
  note?: string;
}

export interface MergeRange {
  r1: number;
  c1: number;
  r2: number;
  c2: number;
}

export interface NamedRange {
  name: string;
  sheetId: string;
  a1: string;
}

export interface ValidationRule {
  id: string;
  sheetId: string;
  a1: string;
  kind: 'list' | 'number' | 'text-length' | 'custom';
  argument: string;
  message: string;
}

export interface ConditionalFormat {
  id: string;
  sheetId: string;
  a1: string;
  kind: 'gt' | 'lt' | 'eq' | 'contains';
  argument: string;
  fill: string;
  color: string;
}

export interface SheetComment {
  id: string;
  sheetId: string;
  a1: string;
  body: string;
  updatedAt: number;
}

export interface PortableSheet {
  id: string;
  name: string;
  rowCount: number;
  columnCount: number;
  cells: Record<string, SheetCell>;
  columnWidths: Record<string, number>;
  rowHeights: Record<string, number>;
  merges: MergeRange[];
  freezeRow: number;
  freezeCol: number;
  hiddenRows: number[];
  hiddenCols: number[];
  filterHeaderRow: number | null;
}

export interface PortableWorkbook {
  id: string;
  name: string;
  activeSheetId: string;
  sheets: PortableSheet[];
  namedRanges: NamedRange[];
  validations: ValidationRule[];
  conditionalFormats: ConditionalFormat[];
  comments: SheetComment[];
}

export interface ExportMeta {
  title: string;
  author: string;
  tags: string[];
  notes: string;
}

export interface WorkbookBundle {
  tool: typeof TOOL_ID;
  schemaVersion: typeof SCHEMA_VERSION;
  exportedAt: string;
  meta: ExportMeta;
  workbook: PortableWorkbook;
}

export interface SheetPrefs {
  zoom: number;
  theme: 'light' | 'high-contrast';
  lastWorkbookId: string | null;
  showProgress: boolean;
}

export type LedgerStatus = 'done' | 'stub-stage2' | 'evidence-cut';

export type FeatureStatus =
  | {
      id: number;
      title: string;
      status: 'done' | 'stub-stage2';
      note: string;
    }
  | {
      id: number;
      title: string;
      status: 'evidence-cut';
      note: string;
      evidenceUrl: string;
      asOf: string;
    };

export function cellKey(row: number, col: number): string {
  return `${row},${col}`;
}

export function parseCellKey(key: string): { row: number; col: number } | null {
  const match = /^(\d+),(\d+)$/.exec(key);
  if (!match) return null;
  return { row: Number(match[1]), col: Number(match[2]) };
}

export function emptyMeta(): ExportMeta {
  return { title: '', author: '', tags: [], notes: '' };
}

export function createSheet(name: string, id = cryptoRandomId()): PortableSheet {
  return {
    id,
    name,
    rowCount: 80,
    columnCount: 26,
    cells: {},
    columnWidths: {},
    rowHeights: {},
    merges: [],
    freezeRow: 0,
    freezeCol: 0,
    hiddenRows: [],
    hiddenCols: [],
    filterHeaderRow: null,
  };
}

export function createWorkbook(name = 'Workbook'): PortableWorkbook {
  const first = createSheet('Sheet1');
  const second = createSheet('Sheet2');
  return {
    id: cryptoRandomId(),
    name,
    activeSheetId: first.id,
    sheets: [first, second],
    namedRanges: [],
    validations: [],
    conditionalFormats: [],
    comments: [],
  };
}

export function cryptoRandomId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `id-${Math.random().toString(36).slice(2, 12)}${Date.now().toString(36)}`;
}

export function defaultPrefs(): SheetPrefs {
  return {
    zoom: 100,
    theme: 'light',
    lastWorkbookId: null,
    showProgress: true,
  };
}

export function starterWorkbook(): PortableWorkbook {
  const book = createWorkbook('Local starter');
  const [sheet1, sheet2] = book.sheets;
  if (!sheet1 || !sheet2) return book;
  sheet1.cells[cellKey(0, 0)] = { v: 'Item' };
  sheet1.cells[cellKey(0, 1)] = { v: 'Qty' };
  sheet1.cells[cellKey(0, 2)] = { v: 'Price' };
  sheet1.cells[cellKey(0, 3)] = { v: 'Line' };
  sheet1.cells[cellKey(1, 0)] = { v: 'Paper' };
  sheet1.cells[cellKey(1, 1)] = { v: 4 };
  sheet1.cells[cellKey(1, 2)] = { v: 2.5 };
  sheet1.cells[cellKey(1, 3)] = { f: '=B2*C2' };
  sheet1.cells[cellKey(2, 0)] = { v: 'Ink' };
  sheet1.cells[cellKey(2, 1)] = { v: 2 };
  sheet1.cells[cellKey(2, 2)] = { v: 6 };
  sheet1.cells[cellKey(2, 3)] = { f: '=B3*C3' };
  sheet1.cells[cellKey(3, 0)] = { v: 'Total' };
  sheet1.cells[cellKey(3, 3)] = { f: '=SUM(D2:D3)+TaxRate' };
  sheet1.cells[cellKey(4, 0)] = { v: 'Other sheet' };
  sheet1.cells[cellKey(4, 1)] = { f: '=Sheet2!B1' };
  sheet2.cells[cellKey(0, 0)] = { v: 'Tax rate' };
  sheet2.cells[cellKey(0, 1)] = { v: 0.08 };
  book.namedRanges = [{ name: 'TaxRate', sheetId: sheet2.id, a1: 'B1' }];
  return book;
}

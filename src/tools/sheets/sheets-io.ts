import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import * as XLSX from 'xlsx';
import { a1FromParts, columnLetters } from './sheets-formula';
import { safeHyperlink, toArgb } from './sheets-grid';
import {
  SCHEMA_VERSION,
  TOOL_ID,
  cellKey,
  createSheet,
  createWorkbook,
  emptyMeta,
  parseCellKey,
  type CellStyle,
  type ExportMeta,
  type PortableSheet,
  type PortableWorkbook,
  type WorkbookBundle,
} from './sheets-types';

export function toBundle(workbook: PortableWorkbook, meta: ExportMeta, now = new Date()): WorkbookBundle {
  return {
    tool: TOOL_ID,
    schemaVersion: SCHEMA_VERSION,
    exportedAt: now.toISOString(),
    meta: {
      title: meta.title.trim(),
      author: meta.author.trim(),
      tags: uniqueTags(meta.tags),
      notes: meta.notes.trim(),
    },
    workbook,
  };
}

export function parseBundle(value: unknown): WorkbookBundle | null {
  if (value === null || typeof value !== 'object') return null;
  const record = value as Partial<WorkbookBundle>;
  if (record.tool !== TOOL_ID) return null;
  if (record.schemaVersion !== SCHEMA_VERSION) return null;
  if (!record.workbook || typeof record.workbook !== 'object') return null;
  const workbook = record.workbook as PortableWorkbook;
  if (!Array.isArray(workbook.sheets) || workbook.sheets.length === 0) return null;
  return {
    tool: TOOL_ID,
    schemaVersion: SCHEMA_VERSION,
    exportedAt: typeof record.exportedAt === 'string' ? record.exportedAt : new Date().toISOString(),
    meta: {
      title: typeof record.meta?.title === 'string' ? record.meta.title : '',
      author: typeof record.meta?.author === 'string' ? record.meta.author : '',
      tags: Array.isArray(record.meta?.tags) ? uniqueTags(record.meta.tags.filter((tag): tag is string => typeof tag === 'string')) : [],
      notes: typeof record.meta?.notes === 'string' ? record.meta.notes : '',
    },
    workbook,
  };
}

export function uniqueTags(tags: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const tag of tags) {
    const trimmed = tag.trim();
    const key = trimmed.toLocaleLowerCase();
    if (!trimmed || seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
  }
  return out;
}

export function spreadsheetSafeText(value: unknown): string {
  const text = value === null || value === undefined ? '' : String(value);
  return /^[=+\-@]/.test(text) ? `'${text}` : text;
}

export function sheetToMatrix(sheet: PortableSheet): Array<Array<string | number | boolean>> {
  const matrix: Array<Array<string | number | boolean>> = [];
  for (let row = 0; row < sheet.rowCount; row += 1) {
    const line: Array<string | number | boolean> = [];
    let last = -1;
    for (let col = 0; col < sheet.columnCount; col += 1) {
      const cell = sheet.cells[cellKey(row, col)];
      const value = cell?.f ? cell.f : cell?.v;
      if (value !== null && value !== undefined && value !== '') {
        line[col] = value;
        last = col;
      }
    }
    if (last >= 0) {
      for (let col = 0; col <= last; col += 1) line[col] = line[col] ?? '';
      matrix[row] = line;
    }
  }
  const lastRow = matrix.reduce((max, row, index) => (row ? index : max), -1);
  if (lastRow < 0) return [];
  return Array.from({ length: lastRow + 1 }, (_, row) => matrix[row] ?? []);
}

export function sheetToCsv(sheet: PortableSheet): string {
  const matrix = sheetToMatrix(sheet);
  return matrix.map((row) => row.map((value) => csvField(spreadsheetSafeText(value))).join(',')).join('\n');
}

function csvField(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replaceAll('"', '""')}"`;
  return value;
}

export function importCsv(text: string, name = 'CSV'): PortableWorkbook {
  const book = createWorkbook(name);
  const sheet = book.sheets[0] ?? createSheet('CSV');
  sheet.name = name.replace(/\.[^.]+$/, '') || 'CSV';
  const rows = parseCsv(text);
  rows.forEach((row, r) => {
    row.forEach((value, c) => {
      if (value === '') return;
      const numeric = Number(value);
      sheet.cells[cellKey(r, c)] = { v: value.startsWith('=') ? undefined : Number.isFinite(numeric) && value.trim() !== '' ? numeric : value, f: value.startsWith('=') ? value : null };
    });
    sheet.rowCount = Math.max(sheet.rowCount, r + 8);
    sheet.columnCount = Math.max(sheet.columnCount, row.length + 2);
  });
  book.sheets = [sheet];
  book.activeSheetId = sheet.id;
  return book;
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (char === '"') quoted = false;
      else field += char;
      continue;
    }
    if (char === '"') {
      quoted = true;
      continue;
    }
    if (char === ',') {
      row.push(field);
      field = '';
      continue;
    }
    if (char === '\n' || char === '\r') {
      if (char === '\r' && text[i + 1] === '\n') i += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      continue;
    }
    field += char;
  }
  row.push(field);
  if (row.some((item) => item !== '')) rows.push(row);
  return rows;
}

interface SheetJsCell {
  v?: string | number | boolean | null;
  w?: string;
  f?: string;
  z?: string;
  l?: { Target?: string };
}

export function importXlsx(buffer: ArrayBuffer, fileName = 'Imported'): PortableWorkbook {
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: false, cellFormula: true, cellNF: true });
  const book = createWorkbook(fileName.replace(/\.[^.]+$/, '') || 'Imported');
  const sheets = workbook.SheetNames.map((name) => {
    const sheet = createSheet(name);
    const ws = workbook.Sheets[name] ?? {};
    const addresses = Object.keys(ws).filter((key) => !key.startsWith('!'));
    for (const addr of addresses) {
      const parsed = XLSX.utils.decode_cell(addr);
      const cell = ws[addr] as SheetJsCell | undefined;
      if (!cell) continue;
      const formula = cell.f ? (cell.f.startsWith('=') ? cell.f : `=${cell.f}`) : null;
      const value = cell.v ?? null;
      if ((value === null || value === '') && !formula) continue;
      sheet.cells[cellKey(parsed.r, parsed.c)] = {
        v: formula ? (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'string' ? value : null) : value,
        f: formula,
        z: typeof cell.z === 'string' && cell.z !== 'General' ? cell.z : undefined,
        hyperlink: safeHyperlink(cell.l?.Target) ?? undefined,
      };
      sheet.columnCount = Math.max(sheet.columnCount, parsed.c + 2);
      sheet.rowCount = Math.max(sheet.rowCount, parsed.r + 8);
    }
    const merges = ws['!merges'] ?? [];
    sheet.merges = merges.map((merge) => ({
      r1: merge.s.r,
      c1: merge.s.c,
      r2: merge.e.r,
      c2: merge.e.c,
    }));
    return sheet;
  });
  book.sheets = sheets.length ? sheets : [createSheet('Sheet1')];
  book.activeSheetId = book.sheets[0]?.id ?? book.activeSheetId;
  return book;
}

export async function exportXlsx(workbook: PortableWorkbook, meta: ExportMeta = emptyMeta()): Promise<Uint8Array> {
  const excel = new ExcelJS.Workbook();
  excel.creator = meta.author || 'Tabular Sheet Workstation';
  excel.title = meta.title || workbook.name;
  excel.description = [meta.notes, meta.tags.length ? `tags: ${meta.tags.join(', ')}` : ''].filter(Boolean).join('\n');
  excel.created = new Date();
  for (const sheet of workbook.sheets) {
    const ws = excel.addWorksheet(sheet.name);
    for (const [key, cell] of Object.entries(sheet.cells)) {
      const parsed = parseCellKey(key);
      if (!parsed) continue;
      const target = ws.getCell(parsed.row + 1, parsed.col + 1);
      if (cell.f) target.value = { formula: cell.f.replace(/^=/, ''), result: typeof cell.v === 'number' ? cell.v : undefined };
      else if (cell.v !== null && cell.v !== undefined) target.value = cell.v;
      if (cell.z) target.numFmt = cell.z;
      if (cell.s?.bold) target.font = { ...(target.font ?? {}), bold: true };
      if (cell.s?.italic) target.font = { ...(target.font ?? {}), italic: true };
      if (cell.s?.underline) target.font = { ...(target.font ?? {}), underline: true };
      if (cell.s?.color) target.font = { ...(target.font ?? {}), color: { argb: toArgb(cell.s.color) } };
      if (cell.s?.fill) target.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: toArgb(cell.s.fill) } };
      if (cell.s?.wrap) target.alignment = { ...(target.alignment ?? {}), wrapText: true };
      const href = safeHyperlink(cell.hyperlink);
      if (href) target.value = { text: String(cell.v ?? href), hyperlink: href };
      if (cell.note) target.note = cell.note;
    }
    for (const merge of sheet.merges) {
      ws.mergeCells(a1FromParts(merge.r1, merge.c1), a1FromParts(merge.r2, merge.c2));
    }
    if (sheet.freezeRow || sheet.freezeCol) {
      ws.views = [{ state: 'frozen', xSplit: sheet.freezeCol, ySplit: sheet.freezeRow }];
    }
    Object.entries(sheet.columnWidths).forEach(([col, width]) => {
      ws.getColumn(Number(col) + 1).width = width / 8;
    });
  }
  const buffer = await excel.xlsx.writeBuffer();
  return new Uint8Array(buffer instanceof ArrayBuffer ? buffer : buffer);
}

export async function exportBundleZip(workbook: PortableWorkbook, meta: ExportMeta): Promise<Uint8Array> {
  const zip = new JSZip();
  zip.file('workbook.json', JSON.stringify(toBundle(workbook, meta), null, 2));
  zip.file('meta.json', JSON.stringify({ tool: TOOL_ID, schemaVersion: SCHEMA_VERSION, ...meta }, null, 2));
  const blob = await zip.generateAsync({ type: 'uint8array' });
  return blob;
}

export async function importBundleZip(buffer: ArrayBuffer): Promise<WorkbookBundle | null> {
  const zip = await JSZip.loadAsync(buffer);
  const file = zip.file('workbook.json');
  if (!file) return null;
  const parsed = JSON.parse(await file.async('string')) as unknown;
  return parseBundle(parsed);
}

export function univerLikeSnapshot(workbook: PortableWorkbook): Record<string, unknown> {
  const sheets: Record<string, unknown> = {};
  for (const sheet of workbook.sheets) {
    const cellData: Record<string, Record<string, unknown>> = {};
    for (const [key, cell] of Object.entries(sheet.cells)) {
      const parsed = parseCellKey(key);
      if (!parsed) continue;
      const row = cellData[parsed.row] ?? {};
      row[parsed.col] = {
        v: cell.v ?? undefined,
        f: cell.f ?? undefined,
        s: univerCellStyle(cell.s, cell.z),
      };
      cellData[parsed.row] = row;
    }
    sheets[sheet.id] = {
      id: sheet.id,
      name: sheet.name,
      rowCount: sheet.rowCount,
      columnCount: sheet.columnCount,
      cellData,
      mergeData: sheet.merges.map((merge) => ({
        startRow: merge.r1,
        startColumn: merge.c1,
        endRow: merge.r2,
        endColumn: merge.c2,
      })),
      freeze: {
        startRow: sheet.freezeRow,
        startColumn: sheet.freezeCol,
        ySplit: sheet.freezeRow,
        xSplit: sheet.freezeCol,
      },
    };
  }
  return {
    id: workbook.id,
    name: workbook.name,
    appVersion: '0.25.1',
    locale: 'enUS',
    sheetOrder: workbook.sheets.map((sheet) => sheet.id),
    sheets,
    styles: {},
    custom: {
      namedRanges: workbook.namedRanges,
      comments: workbook.comments,
      validations: workbook.validations,
      conditionalFormats: workbook.conditionalFormats,
    },
  };
}

function univerCellStyle(style: CellStyle | undefined, z?: string): Record<string, unknown> | undefined {
  if (!style && !z) return undefined;
  return {
    bl: style?.bold ? 1 : 0,
    it: style?.italic ? 1 : 0,
    ul: { s: style?.underline ? 1 : 0 },
    cl: style?.color ? { rgb: style.color } : undefined,
    bg: style?.fill ? { rgb: style.fill } : undefined,
    ht: style?.align === 'center' ? 2 : style?.align === 'right' ? 3 : 1,
    tb: style?.wrap ? 3 : style?.overflow === 'overflow' ? 1 : 2,
    n: z && z !== 'General' ? { pattern: z } : undefined,
  };
}

export function filenameFor(workbook: PortableWorkbook, meta: ExportMeta, ext: string): string {
  const base = (meta.title || workbook.name || 'workbook').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'workbook';
  return `${base}.${ext}`;
}

export function usedColumns(sheet: PortableSheet): number {
  let max = 3;
  for (const key of Object.keys(sheet.cells)) {
    const parsed = parseCellKey(key);
    if (parsed) max = Math.max(max, parsed.col + 1);
  }
  return Math.max(max, 1);
}

export function headerLabels(count: number): string[] {
  return Array.from({ length: count }, (_, index) => columnLetters(index));
}

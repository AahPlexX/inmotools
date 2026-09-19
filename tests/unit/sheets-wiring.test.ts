import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { TOOLS, TOOL_BY_SLUG } from '../../src/catalog';
import { selectE2eSpecs } from '../../scripts/select-e2e-specs.mjs';
import { assertNoProImports } from '../../src/tools/sheets/sheets-univer';
import { suppressNativeContextMenu } from '../../src/tools/sheets/sheets-context-menu';
import { FEATURE_PROGRESS, progressSummary } from '../../src/tools/sheets/sheets-progress';
import { pivotSheet } from '../../src/tools/sheets/sheets-pivot';
import { importCsv, importXlsx, sheetToCsv } from '../../src/tools/sheets/sheets-io';
import { cellKey } from '../../src/tools/sheets/sheets-types';
import * as XLSX from 'xlsx';

const read = (path: string): string => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const SLUG = 'tabular-sheet-workstation';

describe('tabular sheet workstation wiring', () => {
  it('registers one catalog entry and a lazy sheets workspace', () => {
    expect(TOOLS.filter((tool) => tool.slug === SLUG)).toHaveLength(1);
    const tool = TOOL_BY_SLUG.get(SLUG);
    expect(tool?.privacy).toMatch(/IndexedDB|browser/i);
    expect(tool?.accepts).toMatch(/XLSX/i);
    expect(tool?.outputs).toMatch(/CSV/i);
    expect(read('src/tools/workspaces.tsx')).toContain(`'${SLUG}': () => import('./sheets/SheetsWorkspace')`);
  });

  it('keeps source free of Univer Pro and HyperFormula', () => {
    assertNoProImports(read('src/tools/sheets/SheetsWorkspace.tsx'));
    assertNoProImports(read('src/tools/sheets/sheets-formula.ts'));
    assertNoProImports(read('src/tools/sheets/sheets-io.ts'));
    assertNoProImports(read('src/tools/sheets/sheets-univer.ts'));
    const pkg = read('package.json');
    expect(pkg).toContain('"@univerjs/presets": "0.25.1"');
    expect(pkg).toContain('"@univerjs/preset-sheets-core": "0.25.1"');
    expect(pkg).toContain('cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz');
    expect(pkg).not.toMatch(/"chart\.js": "4\.5\.1".*"chart\.js"/s);
    expect(pkg).not.toContain('@univerjs-pro/');
    expect(pkg).not.toContain('hyperformula');
  });

  it('maps suite source to the shared app/accessibility specs until a dedicated browser spec exists', () => {
    expect(selectE2eSpecs(['src/tools/sheets/SheetsWorkspace.tsx'])).toEqual([
      'tests/e2e/app.spec.ts',
      'tests/e2e/accessibility.spec.ts',
    ]);
  });

  it('keeps the 36-feature ledger complete with locked statuses', () => {
    expect(FEATURE_PROGRESS).toHaveLength(36);
    expect(FEATURE_PROGRESS.map((row) => row.id)).toEqual(Array.from({ length: 36 }, (_, index) => index + 1));
    const allowed = new Set(['done', 'stub-stage2', 'in-progress']);
    expect(FEATURE_PROGRESS.every((row) => allowed.has(row.status))).toBe(true);
    const summary = progressSummary();
    expect(summary.done + summary.stubStage2 + summary.inProgress).toBe(36);
    expect(FEATURE_PROGRESS.find((row) => row.id === 21)?.status).toBe('done');
    expect(FEATURE_PROGRESS.find((row) => row.id === 21)?.note).toMatch(/OSS replacement/i);
    expect(FEATURE_PROGRESS.find((row) => row.id === 22)?.status).toBe('done');
    expect(FEATURE_PROGRESS.find((row) => row.id === 22)?.note).toMatch(/OSS replacement/i);
    expect(FEATURE_PROGRESS.find((row) => row.id === 24)?.status).toBe('stub-stage2');
  });

  it('reserves Feature 24 as stub hooks only', () => {
    const event = { prevented: false, preventDefault() { this.prevented = true; } };
    suppressNativeContextMenu(event);
    expect(event.prevented).toBe(true);
    const workspace = read('src/tools/sheets/SheetsWorkspace.tsx');
    expect(workspace).toContain('suppressNativeContextMenu');
    expect(workspace).toContain('scheduleLongPressStub');
    expect(workspace).not.toContain('openMenu');
    expect(workspace).not.toContain('tsw-context');
    expect(read('src/tools/sheets/sheets-univer.ts')).toContain('contextMenu: false');
  });

  it('imports CSV and XLSX and exports formula-safe CSV', () => {
    const csvBook = importCsv('name,qty\n=CMD,2\nAda,3');
    const csv = sheetToCsv(csvBook.sheets[0]!);
    expect(csv).toContain("'=CMD");
    const aoa = [['A', 1], ['B', 2]];
    const sheet = XLSX.utils.aoa_to_sheet(aoa);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, sheet, 'Data');
    const buffer = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
    const imported = importXlsx(buffer, 'demo.xlsx');
    expect(imported.sheets[0]?.cells[cellKey(0, 0)]?.v).toBe('A');
  });

  it('builds an in-house pivot without a Pro engine', () => {
    const book = importCsv('dept,amount\nops,4\nops,6\ndev,10');
    const result = pivotSheet(book.sheets[0]!, { headerRow: 0, groupCol: 0, valueCol: 1, agg: 'sum' });
    expect(result.rows).toEqual([
      { group: 'dev', value: 10 },
      { group: 'ops', value: 10 },
    ]);
  });
});

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
    const catalogCopy = `${tool?.summary} ${tool?.hint} ${tool?.steps.join(' ')}`;
    expect(tool?.summary).toBe('Edit multi-sheet workbooks in this browser: formula bar, AutoSum, paste special, named ranges, FILTER/SORT/UNIQUE spill, column/line/pie charts, and an in-house pivot. Import and export stay on this device.');
    expect(tool?.hint).toBe('Paste special, text to columns, and remove duplicates run on the local grid. FILTER, SORT, and UNIQUE spill into empty neighboring cells; a blocked spill writes #SPILL!. Cell comments survive XLSX and portable bundle export. Univer Pro and HyperFormula are not used. Browser memory still bounds very large workbooks.');
    expect(catalogCopy).not.toMatch(/seamless|robust|empower|unlock|delve/i);
    expect(tool?.summary).not.toMatch(/sheets-core|engine-formula|Univer/i);
    expect(read('src/tools/sheets/sheets.css')).toMatch(/@media print/);
    expect(read('src/tools/sheets/SheetsWorkspace.tsx')).toContain('tsw-parity-chrome');
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
    expect(pkg).toContain('"@formulajs/formulajs": "4.6.1"');
    expect(pkg).not.toMatch(/\^4\.6\.1/);
    expect(pkg).not.toContain('@univerjs-pro/');
    expect(pkg).not.toContain('hyperformula');
  });

  it('maps suite source to the dedicated Stage 2 browser spec', () => {
    expect(selectE2eSpecs(['src/tools/sheets/SheetsWorkspace.tsx'])).toEqual([
      'tests/e2e/tabular-sheet-workstation.spec.ts',
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
    expect(FEATURE_PROGRESS.find((row) => row.id === 24)?.status).toBe('done');
    expect([3, 11, 12, 17, 18, 19, 24, 27].every((id) => FEATURE_PROGRESS.find((row) => row.id === id)?.status === 'done')).toBe(true);
  });

  it('makes the overflowing feature-progress list keyboard-focusable', () => {
    const workspace = read('src/tools/sheets/SheetsWorkspace.tsx');
    const css = read('src/tools/sheets/sheets.css');
    expect(css).toMatch(/\.tsw-progress\s*\{[^}]*overflow:\s*auto/);
    expect(workspace).toMatch(/<ol className="tsw-progress"[^>]*tabIndex=\{0\}/);
    expect(workspace).toMatch(/<ol className="tsw-progress"[^>]*aria-label="Feature progress"/);
  });

  it('wires Feature 24 reserved hooks to a real context-menu surface', () => {
    const event = { prevented: false, preventDefault() { this.prevented = true; } };
    suppressNativeContextMenu(event);
    expect(event.prevented).toBe(true);
    const workspace = read('src/tools/sheets/SheetsWorkspace.tsx');
    expect(workspace).toContain('suppressNativeContextMenu');
    expect(workspace).toContain('scheduleLongPressStub');
    expect(workspace).toContain('tsw-context-menu');
    expect(read('src/tools/sheets/sheets-univer.ts')).toContain('contextMenu: false');
  });

  it('imports CSV and XLSX and exports formula-safe CSV', () => {
    const csvBook = importCsv('name,qty\n=CMD,2\n\nAda,3');
    const csv = sheetToCsv(csvBook.sheets[0]!);
    expect(csv).toContain("'=CMD");
    expect(csv.split('\n')).toHaveLength(4);
    const sheet = XLSX.utils.aoa_to_sheet([['A', 1, { t: 'n', f: 'A1+B1', v: 3 }], ['B', 2]]);
    sheet['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 1, c: 0 } }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, sheet, 'Data');
    const buffer = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
    const imported = importXlsx(buffer, 'demo.xlsx');
    expect(imported.sheets[0]?.cells[cellKey(0, 0)]?.v).toBe('A');
    expect(imported.sheets[0]?.cells[cellKey(0, 2)]?.f).toMatch(/^=A1\+B1$/);
    expect(imported.sheets[0]?.merges).toEqual([expect.objectContaining({ r1: 0, c1: 0, r2: 1, c2: 0 })]);
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

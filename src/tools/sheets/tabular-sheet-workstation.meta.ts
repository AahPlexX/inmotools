import type { ToolMeta } from '../../tool-meta';

export default {
  slug: "tabular-sheet-workstation",
  category: "data",
  shortTitle: "Tabular Sheet Workstation",
  title: "Tabular Sheet Workstation — Local Multi-Sheet Workbook, Formulas & Portable Export",
  audience: "Analysts · finance · operations · students",
  summary: "Edit multi-sheet workbooks in this browser: formula bar, AutoSum, paste special, named ranges, FILTER/SORT/UNIQUE spill, column/line/pie charts, and a local PivotTable. Import and export stay on this device.",
  privacy: "Every workbook, preference, comment, and export is kept in this browser via IndexedDB and LocalStorage. Nothing is uploaded and no account is required.",
  accepts: "XLSX via SheetJS CE, CSV, and portable Tabular Sheet Workstation JSON/zip bundles",
  outputs: "XLSX via exceljs, CSV, and tagged portable JSON/zip bundles",
  steps: [
    "Add sheets, enter values or formulas, then use AutoSum, Insert function, or the formula bar.",
    "Select a contiguous table and create a PivotTable; it writes to a new sheet at A1, or to a destination cell you choose.",
    "Save the workbook in this browser, or export XLSX, CSV, or a tagged portable bundle.",
  ],
  hint: "Paste special, text to columns, and remove duplicates run on the local grid. FILTER, SORT, and UNIQUE spill into empty neighboring cells; a blocked spill writes #SPILL!. Create a PivotTable from a contiguous range and refresh it from the source. GETPIVOTDATA reads those local pivot values. Cell comments survive XLSX and portable bundle export. Univer Pro and HyperFormula are not used. Browser memory still bounds very large workbooks.",
  load: () => import('./SheetsWorkspace'),
} satisfies ToolMeta;

import type { ToolMeta } from '../../tool-meta';

export default {
  slug: "duckdb-workbench",
  category: "data",
  shortTitle: "DuckDB Workbench",
  title: "DuckDB-Wasm In-Browser Parquet & CSV SQL Query Workbench",
  audience: "Data analysts · BI developers · data engineers",
  summary: "Open local CSV or Parquet extracts, query them with DuckDB-Wasm, inspect result rows, and export query output.",
  privacy: "Your selected data files stay on this device. SQL executes inside a browser Web Worker using WebAssembly.",
  accepts: "CSV and Parquet files",
  outputs: "Interactive result table plus CSV or JSON export",
  steps: [
    "Choose one or more local data files.",
    "Write SQL using the file name in FROM.",
    "Run the query and export only the result you need.",
  ],
  hint: "For very large files, keep the query selective. Browser memory is finite even though the data never needs to leave your device.",
  load: () => import('./DuckDbWorkspace'),
} satisfies ToolMeta;

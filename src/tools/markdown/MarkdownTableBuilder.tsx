import { useRef, useState } from 'react';
import { buildMarkdownTable } from './table-builder';

export default function MarkdownTableBuilder({ onInsert }: { onInsert: (source: string) => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [rows, setRows] = useState('3');
  const [columns, setColumns] = useState('4');
  let table = '';
  let problem = '';
  try { table = buildMarkdownTable(Number(rows), Number(columns)); }
  catch { problem = 'Choose 1–100 whole data rows and 1–20 whole columns.'; }
  return <>
    <button type="button" onClick={() => dialogRef.current?.showModal()} title="Choose the data rows and columns for a new Markdown table.">Table builder</button>
    <dialog ref={dialogRef} className="markdown-workbench-help-dialog" aria-labelledby="markdown-table-builder-title">
      <div className="markdown-workbench-help-header">
        <h2 id="markdown-table-builder-title">Build a table</h2>
        <form method="dialog"><button type="submit">Cancel</button></form>
      </div>
      <form className="markdown-workbench-help-body markdown-table-builder-form" onSubmit={(event) => {
        event.preventDefault();
        if (problem) return;
        dialogRef.current?.close();
        onInsert(table);
      }}>
        <p>A header is added above your data rows. Edit cell contents in the source after inserting.</p>
        <label>Data rows<input type="number" min="1" max="100" step="1" required value={rows} onChange={(event) => setRows(event.target.value)} /></label>
        <label>Columns<input type="number" min="1" max="20" step="1" required value={columns} onChange={(event) => setColumns(event.target.value)} /></label>
        {problem ? <p role="alert">{problem}</p> : <p>{rows} data rows · {columns} columns</p>}
        <button type="submit" disabled={!!problem}>Insert table</button>
      </form>
    </dialog>
  </>;
}

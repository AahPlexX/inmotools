import { useRef, useState } from 'react';
import { buildMarkdownTable } from './table-builder';
import { CsvTableError, csvToMarkdownTable, markdownTableToCsv, type TableAtCursor } from './csv-table-engine';

interface MarkdownTableBuilderProps {
  readonly onInsert: (source: string) => void;
  readonly readCursorTable: () => TableAtCursor | null;
}

export default function MarkdownTableBuilder({ onInsert, readCursorTable }: MarkdownTableBuilderProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [rows, setRows] = useState('3');
  const [columns, setColumns] = useState('4');
  const [csv, setCsv] = useState('');
  const [csvProblem, setCsvProblem] = useState('');
  const [cursorTable, setCursorTable] = useState<TableAtCursor | null>(null);
  const [copyNotice, setCopyNotice] = useState('');
  let table = '';
  let problem = '';
  try { table = buildMarkdownTable(Number(rows), Number(columns)); }
  catch { problem = 'Choose 1–100 whole data rows and 1–20 whole columns.'; }
  return <>
    <button type="button" onClick={() => { setCursorTable(readCursorTable()); setCopyNotice(''); dialogRef.current?.showModal(); }} title="Build a table from a row and column count, or convert between CSV and a Markdown table.">Table builder</button>
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
      <form className="markdown-workbench-help-body markdown-table-builder-form" onSubmit={(event) => {
        event.preventDefault();
        try {
          const converted = csvToMarkdownTable(csv);
          setCsvProblem('');
          setCsv('');
          dialogRef.current?.close();
          onInsert(converted);
        } catch (error) {
          setCsvProblem(error instanceof CsvTableError ? error.message : 'Could not read that CSV.');
        }
      }}>
        <h3 className="markdown-workbench-subheading">Table from CSV</h3>
        <label>Paste CSV<textarea rows={5} value={csv} spellCheck={false} onChange={(event) => { setCsv(event.target.value); setCsvProblem(''); }} /></label>
        {csvProblem ? <p role="alert">{csvProblem}</p> : <p>The first row becomes the header. Commas, semicolons and tabs are recognised.</p>}
        <button type="submit">Insert table from CSV</button>
      </form>
      <div className="markdown-workbench-help-body markdown-table-builder-form">
        <h3 className="markdown-workbench-subheading">Table as CSV</h3>
        <p>{cursorTable ? `The table at the cursor (lines ${cursorTable.startLine}–${cursorTable.endLine}) is copied.` : 'Place the cursor inside a Markdown table to copy it as CSV.'}</p>
        <button type="button" disabled={!cursorTable} onClick={() => {
          if (!cursorTable) return;
          const text = markdownTableToCsv(cursorTable.source);
          navigator.clipboard.writeText(text)
            .then(() => setCopyNotice('Copied the table as CSV.'))
            .catch(() => setCopyNotice('This browser blocked clipboard access.'));
        }}>Copy as CSV</button>
        {copyNotice ? <p role="status">{copyNotice}</p> : null}
      </div>
    </dialog>
  </>;
}

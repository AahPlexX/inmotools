import { useMemo, useState, type ReactNode } from 'react';

// A bounded table for result sets whose size the user controls.
//
// Ten workspaces in this catalog render one element per row. That is fine for
// a sample and ruinous for real input: a query or a parse that yields tens of
// thousands of rows mounts tens of thousands of cells, and the tab stops
// responding while laying them out - after the work itself already succeeded.
// Capping what is mounted keeps a large result inspectable instead of fatal.
//
// Pagination rather than virtualisation, deliberately: a windowed list needs
// row-height measurement and an inner scroll container, and it hides the total
// from assistive technology unless carefully annotated. A page has a stable
// DOM, works with find-in-page, and states its own bounds. Export always
// covers the entire result, never the visible page, so the cap is a display
// concern and never silently truncates output.

export interface PagedTableColumn {
  readonly key: string;
  readonly label: ReactNode;
}

export interface PagedTableProps<Row> {
  readonly columns: readonly PagedTableColumn[];
  readonly rows: readonly Row[];
  readonly renderCell: (row: Row, columnKey: string) => ReactNode;
  readonly caption: string;
  readonly pageSize?: number;
  readonly rowKey?: (row: Row, index: number) => string;
  readonly testId?: string;
}

export const DEFAULT_PAGE_SIZE = 200;

export function PagedTable<Row>({
  columns,
  rows,
  renderCell,
  caption,
  pageSize = DEFAULT_PAGE_SIZE,
  rowKey,
  testId,
}: PagedTableProps<Row>) {
  const [requestedPage, setRequestedPage] = useState(0);
  const [seenRows, setSeenRows] = useState(rows);
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));

  // A new result starts at the first page. Keeping the old page number would
  // make it resurface once the result grew again - shrinking to one row and then
  // widening back would land the reader on page 7 of data they never scrolled -
  // and a page index carries no meaning across different data anyway.
  //
  // Adjusted during render, which is React's documented way to react to changed
  // input without an extra commit; correcting it afterwards in an effect paints
  // one frame with an empty body and an impossible range ("rows 1401-900 of
  // 900") before settling.
  if (seenRows !== rows) {
    setSeenRows(rows);
    setRequestedPage(0);
  }

  // Still clamped, which covers a result shrinking while its identity is
  // unchanged.
  const page = Math.min(requestedPage, pageCount - 1);
  const setPage = (next: number) => setRequestedPage(Math.min(Math.max(0, next), pageCount - 1));

  const start = page * pageSize;
  const visible = useMemo(() => rows.slice(start, start + pageSize), [rows, start, pageSize]);
  const paginated = rows.length > pageSize;

  return (
    <div className="paged-table" data-testid={testId}>
      <div className="result-table-wrap" role="region" aria-label={caption} tabIndex={0}>
        <table>
          <caption className="visually-hidden">
            {caption}
            {paginated
              ? `, showing rows ${start + 1} to ${Math.min(start + pageSize, rows.length)} of ${rows.length}`
              : `, ${rows.length} ${rows.length === 1 ? 'row' : 'rows'}`}
          </caption>
          <thead>
            <tr>{columns.map((column) => <th scope="col" key={column.key}>{column.label}</th>)}</tr>
          </thead>
          <tbody>
            {visible.map((row, index) => (
              <tr key={rowKey ? rowKey(row, start + index) : start + index}>
                {columns.map((column) => <td key={column.key}>{renderCell(row, column.key)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {paginated ? (
        <div className="paged-table-controls">
          {/* aria-disabled rather than disabled: a disabled button at the last
              page drops keyboard focus to the document body mid-interaction. */}
          <button
            type="button"
            className="action-button secondary"
            onClick={() => { if (page > 0) setPage(page - 1); }}
            aria-disabled={page === 0}
          >
            Previous
          </button>
          {/* Not a live region. The consuming workspace already owns a status
              line, and announcing a range on every debounced result would queue
              two competing announcements per pause. The caption carries the
              bounds for anyone navigating into the table. */}
          <span data-testid={testId ? `${testId}-range` : undefined}>
            Rows {start + 1}–{Math.min(start + pageSize, rows.length)} of {rows.length}
            {' · '}page {page + 1} of {pageCount}
          </span>
          <button
            type="button"
            className="action-button secondary"
            onClick={() => { if (page < pageCount - 1) setPage(page + 1); }}
            aria-disabled={page >= pageCount - 1}
          >
            Next
          </button>
        </div>
      ) : null}
    </div>
  );
}

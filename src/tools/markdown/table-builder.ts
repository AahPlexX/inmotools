const formatTableRow = (cells: readonly string[]): string => `| ${cells.join(' | ')} |`;

// A pipe table whose first row is the header. Cells are written as given; callers escape them.
export const buildTableFromRows = (rows: readonly (readonly string[])[]): string => {
  const header = rows[0] ?? [];
  return [
    formatTableRow(header),
    formatTableRow(header.map(() => '---')),
    ...rows.slice(1).map(formatTableRow),
  ].join('\n');
};

export const buildMarkdownTable = (dataRows: number, columns: number): string => {
  if (!Number.isInteger(dataRows) || dataRows < 1 || dataRows > 100
    || !Number.isInteger(columns) || columns < 1 || columns > 20) {
    throw new RangeError('Choose 1–100 whole data rows and 1–20 whole columns.');
  }
  return buildTableFromRows([
    Array.from({ length: columns }, (_, i) => `Column ${i + 1}`),
    ...Array.from({ length: dataRows }, () => Array.from({ length: columns }, () => '')),
  ]);
};

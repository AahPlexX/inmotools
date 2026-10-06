export const buildMarkdownTable = (dataRows: number, columns: number): string => {
  if (!Number.isInteger(dataRows) || dataRows < 1 || dataRows > 100
    || !Number.isInteger(columns) || columns < 1 || columns > 20) {
    throw new RangeError('Choose 1–100 whole data rows and 1–20 whole columns.');
  }
  const line = (cells: string[]) => `| ${cells.join(' | ')} |`;
  return [
    line(Array.from({ length: columns }, (_, i) => `Column ${i + 1}`)),
    line(Array.from({ length: columns }, () => '---')),
    ...Array.from({ length: dataRows }, () => line(Array.from({ length: columns }, () => ''))),
  ].join('\n');
};

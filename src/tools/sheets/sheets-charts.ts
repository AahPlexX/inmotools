import type { ChartConfiguration } from 'chart.js';
import { displayCell } from './sheets-formula';
import { collectRange } from './sheets-model';
import type { MergeRange, PortableWorkbook } from './sheets-types';

export type ChartKind = 'bar' | 'line' | 'pie';

export function chartConfigFromSelection(
  book: PortableWorkbook,
  sheetId: string,
  range: MergeRange,
  kind: ChartKind,
): ChartConfiguration {
  const cells = collectRange(book, sheetId, range);
  const cols = range.c2 - range.c1 + 1;
  const labels: string[] = [];
  const values: number[] = [];
  for (const item of cells) {
    const offset = item.col - range.c1;
    if (offset === 0 && item.row !== range.r1) labels.push(displayCell(item.cell) || `R${item.row + 1}`);
    if (cols === 1 && typeof item.cell?.v === 'number') {
      values.push(item.cell.v);
      if (labels.length < values.length) labels.push(`${item.row + 1}`);
    }
    if (offset === 1 && typeof item.cell?.v === 'number') values.push(item.cell.v);
  }
  const palette = ['#205bd6', '#087a55', '#9b5d00', '#b3261e', '#6b4fbb', '#0b66ff'];
  return {
    type: kind,
    data: {
      labels: labels.length ? labels : values.map((_, index) => String(index + 1)),
      datasets: [{
        label: 'Selection',
        data: values,
        backgroundColor: kind === 'line' ? 'rgba(32, 91, 214, 0.18)' : values.map((_, index) => palette[index % palette.length]),
        borderColor: '#205bd6',
        borderWidth: 2,
        fill: kind === 'line',
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      plugins: {
        legend: { display: kind === 'pie', position: 'bottom' },
      },
    },
  };
}

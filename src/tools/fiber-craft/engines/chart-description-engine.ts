import { countedStitchLabel, generateCountedThreadLegend } from './counted-thread-engine';
import { crochetSymbolLabel, type CrochetDialect } from './symbol-library';
import type { ColorSlot, FiberCraftDocument } from '../fiber-craft-types';

export interface FiberChartTextDescription { readonly summary: string; readonly details: readonly string[]; readonly legend: readonly string[]; }
const plural = (count: number, singular: string, pluralForm = `${singular}s`): string => `${count} ${count === 1 ? singular : pluralForm}`;
const countValues = (values: readonly string[]): ReadonlyMap<string, number> => { const counts = new Map<string, number>(); for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1); return counts; };
const paletteLabel = (palette: readonly ColorSlot[], id: string): string => palette.find((slot) => slot.id === id)?.label ?? id;
const formattedCounts = (counts: ReadonlyMap<string, number>, labelFor: (id: string) => string): string => [...counts.entries()].map(([id, count]) => `${count} ${labelFor(id)}`).join(', ');

export function describeCrochetChart(document: FiberCraftDocument, dialect: CrochetDialect): FiberChartTextDescription {
  if (document.metadata.discipline !== 'crochet') throw new Error('Crochet chart descriptions require a crochet project.');
  if (document.chart.kind === 'polar') {
    const chart = document.chart; const worked = chart.nodes.filter((node) => node.symbolId !== null);
    const completedRounds = new Set(document.completedSteps.filter((step) => step.startsWith('round:')).map((step) => Number(step.slice('round:'.length))).filter((round) => Number.isInteger(round) && round >= 0 && round < chart.rounds));
    const details = Array.from({ length: chart.rounds }, (_, round) => {
      const nodes = chart.nodes.filter((node) => node.round === round); const workedNodes = nodes.filter((node) => node.symbolId !== null);
      const symbolCounts = countValues(workedNodes.flatMap((node) => node.symbolId ? [node.symbolId] : [])); const colorCounts = countValues(workedNodes.flatMap((node) => node.colorId ? [node.colorId] : []));
      const symbolText = symbolCounts.size > 0 ? ` Stitches: ${formattedCounts(symbolCounts, (id) => crochetSymbolLabel(id, dialect))}.` : ' No stitches placed yet.';
      const colorText = colorCounts.size > 0 ? ` Colors: ${formattedCounts(colorCounts, (id) => paletteLabel(document.palette, id))}.` : '';
      return `Round ${round + 1}: ${plural(nodes.length, 'position')}, ${workedNodes.length} worked, ${nodes.length - workedNodes.length} unworked. ${completedRounds.has(round) ? 'Marked complete.' : 'Not marked complete.'}${symbolText}${colorText}`;
    });
    const symbolCounts = countValues(worked.flatMap((node) => node.symbolId ? [node.symbolId] : [])); const colorCounts = countValues(worked.flatMap((node) => node.colorId ? [node.colorId] : []));
    return { summary: `Round crochet chart with ${plural(chart.rounds, 'round')} and ${plural(chart.nodes.length, 'stitch position')}. ${plural(worked.length, 'position')} worked. ${completedRounds.size} of ${chart.rounds} rounds marked complete.`, details, legend: [...(symbolCounts.size > 0 ? [`Used stitches: ${formattedCounts(symbolCounts, (id) => crochetSymbolLabel(id, dialect))}.`] : []), ...(colorCounts.size > 0 ? [`Used colors: ${formattedCounts(colorCounts, (id) => paletteLabel(document.palette, id))}.`] : [])] };
  }
  if (document.chart.kind === 'grid') {
    const chart = document.chart; const filled = chart.cells.filter((cell) => cell.colorId !== null || cell.symbolId !== null);
    const completedRows = new Set(document.completedSteps.filter((step) => step.startsWith('row:')).map((step) => Number(step.slice('row:'.length))).filter((row) => Number.isInteger(row) && row >= 0 && row < chart.rows));
    const details = Array.from({ length: chart.rows }, (_, row) => {
      const cells = chart.cells.filter((cell) => cell.row === row); const filledCells = cells.filter((cell) => cell.colorId !== null || cell.symbolId !== null); const colorCounts = countValues(filledCells.flatMap((cell) => cell.colorId ? [cell.colorId] : []));
      const colorText = colorCounts.size > 0 ? ` Colors: ${formattedCounts(colorCounts, (id) => paletteLabel(document.palette, id))}.` : '';
      return `Row ${row + 1}: ${filledCells.length} filled, ${cells.length - filledCells.length} open. ${completedRows.has(row) ? 'Marked complete.' : 'Not marked complete.'}${colorText}`;
    });
    const colorCounts = countValues(filled.flatMap((cell) => cell.colorId ? [cell.colorId] : []));
    return { summary: `Grid crochet chart with ${chart.rows} rows and ${chart.cols} columns, ${plural(chart.cells.length, 'cell')}. ${plural(filled.length, 'cell')} filled. ${completedRows.size} of ${chart.rows} rows marked complete.`, details, legend: colorCounts.size > 0 ? [`Used colors: ${formattedCounts(colorCounts, (id) => paletteLabel(document.palette, id))}.`] : [] };
  }
  throw new Error('This chart type does not have a crochet text description yet.');
}

export function describeCountedThreadChart(document: FiberCraftDocument): FiberChartTextDescription {
  if (document.metadata.discipline !== 'cross-stitch' || document.chart.kind !== 'counted-thread') throw new Error('Counted-thread descriptions require a cross-stitch project.');
  const chart = document.chart; const worked = chart.cells.filter((cell) => cell.stitchKind !== null);
  const details = Array.from({ length: chart.rows }, (_, row) => {
    const rowCells = chart.cells.filter((cell) => cell.row === row); const rowWorked = rowCells.filter((cell) => cell.stitchKind !== null);
    const stitchCounts = countValues(rowWorked.flatMap((cell) => cell.stitchKind ? [cell.stitchKind] : [])); const colorCounts = countValues(rowWorked.flatMap((cell) => cell.colorId ? [cell.colorId] : []));
    const stitches = stitchCounts.size > 0 ? ` Stitches: ${formattedCounts(stitchCounts, (id) => countedStitchLabel(id as Parameters<typeof countedStitchLabel>[0]))}.` : ' No counted stitches placed.';
    const colors = colorCounts.size > 0 ? ` Colors: ${formattedCounts(colorCounts, (id) => paletteLabel(document.palette, id))}.` : '';
    return `Row ${row + 1}: ${rowWorked.length} worked, ${rowCells.length - rowWorked.length} empty.${stitches}${colors}`;
  });
  const legend = generateCountedThreadLegend(document);
  return { summary: `Counted-thread chart with ${chart.rows} rows and ${chart.cols} columns. ${plural(worked.length, 'counted stitch')} placed, ${plural(chart.knots.length, 'French knot')}, and ${plural(chart.backstitches.length, 'backstitch line')}.`, details, legend: legend.map((entry) => { const code = [entry.paletteName, entry.code].filter(Boolean).join(' '); return `${entry.symbol}: ${entry.label}${code ? `, ${code}` : ''}, ${plural(entry.usageCount, 'mark')}.`; }) };
}

export function describeFiberCraftChart(document: FiberCraftDocument, dialect: CrochetDialect): FiberChartTextDescription {
  if (document.metadata.discipline === 'crochet') return describeCrochetChart(document, dialect);
  if (document.metadata.discipline === 'cross-stitch') return describeCountedThreadChart(document);
  throw new Error('This Fiber Craft discipline does not have a text description yet.');
}

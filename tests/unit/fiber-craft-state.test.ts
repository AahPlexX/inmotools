import { describe, expect, it } from 'vitest';
import FiberCraftWorkspace from '../../src/tools/fiber-craft/FiberCraftWorkspace';
import {
  addCrochetRound,
  createStarterCrochetDocument,
  crochetRoundProgress,
  setCrochetGauge,
  setCrochetPatternClassification,
  setCrochetTargetRoundCounts,
  setCrochetYarnReference,
  switchCrochetChartMode,
  toggleCrochetGridCell,
  toggleCrochetProgressStep,
  workNextCrochetStitch,
} from '../../src/tools/fiber-craft/crochet-document-engine';
import { commitFiberCraftHistory, createFiberCraftHistory, redoFiberCraftHistory, undoFiberCraftHistory } from '../../src/tools/fiber-craft/history-engine';
import { isRestorableCrochetDocument } from '../../src/tools/fiber-craft/persistence-engine';

describe('fiber craft crochet document state', () => {
  it('exports the workspace component and creates a deterministic round starter', () => {
    expect(FiberCraftWorkspace).toBeTypeOf('function');
    const document = createStarterCrochetDocument('2026-09-15T00:00:00.000Z');
    expect(document.metadata.discipline).toBe('crochet');
    expect(document.metadata.difficulty).toBe('Basic');
    expect(document.chart.kind).toBe('polar');
    expect(crochetRoundProgress(document, 0)).toEqual({ worked: 0, total: 6 });
    expect(document.settings?.crochet?.targetRoundCounts).toEqual([6]);
  });

  it('works the next stitch without mutating the source document', () => {
    const source = createStarterCrochetDocument('2026-09-15T00:00:00.000Z');
    const next = workNextCrochetStitch(source, 0, 'sc-dc', 'primary', '2026-09-15T00:01:00.000Z');
    expect(crochetRoundProgress(source, 0)).toEqual({ worked: 0, total: 6 });
    expect(crochetRoundProgress(next, 0)).toEqual({ worked: 1, total: 6 });
    expect(next.metadata.updatedAt).toBe('2026-09-15T00:01:00.000Z');
  });

  it('adds an explicit-size round and preserves existing stitch work and project settings', () => {
    let source = workNextCrochetStitch(createStarterCrochetDocument('2026-09-15T00:00:00.000Z'), 0, 'sc-dc', 'primary', '2026-09-15T00:01:00.000Z');
    source = setCrochetTargetRoundCounts(source, [6, 12], '2026-09-15T00:01:30.000Z');
    source = setCrochetYarnReference(source, 4, '4 Medium', '5.5–6.5 mm', '2026-09-15T00:01:45.000Z');
    const next = addCrochetRound(source, 9, '2026-09-15T00:02:00.000Z');
    expect(crochetRoundProgress(next, 0)).toEqual({ worked: 1, total: 6 });
    expect(crochetRoundProgress(next, 1)).toEqual({ worked: 0, total: 9 });
    expect(next.settings?.crochet).toEqual({ targetRoundCounts: [6, 12], yarnWeight: 4 });
    expect(next.metadata).toMatchObject({ materialClass: '4 Medium', toolSize: '5.5–6.5 mm' });
  });

  it('persists measured gauge and normalizes CYC project classification without duplicate technique tags', () => {
    let document = createStarterCrochetDocument('2026-09-15T00:00:00.000Z');
    document = setCrochetGauge(document, { stitchCount: 20, rowCount: 28, span: 4, unit: 'in' }, '2026-09-15T00:01:00.000Z');
    document = setCrochetPatternClassification(document, 'Intermediate', [' amigurumi ', 'AMIGURUMI', ' shaping '], '2026-09-15T00:02:00.000Z');
    expect(document.gauge).toEqual({ stitchCount: 20, rowCount: 28, span: 4, unit: 'in' });
    expect(document.metadata.difficulty).toBe('Intermediate');
    expect(document.metadata.techniqueTags).toEqual(['amigurumi', 'shaping']);
    expect(isRestorableCrochetDocument(document)).toBe(true);
  });

  it('round-trips commits and progress markers through bounded undo and redo history', () => {
    const original = createStarterCrochetDocument('2026-09-15T00:00:00.000Z');
    const edited = toggleCrochetProgressStep(workNextCrochetStitch(original, 0, 'sc-dc', 'primary', '2026-09-15T00:01:00.000Z'), 'round:0', '2026-09-15T00:01:30.000Z');
    const committed = commitFiberCraftHistory(createFiberCraftHistory(original), edited);
    const undone = undoFiberCraftHistory(committed);
    expect(undone.present).toEqual(original);
    expect(redoFiberCraftHistory(undone).present).toEqual(edited);
  });

  it('accepts app-owned round and grid drafts and rejects unknown stitch symbols', () => {
    const roundDocument = createStarterCrochetDocument('2026-09-15T00:00:00.000Z');
    expect(isRestorableCrochetDocument(roundDocument)).toBe(true);
    let gridDocument = switchCrochetChartMode(roundDocument, 'grid', '2026-09-15T00:01:00.000Z');
    gridDocument = toggleCrochetGridCell(gridDocument, 0, 0, 'primary', '2026-09-15T00:02:00.000Z');
    expect(isRestorableCrochetDocument(gridDocument)).toBe(true);
    const invalid = structuredClone(gridDocument);
    if (invalid.chart.kind !== 'grid') throw new Error('Expected grid chart');
    invalid.chart.cells[0] = { ...invalid.chart.cells[0], symbolId: 'not-a-symbol' };
    expect(isRestorableCrochetDocument(invalid)).toBe(false);
  });
});

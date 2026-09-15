import { describe, expect, it } from 'vitest';
import FiberCraftWorkspace from '../../src/tools/fiber-craft/FiberCraftWorkspace';
import {
  addCrochetRound,
  createStarterCrochetDocument,
  crochetRoundProgress,
  workNextCrochetStitch,
} from '../../src/tools/fiber-craft/crochet-document-engine';
import {
  commitFiberCraftHistory,
  createFiberCraftHistory,
  redoFiberCraftHistory,
  undoFiberCraftHistory,
} from '../../src/tools/fiber-craft/history-engine';
import { isRestorableCrochetDocument } from '../../src/tools/fiber-craft/persistence-engine';

describe('fiber craft crochet document state', () => {
  it('exports the workspace component and creates a deterministic round starter', () => {
    expect(FiberCraftWorkspace).toBeTypeOf('function');
    const document = createStarterCrochetDocument('2026-09-15T00:00:00.000Z');
    expect(document.metadata.discipline).toBe('crochet');
    expect(document.chart.kind).toBe('polar');
    expect(crochetRoundProgress(document, 0)).toEqual({ worked: 0, total: 6 });
  });

  it('works the next stitch without mutating the source document', () => {
    const source = createStarterCrochetDocument('2026-09-15T00:00:00.000Z');
    const next = workNextCrochetStitch(source, 0, 'sc-dc', 'primary', '2026-09-15T00:01:00.000Z');
    expect(crochetRoundProgress(source, 0)).toEqual({ worked: 0, total: 6 });
    expect(crochetRoundProgress(next, 0)).toEqual({ worked: 1, total: 6 });
    expect(next.metadata.updatedAt).toBe('2026-09-15T00:01:00.000Z');
  });

  it('adds an explicit-size round and preserves existing stitch work', () => {
    const source = workNextCrochetStitch(
      createStarterCrochetDocument('2026-09-15T00:00:00.000Z'),
      0,
      'sc-dc',
      'primary',
      '2026-09-15T00:01:00.000Z',
    );
    const next = addCrochetRound(source, 9, '2026-09-15T00:02:00.000Z');
    expect(crochetRoundProgress(next, 0)).toEqual({ worked: 1, total: 6 });
    expect(crochetRoundProgress(next, 1)).toEqual({ worked: 0, total: 9 });
  });

  it('round-trips commits through bounded undo and redo history', () => {
    const original = createStarterCrochetDocument('2026-09-15T00:00:00.000Z');
    const edited = workNextCrochetStitch(original, 0, 'sc-dc', 'primary', '2026-09-15T00:01:00.000Z');
    const committed = commitFiberCraftHistory(createFiberCraftHistory(original), edited);
    const undone = undoFiberCraftHistory(committed);
    expect(undone.present).toEqual(original);
    expect(redoFiberCraftHistory(undone).present).toEqual(edited);
  });

  it('accepts the app-owned crochet draft shape and rejects an unknown symbol', () => {
    const document = createStarterCrochetDocument('2026-09-15T00:00:00.000Z');
    expect(isRestorableCrochetDocument(document)).toBe(true);
    const invalid = structuredClone(document);
    if (invalid.chart.kind !== 'polar') throw new Error('Expected polar chart');
    invalid.chart.nodes[0] = { ...invalid.chart.nodes[0], symbolId: 'not-a-symbol' };
    expect(isRestorableCrochetDocument(invalid)).toBe(false);
  });
});

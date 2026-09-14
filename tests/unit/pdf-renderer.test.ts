import { describe, expect, it } from 'vitest';
import {
  canvasRenderPlan,
  normalizedPdfZoom,
  type PdfCancelableRender,
  PdfRenderCoordinator,
} from '../../src/tools/pdf/pdf-renderer';

describe('PDF renderer foundation', () => {
  it('keeps CSS viewport dimensions separate from bounded HiDPI backing pixels', () => {
    expect(canvasRenderPlan({ width: 612.4, height: 792.2 }, 2)).toEqual({
      cssWidth: 612,
      cssHeight: 792,
      pixelWidth: 1224,
      pixelHeight: 1584,
      outputScale: 2,
      transform: [2, 0, 0, 2, 0, 0],
    });

    expect(canvasRenderPlan({ width: 100, height: 50 }, 8)).toEqual({
      cssWidth: 100,
      cssHeight: 50,
      pixelWidth: 300,
      pixelHeight: 150,
      outputScale: 3,
      transform: [3, 0, 0, 3, 0, 0],
    });
  });

  it('normalizes zoom to a finite usable range', () => {
    expect(normalizedPdfZoom(0)).toBe(0.25);
    expect(normalizedPdfZoom(Number.NaN)).toBe(1);
    expect(normalizedPdfZoom(1.5)).toBe(1.5);
    expect(normalizedPdfZoom(9)).toBe(5);
  });

  it('cancels a stale render before replacing it and cancels all active renders on destroy', async () => {
    const events: string[] = [];
    const makeRender = (id: string): PdfCancelableRender => ({
      cancel: () => { events.push(`cancel:${id}`); },
      promise: Promise.resolve(),
    });
    const coordinator = new PdfRenderCoordinator();

    coordinator.replace(1, makeRender('one-a'));
    coordinator.replace(1, makeRender('one-b'));
    coordinator.replace(2, makeRender('two'));

    expect(events).toEqual(['cancel:one-a']);
    await coordinator.destroy();
    expect(events).toEqual(['cancel:one-a', 'cancel:one-b', 'cancel:two']);
  });
});

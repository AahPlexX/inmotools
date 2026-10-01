import { describe, expect, it } from 'vitest';
import {
  applyLinkedUnitTranslation,
  createLinkedUnit,
} from '../../src/tools/tactics/unit-engine';
import { sampleTacticalTimeline } from '../../src/tools/tactics/timeline-engine';
import type { TacticalTimeline } from '../../src/tools/tactics/tactics-types';

const timeline = (): TacticalTimeline => ({
  playheadMs: 0,
  durationMs: 4000,
  loop: false,
  playbackRate: 1,
  tracks: [],
  markers: [],
});

describe('Tactical linked units', () => {
  it('requires at least two unique target members', () => {
    expect(createLinkedUnit('midfield', 'Midfield', ['p6', 'p8', 'p10']).memberTargetIds).toEqual(['p6', 'p8', 'p10']);
    expect(() => createLinkedUnit('one', 'One', ['p6'])).toThrow(/two/i);
    expect(() => createLinkedUnit('dup', 'Duplicate', ['p6', 'p6'])).toThrow(/unique/i);
  });

  it('moves every member by the same delta while preserving relative spacing', () => {
    const unit = createLinkedUnit('back-line', 'Back line', ['lb', 'cb', 'rb']);
    const result = applyLinkedUnitTranslation(
      timeline(),
      unit,
      {
        lb: { x: 0.3, y: 0.2 },
        cb: { x: 0.3, y: 0.5 },
        rb: { x: 0.3, y: 0.8 },
      },
      { x: 0.15, y: -0.05 },
      1000,
      1000,
    );
    const end = sampleTacticalTimeline(result, 2000);
    expect(end.lb?.position).toEqual({ x: 0.45, y: 0.15 });
    expect(end.cb?.position).toEqual({ x: 0.45, y: 0.45 });
    expect(end.rb?.position).toEqual({ x: 0.45, y: 0.75 });
    expect((end.rb?.position?.y ?? 0) - (end.cb?.position?.y ?? 0)).toBeCloseTo(0.3, 12);
  });

  it('rejects missing member geometry or translations that would distort pitch bounds', () => {
    const unit = createLinkedUnit('pair', 'Pair', ['a', 'b']);
    expect(() => applyLinkedUnitTranslation(
      timeline(), unit, { a: { x: 0.2, y: 0.2 } }, { x: 0.1, y: 0 }, 0, 500,
    )).toThrow(/position.*b/i);
    expect(() => applyLinkedUnitTranslation(
      timeline(), unit,
      { a: { x: 0.95, y: 0.2 }, b: { x: 0.9, y: 0.4 } },
      { x: 0.2, y: 0 }, 0, 500,
    )).toThrow(/normalized|bounds|within \[0, 1\]/i);
  });
});

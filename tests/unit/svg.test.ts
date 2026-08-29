import { describe, expect, it } from 'vitest';
import { compileSvgSprite } from '../../src/tools/svg/svg-engine';

describe('SVG sprite compiler', () => {
  it('creates deterministic symbol IDs and can normalize fills', () => {
    const result = compileSvgSprite([
      { name: 'Arrow Left.svg', text: '<svg viewBox="0 0 24 24"><path fill="#111" d="M20 11H7l5-5-1-1-7 7 7 7 1-1-5-5h13z"/></svg>' },
    ], { currentColor: true });
    expect(result.sprite).toContain('<symbol id="arrow-left"');
    expect(result.sprite).toContain('currentColor');
    expect(result.files[0].optimizedBytes).toBeLessThanOrEqual(result.files[0].originalBytes);
  });
});

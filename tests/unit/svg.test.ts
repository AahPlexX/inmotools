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


describe('currentColor normalization covers style declarations', () => {
  it('rewrites fill and stroke inside a style attribute', () => {
    // Handling only presentation attributes left these hard-coded, so a sprite
    // compiled for currentColor silently refused to inherit.
    const { sprite } = compileSvgSprite(
      [{ name: 'styled.svg', text: '<svg viewBox="0 0 10 10"><path style="fill:#ff0000;stroke:blue" d="M0 0h10v10H0z"/></svg>' }],
      { currentColor: true },
    );
    expect(sprite).toContain('fill:currentColor');
    expect(sprite).toContain('stroke:currentColor');
    expect(sprite).not.toContain('#ff0000');
    expect(sprite).not.toContain('blue');
  });

  it('leaves none and url() references alone', () => {
    const { sprite } = compileSvgSprite(
      [{ name: 'keep.svg', text: '<svg viewBox="0 0 10 10"><path style="fill:none;stroke:url(#grad)" d="M0 0h10"/></svg>' }],
      { currentColor: true },
    );
    expect(sprite).toContain('fill:none');
    expect(sprite).toContain('url(#grad)');
  });

  it('does not touch style declarations when normalization is off', () => {
    const { sprite } = compileSvgSprite(
      [{ name: 'raw.svg', text: '<svg viewBox="0 0 10 10"><path style="fill:#ff0000" d="M0 0h10v10H0z"/></svg>' }],
      { currentColor: false },
    );
    // svgo's own convertColors shortens #ff0000 to the keyword, so the assertion
    // is that the colour survives rather than that its spelling is preserved.
    expect(sprite).toContain('fill:red');
    expect(sprite).not.toContain('currentColor');
  });
});

describe('symbol viewBox derivation', () => {
  it('synthesizes a viewBox from width and height when none is present', () => {
    // A symbol with no viewBox has no coordinate system, so <use> renders it at
    // the wrong scale.
    const { sprite } = compileSvgSprite([{ name: 'sized.svg', text: '<svg width="24" height="16"><path d="M0 0h24v16H0z"/></svg>' }]);
    expect(sprite).toContain('viewBox="0 0 24 16"');
  });

  it('accepts px dimensions', () => {
    const { sprite } = compileSvgSprite([{ name: 'px.svg', text: '<svg width="32px" height="32px"><path d="M0 0h32v32H0z"/></svg>' }]);
    expect(sprite).toContain('viewBox="0 0 32 32"');
  });

  it('prefers an explicit viewBox over the dimensions', () => {
    const { sprite } = compileSvgSprite([{ name: 'both.svg', text: '<svg viewBox="0 0 48 48" width="24" height="24"><path d="M0 0h48v48H0z"/></svg>' }]);
    expect(sprite).toContain('viewBox="0 0 48 48"');
  });

  it('omits the viewBox rather than guessing when dimensions are not usable', () => {
    const { sprite } = compileSvgSprite([{ name: 'relative.svg', text: '<svg width="100%" height="2em"><path d="M0 0h10v10H0z"/></svg>' }]);
    expect(sprite).not.toContain('viewBox');
  });
});

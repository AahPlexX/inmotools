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
    expect(result.errors).toEqual([]);
  });

  it('allocates globally unique symbol IDs even when suffix-like filenames collide', () => {
    const result = compileSvgSprite([
      { name: 'foo.svg', text: '<svg viewBox="0 0 1 1"><path d="M0 0h1v1z"/></svg>' },
      { name: 'foo-2.svg', text: '<svg viewBox="0 0 1 1"><path d="M0 0h1v1z"/></svg>' },
      { name: 'foo.svg', text: '<svg viewBox="0 0 1 1"><path d="M0 0h1v1z"/></svg>' },
    ]);
    expect(result.files.map((file) => file.id)).toEqual(['foo', 'foo-2', 'foo-3']);
  });

  it('isolates one invalid file instead of dropping valid siblings', () => {
    const result = compileSvgSprite([
      { name: 'good.svg', text: '<svg viewBox="0 0 1 1"><path d="M0 0h1v1z"/></svg>' },
      { name: 'bad.svg', text: 'not svg' },
    ]);
    expect(result.files).toHaveLength(1);
    expect(result.files[0].name).toBe('good.svg');
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].name).toBe('bad.svg');
  });
});

describe('currentColor normalization', () => {
  it('rewrites literal fill and stroke declarations inside a style attribute', () => {
    const { sprite } = compileSvgSprite(
      [{ name: 'styled.svg', text: '<svg viewBox="0 0 10 10"><path style="fill:#ff0000;stroke:blue" d="M0 0h10v10H0z"/></svg>' }],
      { currentColor: true },
    );
    expect(sprite).toContain('fill:currentColor');
    expect(sprite).toContain('stroke:currentColor');
  });

  it('preserves none and paint-server references in style and presentation attributes', () => {
    const { sprite } = compileSvgSprite(
      [{ name: 'keep.svg', text: '<svg viewBox="0 0 10 10"><defs><linearGradient id="paint"><stop offset="0" stop-color="red"/></linearGradient></defs><path fill="url(#paint)" style="stroke:url(#paint)" d="M0 0h10"/></svg>' }],
      { currentColor: true },
    );
    expect(sprite).toContain('fill="url(#keep--paint)"');
    expect(sprite).toContain('stroke:url(#keep--paint)');
    expect(sprite).not.toContain('fill="currentColor"');
  });

  it('does not touch style declarations when normalization is off', () => {
    const { sprite } = compileSvgSprite(
      [{ name: 'raw.svg', text: '<svg viewBox="0 0 10 10"><path style="fill:#ff0000" d="M0 0h10v10H0z"/></svg>' }],
      { currentColor: false },
    );
    expect(sprite).not.toContain('currentColor');
  });
});

describe('symbol structure preservation', () => {
  it('preserves inherited root presentation and style attributes on the symbol', () => {
    const { sprite } = compileSvgSprite([{ name: 'root.svg', text: '<svg viewBox="0 0 10 10" fill="red" stroke="blue" class="icon" style="opacity:.5"><path d="M0 0h10v10H0z"/></svg>' }]);
    expect(sprite).toContain('<symbol id="root" viewBox="0 0 10 10"');
    expect(sprite).toContain('fill="red"');
    expect(sprite).toContain('stroke="#00f"');
    expect(sprite).toContain('class="icon"');
    expect(sprite).toContain('style="opacity:.5"');
  });

  it('prefixes internal IDs and rewrites local URL and href references per symbol', () => {
    const result = compileSvgSprite([
      { name: 'one.svg', text: '<svg viewBox="0 0 10 10"><defs><linearGradient id="paint"><stop offset="1"/></linearGradient></defs><rect fill="url(#paint)" width="10" height="10"/></svg>' },
      { name: 'two.svg', text: '<svg viewBox="0 0 10 10"><defs><linearGradient id="paint"/><linearGradient id="derived" href="#paint"/></defs><rect fill="url(#derived)" width="10" height="10"/></svg>' },
    ]);
    expect(result.sprite).toContain('id="one--paint"');
    expect(result.sprite).toContain('url(#one--paint)');
    expect(result.sprite).toContain('id="two--paint"');
    expect(result.sprite).toContain('id="two--derived"');
    expect(result.sprite).toContain('href="#two--paint"');
    expect(result.sprite).toContain('url(#two--derived)');
  });
});

describe('symbol viewBox derivation', () => {
  it('synthesizes a viewBox from width and height when none is present', () => {
    const { sprite } = compileSvgSprite([{ name: 'sized.svg', text: '<svg width="24" height="16"><path d="M0 0h24v16H0z"/></svg>' }]);
    expect(sprite).toContain('viewBox="0 0 24 16"');
  });

  it('accepts px dimensions', () => {
    const { sprite } = compileSvgSprite([{ name: 'px.svg', text: '<svg width="32px" height="32px"><path d="M0 0h32v32H0z"/></svg>' }]);
    expect(sprite).toContain('viewBox="0 0 32 32"');
  });

  it('prefers an explicit viewBox over dimensions', () => {
    const { sprite } = compileSvgSprite([{ name: 'both.svg', text: '<svg viewBox="0 0 48 48" width="24" height="24"><path d="M0 0h48v48H0z"/></svg>' }]);
    expect(sprite).toContain('viewBox="0 0 48 48"');
  });
});

import { describe, expect, it } from 'vitest';
import { addComponent, addWire, createInitialDocument, relabelComponent, updateMetadata } from '../../src/tools/logic/circuit-model';
import type { LogicDocument } from '../../src/tools/logic/logic-types';
import { clip, ogAltText, ogFieldsFromMetadata, ogMetaTags, OG_HEIGHT, OG_WIDTH, renderOgCardSvg, sanitizeUrl, wrapText } from '../../src/tools/logic/og-card';
import { parseSvg } from '../../src/tools/logic/svg-subset';

const sample = (): LogicDocument => {
  let doc = createInitialDocument('Half adder');
  doc = updateMetadata(doc, { author: 'Ada Lovelace', description: 'Adds two one-bit numbers and shows the sum on an LED.', tags: ['adder', 'demo', 'teaching'], version: '1.2.0' });
  doc = addComponent(doc, 'SWITCH', 0, 0);
  const sw = doc.components[0]!.id;
  doc = addComponent(doc, 'LED', 10, 0);
  const led = doc.components[1]!.id;
  doc = relabelComponent(doc, led, 'SUM');
  return addWire(doc, { componentId: sw, portId: 'Y' }, { componentId: led, portId: 'A' });
};

describe('text helpers', () => {
  it('clips at a word boundary and marks the cut', () => {
    expect(clip('short', 20)).toBe('short');
    expect(clip('the quick brown fox jumps over', 20)).toBe('the quick brown fox…');
    expect(clip('   lots   of   space   ', 50)).toBe('lots of space');
    expect(clip('abcdefghijklmnopqrstuvwxyz', 10)).toBe('abcdefghi…');
    expect(clip('one two three four', 12).length).toBeLessThanOrEqual(12);
  });

  it('wraps into lines no longer than the limit and ends a cut text with an ellipsis', () => {
    expect(wrapText('one two three four five', 9, 5)).toEqual(['one two', 'three', 'four five']);
    const cut = wrapText('one two three four five six seven', 9, 2);
    expect(cut).toHaveLength(2);
    expect(cut[1]!.endsWith('…')).toBe(true);
    for (const line of cut) expect(line.length).toBeLessThanOrEqual(9);
  });

  it('splits a word longer than a line so nothing runs off the card', () => {
    const lines = wrapText('abcdefghijklmnopqrstuvwxyz', 10, 5);
    expect(lines).toEqual(['abcdefghij', 'klmnopqrst', 'uvwxyz']);
  });

  it('returns no lines for empty text', () => {
    expect(wrapText('   ', 10, 3)).toEqual([]);
  });
});

describe('address checking', () => {
  it('accepts http(s) addresses and plain relative paths', () => {
    expect(sanitizeUrl('https://example.com/card.png')).toBe('https://example.com/card.png');
    expect(sanitizeUrl('http://example.com')).toBe('http://example.com');
    expect(sanitizeUrl('og-card.png')).toBe('og-card.png');
    expect(sanitizeUrl('/img/card.png')).toBe('/img/card.png');
    expect(sanitizeUrl('  https://example.com  ')).toBe('https://example.com');
  });

  it('refuses anything that could do more than point at a page', () => {
    for (const bad of ['javascript:alert(1)', 'data:text/html,hi', 'ftp://example.com', '//evil.example', 'https://exa mple.com', 'https://a.com/"onload="x', '<b>', '', 'https://']) {
      expect(sanitizeUrl(bad), bad).toBeUndefined();
    }
    expect(sanitizeUrl(`https://example.com/${'a'.repeat(2100)}`)).toBeUndefined();
  });
});

describe('card fields', () => {
  it('come from the project, and a typed title or description replaces the project\'s for this export only', () => {
    const doc = sample();
    const own = ogFieldsFromMetadata(doc.metadata).fields;
    expect(own).toMatchObject({ title: 'Half adder', author: 'Ada Lovelace', version: '1.2.0', license: 'MIT', siteName: 'InMo Tools', url: '', imageUrl: '' });
    expect(own.tags).toEqual(['adder', 'demo', 'teaching']);
    const typed = ogFieldsFromMetadata(doc.metadata, { title: 'Adder demo', description: '  Custom  text ', siteName: 'My Lab' }).fields;
    expect(typed).toMatchObject({ title: 'Adder demo', description: 'Custom text', siteName: 'My Lab' });
    expect(doc.metadata.title).toBe('Half adder');
  });

  it('fall back to a title when the project has none, and limit lengths', () => {
    const doc = updateMetadata(sample(), { title: '   ', description: 'x'.repeat(500), tags: Array.from({ length: 20 }, (_, index) => `tag${index}`) });
    const { fields } = ogFieldsFromMetadata(doc.metadata);
    expect(fields.title).toBe('Untitled circuit');
    expect(fields.description.length).toBeLessThanOrEqual(200);
    expect(fields.tags).toHaveLength(8);
  });

  it('report a refused address and leave it out', () => {
    const { fields, problems } = ogFieldsFromMetadata(sample().metadata, { url: 'javascript:alert(1)', imageUrl: 'https://example.com/c.png' });
    expect(fields.url).toBe('');
    expect(fields.imageUrl).toBe('https://example.com/c.png');
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('page address');
  });
});

describe('card picture', () => {
  const fields = ogFieldsFromMetadata(sample().metadata).fields;
  const svg = renderOgCardSvg(sample(), fields);

  it('is 1200 x 630 and describes itself for screen readers', () => {
    const root = parseSvg(svg);
    expect(root.attrs.width).toBe(String(OG_WIDTH));
    expect(root.attrs.height).toBe(String(OG_HEIGHT));
    expect(root.attrs['aria-label']).toBe(ogAltText(fields));
    expect(ogAltText(fields)).toBe('Half adder: a digital logic schematic by Ada Lovelace');
  });

  it('carries the title, description, byline and tags, and a thumbnail of the schematic', () => {
    for (const text of ['Half adder', 'Adds two one-bit numbers', 'by Ada Lovelace', 'v1.2.0', 'MIT', 'adder', 'teaching']) expect(svg, text).toContain(text);
    expect(svg).toMatch(/<g transform="translate\([\d.]+,[\d.]+\) scale\([\d.]+\)"/);
    // The schematic's own title block is left out, so the title appears once as large text and never as the 15px block text.
    expect(svg).not.toContain('font-size="15" font-weight="700"');
  });

  it('is well formed and balanced', () => {
    expect(svg.match(/<g[ >]/g)!.length).toBe(svg.match(/<\/g>/g)!.length);
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg.trimEnd().endsWith('</svg>')).toBe(true);
  });

  it('escapes hostile text', () => {
    const hostile = ogFieldsFromMetadata(updateMetadata(sample(), { title: '<script>alert(1)</script>', author: '"><img src=x>', description: '</text><script>x</script>' }).metadata).fields;
    const out = renderOgCardSvg(sample(), hostile);
    expect(out).not.toContain('<script>');
    expect(out).not.toContain('<img');
  });

  it('shrinks a long title and wraps it inside the card', () => {
    const long = ogFieldsFromMetadata(updateMetadata(sample(), { title: 'A very long project title about a serial to parallel converter with enable' }).metadata).fields;
    const out = renderOgCardSvg(sample(), long);
    const titleSizes = [...out.matchAll(/font-size="(\d+)" font-weight="700" fill="#f8fafc"/g)].map((match) => Number(match[1]));
    expect(titleSizes.length).toBeGreaterThan(1);
    expect(titleSizes.every((size) => size <= 46)).toBe(true);
    expect(titleSizes.length).toBeLessThanOrEqual(3);
  });

  it('draws an empty circuit as a message rather than a blank panel', () => {
    const empty = createInitialDocument('Empty');
    expect(renderOgCardSvg(empty, ogFieldsFromMetadata(empty.metadata).fields)).toContain('Empty circuit');
  });
});

describe('meta tags', () => {
  it('write the Open Graph and X card tags, escaped', () => {
    const { fields } = ogFieldsFromMetadata(updateMetadata(sample(), { title: 'Adder "v2" & <more>' }).metadata, { url: 'https://example.com/adder', imageUrl: 'https://example.com/adder.png' });
    const { text, warnings } = ogMetaTags(fields);
    expect(warnings).toEqual([]);
    expect(text).toContain('<meta property="og:title" content="Adder &quot;v2&quot; &amp; &lt;more&gt;" />');
    expect(text).toContain('<meta property="og:type" content="website" />');
    expect(text).toContain('<meta property="og:url" content="https://example.com/adder" />');
    expect(text).toContain('<meta property="og:image" content="https://example.com/adder.png" />');
    expect(text).toContain('<meta property="og:image:width" content="1200" />');
    expect(text).toContain('<meta property="og:image:height" content="630" />');
    expect(text).toContain('<meta property="og:site_name" content="InMo Tools" />');
    expect(text).toContain('<meta name="twitter:card" content="summary_large_image" />');
    expect(text).toContain('<meta name="author" content="Ada Lovelace" />');
    // Every tag is on its own line and closed.
    for (const line of text.trim().split('\n')) expect(line).toMatch(/^<meta (property|name)="[a-z:_]+" content="[^"]*" \/>$/);
  });

  it('warn about the address and image a shared link still needs', () => {
    const { text, warnings } = ogMetaTags(ogFieldsFromMetadata(sample().metadata).fields);
    expect(text).not.toContain('og:url');
    expect(text).toContain('content="og-card.png"');
    expect(warnings).toHaveLength(2);
    expect(warnings[0]).toContain('og:url');
    expect(warnings[1]).toContain('full https address');
  });

  it('leave out description tags when there is no description', () => {
    const { fields } = ogFieldsFromMetadata(updateMetadata(sample(), { description: '', author: '' }).metadata);
    const { text } = ogMetaTags(fields);
    expect(text).not.toContain('og:description');
    expect(text).not.toContain('name="author"');
  });
});

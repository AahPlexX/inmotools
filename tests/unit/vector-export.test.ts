import { describe, expect, test } from 'vitest';
import { addElement, composeSelection, createVectorDocument, mirrorSelection } from '../../src/tools/svg/vector-engine';
import {
  buildInlineEmbed,
  buildSvgDataUri,
  optimizeVectorSvg,
  parseVectorProject,
  serializeVectorProject,
  serializeVectorSvg,
} from '../../src/tools/svg/vector-export';
import type { VectorElement } from '../../src/tools/svg/vector-types';

const textElement: VectorElement = {
  id: 'wordmark',
  type: 'text',
  name: 'Wordmark',
  x: 120,
  y: 180,
  width: 320,
  height: 80,
  rotation: 0,
  opacity: 1,
  visible: true,
  locked: false,
  fill: { kind: 'linear-gradient', start: '#7c3aed', end: '#06b6d4', angle: 45 },
  stroke: { color: '#111827', width: 1, linecap: 'round', linejoin: 'round', dash: '' },
  blendMode: 'normal',
  text: 'North & Pine <Studio>',
  fontFamily: 'system-ui',
  fontSize: 64,
  fontWeight: 700,
  letterSpacing: 1,
  textAnchor: 'start',
  title: 'Primary wordmark',
  description: 'Brand text with special characters',
};

const compositionShape: VectorElement = {
  id: 'composition-shape',
  type: 'ellipse',
  name: 'Composition shape',
  x: 160,
  y: 150,
  width: 180,
  height: 120,
  rotation: 0,
  opacity: 1,
  visible: true,
  locked: false,
  fill: { kind: 'solid', color: '#ffffff' },
  stroke: { color: '#111827', width: 0, linecap: 'round', linejoin: 'round', dash: '' },
  blendMode: 'normal',
  title: '',
  description: '',
};

describe('Vector Studio export', () => {
  test('serializes a responsive SVG with escaped descriptive metadata and editable tags', () => {
    let document = createVectorDocument();
    document = {
      ...document,
      metadata: {
        title: 'Brand <Launch>',
        description: 'A & B identity system',
        creator: 'Design Team',
        rights: 'Copyright © 2026',
        license: 'Internal approved use',
        language: 'en-US',
        tags: ['brand', 'launch & web'],
        custom: 'campaign=fall',
      },
    };
    document = addElement(document, textElement);

    const svg = serializeVectorSvg(document, { includeBackground: false, responsive: true });
    expect(svg).toContain('viewBox="0 0 1200 800"');
    expect(svg).not.toContain('width="1200" height="800"');
    expect(svg).toContain('<title>Brand &lt;Launch&gt;</title>');
    expect(svg).toContain('<desc>A &amp; B identity system</desc>');
    expect(svg).toContain('<metadata>');
    expect(svg).toContain('launch &amp; web');
    expect(svg).toContain('North &amp; Pine &lt;Studio&gt;');
    expect(svg).toContain('linearGradient');
  });

  test('serializes true axis reflection around an element center', () => {
    const document = mirrorSelection(addElement(createVectorDocument(), textElement), ['wordmark'], 'horizontal');
    const svg = serializeVectorSvg(document);
    expect(svg).toContain('scale(-1 1)');
    expect(svg).toContain('translate(-280 -220)');
  });

  test('serializes clip and difference compositions with native SVG definitions', () => {
    let source = createVectorDocument();
    source = addElement(source, { ...textElement, id: 'art' });
    source = addElement(source, compositionShape);

    const clipped = composeSelection(source, ['art', 'composition-shape'], 'clip').document;
    const clipSvg = serializeVectorSvg(clipped);
    expect(clipSvg).toContain('<clipPath id="clip-');
    expect(clipSvg).toContain('clip-path="url(#clip-');
    expect(clipSvg).toContain('id="composition-shape"');

    const differenced = composeSelection(source, ['art', 'composition-shape'], 'difference').document;
    const differenceSvg = serializeVectorSvg(differenced);
    expect(differenceSvg).toContain('<mask id="mask-');
    expect(differenceSvg).toContain('mask="url(#mask-');
    expect(differenceSvg).toContain('fill="#000000"');
  });

  test('omits hidden elements and preserves locked artwork as normal SVG content', () => {
    let document = createVectorDocument();
    document = addElement(document, { ...textElement, id: 'visible', locked: true });
    document = addElement(document, { ...textElement, id: 'hidden', visible: false, text: 'Do not export me' });
    const svg = serializeVectorSvg(document);
    expect(svg).toContain('North &amp; Pine');
    expect(svg).not.toContain('Do not export me');
    expect(svg).not.toContain('locked=');
  });

  test('round-trips project JSON and rejects unrelated JSON', () => {
    const document = addElement(createVectorDocument(), textElement);
    const source = serializeVectorProject(document);
    expect(parseVectorProject(source)).toEqual(document);
    expect(() => parseVectorProject('{"hello":"world"}')).toThrow(/Vector Studio project/i);
  });

  test('generates portable inline and data-URI representations from the same SVG source', () => {
    const svg = serializeVectorSvg(addElement(createVectorDocument(), textElement));
    const inline = buildInlineEmbed(svg, 'Brand mark');
    expect(inline).toContain('<span class="vector-art"');
    expect(inline).toContain(svg);
    const uri = buildSvgDataUri(svg);
    expect(uri.startsWith('data:image/svg+xml;charset=utf-8,')).toBe(true);
    expect(decodeURIComponent(uri.split(',')[1])).toBe(svg);
  });

  test('optimizes SVG without removing title, description, or metadata', () => {
    const document = addElement(createVectorDocument(), textElement);
    const svg = serializeVectorSvg({ ...document, metadata: { ...document.metadata, title: 'Keep me', description: 'Keep this too' } });
    const optimized = optimizeVectorSvg(svg);
    expect(optimized).toContain('<title>Keep me</title>');
    expect(optimized).toContain('<desc>Keep this too</desc>');
    expect(optimized).toContain('<metadata>');
    expect(optimized.length).toBeLessThanOrEqual(svg.length);
  });
});

import { describe, expect, it } from 'vitest';
import { parseMarkdownTree } from '../../src/tools/markdown/parse-engine';
import { stripFrontmatter } from '../../src/tools/markdown/frontmatter-engine';
import { prepareDocument } from '../../src/tools/markdown/document-pipeline';
import { buildPlainText } from '../../src/tools/markdown/text-export-engine';

const toText = (source: string): string => buildPlainText(parseMarkdownTree(source));

describe('MDW-R81 plain text export', () => {
  it('MDW-R81 gives headings, paragraphs and inline text without Markdown marks', () => {
    const text = toText([
      '# Title with *emphasis*',
      '',
      'A **bold** word, an _italic_ one, ~~struck~~, `code` and a hard  ',
      'break.',
      '',
      '## Second heading',
    ].join('\n'));
    expect(text).toBe('Title with emphasis\n\nA bold word, an italic one, struck, code and a hard\nbreak.\n\nSecond heading\n');
  });

  it('MDW-R81 keeps a link address after its text, and only when the text is not already the address', () => {
    const text = toText([
      'See [the docs](https://example.com/docs) and <https://example.org> or [mail](mailto:a@b.example).',
      '',
      'A [reference link][ref] and ![a chart](chart.png "Chart").',
      '',
      '[ref]: https://example.net/ref',
    ].join('\n'));
    expect(text).toBe([
      'See the docs (https://example.com/docs) and https://example.org or mail (mailto:a@b.example).',
      '',
      'A reference link (https://example.net/ref) and a chart.',
      '',
    ].join('\n'));
  });

  it('MDW-R81 writes lists with neutral bullets, real numbers and task boxes, nested by indentation', () => {
    const text = toText([
      '- one',
      '- two',
      '  - nested',
      '',
      '3. third',
      '4. fourth',
      '',
      '- [ ] open task',
      '- [x] done task',
    ].join('\n'));
    expect(text).toContain('• one\n• two\n  • nested\n');
    expect(text).toContain('3. third\n4. fourth\n');
    expect(text).toContain('[ ] open task\n');
    expect(text).toContain('[x] done task\n');
    expect(text).not.toMatch(/^[-*+] /m);
  });

  it('MDW-R81 indents quotes, labels GitHub alerts and keeps code and math exactly as written', () => {
    const text = toText([
      '> A quoted line.',
      '',
      '> [!WARNING]',
      '> Mind the gap.',
      '',
      '```js',
      'const a = "**not bold**";',
      '```',
      '',
      '$$',
      'E = mc^2',
      '$$',
    ].join('\n'));
    expect(text).toContain('    A quoted line.\n');
    expect(text).toContain('    Warning\n\n    Mind the gap.\n');
    expect(text).not.toContain('[!WARNING]');
    expect(text).toContain('const a = "**not bold**";\n');
    expect(text).not.toContain('```');
    expect(text).toContain('E = mc^2');
    expect(text).not.toContain('$$');
  });

  it('MDW-R81 writes a table row per line with tab-separated cells and no pipes or rules', () => {
    const text = toText([
      '| Item | Qty |',
      '| - | -: |',
      '| **Widget** | 4 |',
      '| Gadget | 12 |',
    ].join('\n'));
    expect(text).toBe('Item\tQty\nWidget\t4\nGadget\t12\n');
  });

  it('MDW-R81 numbers footnote references by first appearance and puts the notes after the document', () => {
    const text = toText([
      'First claim[^a] and second claim[^b].',
      '',
      '[^b]: Second note.',
      '[^a]: First note.',
    ].join('\n'));
    expect(text).toBe('First claim[1] and second claim[2].\n\n[1] First note.\n[2] Second note.\n');
  });

  it('MDW-R81 indents definition-list descriptions under their term', () => {
    const text = toText('Term\n: The description.\n');
    expect(text).toBe('Term\n    The description.\n');
  });

  it('MDW-R81 omits metadata, inert HTML, rules and link definitions', () => {
    const source = ['---', 'title: Hidden', '---', '', 'Visible.', '', '---', '', '<div>raw</div>', '', 'End.', ''].join('\n');
    const text = buildPlainText(parseMarkdownTree(stripFrontmatter(source)));
    expect(text).toBe('Visible.\n\nEnd.\n');
  });

  it('MDW-R81 uses the prepared document, so a formula cell shows its computed value', () => {
    const source = ['| A | B |', '| - | - |', '| 4 | =A2*2 |'].join('\n');
    expect(toText(prepareDocument(source))).toBe('A\tB\n4\t8\n');
  });

  it('MDW-R81 leaves no Markdown marks in a rich document', () => {
    const text = toText([
      '# Heading',
      '',
      '**bold** *em* ~~del~~ `code` [link](https://example.com) ![img](a.png)',
      '',
      '> quote',
      '',
      '1. one',
      '2. two',
      '',
      '| a | b |',
      '| - | - |',
      '| 1 | 2 |',
    ].join('\n'));
    for (const mark of ['**', '~~', '`', '](', '![', '| ', '# ', '> ']) expect(text).not.toContain(mark);
  });

  it('MDW-R81 returns an empty string for an empty document and ends other documents with one newline', () => {
    expect(toText('')).toBe('');
    expect(toText('   \n\n')).toBe('');
    expect(toText('One.\n\n\n\nTwo.')).toBe('One.\n\nTwo.\n');
  });
});

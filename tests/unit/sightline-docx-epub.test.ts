import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { ingestDocx } from '../../src/tools/sightline/docx-ingest';
import { ingestEpub, resolveEpubPath } from '../../src/tools/sightline/epub-ingest';

const buildDocx = async (parts: Record<string, string>): Promise<Uint8Array> => {
  const zip = new JSZip();
  zip.file('[Content_Types].xml', '<?xml version="1.0"?><Types/>');
  for (const [path, content] of Object.entries(parts)) zip.file(path, content);
  return zip.generateAsync({ type: 'uint8array' });
};

const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Chapter One</w:t></w:r></w:p>
    <w:p><w:r><w:t xml:space="preserve">The first body paragraph of the study.</w:t></w:r></w:p>
    <w:p><w:pPr><w:numPr><w:ilvl w:val="0"/></w:numPr></w:pPr><w:r><w:t>List item text</w:t></w:r></w:p>
    <w:p><w:pPr><w:outlineLvl w:val="1"/></w:pPr><w:r><w:t>Section From Outline</w:t></w:r></w:p>
    <w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Bold Direct Heading</w:t></w:r></w:p>
    <w:p><w:r><w:rPr><w:sz w:val="40"/><w:b/></w:rPr><w:t>Bigger Bold Heading</w:t></w:r></w:p>
    <w:p><w:r><w:t>Text with a</w:t></w:r><w:r><w:tab/></w:r><w:r><w:t>tab and a</w:t></w:r><w:r><w:br/></w:r><w:r><w:t>break.</w:t></w:r></w:p>
    <w:p><w:r><w:t>Tracked</w:t></w:r><w:del><w:r><w:delText>deleted words</w:delText></w:r></w:del><w:r><w:t>replacement</w:t></w:r></w:p>
    <w:tbl>
      <w:tr><w:tc><w:p><w:r><w:t>Metric</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Value</w:t></w:r></w:p></w:tc></w:tr>
      <w:tr><w:tc><w:p><w:r><w:t>Words</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>1200</w:t></w:r></w:p></w:tc></w:tr>
    </w:tbl>
    <w:p><w:r><w:t>Closing paragraph.</w:t></w:r></w:p>
  </w:body>
</w:document>`;

const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/></w:style>
  <w:style w:type="paragraph" w:styleId="BodyText"><w:name w:val="Body Text"/></w:style>
</w:styles>`;

const coreXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties"
  xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/">
  <dc:title>Paced Reading Study</dc:title>
  <dc:creator>Dana Reader</dc:creator>
  <dc:subject>Reading speed</dc:subject>
  <cp:keywords>reading, pacing, cognition</cp:keywords>
  <dcterms:modified>2026-09-15T10:00:00Z</dcterms:modified>
  <cp:lastModifiedBy>Editor</cp:lastModifiedBy>
</cp:coreProperties>`;

const footnotesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:footnotes xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:footnote w:type="separator" w:id="-1"><w:p><w:r><w:t>separator</w:t></w:r></w:p></w:footnote>
  <w:footnote w:type="continuationSeparator" w:id="0"><w:p><w:r><w:t>continued</w:t></w:r></w:p></w:footnote>
  <w:footnote w:id="1"><w:p><w:r><w:t>A real footnote body.</w:t></w:r></w:p></w:footnote>
</w:footnotes>`;

describe('DOCX ingestion', () => {
  it('resolves headings from the paragraph style reference', async () => {
    const structure = await ingestDocx(
      await buildDocx({ 'word/document.xml': documentXml, 'word/styles.xml': stylesXml, 'docProps/core.xml': coreXml }),
      'study.docx',
    );
    const headings = structure.paragraphs.filter((paragraph) => paragraph.kind === 'heading');
    expect(headings.map((paragraph) => paragraph.text)).toContain('Chapter One');
    expect(structure.chapters[0]!.title).toBe('Chapter One');
  });

  it('resolves headings from an explicit outline level', async () => {
    const structure = await ingestDocx(
      await buildDocx({ 'word/document.xml': documentXml, 'word/styles.xml': stylesXml }),
      'study.docx',
    );
    const outlineHeading = structure.paragraphs.find((paragraph) => paragraph.text === 'Section From Outline')!;
    expect(outlineHeading.kind).toBe('heading');
    expect(outlineHeading.level).toBe(2);
  });

  it('treats a bold, large, unpunctuated paragraph as a heading', async () => {
    const structure = await ingestDocx(
      await buildDocx({ 'word/document.xml': documentXml, 'word/styles.xml': stylesXml }),
      'study.docx',
    );
    expect(structure.paragraphs.find((paragraph) => paragraph.text === 'Bigger Bold Heading')!.kind).toBe('heading');
    expect(structure.paragraphs.find((paragraph) => paragraph.text === 'Bigger Bold Heading')!.level).toBe(1);
  });

  it('keeps short bold text without a larger size in the prose stream', async () => {
    const structure = await ingestDocx(
      await buildDocx({ 'word/document.xml': documentXml, 'word/styles.xml': stylesXml }),
      'study.docx',
    );
    const boldOnly = structure.paragraphs.find((paragraph) => paragraph.text === 'Bold Direct Heading')!;
    expect(boldOnly.kind).toBe('body');
  });

  it('marks numbered paragraphs as list items', async () => {
    const structure = await ingestDocx(
      await buildDocx({ 'word/document.xml': documentXml, 'word/styles.xml': stylesXml }),
      'study.docx',
    );
    expect(structure.paragraphs.find((paragraph) => paragraph.text === 'List item text')!.kind).toBe('list-item');
  });

  it('keeps tabs and breaks as spacing inside a paragraph', async () => {
    const structure = await ingestDocx(
      await buildDocx({ 'word/document.xml': documentXml, 'word/styles.xml': stylesXml }),
      'study.docx',
    );
    expect(structure.paragraphs.find((paragraph) => paragraph.text.startsWith('Text with a'))!.text)
      .toBe('Text with a tab and a break.');
  });

  it('excludes tracked deletions from the accepted text', async () => {
    const structure = await ingestDocx(
      await buildDocx({ 'word/document.xml': documentXml, 'word/styles.xml': stylesXml }),
      'study.docx',
    );
    const paragraph = structure.paragraphs.find((entry) => entry.text.startsWith('Tracked'))!;
    expect(paragraph.text).toBe('Trackedreplacement');
    expect(paragraph.text).not.toContain('deleted');
  });

  it('renders table rows as pipe-separated cells', async () => {
    const structure = await ingestDocx(
      await buildDocx({ 'word/document.xml': documentXml, 'word/styles.xml': stylesXml }),
      'study.docx',
    );
    const table = structure.paragraphs.find((paragraph) => paragraph.kind === 'table')!;
    expect(table.text).toBe('Metric | Value');
  });

  it('reads core properties into export metadata', async () => {
    const structure = await ingestDocx(
      await buildDocx({ 'word/document.xml': documentXml, 'word/styles.xml': stylesXml, 'docProps/core.xml': coreXml }),
      'study.docx',
    );
    expect(structure.metadata.title).toBe('Paced Reading Study');
    expect(structure.metadata.author).toBe('Dana Reader');
    expect(structure.metadata.keywords).toEqual(['reading', 'pacing', 'cognition']);
    expect(structure.metadata.modified).toBe('2026-09-15T10:00:00Z');
    expect(structure.metadata.extra).toMatchObject({ lastModifiedBy: 'Editor' });
  });

  it('includes footnote bodies as note blocks', async () => {
    const structure = await ingestDocx(
      await buildDocx({ 'word/document.xml': documentXml, 'word/styles.xml': stylesXml, 'word/footnotes.xml': footnotesXml }),
      'study.docx',
    );
    const notes = structure.paragraphs.filter((paragraph) => paragraph.kind === 'footnote');
    expect(notes.map((paragraph) => paragraph.text)).toContain('A real footnote body.');
    expect(notes.some((paragraph) => paragraph.text === 'separator')).toBe(false);
    expect(notes.some((paragraph) => paragraph.text === 'continued')).toBe(false);
  });

  it('falls back to the file name when the package has no title', async () => {
    const structure = await ingestDocx(await buildDocx({ 'word/document.xml': documentXml }), 'unnamed.docx');
    expect(structure.metadata.title).toBe('unnamed');
  });

  it('reports a clear error when the document part is missing', async () => {
    const structure = await ingestDocx(await buildDocx({ 'word/other.xml': '<x/>' }), 'broken.docx');
    expect(structure.paragraphs).toHaveLength(0);
    expect(structure.diagnostics[0]!.code).toBe('docx-structure');
  });
});

const containerXml = `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>`;

const opf = `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="book-id">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:opf="http://www.idpf.org/2007/opf">
    <dc:identifier id="book-id">urn:uuid:1234</dc:identifier>
    <dc:title>Reading at Speed</dc:title>
    <dc:creator>R. Author</dc:creator>
    <dc:language>en</dc:language>
    <dc:publisher>Local Press</dc:publisher>
    <dc:subject>reading</dc:subject>
    <meta property="dcterms:modified">2026-09-15T00:00:00Z</meta>
  </metadata>
  <manifest>
    <item id="chapter1" href="text/chapter1.xhtml" media-type="application/xhtml+xml"/>
    <item id="chapter2" href="text/chapter2.xhtml" media-type="application/xhtml+xml"/>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="cover" href="images/cover.jpg" media-type="image/jpeg" properties="cover-image"/>
  </manifest>
  <spine>
    <itemref idref="chapter1"/>
    <itemref idref="chapter2"/>
  </spine>
</package>`;

const navXhtml = `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
  <body><nav epub:type="toc"><ol>
    <li><a href="text/chapter1.xhtml">Getting Started</a></li>
    <li><a href="text/chapter2.xhtml">Going Faster</a></li>
  </ol></nav></body>
</html>`;

const chapter = (heading: string, body: string) => `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml"><head><title>${heading}</title></head>
<body><h1>${heading}</h1><p>${body}</p></body></html>`;

const buildEpub = async (parts: Record<string, string>): Promise<Uint8Array> => {
  const zip = new JSZip();
  zip.file('mimetype', 'application/epub+zip');
  zip.file('META-INF/container.xml', containerXml);
  for (const [path, content] of Object.entries(parts)) zip.file(path, content);
  return zip.generateAsync({ type: 'uint8array' });
};

describe('EPUB ingestion', () => {
  const parts = {
    'OEBPS/content.opf': opf,
    'OEBPS/nav.xhtml': navXhtml,
    'OEBPS/text/chapter1.xhtml': chapter('Getting Started', 'The first chapter body text.'),
    'OEBPS/text/chapter2.xhtml': chapter('Going Faster', 'The second chapter body text.'),
    'OEBPS/images/cover.jpg': '\u00ff\u00d8\u00ff\u00e0cover-bytes',
  };

  it('reads package metadata', async () => {
    const structure = await ingestEpub(await buildEpub(parts), 'book.epub');
    expect(structure.metadata.title).toBe('Reading at Speed');
    expect(structure.metadata.author).toBe('R. Author');
    expect(structure.metadata.language).toBe('en');
    expect(structure.metadata.publisher).toBe('Local Press');
    expect(structure.metadata.identifier).toBe('urn:uuid:1234');
    expect(structure.metadata.extra?.['dcterms:modified']).toBe('2026-09-15T00:00:00Z');
  });

  it('reads chapters in spine order and uses the navigation titles', async () => {
    const structure = await ingestEpub(await buildEpub(parts), 'book.epub');
    expect(structure.chapters.map((chapter) => chapter.title)).toEqual(['Getting Started', 'Going Faster']);
    const text = structure.paragraphs.map((paragraph) => paragraph.text);
    expect(text.indexOf('The first chapter body text.')).toBeLessThan(text.indexOf('The second chapter body text.'));
  });

  it('does not repeat a chapter heading that matches the chapter title', async () => {
    const structure = await ingestEpub(await buildEpub(parts), 'book.epub');
    expect(structure.paragraphs.filter((paragraph) => paragraph.text === 'Getting Started')).toHaveLength(0);
  });

  it('tags each block with the resource it came from', async () => {
    const structure = await ingestEpub(await buildEpub(parts), 'book.epub');
    expect(structure.paragraphs[0]!.href).toBe('OEBPS/text/chapter1.xhtml');
  });

  it('extracts the cover image declared by the manifest', async () => {
    const structure = await ingestEpub(await buildEpub(parts), 'book.epub');
    expect(structure.cover?.mediaType).toBe('image/jpeg');
    expect(structure.cover!.data.length).toBeGreaterThan(0);
  });

  it('falls back to the NCX when no navigation document is usable', async () => {
    const ncx = `<?xml version="1.0" encoding="UTF-8"?>
      <ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
        <navMap>
          <navPoint id="n1"><navLabel><text>NCX One</text></navLabel><content src="text/chapter1.xhtml"/></navPoint>
          <navPoint id="n2"><navLabel><text>NCX Two</text></navLabel><content src="text/chapter2.xhtml"/></navPoint>
        </navMap>
      </ncx>`;
    const withNcx = { ...parts };
    delete (withNcx as Record<string, string>)['OEBPS/nav.xhtml'];
    (withNcx as Record<string, string>)['OEBPS/toc.ncx'] = ncx;
    (withNcx as Record<string, string>)['OEBPS/content.opf'] = opf
      .replace('<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>',
        '<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>')
      .replace('<spine>', '<spine toc="ncx">');
    const structure = await ingestEpub(await buildEpub(withNcx), 'book.epub');
    expect(structure.chapters.map((chapter) => chapter.title)).toEqual(['NCX One', 'NCX Two']);
    expect(structure.diagnostics.some((diagnostic) => diagnostic.code === 'epub-ncx')).toBe(true);
  });

  it('reports a missing spine entry instead of failing the whole book', async () => {
    const broken = { ...parts, 'OEBPS/content.opf': opf.replace('<itemref idref="chapter2"/>', '<itemref idref="ghost"/>') };
    const structure = await ingestEpub(await buildEpub(broken), 'book.epub');
    expect(structure.paragraphs.some((paragraph) => paragraph.text.includes('first chapter'))).toBe(true);
    expect(structure.diagnostics.some((diagnostic) => diagnostic.code === 'epub-missing-item')).toBe(true);
  });

  it('reports a clear error when the container is missing', async () => {
    const zip = new JSZip();
    zip.file('mimetype', 'application/epub+zip');
    const bytes = await zip.generateAsync({ type: 'uint8array' });
    const structure = await ingestEpub(bytes, 'broken.epub');
    expect(structure.diagnostics[0]!.code).toBe('epub-container');
  });

  it('resolves relative archive paths including parent segments and fragments', () => {
    expect(resolveEpubPath('OEBPS/text/chapter1.xhtml', '../images/cover.jpg')).toBe('OEBPS/images/cover.jpg');
    expect(resolveEpubPath('OEBPS/content.opf', 'text/chapter1.xhtml#section-2')).toBe('OEBPS/text/chapter1.xhtml');
    expect(resolveEpubPath('OEBPS/content.opf', 'text/my%20chapter.xhtml')).toBe('OEBPS/text/my chapter.xhtml');
  });
});

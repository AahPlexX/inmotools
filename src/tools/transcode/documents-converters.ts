// Registry wiring for documents, markup & e-books (F15-F18) and LaTeX math
// outputs (F17).

import {
  decompileEpub, htmlToMarkdown, htmlToPlainText, markdownToDocx, markdownToEpub, markdownToHtml,
  markdownToPdf, markdownToRtf, markdownToText,
} from './documents-engine';
import { extractTexSource, latexToHtml, latexToMathMl, latexToPng, latexToSvg } from './math-engine';
import { parseRtf, rtfToHtml, rtfToMarkdown, rtfToText } from './rtf-engine';
import { baseName, bytesArtifact, registerConverter, swapExtension, textArtifact, type ConversionOptions } from './transcode-engine';

const strOpt = (options: ConversionOptions, key: string, fallback: string): string =>
  typeof options[key] === 'string' && (options[key] as string).trim() !== '' ? (options[key] as string).trim() : fallback;

function titleFor(fileName: string, options: ConversionOptions): string {
  return strOpt(options, 'title', baseName(fileName));
}

export function registerDocumentConverters(): void {
  // --- Markdown sources (F15) ----------------------------------------------
  registerConverter('markdown', 'html', 'Compile GFM Markdown to standalone HTML5 (math as MathML)', async (input, options) => {
    const html = await markdownToHtml(input.text(), { title: titleFor(input.fileName, options) });
    return [textArtifact(swapExtension(input.fileName, 'html'), html, 'text/html;charset=utf-8')];
  });
  registerConverter('markdown', 'txt', 'Flatten Markdown to plain text', async (input) => {
    const text = await markdownToText(input.text());
    return [textArtifact(swapExtension(input.fileName, 'txt'), text, 'text/plain;charset=utf-8')];
  });
  registerConverter('markdown', 'rtf', 'Render Markdown as Rich Text Format', async (input, options) => {
    const rtf = await markdownToRtf(input.text(), titleFor(input.fileName, options));
    return [textArtifact(swapExtension(input.fileName, 'rtf'), rtf, 'application/rtf')];
  });
  registerConverter('markdown', 'pdf', 'Typeset Markdown into a PDF document', async (input, options) => {
    const bytes = await markdownToPdf(input.text(), titleFor(input.fileName, options));
    return [bytesArtifact(swapExtension(input.fileName, 'pdf'), bytes, 'application/pdf')];
  });
  registerConverter('markdown', 'docx', 'Compile Markdown into a Word DOCX document', async (input, options) => {
    const bytes = await markdownToDocx(input.text(), titleFor(input.fileName, options));
    return [bytesArtifact(swapExtension(input.fileName, 'docx'), bytes, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')];
  });
  registerConverter('markdown', 'epub', 'Bundle Markdown chapters into an EPUB 3 e-book', async (input, options) => {
    const bytes = await markdownToEpub(input.text(), {
      title: titleFor(input.fileName, options),
      author: strOpt(options, 'author', 'Unknown'),
      language: strOpt(options, 'language', 'en'),
      date: new Date().toISOString(),
    });
    return [bytesArtifact(swapExtension(input.fileName, 'epub'), bytes, 'application/epub+zip')];
  });

  // --- HTML sources ----------------------------------------------------------
  registerConverter('html', 'markdown', 'Convert HTML to Markdown', async (input) => {
    const markdown = await htmlToMarkdown(input.text());
    return [textArtifact(swapExtension(input.fileName, 'md'), `${markdown}\n`, 'text/markdown;charset=utf-8')];
  });
  registerConverter('html', 'txt', 'Extract plain text from HTML', async (input) => {
    return [textArtifact(swapExtension(input.fileName, 'txt'), htmlToPlainText(input.text()), 'text/plain;charset=utf-8')];
  });
  registerConverter('html', 'pdf', 'Convert HTML to PDF via Markdown typesetting', async (input, options) => {
    const markdown = await htmlToMarkdown(input.text());
    const bytes = await markdownToPdf(markdown, titleFor(input.fileName, options));
    return [bytesArtifact(swapExtension(input.fileName, 'pdf'), bytes, 'application/pdf')];
  });
  registerConverter('html', 'rtf', 'Convert HTML to RTF via Markdown', async (input, options) => {
    const markdown = await htmlToMarkdown(input.text());
    const rtf = await markdownToRtf(markdown, titleFor(input.fileName, options));
    return [textArtifact(swapExtension(input.fileName, 'rtf'), rtf, 'application/rtf')];
  });
  registerConverter('html', 'epub', 'Bundle HTML into an EPUB 3 e-book', async (input, options) => {
    const markdown = await htmlToMarkdown(input.text());
    const bytes = await markdownToEpub(markdown, {
      title: titleFor(input.fileName, options),
      author: strOpt(options, 'author', 'Unknown'),
      language: strOpt(options, 'language', 'en'),
      date: new Date().toISOString(),
    });
    return [bytesArtifact(swapExtension(input.fileName, 'epub'), bytes, 'application/epub+zip')];
  });

  // --- RTF sources (F18) -----------------------------------------------------
  registerConverter('rtf', 'txt', 'Strip RTF control codes to plain text', async (input) => {
    const document = parseRtf(input.text());
    return [textArtifact(swapExtension(input.fileName, 'txt'), rtfToText(document), 'text/plain;charset=utf-8')];
  });
  registerConverter('rtf', 'html', 'Convert RTF to clean semantic HTML', async (input, options) => {
    const document = parseRtf(input.text());
    return [textArtifact(swapExtension(input.fileName, 'html'), rtfToHtml(document, titleFor(input.fileName, options)), 'text/html;charset=utf-8')];
  });
  registerConverter('rtf', 'markdown', 'Convert RTF to Markdown', async (input) => {
    const document = parseRtf(input.text());
    return [textArtifact(swapExtension(input.fileName, 'md'), rtfToMarkdown(document), 'text/markdown;charset=utf-8')];
  });

  // --- Plain text sources -----------------------------------------------------
  registerConverter('txt', 'markdown', 'Wrap plain text as Markdown paragraphs', async (input) => {
    const paragraphs = input.text().replace(/\r\n/g, '\n').split(/\n{2,}/).map((part) => part.replace(/\n/g, ' ').trim()).filter((part) => part.length > 0);
    return [textArtifact(swapExtension(input.fileName, 'md'), `${paragraphs.join('\n\n')}\n`, 'text/markdown;charset=utf-8')];
  });
  registerConverter('txt', 'html', 'Wrap plain text paragraphs in HTML5', async (input, options) => {
    const title = titleFor(input.fileName, options);
    const escaped = input.text().replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const paragraphs = escaped.split(/\n{2,}/).map((part) => `<p>${part.replace(/\n/g, '<br>')}</p>`).join('\n');
    const html = `<!doctype html>\n<html lang="en">\n<head><meta charset="utf-8"><title>${title}</title>\n<style>body{font-family:system-ui,sans-serif;max-width:46rem;margin:2.5rem auto;padding:0 1.25rem;line-height:1.6}</style></head>\n<body>\n${paragraphs}\n</body>\n</html>\n`;
    return [textArtifact(swapExtension(input.fileName, 'html'), html, 'text/html;charset=utf-8')];
  });
  registerConverter('txt', 'pdf', 'Typeset plain text into a PDF document', async (input, options) => {
    const bytes = await markdownToPdf(input.text(), titleFor(input.fileName, options));
    return [bytesArtifact(swapExtension(input.fileName, 'pdf'), bytes, 'application/pdf')];
  });

  // --- LaTeX math sources (F17) ----------------------------------------------
  registerConverter('latex-math', 'mathml', 'Convert LaTeX to MathML', async (input) => {
    const source = extractTexSource(input.text());
    return [textArtifact(swapExtension(input.fileName, 'mathml.xml'), latexToMathMl(source), 'application/mathml+xml')];
  });
  registerConverter('latex-math', 'svg-equation', 'Render LaTeX to a vector SVG equation', async (input) => {
    const source = extractTexSource(input.text());
    return [textArtifact(swapExtension(input.fileName, 'svg'), latexToSvg(source), 'image/svg+xml')];
  });
  registerConverter('latex-math', 'png-equation', 'Render LaTeX to a PNG equation image', async (input) => {
    const source = extractTexSource(input.text());
    const bytes = await latexToPng(source);
    return [bytesArtifact(swapExtension(input.fileName, 'png'), bytes, 'image/png')];
  });
  registerConverter('latex-math', 'html', 'Render LaTeX into an HTML page', async (input, options) => {
    const source = extractTexSource(input.text());
    return [textArtifact(swapExtension(input.fileName, 'html'), latexToHtml(source, titleFor(input.fileName, options)), 'text/html;charset=utf-8')];
  });

  // --- EPUB sources (F16 decompile) -------------------------------------------
  registerConverter('epub', 'markdown', 'Decompile EPUB chapters to Markdown', async (input) => {
    const extraction = await decompileEpub(input.bytes);
    const markdown = await htmlToMarkdown(extraction.html);
    return [textArtifact(swapExtension(input.fileName, 'md'), `${markdown}\n`, 'text/markdown;charset=utf-8')];
  });
  registerConverter('epub', 'html', 'Extract EPUB content as HTML', async (input, options) => {
    const extraction = await decompileEpub(input.bytes);
    const title = strOpt(options, 'title', extraction.title);
    const html = `<!doctype html>\n<html lang="en">\n<head><meta charset="utf-8"><title>${title}</title></head>\n<body>\n${extraction.html}\n</body>\n</html>\n`;
    return [textArtifact(swapExtension(input.fileName, 'html'), html, 'text/html;charset=utf-8')];
  });
  registerConverter('epub', 'txt', 'Extract EPUB content as plain text', async (input) => {
    const extraction = await decompileEpub(input.bytes);
    return [textArtifact(swapExtension(input.fileName, 'txt'), htmlToPlainText(extraction.html), 'text/plain;charset=utf-8')];
  });
}

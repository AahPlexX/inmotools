import { describe, expect, it, vi } from 'vitest';
import JSZip from 'jszip';
import { buildEpubArchive, buildStandaloneMarkdownHtml } from '../../src/tools/markdown/export-engine';
import { renderMarkdown } from '../../src/tools/markdown/render-engine';

// Default unit CSS imports are empty; use the tracked stylesheet for export logic.
// Production browser checks exercise the actual Vite inline CSS integration.
vi.mock('../../src/tools/markdown/alert-style.css?inline', async () => {
  const { readFile } = await import('node:fs/promises');
  return { default: await readFile(new URL('../../src/tools/markdown/alert-style.css', import.meta.url), 'utf8') };
});

describe('Markdown alert extensions and literals', () => {
  it.each(['DANGER', 'danger'])('renders %s with a title, body formatting and source anchor', (kind) => {
    const rendered = renderMarkdown(`> [!${kind}]\n> **Critical** warning.\n>\n> - Keep this list.`);
    expect(rendered.html).toContain('markdown-alert-danger');
    expect(rendered.html).toContain('>Danger</p>');
    expect(rendered.html).toContain('<strong');
    expect(rendered.html).toContain('<ul');
    expect(rendered.html).toContain('data-source-line="1"');
    expect(rendered.html).not.toContain(`[!${kind}]`);
  });

  it.each(['NOTE', 'TIP', 'IMPORTANT', 'WARNING', 'CAUTION', 'DANGER'])('keeps an escaped %s marker literal', (kind) => {
    const rendered = renderMarkdown(`> \\[!${kind}]\n> Literal marker.`);
    expect(rendered.html).toContain('<blockquote');
    expect(rendered.html).toContain(`[!${kind}]`);
    expect(rendered.html).not.toContain('markdown-alert');
  });

  it('does not turn inline, fenced or unknown markers into alerts', () => {
    const rendered = renderMarkdown('`[!DANGER]`\n\n```text\n> [!DANGER]\n```\n\n> [!UNKNOWN]\n> Plain quote.');
    expect(rendered.html).not.toContain('markdown-alert');
    expect(rendered.html).toContain('[!DANGER]');
    expect(rendered.html).toContain('[!UNKNOWN]');
  });

  it('keeps unsafe alert body links inert through the existing sanitizer', () => {
    const rendered = renderMarkdown('> [!DANGER]\n> [Unsafe](javascript:alert(1)) <script>bad()</script>');
    expect(rendered.html).toContain('markdown-alert-danger');
    expect(rendered.html).not.toContain('javascript:');
    expect(rendered.html).not.toContain('<script');
  });
});


describe('alert styling in detached exports', () => {
  const body = renderMarkdown('> [!WARNING]\n> Keep this warning.').html;
  it('retains existing alert styling in standalone HTML', () => {
    const html = buildStandaloneMarkdownHtml('Alert export', body);
    expect(html.match(/<style>([\s\S]*?)<\/style>/)?.[1]).toContain('.markdown-alert-warning');
    expect(html).toContain('Keep this warning.');
  });
  it('packages existing alert styling in EPUB', async () => {
    const zip = await JSZip.loadAsync(await buildEpubArchive({
      title: 'Alert export', author: '', identifier: 'urn:uuid:alert-test', modified: '2026-10-07T00:00:00Z',
    }, body));
    expect(await zip.file('OEBPS/styles/markdown.css')?.async('string')).toContain('.markdown-alert-warning');
    expect(await zip.file('OEBPS/chapter1.xhtml')?.async('string')).toContain('Keep this warning.');
  });
});

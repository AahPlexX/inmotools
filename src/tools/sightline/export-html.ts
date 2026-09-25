/**
 * Standalone HTML export.
 *
 * The exported file carries everything its own rendering needs: the styles are
 * inline, the fonts fall back to the reader's system, and there is no script.
 * Two treatments are available, and they can be combined:
 *
 * - fixation weighting, where the opening letters of a word are heavier;
 * - a trail gradient, where each word's colour steps through a palette so every
 *   line begins and ends at the same colours.
 *
 * Both are computed from the document model, so the file matches what the
 * reader saw in the studio.
 */

import { gradientLineHtml, paletteById, type GradientOptions } from './gradient-engine';
import { themeById, themeVariables, type ReaderAppearance } from './palette-engine';
import { emphasisHtml, emphasisForLevel, type EmphasisConfig } from './typography-engine';
import { socialTagHtml, structuredDataScript, type MetadataDraft } from './metadata-studio';
import type { DocumentModel } from './sightline-types';

export interface HtmlExportOptions {
  readonly appearance: ReaderAppearance;
  readonly emphasis: EmphasisConfig | null;
  readonly gradient: GradientOptions | null;
  readonly gradientPalette: string;
  /** Include the heading outline at the top of the document. */
  readonly includeTableOfContents: boolean;
  /** Include prose metrics in the footer. */
  readonly includeMetrics: boolean;
  /** Render one paragraph per line instead of the flowing layout. */
  readonly preserveLines: boolean;
}

export const DEFAULT_HTML_EXPORT: HtmlExportOptions = {
  appearance: {
    theme: 'parchment',
    font: 'atkinson',
    fontScale: 1,
    lineHeight: 1.7,
    letterSpacing: 0,
    wordSpacing: 0,
    focalMarker: 'none',
    anchorAccent: 'accent',
    reduceMotion: false,
    dyslexiaSpacing: false,
    highlightCurrentWord: true,
  },
  emphasis: emphasisForLevel(3),
  gradient: { direction: 'horizontal', intensity: 1, wash: false },
  gradientPalette: 'horizon',
  includeTableOfContents: true,
  includeMetrics: true,
  preserveLines: false,
};

const escapeHtml = (value: string): string => value.replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[character] ?? character));

const paragraphClass = (kind: string): string => `sightline-${kind}`;

export const buildExportCss = (appearance: ReaderAppearance): string => {
  const variables = themeVariables(appearance);
  const declarations = Object.entries(variables).map(([name, value]) => `  ${name}: ${value};`).join('\n');
  const theme = themeById(appearance.theme);
  return `:root {
${declarations}
}

* { box-sizing: border-box; }

body {
  margin: 0;
  padding: 3rem 1.25rem 5rem;
  background: var(--sightline-background);
  color: var(--sightline-text);
  font-family: var(--sightline-font);
  font-size: var(--sightline-font-size);
  line-height: var(--sightline-line-height);
  letter-spacing: var(--sightline-letter-spacing);
  word-spacing: var(--sightline-word-spacing);
}

.sightline-document {
  max-width: 34rem;
  margin: 0 auto;
}

h1.sightline-document-title {
  font-size: 1.9em;
  margin: 0 0 0.5rem;
}

.sightline-byline {
  color: var(--sightline-muted);
  margin: 0 0 2rem;
  font-size: 0.95em;
}

.sightline-tags {
  margin: 0 0 1.5rem;
  padding: 0;
  list-style: none;
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}

.sightline-tags li {
  border: 1px solid var(--sightline-muted);
  border-radius: 999px;
  padding: 0.1rem 0.6rem;
  font-size: 0.8em;
  color: var(--sightline-muted);
}

.sightline-toc {
  border: 1px solid ${theme.muted}33;
  border-radius: 0.5rem;
  padding: 1rem 1.25rem;
  margin: 0 0 2rem;
}

.sightline-toc ol { margin: 0.4rem 0 0; padding-left: 1.2rem; }

.sightline-toc a { color: var(--sightline-accent); }

.sightline-heading { margin: 2.2rem 0 0.8rem; }

.sightline-body { margin: 0 0 1.1rem; }

.sightline-list-item { margin: 0 0 0.5rem 1.2rem; }

.sightline-quote {
  margin: 1.2rem 0;
  padding-left: 1rem;
  border-left: 3px solid var(--sightline-accent);
  color: var(--sightline-muted);
}

.sightline-code {
  font-family: "JetBrains Mono", Consolas, monospace;
  font-size: 0.9em;
  white-space: pre-wrap;
  background: ${theme.muted}1a;
  border-radius: 0.35rem;
  padding: 0.75rem 0.9rem;
  margin: 0 0 1.1rem;
}

.sightline-table {
  font-size: 0.92em;
  white-space: pre-wrap;
  border-left: 3px solid ${theme.muted}66;
  padding-left: 0.8rem;
  margin: 0 0 1.1rem;
}

.sightline-caption {
  font-size: 0.9em;
  color: var(--sightline-muted);
  margin: -0.6rem 0 1.2rem;
}

.sightline-footnote, .sightline-endnote {
  font-size: 0.9em;
  color: var(--sightline-muted);
  margin: 0 0 0.7rem;
}

.sightline-metrics {
  margin-top: 3rem;
  border-top: 1px solid ${theme.muted}55;
  padding-top: 1rem;
  color: var(--sightline-muted);
  font-size: 0.85em;
}

b { font-weight: 700; }

@media print {
  body { padding: 0; }
  .sightline-document { max-width: none; }
  .sightline-toc { break-inside: avoid; }
  a { color: inherit; text-decoration: none; }
}`;
};

export const buildExportHtml = (
  model: DocumentModel,
  draft: MetadataDraft,
  options: HtmlExportOptions = DEFAULT_HTML_EXPORT,
): string => {
  const palette = paletteById(options.gradientPalette);
  const paragraphs = model.paragraphs.map((paragraph) => {
    const tokens = model.tokens.slice(paragraph.tokenStart, paragraph.tokenEnd);
    const html = options.gradient
      ? gradientLineHtml(tokens.map((token) => token.text).join(' '), palette, options.gradient)
      : options.emphasis
        ? emphasisHtml(tokens, options.emphasis)
        : escapeHtml(tokens.map((token) => token.text).join(' '));
    const level = Math.min(6, Math.max(1, paragraph.level || 2));
    const tag = paragraph.kind === 'heading' ? `h${level}` : 'p';
    const id = paragraph.kind === 'heading' ? ` id="section-${paragraph.index}"` : '';
    const classes = `${paragraphClass(paragraph.kind)}${paragraph.kind === 'heading' ? ' sightline-heading' : ''}`;
    const style = options.preserveLines ? ' style="white-space:pre-wrap"' : '';
    return `<${tag}${id} class="${classes}"${style}>${html}</${tag}>`;
  }).join('\n');

  const toc = options.includeTableOfContents && model.chapters.length > 1
    ? `<nav class="sightline-toc" aria-label="Contents"><strong>Contents</strong><ol>${model.chapters
      .filter((chapter) => chapter.level > 0)
      .map((chapter) => `<li><a href="#section-${chapter.paragraphStart}">${escapeHtml(chapter.title)}</a></li>`)
      .join('')}</ol></nav>`
    : '';

  const tags = draft.tags.length > 0
    ? `<ul class="sightline-tags">${draft.tags.map((tag) => `<li>${escapeHtml(tag)}</li>`).join('')}</ul>`
    : '';
  void tags;

  const metrics = options.includeMetrics
    ? `<footer class="sightline-metrics">${model.metrics.words.toLocaleString('en-US')} words · ${model.metrics.sentences.toLocaleString('en-US')} sentences · ${model.metrics.readingMinutes.toFixed(1)} minutes at ${model.metrics.words === 0 ? 0 : Math.round(model.metrics.words / Math.max(0.001, model.metrics.readingMinutes))} words per minute${draft.readingLevel ? ` · ${escapeHtml(draft.readingLevel)}` : ''}</footer>`
    : '';

  const firstParagraph = model.paragraphs.find((paragraph) => paragraph.kind === 'body')?.text ?? '';

  return `<!doctype html>
<html lang="${escapeHtml(draft.language || 'en')}">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(draft.title)}</title>
  <meta name="generator" content="Sightline Velocity Studio" />
  <meta name="description" content="${escapeHtml(draft.description || firstParagraph.slice(0, 300))}" />
    ${socialTagHtml(draft, firstParagraph.slice(0, 300))}
  ${structuredDataScript(draft)}
  <style>
${buildExportCss(options.appearance)}
  </style>
</head>
<body>
  <article class="sightline-document">
    <header data-sightline-chrome="true">
      <h1 class="sightline-document-title">${escapeHtml(draft.title)}</h1>
      ${draft.author ? `<p class="sightline-byline">${escapeHtml(draft.author)}${draft.publisher ? ` · ${escapeHtml(draft.publisher)}` : ''}</p>` : ''}
      ${tags}
    </header>
    ${toc}
${paragraphs}
    ${metrics}
  </article>
</body>
</html>
`;
};

/** Markdown export of the same model, for readers who want to re-edit it. */
export const buildExportMarkdown = (model: DocumentModel, draft: MetadataDraft): string => {
  const frontmatter = [
    '---',
    `title: ${draft.title}`,
    ...(draft.author ? [`author: ${draft.author}`] : []),
    ...(draft.description ? [`description: ${draft.description}`] : []),
    ...(draft.tags.length > 0 ? [`tags: ${draft.tags.join(', ')}`] : []),
    ...(draft.language ? [`language: ${draft.language}`] : []),
    ...(draft.readingLevel ? [`readingLevel: ${draft.readingLevel}`] : []),
    ...(draft.modified ? [`date: ${draft.modified}`] : []),
    '---',
    '',
  ].join('\n');

  const body = model.paragraphs.map((paragraph) => {
    const text = model.tokens.slice(paragraph.tokenStart, paragraph.tokenEnd).map((token) => token.text).join(' ');
    switch (paragraph.kind) {
      case 'heading': return `${'#'.repeat(Math.min(6, Math.max(1, paragraph.level || 1)))} ${text}`;
      case 'list-item': return `${'  '.repeat(Math.max(0, paragraph.level - 1))}- ${text}`;
      case 'quote': return `> ${text}`;
      case 'code': return `\`\`\`\n${text}\n\`\`\``;
      case 'footnote':
      case 'endnote': return `[^${paragraph.index}]: ${text}`;
      default: return text;
    }
  }).join('\n\n');

  return `${frontmatter}${body}\n`;
};

/** Plain text export, one paragraph per line. */
export const buildExportText = (model: DocumentModel): string =>
  `${model.paragraphs
    .map((paragraph) => model.tokens.slice(paragraph.tokenStart, paragraph.tokenEnd).map((token) => token.text).join(' '))
    .join('\n\n')}\n`;

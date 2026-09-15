/**
 * HTML ingestion with boilerplate stripping.
 *
 * The browser's own HTML parsing algorithm does the parsing (through
 * `rehype-parse`'s default DOM-backed parser in the browser and its parse5
 * fallback elsewhere), so malformed markup is handled exactly as the HTML
 * standard requires rather than by a bespoke tolerant parser. Article
 * extraction is a deterministic scoring pass over block elements: text length,
 * punctuation density, link density, and structural hints decide which
 * container is the body of the document.
 */

import { unified } from 'unified';
import rehypeParse from 'rehype-parse';
import { toText } from 'hast-util-to-text';
import type { Element, Root, RootContent } from 'hast';
import { normalizeParagraphText, type RawChapter, type RawParagraph } from './segmentation-engine';
import type { IngestDiagnostic } from './sightline-types';

export interface HtmlStructure {
  readonly paragraphs: readonly RawParagraph[];
  readonly chapters: readonly RawChapter[];
  readonly title: string;
  readonly byline: string;
  readonly description: string;
  readonly diagnostics: readonly IngestDiagnostic[];
}

const BLOCK_TAGS = new Set([
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'li', 'blockquote', 'pre', 'td', 'th',
  'figcaption', 'caption', 'dd', 'dt', 'summary',
]);

const CLASS_HINTS = /(?:^|[\s_-])(article|content|post|entry|main|body|chapter|story|text|prose|markdown|reading)(?:$|[\s_-])/i;
const BOILERPLATE_HINTS = /(?:^|[\s_-])(nav|menu|sidebar|footer|header|comment|comments|share|social|promo|advert|ads?|cookie|breadcrumb|related|newsletter|subscribe|masthead|toolbar|pagination|meta|tags)(?:$|[\s_-])/i;
const ARTICLE_TAGS = new Set(['article', 'main']);

const parseHtml = (html: string): Root => unified().use(rehypeParse).parse(html) as Root;

const getText = (node: RootContent | Element): string => toText(node as never, { whitespace: 'normal' });

const classAndId = (element: Element): string => {
  const className = element.properties?.['className'];
  const id = element.properties?.['id'];
  const classText = Array.isArray(className) ? className.join(' ') : typeof className === 'string' ? className : '';
  const idText = typeof id === 'string' ? id : '';
  return `${classText} ${idText}`.trim();
};

const isBoilerplate = (element: Element): boolean => {
  const tag = element.tagName.toLowerCase();
  if (tag === 'nav' || tag === 'footer' || tag === 'aside' || tag === 'form' || tag === 'script' || tag === 'style') return true;
  if (tag === 'header') return true;
  const marker = classAndId(element);
  return marker.length > 0 && BOILERPLATE_HINTS.test(marker);
};

const scoreContainer = (element: Element): number => {
  let score = 0;
  const tag = element.tagName.toLowerCase();
  if (ARTICLE_TAGS.has(tag)) score += 30;
  const marker = classAndId(element);
  if (CLASS_HINTS.test(marker)) score += 40;
  let linkText = 0;
  let totalText = 0;
  const walk = (node: RootContent): void => {
    if (node.type === 'text') {
      totalText += node.value.trim().length;
      return;
    }
    if (node.type !== 'element') return;
    if (isBoilerplate(node)) return;
    if (node.tagName.toLowerCase() === 'a') linkText += getText(node).trim().length;
    for (const child of node.children) walk(child);
  };
  for (const child of element.children) walk(child);
  if (totalText === 0) return -1;
  const linkDensity = linkText / Math.max(1, totalText);
  score += Math.min(60, totalText / 40);
  score -= linkDensity * 60;
  if (element.tagName.toLowerCase() === 'div' && marker.length === 0) score -= 6;
  return score;
};

const collectParagraphs = (root: Element): RawParagraph[] => {
  const paragraphs: RawParagraph[] = [];
  const visit = (node: RootContent, suppressed: boolean) => {
    if (node.type !== 'element') return;
    const tag = node.tagName.toLowerCase();
    if (!suppressed && isBoilerplate(node)) return;
    if (tag === 'table') {
      const rows: string[] = [];
      const collectRows = (rowNode: RootContent) => {
        if (rowNode.type !== 'element') return;
        if (rowNode.tagName.toLowerCase() === 'tr') {
          const cells: string[] = [];
          for (const cell of rowNode.children) {
            if (cell.type === 'element' && (cell.tagName.toLowerCase() === 'td' || cell.tagName.toLowerCase() === 'th')) {
              cells.push(getText(cell).trim().replace(/\s+/g, ' '));
            }
          }
          if (cells.length > 0) rows.push(cells.join(' | '));
          return;
        }
        for (const child of rowNode.children) collectRows(child);
      };
      collectRows(node);
      if (rows.length > 0) paragraphs.push({ kind: 'table', level: 0, text: rows.join('; ') });
      return;
    }
    if (tag === 'pre') {
      paragraphs.push({ kind: 'code', level: 0, text: getText(node) });
      return;
    }
    if (/^h[1-6]$/.test(tag)) {
      paragraphs.push({ kind: 'heading', level: Number(tag.slice(1)), text: getText(node) });
      return;
    }
    if (tag === 'blockquote') {
      paragraphs.push({ kind: 'quote', level: 0, text: getText(node) });
      return;
    }
    if (tag === 'figcaption' || tag === 'caption') {
      paragraphs.push({ kind: 'caption', level: 0, text: getText(node) });
      return;
    }
    if (tag === 'li') {
      paragraphs.push({ kind: 'list-item', level: 1, text: getText(node) });
      return;
    }
    if (tag === 'p' || tag === 'dd' || tag === 'dt' || tag === 'summary') {
      paragraphs.push({ kind: 'body', level: 0, text: getText(node) });
      return;
    }
    if (BLOCK_TAGS.has(tag)) {
      const text = getText(node);
      if (text.trim().length > 0) paragraphs.push({ kind: 'body', level: 0, text });
      return;
    }
    for (const child of node.children) visit(child, suppressed);
  };
  for (const child of root.children) visit(child, false);
  return paragraphs;
};

const findArticleContainer = (root: Root): { element: Element | null; score: number; considered: number } => {
  let best: Element | null = null;
  let bestScore = 0;
  let considered = 0;
  const visit = (node: RootContent) => {
    if (node.type !== 'element') return;
    if (!isBoilerplate(node)) {
      const score = scoreContainer(node);
      if (score >= 0) {
        considered += 1;
        if (score > bestScore) {
          bestScore = score;
          best = node;
        }
      }
    }
    for (const child of node.children) visit(child);
  };
  for (const child of root.children) visit(child);
  return { element: best, score: bestScore, considered };
};

const findMeta = (root: Root, names: readonly string[]): string => {
  let value = '';
  const visit = (node: RootContent) => {
    if (node.type !== 'element') return;
    if (node.tagName.toLowerCase() === 'meta') {
      const properties = node.properties ?? {};
      const key = String(properties['name'] ?? properties['property'] ?? '').toLowerCase();
      if (names.includes(key)) {
        const content = String(properties['content'] ?? '').trim();
        if (content.length > 0 && value.length === 0) value = content;
      }
    }
    for (const child of node.children) visit(child);
  };
  for (const child of root.children) visit(child);
  return value;
};

export const ingestHtml = (html: string): HtmlStructure => {
  const diagnostics: IngestDiagnostic[] = [];
  const root = parseHtml(html);

  const titleTag = (() => {
    let found = '';
    const visit = (node: RootContent) => {
      if (node.type !== 'element') return;
      if (node.tagName.toLowerCase() === 'title' && found.length === 0) found = getText(node).trim();
      for (const child of node.children) visit(child);
    };
    for (const child of root.children) visit(child);
    return found;
  })();

  const { element, score, considered } = findArticleContainer(root);
  const bodySource = element ?? (root.children.find((child): child is Element => child.type === 'element') ?? root);
  const collected = element ? collectParagraphs(element as Element) : collectParagraphs(root as unknown as Element);
  const paragraphs = collected
    .map((paragraph) => ({ ...paragraph, text: normalizeParagraphText(paragraph.text) }))
    .filter((paragraph) => paragraph.text.length > 0);

  if (!element || score < 20) {
    diagnostics.push({
      level: 'info',
      code: 'article-heuristic',
      message: 'No dominant article container was found, so the whole document body was read.',
      detail: `${considered} candidate containers scored, best score ${Math.round(score)}`,
    });
  } else {
    diagnostics.push({
      level: 'info',
      code: 'article-container',
      message: `Article container selected by content scoring (score ${Math.round(score)}).`,
    });
  }

  const chapters: RawChapter[] = [];
  paragraphs.forEach((paragraph, index) => {
    const level = paragraph.level ?? 1;
    if (paragraph.kind === 'heading' && level <= 2) {
      chapters.push({ title: paragraph.text, level, paragraphIndex: index });
    }
  });

  if (paragraphs.length === 0) {
    diagnostics.push({
      level: 'error',
      code: 'empty-html',
      message: 'No readable text was found in this HTML document.',
    });
  }

  const byline = findMeta(root, ['author', 'article:author', 'og:article:author', 'twitter:creator'])
    || (() => {
      let found = '';
      const visit = (node: RootContent) => {
        if (node.type !== 'element' || found.length > 0) return;
        const tag = node.tagName.toLowerCase();
        const marker = classAndId(node);
        if (/^(p|span|div|a)$/.test(tag) && /author|byline|written-by/i.test(marker)) {
          const text = getText(node).trim();
          if (text.length > 0 && text.length < 160) found = text;
        }
        for (const child of node.children) visit(child);
      };
      for (const child of root.children) visit(child);
      return found;
    })();

  const description = findMeta(root, ['description', 'og:description', 'twitter:description']);
  const title = findMeta(root, ['og:title', 'twitter:title']) || titleTag;
  void bodySource;

  return { paragraphs, chapters, title, byline, description, diagnostics };
};

/**
 * Markdown (CommonMark + GFM) ingestion through the repository's existing
 * remark parser stack, which never needs a DOM.
 *
 * The block tree is flattened into reading paragraphs with a chapter outline
 * taken from the heading hierarchy. Code blocks and tables are kept as their
 * own block kinds so the reader can exclude them from the prose stream.
 */

import { unified } from 'unified';
import remarkGfm from 'remark-gfm';
import remarkParse from 'remark-parse';
import type { Root, RootContent } from 'mdast';
import { normalizeParagraphText, type RawChapter, type RawParagraph } from './segmentation-engine';
import type { IngestDiagnostic } from './sightline-types';

export interface MarkdownStructure {
  readonly paragraphs: readonly RawParagraph[];
  readonly chapters: readonly RawChapter[];
  readonly frontmatter: Readonly<Record<string, string>>;
  readonly diagnostics: readonly IngestDiagnostic[];
}

const parseTree = (source: string): Root =>
  unified().use(remarkParse).use(remarkGfm).parse(source) as Root;

const textOf = (nodes: readonly unknown[]): string => {
  let output = '';
  const walk = (node: unknown) => {
    if (node === null || typeof node !== 'object') return;
    const record = node as { type?: string; value?: string; children?: unknown[]; url?: string; alt?: string };
    if (record.type === 'text' || record.type === 'inlineCode') {
      output += record.value ?? '';
      return;
    }
    if (record.type === 'code') {
      output += record.value ?? '';
      return;
    }
    if (record.type === 'image') {
      output += record.alt ?? '';
      return;
    }
    if (record.type === 'break') {
      output += ' ';
      return;
    }
    if (record.type === 'footnoteReference') {
      output += `[${String((record as { label?: string }).label ?? '')}]`;
      return;
    }
    for (const child of record.children ?? []) walk(child);
  };
  for (const node of nodes) walk(node);
  return output;
};

const isTableRow = (node: RootContent): boolean => node.type === 'tableRow';

const FRONTMATTER_PATTERN = /^---\r?\n([\s\S]*?)\r?\n---(\r?\n|$)/;

const parseFrontmatter = (source: string): { frontmatter: Record<string, string>; body: string } => {
  const match = FRONTMATTER_PATTERN.exec(source);
  if (!match) return { frontmatter: {}, body: source };
  const frontmatter: Record<string, string> = {};
  for (const line of match[1]!.split(/\r?\n/)) {
    const separator = line.indexOf(':');
    if (separator <= 0) continue;
    const key = line.slice(0, separator).trim().toLowerCase();
    const rawValue = line.slice(separator + 1).trim().replace(/^["']|["']$/g, '');
    if (key.length > 0 && rawValue.length > 0) frontmatter[key] = rawValue;
  }
  return { frontmatter, body: source.slice(match[0].length) };
};

export const ingestMarkdown = (source: string): MarkdownStructure => {
  const diagnostics: IngestDiagnostic[] = [];
  const { frontmatter, body } = parseFrontmatter(source);
  const tree = parseTree(body);
  const paragraphs: RawParagraph[] = [];
  const chapters: RawChapter[] = [];

  const pushBlock = (kind: RawParagraph['kind'], text: string, level = 0) => {
    const normalized = normalizeParagraphText(text);
    if (normalized.length === 0) return;
    if (kind === 'heading') {
      chapters.push({ title: normalized, level, paragraphIndex: paragraphs.length });
    }
    paragraphs.push({ kind, level, text: normalized });
  };

  const walkList = (nodes: readonly RootContent[], depth: number) => {
    for (const node of nodes) {
      if (node.type === 'listItem') {
        const text = textOf(node.children.filter((child) => child.type !== 'list'));
        pushBlock('list-item', text, depth);
        const nested = node.children.filter((child) => child.type === 'list');
        for (const list of nested) {
          walkList((list as { children: RootContent[] }).children, depth + 1);
        }
        continue;
      }
      if (node.type === 'list') {
        walkList((node as { children: RootContent[] }).children, depth);
      }
    }
  };

  for (const node of tree.children) {
    switch (node.type) {
      case 'heading':
        pushBlock('heading', textOf(node.children), node.depth);
        break;
      case 'paragraph':
        pushBlock('body', textOf(node.children));
        break;
      case 'code':
        pushBlock('code', node.value ?? '', 0);
        break;
      case 'blockquote':
        pushBlock('quote', textOf(node.children));
        break;
      case 'list':
        walkList(node.children, 1);
        break;
      case 'table': {
        const rows = node.children.filter(isTableRow);
        const rendered = rows.map((row) =>
          row.children.map((cell) => textOf(cell.children)).join(' | ')).join('; ');
        pushBlock('table', rendered);
        break;
      }
      case 'footnoteDefinition': {
        const label = (node as { identifier?: string }).identifier ?? '';
        pushBlock('footnote', `[${label}] ${textOf(node.children)}`);
        break;
      }
      case 'html': {
        // Raw HTML inside Markdown is kept as body text after tag stripping so
        // quoted source snippets still contribute to the reading stream.
        const stripped = (node.value ?? '').replace(/<[^>]*>/g, ' ');
        pushBlock('body', stripped);
        break;
      }
      case 'thematicBreak':
        break;
      default:
        if ('children' in node && Array.isArray((node as { children?: unknown[] }).children)) {
          const text = textOf((node as { children: RootContent[] }).children);
          pushBlock('body', text);
        }
    }
  }

  if (paragraphs.length === 0) {
    diagnostics.push({
      level: 'error',
      code: 'empty-markdown',
      message: 'The Markdown source produced no readable blocks.',
    });
  }

  const mappedChapters = chapters.map((chapter) => ({ ...chapter }));
  return { paragraphs, chapters: mappedChapters, frontmatter, diagnostics };
};

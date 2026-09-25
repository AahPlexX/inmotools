// Shared heading-text extraction and GitHub-style slugging, used by both
// outline-engine.ts (the Outline panel's in-app navigation ids) and
// heading-id-plugin.ts (the rendered document's real `id` attributes, which
// an inserted Table of Contents links against). Kept in one place so the two
// can never drift into assigning a heading two different ids.

// rehype-sanitize's defaultSchema (render-engine.ts's sanitizeSchema is
// spread from it) clobber-prefixes `id`/`name` attributes with this exact
// string as DOM-clobbering protection - the same thing GitHub's own
// rendering does. A generated Table of Contents link must target
// `#user-content-<slug>`, not the bare slug, or the link goes nowhere.
export const HEADING_ID_PREFIX = 'user-content-';

// Concatenates the visible text of a heading's inline children. Inline code,
// emphasis, and links contribute their text; images contribute their alt
// text, which is the only text a reader would see in an outline.
export const headingText = (node: unknown): string => {
  if (typeof node !== 'object' || node === null) return '';
  const candidate = node as { type?: string; value?: unknown; alt?: unknown; children?: unknown[] };
  if (candidate.type === 'text' || candidate.type === 'inlineCode') {
    return typeof candidate.value === 'string' ? candidate.value : '';
  }
  if (candidate.type === 'image') {
    return typeof candidate.alt === 'string' ? candidate.alt : '';
  }
  if (Array.isArray(candidate.children)) {
    return candidate.children.map((child) => headingText(child)).join('');
  }
  return '';
};

// GitHub-style slug: lowercased, non-word characters dropped, spaces to
// hyphens. Duplicate slugs get a numeric suffix so every heading has a
// unique id, matching the disambiguation behaviour readers expect from
// rendered markdown anchors.
export const toSlug = (text: string): string =>
  text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .trim()
    .replace(/\s+/g, '-');

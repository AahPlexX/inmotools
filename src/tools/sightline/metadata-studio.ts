/**
 * Metadata studio.
 *
 * The metadata written into an export is edited at export time, not at ingest
 * time: the document supplies defaults, and the studio lets the reader change
 * title, author, description, tags, language, publisher, identifier, and dates
 * before a file is produced. The same field set is written into the formats that
 * have somewhere to put it — the EPUB package document, the PDF information
 * dictionary, and the HTML head — so a tagged document stays tagged.
 *
 * Reading level is offered as a field of its own. It is computed from the prose
 * rather than typed, and it is never presented as a guarantee: it is an estimate
 * from syllable and sentence counts.
 */

import { computeReadability, describeGradeLevel, describeReadingEase } from './syllable-engine';
import type { DocumentMetadata, DocumentModel, ProseMetrics } from './sightline-types';

export interface MetadataDraft {
  readonly title: string;
  readonly author: string;
  readonly description: string;
  readonly tags: readonly string[];
  readonly language: string;
  readonly publisher: string;
  readonly identifier: string;
  readonly created: string;
  readonly modified: string;
  readonly rights: string;
  readonly subject: string;
  /** Reading level text, computed from the prose and editable. */
  readonly readingLevel: string;
  /** Canonical URL, used for the social tags. */
  readonly url: string;
  /** Cover image as a data URL, when one was supplied. */
  readonly coverDataUrl: string;
}

export const emptyDraft = (): MetadataDraft => ({
  title: '', author: '', description: '', tags: [], language: '', publisher: '', identifier: '',
  created: '', modified: '', rights: '', subject: '', readingLevel: '', url: '', coverDataUrl: '',
});

/** Split a comma or semicolon separated tag field into clean tags. */
export const parseTags = (value: string): string[] => value
  .split(/[,;\n]/)
  .map((tag) => tag.trim())
  .filter((tag) => tag.length > 0 && tag.length <= 64)
  .filter((tag, index, list) => list.findIndex((entry) => entry.toLowerCase() === tag.toLowerCase()) === index);

export const formatTags = (tags: readonly string[]): string => tags.join(', ');

export const slugify = (value: string): string => value
  .toLowerCase()
  .normalize('NFKD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '');

export const readingLevelOf = (metrics: ProseMetrics): string => metrics.words === 0
  ? ''
  : `${describeGradeLevel(metrics.fleschKincaidGrade)} · ${describeReadingEase(metrics.fleschReadingEase)}`;

/** Build the draft an export starts from: document metadata plus computed level. */
export const draftFromModel = (model: DocumentModel, now = new Date()): MetadataDraft => ({
  ...emptyDraft(),
  title: model.metadata.title || model.fileName.replace(/\.[^.]+$/, ''),
  author: model.metadata.author,
  description: model.metadata.description,
  tags: [...model.metadata.keywords],
  language: model.metadata.language || 'en',
  publisher: model.metadata.publisher,
  identifier: model.metadata.identifier,
  created: model.metadata.created,
  modified: model.metadata.modified || now.toISOString(),
  rights: model.metadata.rights,
  subject: model.metadata.subject,
  readingLevel: readingLevelOf(model.metrics),
  url: '',
});

/**
 * Tag suggestions from the document itself: the words that occur more often
 * than chance and are long enough to be topical. Function words are excluded by
 * length and by frequency: a word that appears in almost every paragraph is
 * structural, not topical.
 */
export const suggestTags = (model: DocumentModel, limit = 8): string[] => {
  const counts = new Map<string, number>();
  for (const token of model.tokens) {
    const word = token.text.replace(/[^A-Za-z\u00c0-\u024f'-]/g, '').toLowerCase();
    if (word.length < 4 || token.symbolic) continue;
    counts.set(word, (counts.get(word) ?? 0) + 1);
  }
  const paragraphCount = Math.max(1, model.paragraphs.length);
  const ranked = [...counts.entries()]
    .filter(([, count]) => count >= 2 && count <= paragraphCount * 0.8)
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .map(([word]) => word);

  if (ranked.length < limit) {
    // A short document may not repeat its subject words. Long, distinctive words
    // that appear once are still the best tags available.
    const single = [...counts.entries()]
      .filter(([word, count]) => count === 1 && word.length >= 7 && !ranked.includes(word))
      .sort((left, right) => right[0].length - left[0].length || left[0].localeCompare(right[0]))
      .map(([word]) => word);
    ranked.push(...single);
  }
  return ranked.slice(0, limit);
};

/** Merge a draft into the readonly document metadata used by the enclosures. */
export const draftToMetadata = (draft: MetadataDraft): DocumentMetadata => ({
  title: draft.title.trim(),
  author: draft.author.trim(),
  language: draft.language.trim(),
  publisher: draft.publisher.trim(),
  description: draft.description.trim(),
  subject: draft.subject.trim() || draft.readingLevel.trim(),
  keywords: [...draft.tags],
  identifier: draft.identifier.trim(),
  created: draft.created.trim(),
  modified: draft.modified.trim(),
  rights: draft.rights.trim(),
  extra: {
    ...(draft.readingLevel ? { readingLevel: draft.readingLevel } : {}),
    ...(draft.url ? { url: draft.url } : {}),
  },
});

export interface SocialTag {
  readonly property: string;
  readonly content: string;
}

/**
 * Open Graph and Twitter card tags for the exported HTML. The description falls
 * back to the first paragraph, because a social card with no description shows
 * the platform's own guess instead.
 */
export const socialTags = (draft: MetadataDraft, fallbackDescription = ''): SocialTag[] => {
  const description = draft.description.trim() || fallbackDescription.trim();
  const tags: SocialTag[] = [
    { property: 'og:type', content: 'article' },
    { property: 'og:title', content: draft.title },
  ];
  if (description) tags.push({ property: 'og:description', content: description });
  if (draft.url) tags.push({ property: 'og:url', content: draft.url });
  if (draft.coverDataUrl) tags.push({ property: 'og:image', content: draft.coverDataUrl });
  if (draft.author) tags.push({ property: 'article:author', content: draft.author });
  if (draft.modified) tags.push({ property: 'article:modified_time', content: draft.modified });
  if (draft.tags.length > 0) tags.push({ property: 'article:tag', content: draft.tags.join(', ') });
  tags.push({ property: 'twitter:card', content: draft.coverDataUrl ? 'summary_large_image' : 'summary' });
  tags.push({ property: 'twitter:title', content: draft.title });
  if (description) tags.push({ property: 'twitter:description', content: description });
  return tags.filter((tag) => tag.content.length > 0);
};

/** `<meta>` elements for the head of an exported HTML document. */
export const socialTagHtml = (draft: MetadataDraft, fallbackDescription = ''): string => {
  const escape = (value: string): string => value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[character] ?? character));
  const lines = socialTags(draft, fallbackDescription).map((tag) =>
    `<meta ${tag.property.startsWith('twitter:') ? 'name' : 'property'}="${tag.property}" content="${escape(tag.content)}" />`);
  if (draft.tags.length > 0) lines.push(`<meta name="keywords" content="${escape(draft.tags.join(', '))}" />`);
  if (draft.author) lines.push(`<meta name="author" content="${escape(draft.author)}" />`);
  if (draft.readingLevel) lines.push(`<meta name="reading-level" content="${escape(draft.readingLevel)}" />`);
  if (draft.language) lines.push(`<meta name="language" content="${escape(draft.language)}" />`);
  return lines.join('\n    ');
};

export interface StructuredData {
  readonly '@context': string;
  readonly '@type': string;
  readonly name: string;
  readonly author?: { '@type': string; name: string };
  readonly description?: string;
  readonly keywords?: string;
  readonly inLanguage?: string;
  readonly dateModified?: string;
  readonly publisher?: { '@type': string; name: string };
}

/** JSON-LD for the exported HTML, using the schema.org Book type. */
export const structuredData = (draft: MetadataDraft): StructuredData => ({
  '@context': 'https://schema.org',
  '@type': 'Book',
  name: draft.title,
  ...(draft.author ? { author: { '@type': 'Person', name: draft.author } } : {}),
  ...(draft.description ? { description: draft.description } : {}),
  ...(draft.tags.length > 0 ? { keywords: draft.tags.join(', ') } : {}),
  ...(draft.language ? { inLanguage: draft.language } : {}),
  ...(draft.modified ? { dateModified: draft.modified } : {}),
  ...(draft.publisher ? { publisher: { '@type': 'Organization', name: draft.publisher } } : {}),
});

export const structuredDataScript = (draft: MetadataDraft): string =>
  `<script type="application/ld+json">${JSON.stringify(structuredData(draft))}</script>`;

/** Dublin Core elements for the EPUB package document. */
export const dublinCore = (draft: MetadataDraft): readonly { readonly tag: string; readonly value: string; readonly attributes?: Record<string, string> }[] => [
  { tag: 'dc:title', value: draft.title },
  { tag: 'dc:creator', value: draft.author },
  { tag: 'dc:language', value: draft.language || 'en' },
  { tag: 'dc:identifier', value: draft.identifier || `urn:uuid:${slugify(draft.title) || 'document'}`, attributes: { id: 'book-id' } },
  { tag: 'dc:publisher', value: draft.publisher },
  { tag: 'dc:description', value: draft.description },
  { tag: 'dc:subject', value: draft.subject || draft.readingLevel },
  { tag: 'dc:rights', value: draft.rights },
  { tag: 'dc:date', value: draft.modified.slice(0, 10) },
].filter((entry) => entry.value.trim().length > 0);

/** File name for an export, derived from the title and the suffix. */
export const exportFileName = (draft: MetadataDraft, suffix: string, extension: string): string => {
  const base = slugify(draft.title) || 'sightline';
  return `${base}-${suffix}.${extension}`;
};

/**
 * Validate a draft before it is written into a file. Problems are reported so
 * the panel can mark the field, rather than silently exporting an empty title.
 */
export const validateDraft = (draft: MetadataDraft): { readonly field: keyof MetadataDraft; readonly message: string }[] => {
  const problems: { field: keyof MetadataDraft; message: string }[] = [];
  if (draft.title.trim().length === 0) problems.push({ field: 'title', message: 'A title is required; the export uses it for the file name and the document metadata.' });
  if (draft.title.length > 200) problems.push({ field: 'title', message: 'Titles longer than 200 characters are truncated by most readers.' });
  if (draft.description.length > 5000) problems.push({ field: 'description', message: 'Descriptions longer than 5,000 characters are truncated by some catalogues.' });
  if (draft.tags.length > 40) problems.push({ field: 'tags', message: 'More than 40 tags is unusual for a document; catalogues often ignore the extra ones.' });
  if (draft.url && !/^https?:\/\//i.test(draft.url)) problems.push({ field: 'url', message: 'The canonical URL should start with http:// or https://.' });
  if (draft.coverDataUrl && !/^data:image\/(png|jpeg|jpg|webp|avif);base64,/.test(draft.coverDataUrl)) {
    problems.push({ field: 'coverDataUrl', message: 'A cover must be a PNG, JPEG, WebP, or AVIF data URL.' });
  }
  return problems;
};

/**
 * A second opinion on reading level: the metrics are recomputed from the model
 * so the exported value cannot drift from the prose that is being exported.
 */
export const reconcileReadingLevel = (draft: MetadataDraft, model: DocumentModel): MetadataDraft => {
  const metrics = computeReadability(
    {
      text: model.text,
      words: model.metrics.words,
      sentences: model.metrics.sentences,
      syllables: model.metrics.syllables,
      complexWords: model.metrics.complexWords,
      characters: model.metrics.characters,
      charactersNoSpaces: model.metrics.charactersNoSpaces,
      paragraphs: model.metrics.paragraphs,
    },
    model.metrics.longestSentenceWords,
  );
  return { ...draft, readingLevel: draft.readingLevel.trim() || readingLevelOf(metrics) };
};

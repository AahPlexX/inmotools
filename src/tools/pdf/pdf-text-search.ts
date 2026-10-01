export interface PdfTextMatch {
  index: number;
  excerpt: string;
}

export interface PdfTextSearchOptions {
  caseSensitive?: boolean;
  maxResults?: number;
  excerptRadius?: number;
}

const DEFAULT_MAX_RESULTS = 200;
const DEFAULT_EXCERPT_RADIUS = 48;

export function findPdfTextMatches(
  text: string,
  query: string,
  options: PdfTextSearchOptions = {},
): PdfTextMatch[] {
  const needle = query.trim();
  if (!needle) return [];

  const maxResults = Number.isFinite(options.maxResults)
    ? Math.min(Math.max(Math.trunc(options.maxResults ?? DEFAULT_MAX_RESULTS), 1), 1_000)
    : DEFAULT_MAX_RESULTS;
  const excerptRadius = Number.isFinite(options.excerptRadius)
    ? Math.min(Math.max(Math.trunc(options.excerptRadius ?? DEFAULT_EXCERPT_RADIUS), 8), 200)
    : DEFAULT_EXCERPT_RADIUS;
  const haystack = options.caseSensitive ? text : text.toLocaleLowerCase();
  const comparableNeedle = options.caseSensitive ? needle : needle.toLocaleLowerCase();
  const matches: PdfTextMatch[] = [];
  let fromIndex = 0;

  while (matches.length < maxResults) {
    const index = haystack.indexOf(comparableNeedle, fromIndex);
    if (index < 0) break;
    const start = Math.max(0, index - excerptRadius);
    const end = Math.min(text.length, index + needle.length + excerptRadius);
    matches.push({
      index,
      excerpt: text.slice(start, end).replace(/\s+/g, ' ').trim(),
    });
    fromIndex = index + Math.max(comparableNeedle.length, 1);
  }

  return matches;
}

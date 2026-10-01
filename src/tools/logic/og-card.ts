import { escapeXml, renderSchematicSvg } from './export-engine';
import { parseSvg } from './svg-subset';
import type { LogicDocument, ProjectMetadata } from './logic-types';
import type { HdlExport } from './hdl-verilog';

/**
 * The social-sharing card for a circuit: a 1200 x 630 picture (the size Facebook,
 * X, LinkedIn, Slack and Discord all accept) with the project's title,
 * description, author, version, license and tags beside a thumbnail of the
 * schematic, plus the `<meta>` tags that make a page show that card when its
 * link is shared. The Open Graph protocol (ogp.me) requires `og:title`,
 * `og:type`, `og:image` and `og:url`, and defines `og:image:width`,
 * `og:image:height`, `og:image:alt` and `og:site_name`; X reads the same tags
 * once `twitter:card` is `summary_large_image`.
 *
 * Everything here is text in, text out; turning the SVG into a PNG needs a
 * browser and lives in `svg-raster.ts`.
 */

export const OG_WIDTH = 1200;
export const OG_HEIGHT = 630;

const TITLE_LIMIT = 90;
const DESCRIPTION_LIMIT = 200;
const SITE_NAME = 'InMo Tools';
const DEFAULT_IMAGE = 'og-card.png';

/** What the card and its tags say. Each of the first two may be replaced at export time without touching the project. */
export interface OgFields {
  readonly title: string;
  readonly description: string;
  readonly author: string;
  readonly version: string;
  readonly license: string;
  readonly tags: readonly string[];
  readonly siteName: string;
  /** The page the card links to (`og:url`); empty when not given. */
  readonly url: string;
  /** Where the card image will be served from (`og:image`). */
  readonly imageUrl: string;
}

/** The values a person typed at export time; an empty one leaves the project's own value in place. */
export interface OgOverrides {
  readonly title?: string;
  readonly description?: string;
  readonly siteName?: string;
  readonly url?: string;
  readonly imageUrl?: string;
}

/** Shortens to `limit` characters at a word boundary when one is close, ending in an ellipsis. */
export const clip = (text: string, limit: number): string => {
  const flat = text.replace(/\s+/g, ' ').trim();
  if (flat.length <= limit) return flat;
  const cut = flat.slice(0, limit - 1);
  // When the cut lands exactly at the end of a word (the next character is a space) the whole cut is kept.
  const space = flat.charAt(limit - 1) === ' ' ? limit - 1 : cut.lastIndexOf(' ');
  return `${(space > limit * 0.6 ? cut.slice(0, space) : cut).replace(/[\s.,;:!-]+$/, '')}…`;
};

/**
 * An `http` or `https` address, or a plain relative path (`og-card.png`, `/img/card.png`). Anything else (`javascript:`,
 * `data:`, a protocol-relative `//host`, a path with spaces or control characters) is refused so it can never reach a
 * page's `<meta>` tags.
 */
export const sanitizeUrl = (value: string): string | undefined => {
  const text = value.trim();
  if (text === '' || text.length > 2048 || /[\s\u0000-\u001f<>"']/.test(text)) return undefined;
  if (/^[a-z][a-z0-9+.-]*:/i.test(text)) {
    try {
      const parsed = new URL(text);
      return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? text : undefined;
    } catch {
      return undefined;
    }
  }
  return text.startsWith('//') ? undefined : text;
};

export interface OgFieldsResult {
  readonly fields: OgFields;
  /** Typed values that were refused, said in words. */
  readonly problems: readonly string[];
}

export const ogFieldsFromMetadata = (metadata: ProjectMetadata, overrides: OgOverrides = {}): OgFieldsResult => {
  const problems: string[] = [];
  const address = (label: string, typed: string | undefined): string => {
    if (!typed || typed.trim() === '') return '';
    const clean = sanitizeUrl(typed);
    if (clean === undefined) problems.push(`${label} must be an http or https address, or a relative path; it was left out.`);
    return clean ?? '';
  };
  const pick = (typed: string | undefined, own: string, limit: number): string => clip(typed && typed.trim() !== '' ? typed : own, limit);
  return {
    fields: {
      title: pick(overrides.title, metadata.title, TITLE_LIMIT) || 'Untitled circuit',
      description: pick(overrides.description, metadata.description, DESCRIPTION_LIMIT),
      author: clip(metadata.author, 60),
      version: clip(metadata.version, 20),
      license: metadata.license,
      tags: metadata.tags.slice(0, 8).map((tag) => clip(tag, 24)),
      siteName: pick(overrides.siteName, SITE_NAME, 60),
      url: address('The page address', overrides.url),
      imageUrl: address('The image address', overrides.imageUrl),
    },
    problems,
  };
};

// --- SECTION: the picture ---

/** Monospace glyphs are about 0.6 of the font size wide; the card is set in monospace so a line's length can be planned. */
const GLYPH = 0.6;

/** Breaks text into lines of at most `maxChars`, at most `maxLines` of them; the last line ends in an ellipsis when text was cut. */
export const wrapText = (text: string, maxChars: number, maxLines: number): string[] => {
  const words = text.replace(/\s+/g, ' ').trim().split(' ').filter((word) => word !== '');
  const lines: string[] = [];
  let line = '';
  let truncated = false;
  for (let word of words) {
    while (word.length > maxChars) {
      // A single word longer than a line is split, so nothing runs off the card.
      if (line !== '') {
        lines.push(line);
        line = '';
      }
      lines.push(word.slice(0, maxChars));
      word = word.slice(maxChars);
    }
    if (line === '') line = word;
    else if (line.length + 1 + word.length <= maxChars) line += ` ${word}`;
    else {
      lines.push(line);
      line = word;
    }
  }
  if (line !== '') lines.push(line);
  if (lines.length > maxLines) {
    truncated = true;
    lines.length = maxLines;
  }
  if (truncated) {
    const last = lines[maxLines - 1]!;
    lines[maxLines - 1] = `${last.length >= maxChars ? last.slice(0, maxChars - 1) : last}…`.replace(/[\s.,;:!-]+…$/, '…');
  }
  return lines;
};

const COLUMN_LEFT = 64;
const COLUMN_WIDTH = 580;
const PANEL = { x: 690, y: 96, width: 446, height: 438 };

const titleSize = (title: string): number => (title.length <= 16 ? 64 : title.length <= 34 ? 46 : 34);

export const ogAltText = (fields: OgFields): string => `${fields.title}: a digital logic schematic${fields.author ? ` by ${fields.author}` : ''}`;

/** The card as an SVG document, 1200 x 630, with the schematic drawn small inside a white panel. */
export const renderOgCardSvg = (document: LogicDocument, fields: OgFields): string => {
  const parts: string[] = [];
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${OG_WIDTH}" height="${OG_HEIGHT}" viewBox="0 0 ${OG_WIDTH} ${OG_HEIGHT}" font-family="ui-monospace, Menlo, Consolas, monospace" role="img" aria-label="${escapeXml(ogAltText(fields))}">`);
  parts.push(`<rect width="${OG_WIDTH}" height="${OG_HEIGHT}" fill="#0f172a" />`);
  parts.push(`<rect x="0" y="0" width="12" height="${OG_HEIGHT}" fill="#38bdf8" />`);
  parts.push(`<text x="${COLUMN_LEFT}" y="72" font-size="22" fill="#94a3b8">${escapeXml(clip(`DIGITAL LOGIC WORKSTATION · ${fields.siteName}`, 48).toUpperCase())}</text>`);

  // The title, sized down as it lengthens so a long one wraps to three lines instead of overflowing.
  const size = titleSize(fields.title);
  const titleLines = wrapText(fields.title, Math.floor(COLUMN_WIDTH / (size * GLYPH)), 3);
  let y = 150 + size * 0.2;
  for (const line of titleLines) {
    parts.push(`<text x="${COLUMN_LEFT}" y="${y}" font-size="${size}" font-weight="700" fill="#f8fafc">${escapeXml(line)}</text>`);
    y += size * 1.2;
  }

  const descriptionSize = 26;
  const descriptionLines = wrapText(fields.description, Math.floor(COLUMN_WIDTH / (descriptionSize * GLYPH)), Math.max(1, Math.min(5, Math.floor((470 - y) / 36))));
  y += 14;
  for (const line of fields.description === '' ? [] : descriptionLines) {
    parts.push(`<text x="${COLUMN_LEFT}" y="${y}" font-size="${descriptionSize}" fill="#cbd5e1">${escapeXml(line)}</text>`);
    y += 36;
  }

  const byline = [fields.author ? `by ${fields.author}` : '', fields.version ? `v${fields.version}` : '', fields.license].filter((piece) => piece !== '').join('  ·  ');
  parts.push(`<text x="${COLUMN_LEFT}" y="530" font-size="24" fill="#e2e8f0">${escapeXml(clip(byline, Math.floor(COLUMN_WIDTH / (24 * GLYPH))))}</text>`);

  // Tag chips along the bottom, as many as fit on one row.
  let chipX = COLUMN_LEFT;
  for (const tag of fields.tags) {
    const width = tag.length * 18 * GLYPH + 28;
    if (chipX + width > COLUMN_LEFT + COLUMN_WIDTH) break;
    parts.push(`<rect x="${chipX}" y="558" width="${width}" height="36" rx="18" fill="#1e293b" stroke="#475569" />`);
    parts.push(`<text x="${chipX + width / 2}" y="582" font-size="18" text-anchor="middle" fill="#7dd3fc">${escapeXml(tag)}</text>`);
    chipX += width + 10;
  }

  // The schematic, drawn without its own title block (the card already carries that text).
  parts.push(`<rect x="${PANEL.x}" y="${PANEL.y}" width="${PANEL.width}" height="${PANEL.height}" rx="16" fill="#ffffff" />`);
  if (document.components.length === 0) {
    parts.push(`<text x="${PANEL.x + PANEL.width / 2}" y="${PANEL.y + PANEL.height / 2}" font-size="22" text-anchor="middle" fill="#64748b">Empty circuit</text>`);
  } else {
    const schematic = renderSchematicSvg(document, { titleBlock: false });
    const root = parseSvg(schematic);
    const width = Number(root.attrs.width);
    const height = Number(root.attrs.height);
    if (width > 0 && height > 0) {
      const inner = schematic.replace(/^<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
      const inset = 20;
      const scale = Math.min((PANEL.width - inset * 2) / width, (PANEL.height - inset * 2) / height, 1.5);
      const x = PANEL.x + (PANEL.width - width * scale) / 2;
      const yTop = PANEL.y + (PANEL.height - height * scale) / 2;
      parts.push(`<g transform="translate(${Number(x.toFixed(2))},${Number(yTop.toFixed(2))}) scale(${Number(scale.toFixed(4))})" font-family="ui-monospace, Menlo, Consolas, monospace">${inner}</g>`);
    }
  }
  parts.push('</svg>');
  return parts.join('\n');
};

// --- SECTION: the meta tags ---

const attribute = (value: string): string => escapeXml(value.replace(/[\r\n\t]+/g, ' ')).replace(/'/g, '&#39;');

/**
 * The `<meta>` tags for a page that shares this card. Warnings name what a link preview still needs: `og:url` is
 * required by the protocol but is the page's own address, which only its publisher knows, and social sites need an
 * absolute address for the image.
 */
export const ogMetaTags = (fields: OgFields): HdlExport => {
  const warnings: string[] = [];
  const image = fields.imageUrl === '' ? DEFAULT_IMAGE : fields.imageUrl;
  if (fields.url === '') warnings.push('og:url is left out: the Open Graph protocol requires it, so enter the address of the page that will carry these tags.');
  if (!/^https?:\/\//i.test(image)) warnings.push(`og:image is "${image}", a relative path: social sites need the full https address of the uploaded image, so enter it before publishing.`);
  const alt = ogAltText(fields);
  const property = (name: string, value: string): string => `<meta property="${name}" content="${attribute(value)}" />`;
  const named = (name: string, value: string): string => `<meta name="${name}" content="${attribute(value)}" />`;
  const lines = [
    property('og:title', fields.title),
    property('og:type', 'website'),
    ...(fields.url === '' ? [] : [property('og:url', fields.url)]),
    property('og:image', image),
    property('og:image:width', String(OG_WIDTH)),
    property('og:image:height', String(OG_HEIGHT)),
    property('og:image:alt', alt),
    ...(fields.description === '' ? [] : [property('og:description', fields.description)]),
    property('og:site_name', fields.siteName),
    named('twitter:card', 'summary_large_image'),
    named('twitter:title', fields.title),
    ...(fields.description === '' ? [] : [named('twitter:description', fields.description)]),
    named('twitter:image', image),
    named('twitter:image:alt', alt),
    ...(fields.author === '' ? [] : [named('author', fields.author)]),
    ...(fields.description === '' ? [] : [named('description', fields.description)]),
  ];
  return { text: `${lines.join('\n')}\n`, warnings };
};

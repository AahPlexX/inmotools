import { PDFDocument } from 'pdf-lib';
import { optimize } from 'svgo/browser';
import type {
  PdfExportOptions,
  RasterExportOptions,
  SvgExportOptions,
  VectorDocument,
  VectorElement,
  VectorFill,
} from './vector-types';

function escapeText(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeAttribute(value: string): string {
  return escapeText(value).replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function number(value: number): string {
  return Number(value.toFixed(3)).toString();
}

function safeId(value: string): string {
  return value.replace(/[^a-zA-Z0-9_.:-]/g, '-');
}

function elementTransform(element: VectorElement): string | null {
  const flipX = Boolean(element.flipX);
  const flipY = Boolean(element.flipY);
  if (!element.rotation && !flipX && !flipY) return null;
  const cx = element.x + element.width / 2;
  const cy = element.y + element.height / 2;
  const operations = [`translate(${number(cx)} ${number(cy)})`];
  if (element.rotation) operations.push(`rotate(${number(element.rotation)})`);
  if (flipX || flipY) operations.push(`scale(${flipX ? -1 : 1} ${flipY ? -1 : 1})`);
  operations.push(`translate(${number(-cx)} ${number(-cy)})`);
  return operations.join(' ');
}

interface PaintSerialization {
  value: string;
  definition?: string;
}

function serializeFill(fill: VectorFill, elementId: string): PaintSerialization {
  if (fill.kind === 'solid') return { value: fill.color };
  const id = `paint-${safeId(elementId)}`;
  if (fill.kind === 'linear-gradient') {
    const radians = fill.angle * Math.PI / 180;
    const x = Math.cos(radians) * 50;
    const y = Math.sin(radians) * 50;
    return {
      value: `url(#${id})`,
      definition: `<linearGradient id="${id}" x1="${number(50 - x)}%" y1="${number(50 - y)}%" x2="${number(50 + x)}%" y2="${number(50 + y)}%"><stop offset="0%" stop-color="${escapeAttribute(fill.start)}"/><stop offset="100%" stop-color="${escapeAttribute(fill.end)}"/></linearGradient>`,
    };
  }
  if (fill.kind === 'radial-gradient') {
    return {
      value: `url(#${id})`,
      definition: `<radialGradient id="${id}" cx="${number(fill.cx ?? 50)}%" cy="${number(fill.cy ?? 50)}%"><stop offset="0%" stop-color="${escapeAttribute(fill.start)}"/><stop offset="100%" stop-color="${escapeAttribute(fill.end)}"/></radialGradient>`,
    };
  }
  const size = Math.max(2, fill.size);
  const patternBody = fill.pattern === 'dots'
    ? `<circle cx="${number(size / 2)}" cy="${number(size / 2)}" r="${number(Math.max(1, size / 6))}" fill="${escapeAttribute(fill.foreground)}"/>`
    : fill.pattern === 'grid'
      ? `<path d="M ${number(size)} 0 L 0 0 0 ${number(size)}" fill="none" stroke="${escapeAttribute(fill.foreground)}" stroke-width="1"/>`
      : `<path d="M 0 ${number(size)} L ${number(size)} 0 M ${number(-size / 2)} ${number(size / 2)} L ${number(size / 2)} ${number(-size / 2)} M ${number(size / 2)} ${number(size * 1.5)} L ${number(size * 1.5)} ${number(size / 2)}" stroke="${escapeAttribute(fill.foreground)}" stroke-width="${number(Math.max(1, size / 5))}"/>`;
  return {
    value: `url(#${id})`,
    definition: `<pattern id="${id}" width="${number(size)}" height="${number(size)}" patternUnits="userSpaceOnUse" patternTransform="rotate(${number(fill.rotation)})"><rect width="100%" height="100%" fill="${escapeAttribute(fill.background)}"/>${patternBody}</pattern>`,
  };
}

function styleAttributes(element: VectorElement, fill: string): string {
  const attrs = [
    `fill="${escapeAttribute(fill)}"`,
    `opacity="${number(Math.max(0, Math.min(1, element.opacity)))}"`,
  ];
  if (element.stroke.width > 0) {
    attrs.push(`stroke="${escapeAttribute(element.stroke.color)}"`);
    attrs.push(`stroke-width="${number(element.stroke.width)}"`);
    attrs.push(`stroke-linecap="${element.stroke.linecap}"`);
    attrs.push(`stroke-linejoin="${element.stroke.linejoin}"`);
    if (element.stroke.dash.trim()) attrs.push(`stroke-dasharray="${escapeAttribute(element.stroke.dash.trim())}"`);
  }
  if (element.blendMode !== 'normal') attrs.push(`style="mix-blend-mode:${element.blendMode}"`);
  const transform = elementTransform(element);
  if (transform) attrs.push(`transform="${escapeAttribute(transform)}"`);
  return attrs.join(' ');
}

function descriptiveMarkup(element: VectorElement): string {
  const title = element.title.trim() ? `<title>${escapeText(element.title.trim())}</title>` : '';
  const description = element.description.trim() ? `<desc>${escapeText(element.description.trim())}</desc>` : '';
  return `${title}${description}`;
}

function serializeElement(element: VectorElement, definitions: string[]): string {
  if (!element.visible) return '';
  const paint = serializeFill(element.fill, element.id);
  if (paint.definition) definitions.push(paint.definition);
  const id = escapeAttribute(safeId(element.id));
  const common = `id="${id}" ${styleAttributes(element, paint.value)}`;
  const description = descriptiveMarkup(element);

  switch (element.type) {
    case 'rect':
      return `<rect ${common} x="${number(element.x)}" y="${number(element.y)}" width="${number(element.width)}" height="${number(element.height)}" rx="${number(Math.max(0, element.cornerRadius))}">${description}</rect>`;
    case 'ellipse':
      return `<ellipse ${common} cx="${number(element.x + element.width / 2)}" cy="${number(element.y + element.height / 2)}" rx="${number(Math.abs(element.width / 2))}" ry="${number(Math.abs(element.height / 2))}">${description}</ellipse>`;
    case 'line':
      return `<line ${common} x1="${number(element.x)}" y1="${number(element.y)}" x2="${number(element.x2)}" y2="${number(element.y2)}">${description}</line>`;
    case 'path':
      return `<path ${common} d="${escapeAttribute(element.d)}">${description}</path>`;
    case 'text': {
      const textAttrs = `font-family="${escapeAttribute(element.fontFamily)}" font-size="${number(element.fontSize)}" font-weight="${number(element.fontWeight)}" letter-spacing="${number(element.letterSpacing)}" text-anchor="${element.textAnchor}"`;
      const text = escapeText(element.text);
      if (element.pathId) return `<text ${common} ${textAttrs}>${description}<textPath href="#${escapeAttribute(safeId(element.pathId))}">${text}</textPath></text>`;
      return `<text ${common} ${textAttrs} x="${number(element.x)}" y="${number(element.y + element.fontSize)}">${description}${text}</text>`;
    }
    case 'image': {
      const transform = elementTransform(element);
      return `<image id="${id}" x="${number(element.x)}" y="${number(element.y)}" width="${number(element.width)}" height="${number(element.height)}" opacity="${number(element.opacity)}"${transform ? ` transform="${escapeAttribute(transform)}"` : ''} href="${escapeAttribute(element.href)}" preserveAspectRatio="${escapeAttribute(element.preserveAspectRatio)}">${description}</image>`;
    }
    case 'group': {
      const children = element.children.map((child) => serializeElement(child, definitions)).join('');
      const transform = elementTransform(element);
      return `<g id="${id}" opacity="${number(element.opacity)}"${transform ? ` transform="${escapeAttribute(transform)}"` : ''}${element.blendMode !== 'normal' ? ` style="mix-blend-mode:${element.blendMode}"` : ''}>${description}${children}</g>`;
    }
    case 'symbol-instance':
      return `<use ${common} href="#${escapeAttribute(safeId(element.symbolId))}" x="${number(element.x)}" y="${number(element.y)}" width="${number(element.width)}" height="${number(element.height)}">${description}</use>`;
    default:
      return '';
  }
}

function metadataMarkup(document: VectorDocument): string {
  const metadata = document.metadata;
  const title = metadata.title.trim() ? `<title>${escapeText(metadata.title.trim())}</title>` : '';
  const description = metadata.description.trim() ? `<desc>${escapeText(metadata.description.trim())}</desc>` : '';
  const payload = [
    metadata.creator && `<inmo:creator>${escapeText(metadata.creator)}</inmo:creator>`,
    metadata.rights && `<inmo:rights>${escapeText(metadata.rights)}</inmo:rights>`,
    metadata.license && `<inmo:license>${escapeText(metadata.license)}</inmo:license>`,
    metadata.language && `<inmo:language>${escapeText(metadata.language)}</inmo:language>`,
    ...metadata.tags.map((tag) => `<inmo:tag>${escapeText(tag)}</inmo:tag>`),
    metadata.custom && `<inmo:custom>${escapeText(metadata.custom)}</inmo:custom>`,
  ].filter(Boolean).join('');
  return `${title}${description}<metadata><inmo:metadata xmlns:inmo="https://inmotools.local/ns/vector/1">${payload}</inmo:metadata></metadata>`;
}

export function serializeVectorSvg(document: VectorDocument, options: SvgExportOptions = {}): string {
  const responsive = options.responsive ?? false;
  const definitions: string[] = [];
  const symbols = document.symbols.map((symbol) => {
    const content = symbol.elements.map((element) => serializeElement(element, definitions)).join('');
    return `<symbol id="${escapeAttribute(safeId(symbol.id))}" viewBox="${escapeAttribute(symbol.viewBox)}">${content}</symbol>`;
  });
  const content = document.elements.map((element) => serializeElement(element, definitions)).join('');
  const background = options.includeBackground ?? document.artboard.exportBackground
    ? `<rect width="100%" height="100%" fill="${escapeAttribute(document.artboard.background)}" data-artboard-background="true"/>`
    : '';
  const defs = definitions.length || symbols.length ? `<defs>${[...definitions, ...symbols].join('')}</defs>` : '';
  const dimensions = responsive ? '' : ` width="${number(document.artboard.width)}" height="${number(document.artboard.height)}"`;
  const language = document.metadata.language.trim() ? ` xml:lang="${escapeAttribute(document.metadata.language.trim())}"` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${number(document.artboard.width)} ${number(document.artboard.height)}"${dimensions}${language}>${metadataMarkup(document)}${defs}${background}${content}</svg>`;
}

export function optimizeVectorSvg(svg: string): string {
  return optimize(svg, {
    multipass: true,
    plugins: [
      {
        name: 'preset-default',
        params: {
          overrides: {
            removeDesc: false,
            removeMetadata: false,
          },
        },
      },
    ],
  }).data;
}

export function serializeVectorProject(document: VectorDocument): string {
  return JSON.stringify(document, null, 2);
}

export function parseVectorProject(source: string): VectorDocument {
  const value: unknown = JSON.parse(source);
  if (!value || typeof value !== 'object') throw new Error('Not a Vector Studio project.');
  const candidate = value as Partial<VectorDocument>;
  if (candidate.format !== 'inmotools-vector' || candidate.version !== 1 || !candidate.artboard || !Array.isArray(candidate.elements) || !candidate.metadata) {
    throw new Error('Not a Vector Studio project or the project version is unsupported.');
  }
  const width = Number(candidate.artboard.width);
  const height = Number(candidate.artboard.height);
  if (!Number.isFinite(width) || width <= 0 || !Number.isFinite(height) || height <= 0) throw new Error('Vector Studio project has invalid artboard dimensions.');
  return candidate as VectorDocument;
}

export function buildSvgDataUri(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export function buildInlineEmbed(svg: string, label = 'Vector artwork'): string {
  return `<span class="vector-art" role="img" aria-label="${escapeAttribute(label)}">${svg}</span>`;
}

export function buildImageEmbed(svg: string, alt = ''): string {
  return `<img src="${buildSvgDataUri(svg)}" alt="${escapeAttribute(alt)}"/>`;
}

async function loadSvgImage(svg: string): Promise<HTMLImageElement> {
  const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  try {
    const image = new Image();
    image.decoding = 'async';
    image.src = url;
    await image.decode();
    return image;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function renderVectorRaster(document: VectorDocument, options: RasterExportOptions): Promise<Blob> {
  const scale = Math.max(0.25, Math.min(8, options.scale));
  const svg = serializeVectorSvg(document, { includeBackground: options.format === 'jpeg' ? true : undefined });
  const image = await loadSvgImage(svg);
  const canvas = globalThis.document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(document.artboard.width * scale));
  canvas.height = Math.max(1, Math.round(document.artboard.height * scale));
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas rendering is unavailable in this browser.');
  if (options.background || options.format === 'jpeg') {
    context.fillStyle = options.background || document.artboard.background || '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
  }
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  const mime = options.format === 'jpeg' ? 'image/jpeg' : options.format === 'webp' ? 'image/webp' : 'image/png';
  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error(`${options.format.toUpperCase()} export is unavailable in this browser.`)), mime, options.quality ?? 0.92);
  });
}

export async function renderVectorPdf(document: VectorDocument, options: PdfExportOptions): Promise<Blob> {
  const raster = await renderVectorRaster(document, { format: 'png', scale: Math.max(1, options.scale), background: options.background });
  const pdf = await PDFDocument.create();
  const png = await pdf.embedPng(await raster.arrayBuffer());
  const page = pdf.addPage([document.artboard.width, document.artboard.height]);
  page.drawImage(png, { x: 0, y: 0, width: document.artboard.width, height: document.artboard.height });
  if (document.metadata.title) pdf.setTitle(document.metadata.title);
  if (document.metadata.creator) pdf.setAuthor(document.metadata.creator);
  if (document.metadata.description) pdf.setSubject(document.metadata.description);
  if (document.metadata.tags.length) pdf.setKeywords(document.metadata.tags);
  const bytes = await pdf.save();
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return new Blob([copy.buffer], { type: 'application/pdf' });
}

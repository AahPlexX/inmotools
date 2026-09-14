import { degrees, PDFDocument, rgb, StandardFonts, type PDFFont, type PDFPage } from 'pdf-lib';

export type PdfOverlayAlignment = 'left' | 'center' | 'right';
export type PdfBatesPlacement = 'header-left' | 'header-center' | 'header-right' | 'footer-left' | 'footer-center' | 'footer-right';
export type PdfImageWatermarkPlacement = 'top-left' | 'top-center' | 'top-right' | 'center-left' | 'center' | 'center-right' | 'bottom-left' | 'bottom-center' | 'bottom-right';

export interface PdfOverlayContext {
  filename: string;
  date: string;
}

export interface PdfBandOverlayDefinition {
  template: string;
  align: PdfOverlayAlignment;
  fontSize: number;
  margin?: number;
  opacity?: number;
}

export interface PdfBatesCore {
  start: number;
  padding: number;
  prefix: string;
  suffix: string;
}

export interface PdfBatesDefinition extends PdfBatesCore {
  placement: PdfBatesPlacement;
  fontSize: number;
  margin?: number;
  opacity?: number;
}

export interface PdfTextWatermarkDefinition {
  template: string;
  fontSize: number;
  opacity: number;
  rotation: number;
}

export interface PdfImageWatermarkDefinition {
  bytes: Uint8Array;
  mimeType: 'image/png' | 'image/jpeg';
  opacity: number;
  rotation: number;
  widthPercent: number;
  placement: PdfImageWatermarkPlacement;
  margin?: number;
}

export interface PdfOverlayOptions {
  context: PdfOverlayContext;
  header?: PdfBandOverlayDefinition;
  footer?: PdfBandOverlayDefinition;
  bates?: PdfBatesDefinition;
  textWatermark?: PdfTextWatermarkDefinition;
  imageWatermark?: PdfImageWatermarkDefinition;
}

export type PdfOverlayAuditRole = 'header' | 'footer' | 'bates' | 'text-watermark' | 'image-watermark';

export interface PdfOverlayAuditEntry {
  page: number;
  role: PdfOverlayAuditRole;
  text?: string;
}

export interface PdfOverlayTokenContext {
  page: number;
  pages: number;
  filename: string;
  date: string;
  bates: string;
}

const DEFAULT_MARGIN = 24;

function finitePositive(value: number, label: string): void {
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${label} must be a finite positive number.`);
}

function validOpacity(value: number | undefined, label: string): number {
  const opacity = value ?? 1;
  if (!Number.isFinite(opacity) || opacity < 0 || opacity > 1) throw new Error(`${label} opacity must be between 0 and 1.`);
  return opacity;
}

function validRotation(value: number, label: string): number {
  if (!Number.isFinite(value) || value < -360 || value > 360) throw new Error(`${label} rotation must be between -360 and 360 degrees.`);
  return value;
}

function validMargin(value: number | undefined, label: string): number {
  const margin = value ?? DEFAULT_MARGIN;
  if (!Number.isFinite(margin) || margin < 0) throw new Error(`${label} margin must be a finite non-negative number.`);
  return margin;
}

export function batesValue(definition: PdfBatesCore, page: number): string {
  if (!Number.isSafeInteger(definition.start) || definition.start < 0) throw new Error('Bates start must be a non-negative safe integer.');
  if (!Number.isInteger(definition.padding) || definition.padding < 1 || definition.padding > 20) throw new Error('Bates padding must be an integer from 1 to 20.');
  if (!Number.isInteger(page) || page < 1) throw new Error('Bates page index must be a positive integer.');
  const number = definition.start + page - 1;
  if (!Number.isSafeInteger(number)) throw new Error('Bates sequence exceeds the safe integer range.');
  return `${definition.prefix}${String(number).padStart(definition.padding, '0')}${definition.suffix}`;
}

export function resolveOverlayTokens(template: string, context: PdfOverlayTokenContext): string {
  return template
    .replaceAll('{{page}}', String(context.page))
    .replaceAll('{{pages}}', String(context.pages))
    .replaceAll('{{date}}', context.date)
    .replaceAll('{{filename}}', context.filename)
    .replaceAll('{{bates}}', context.bates);
}

function alignedX(pageWidth: number, textWidth: number, align: PdfOverlayAlignment, margin: number): number {
  if (align === 'center') return Math.max(margin, (pageWidth - textWidth) / 2);
  if (align === 'right') return Math.max(margin, pageWidth - margin - textWidth);
  return margin;
}

function drawBandText(
  page: PDFPage,
  font: PDFFont,
  text: string,
  role: 'header' | 'footer',
  definition: PdfBandOverlayDefinition,
): void {
  finitePositive(definition.fontSize, `${role} font size`);
  const opacity = validOpacity(definition.opacity, role);
  const margin = validMargin(definition.margin, role);
  const { width, height } = page.getSize();
  const textWidth = font.widthOfTextAtSize(text, definition.fontSize);
  page.drawText(text, {
    x: alignedX(width, textWidth, definition.align, margin),
    y: role === 'header' ? Math.max(margin, height - margin - definition.fontSize) : margin,
    size: definition.fontSize,
    font,
    opacity,
    color: rgb(0, 0, 0),
  });
}

function batesPlacement(definition: PdfBatesDefinition): { role: 'header' | 'footer'; align: PdfOverlayAlignment } {
  const [role, align] = definition.placement.split('-') as ['header' | 'footer', PdfOverlayAlignment];
  return { role, align };
}

function drawBates(page: PDFPage, font: PDFFont, text: string, definition: PdfBatesDefinition): void {
  const placement = batesPlacement(definition);
  drawBandText(page, font, text, placement.role, {
    template: text,
    align: placement.align,
    fontSize: definition.fontSize,
    margin: definition.margin,
    opacity: definition.opacity,
  });
}

function drawTextWatermark(page: PDFPage, font: PDFFont, text: string, definition: PdfTextWatermarkDefinition): void {
  finitePositive(definition.fontSize, 'Text watermark font size');
  const opacity = validOpacity(definition.opacity, 'Text watermark');
  const rotation = validRotation(definition.rotation, 'Text watermark');
  const { width, height } = page.getSize();
  const textWidth = font.widthOfTextAtSize(text, definition.fontSize);
  page.drawText(text, {
    x: Math.max(0, (width - textWidth) / 2),
    y: Math.max(0, (height - definition.fontSize) / 2),
    size: definition.fontSize,
    font,
    opacity,
    color: rgb(0.45, 0.45, 0.45),
    rotate: degrees(rotation),
  });
}

function imagePosition(
  pageWidth: number,
  pageHeight: number,
  width: number,
  height: number,
  placement: PdfImageWatermarkPlacement,
  margin: number,
): { x: number; y: number } {
  const [vertical, horizontal] = placement === 'center'
    ? ['center', 'center']
    : placement.split('-') as ['top' | 'center' | 'bottom', 'left' | 'center' | 'right'];
  const x = horizontal === 'left' ? margin : horizontal === 'right' ? pageWidth - margin - width : (pageWidth - width) / 2;
  const y = vertical === 'bottom' ? margin : vertical === 'top' ? pageHeight - margin - height : (pageHeight - height) / 2;
  return { x: Math.max(0, x), y: Math.max(0, y) };
}

export async function applyPdfOverlays(document: PDFDocument, options: PdfOverlayOptions): Promise<PdfOverlayAuditEntry[]> {
  const hasText = Boolean(options.header || options.footer || options.bates || options.textWatermark);
  const font = hasText ? await document.embedFont(StandardFonts.Helvetica) : undefined;
  const imageDefinition = options.imageWatermark;
  let image: Awaited<ReturnType<PDFDocument['embedPng']>> | undefined;

  if (imageDefinition) {
    validOpacity(imageDefinition.opacity, 'Image watermark');
    validRotation(imageDefinition.rotation, 'Image watermark');
    finitePositive(imageDefinition.widthPercent, 'Image watermark width percentage');
    if (imageDefinition.widthPercent > 100) throw new Error('Image watermark width percentage cannot exceed 100.');
    validMargin(imageDefinition.margin, 'Image watermark');
    image = imageDefinition.mimeType === 'image/png'
      ? await document.embedPng(imageDefinition.bytes)
      : await document.embedJpg(imageDefinition.bytes);
  }

  const pages = document.getPages();
  const audit: PdfOverlayAuditEntry[] = [];

  for (let index = 0; index < pages.length; index += 1) {
    const pageNumber = index + 1;
    const bates = options.bates ? batesValue(options.bates, pageNumber) : '';
    const tokenContext: PdfOverlayTokenContext = {
      page: pageNumber,
      pages: pages.length,
      filename: options.context.filename,
      date: options.context.date,
      bates,
    };
    const page = pages[index];

    if (options.header && font) {
      const text = resolveOverlayTokens(options.header.template, tokenContext);
      if (text) {
        drawBandText(page, font, text, 'header', options.header);
        audit.push({ page: pageNumber, role: 'header', text });
      }
    }
    if (options.footer && font) {
      const text = resolveOverlayTokens(options.footer.template, tokenContext);
      if (text) {
        drawBandText(page, font, text, 'footer', options.footer);
        audit.push({ page: pageNumber, role: 'footer', text });
      }
    }
    if (options.bates && font) {
      drawBates(page, font, bates, options.bates);
      audit.push({ page: pageNumber, role: 'bates', text: bates });
    }
    if (options.textWatermark && font) {
      const text = resolveOverlayTokens(options.textWatermark.template, tokenContext);
      if (text) {
        drawTextWatermark(page, font, text, options.textWatermark);
        audit.push({ page: pageNumber, role: 'text-watermark', text });
      }
    }
    if (imageDefinition && image) {
      const opacity = validOpacity(imageDefinition.opacity, 'Image watermark');
      const rotation = validRotation(imageDefinition.rotation, 'Image watermark');
      const margin = validMargin(imageDefinition.margin, 'Image watermark');
      const pageSize = page.getSize();
      const targetWidth = pageSize.width * (imageDefinition.widthPercent / 100);
      let scale = targetWidth / image.width;
      const maxHeight = Math.max(1, pageSize.height - margin * 2);
      if (image.height * scale > maxHeight) scale = maxHeight / image.height;
      const width = image.width * scale;
      const height = image.height * scale;
      const position = imagePosition(pageSize.width, pageSize.height, width, height, imageDefinition.placement, margin);
      page.drawImage(image, {
        ...position,
        width,
        height,
        opacity,
        rotate: degrees(rotation),
      });
      audit.push({ page: pageNumber, role: 'image-watermark' });
    }
  }

  return audit;
}

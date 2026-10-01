import type {
  PdfBatesPlacement,
  PdfImageWatermarkPlacement,
  PdfOverlayAlignment,
  PdfOverlayOptions,
} from './pdf-overlays';

export type PdfOverlayDraft = {
  tokenDate: string;
  headerTemplate: string;
  headerAlign: PdfOverlayAlignment;
  headerFontSize: number;
  footerTemplate: string;
  footerAlign: PdfOverlayAlignment;
  footerFontSize: number;
  batesEnabled: boolean;
  batesStart: number;
  batesPadding: number;
  batesPrefix: string;
  batesSuffix: string;
  batesPlacement: PdfBatesPlacement;
  batesFontSize: number;
  textWatermark: string;
  textWatermarkFontSize: number;
  textWatermarkOpacity: number;
  textWatermarkRotation: number;
  imageWatermarkFile: File | null;
  imageWatermarkOpacity: number;
  imageWatermarkRotation: number;
  imageWatermarkWidthPercent: number;
  imageWatermarkPlacement: PdfImageWatermarkPlacement;
};

export const EMPTY_OVERLAY_DRAFT: PdfOverlayDraft = {
  tokenDate: '',
  headerTemplate: '',
  headerAlign: 'center',
  headerFontSize: 9,
  footerTemplate: '',
  footerAlign: 'center',
  footerFontSize: 9,
  batesEnabled: false,
  batesStart: 1,
  batesPadding: 6,
  batesPrefix: '',
  batesSuffix: '',
  batesPlacement: 'footer-right',
  batesFontSize: 9,
  textWatermark: '',
  textWatermarkFontSize: 42,
  textWatermarkOpacity: 0.18,
  textWatermarkRotation: -35,
  imageWatermarkFile: null,
  imageWatermarkOpacity: 0.18,
  imageWatermarkRotation: 0,
  imageWatermarkWidthPercent: 30,
  imageWatermarkPlacement: 'center',
};

function positive(value: number, label: string): string {
  return Number.isFinite(value) && value > 0 ? '' : `${label} must be a positive number.`;
}

function opacity(value: number, label: string): string {
  return Number.isFinite(value) && value >= 0 && value <= 1 ? '' : `${label} opacity must be between 0 and 1.`;
}

function rotation(value: number, label: string): string {
  return Number.isFinite(value) && value >= -360 && value <= 360 ? '' : `${label} rotation must be between -360 and 360 degrees.`;
}

export function overlayDraftError(draft: PdfOverlayDraft): string {
  if (draft.headerTemplate.trim()) {
    const error = positive(draft.headerFontSize, 'Header font size');
    if (error) return error;
  }
  if (draft.footerTemplate.trim()) {
    const error = positive(draft.footerFontSize, 'Footer font size');
    if (error) return error;
  }
  if (draft.batesEnabled) {
    if (!Number.isSafeInteger(draft.batesStart) || draft.batesStart < 0) return 'Bates start must be a non-negative whole number.';
    if (!Number.isInteger(draft.batesPadding) || draft.batesPadding < 1 || draft.batesPadding > 20) return 'Bates padding must be a whole number from 1 to 20.';
    const error = positive(draft.batesFontSize, 'Bates font size');
    if (error) return error;
  }
  if (draft.textWatermark.trim()) {
    const errors = [
      positive(draft.textWatermarkFontSize, 'Text watermark font size'),
      opacity(draft.textWatermarkOpacity, 'Text watermark'),
      rotation(draft.textWatermarkRotation, 'Text watermark'),
    ].filter(Boolean);
    if (errors.length) return errors[0];
  }
  if (draft.imageWatermarkFile) {
    if (!['image/png', 'image/jpeg'].includes(draft.imageWatermarkFile.type)) return 'Image watermark must be a PNG or JPEG file.';
    const errors = [
      opacity(draft.imageWatermarkOpacity, 'Image watermark'),
      rotation(draft.imageWatermarkRotation, 'Image watermark'),
      positive(draft.imageWatermarkWidthPercent, 'Image watermark width'),
    ].filter(Boolean);
    if (errors.length) return errors[0];
    if (draft.imageWatermarkWidthPercent > 100) return 'Image watermark width cannot exceed 100% of the page width.';
  }
  return '';
}

export function overlayChangeCount(draft: PdfOverlayDraft): number {
  return Number(Boolean(draft.headerTemplate.trim()))
    + Number(Boolean(draft.footerTemplate.trim()))
    + Number(draft.batesEnabled)
    + Number(Boolean(draft.textWatermark.trim()))
    + Number(Boolean(draft.imageWatermarkFile));
}

export async function overlayOptionsFromDraft(draft: PdfOverlayDraft, filename: string): Promise<PdfOverlayOptions | undefined> {
  const error = overlayDraftError(draft);
  if (error) throw new Error(error);
  if (!overlayChangeCount(draft)) return undefined;

  return {
    context: { filename, date: draft.tokenDate.trim() },
    header: draft.headerTemplate.trim() ? {
      template: draft.headerTemplate,
      align: draft.headerAlign,
      fontSize: draft.headerFontSize,
    } : undefined,
    footer: draft.footerTemplate.trim() ? {
      template: draft.footerTemplate,
      align: draft.footerAlign,
      fontSize: draft.footerFontSize,
    } : undefined,
    bates: draft.batesEnabled ? {
      start: draft.batesStart,
      padding: draft.batesPadding,
      prefix: draft.batesPrefix,
      suffix: draft.batesSuffix,
      placement: draft.batesPlacement,
      fontSize: draft.batesFontSize,
    } : undefined,
    textWatermark: draft.textWatermark.trim() ? {
      template: draft.textWatermark,
      fontSize: draft.textWatermarkFontSize,
      opacity: draft.textWatermarkOpacity,
      rotation: draft.textWatermarkRotation,
    } : undefined,
    imageWatermark: draft.imageWatermarkFile ? {
      bytes: new Uint8Array(await draft.imageWatermarkFile.arrayBuffer()),
      mimeType: draft.imageWatermarkFile.type as 'image/png' | 'image/jpeg',
      opacity: draft.imageWatermarkOpacity,
      rotation: draft.imageWatermarkRotation,
      widthPercent: draft.imageWatermarkWidthPercent,
      placement: draft.imageWatermarkPlacement,
    } : undefined,
  };
}

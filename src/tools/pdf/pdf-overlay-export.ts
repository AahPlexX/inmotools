import { PDFDocument } from 'pdf-lib';
import { applyPdfOverlays, type PdfOverlayOptions } from './pdf-overlays';

export async function applyPdfOverlaysToBytes(bytes: Uint8Array, options: PdfOverlayOptions | undefined): Promise<Uint8Array> {
  if (!options) return bytes;
  const document = await PDFDocument.load(bytes.slice(), { updateMetadata: false });
  await applyPdfOverlays(document, options);
  return new Uint8Array(await document.save({ updateFieldAppearances: false }));
}

import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import {
  applyPdfOverlays,
  batesValue,
  resolveOverlayTokens,
  type PdfOverlayOptions,
} from '../../src/tools/pdf/pdf-overlays';

describe('PDF export overlays', () => {
  it('resolves deterministic page, total, date, filename, and Bates tokens', () => {
    expect(batesValue({ start: 42, padding: 6, prefix: 'CASE-', suffix: '-A' }, 3)).toBe('CASE-000044-A');
    expect(resolveOverlayTokens(
      '{{filename}} · {{page}}/{{pages}} · {{date}} · {{bates}}',
      { page: 3, pages: 12, filename: 'record.pdf', date: '2026-09-12', bates: 'CASE-000044-A' },
    )).toBe('record.pdf · 3/12 · 2026-09-12 · CASE-000044-A');
  });

  it('draws header, footer, Bates, text watermark, and image watermark with a resolved audit plan', async () => {
    const document = await PDFDocument.create();
    document.addPage([300, 200]);
    document.addPage([400, 300]);
    const imageBytes = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64'));
    const options: PdfOverlayOptions = {
      context: { filename: 'packet.pdf', date: '2026-09-12' },
      header: { template: '{{filename}} · {{page}}/{{pages}}', align: 'center', fontSize: 9 },
      footer: { template: 'Filed {{date}}', align: 'right', fontSize: 8 },
      bates: { start: 100, padding: 5, prefix: 'B-', suffix: '', placement: 'footer-left', fontSize: 9 },
      textWatermark: { template: 'DRAFT {{page}}', fontSize: 30, opacity: 0.2, rotation: -35 },
      imageWatermark: { bytes: imageBytes, mimeType: 'image/png', opacity: 0.15, rotation: 10, widthPercent: 20, placement: 'center' },
    };

    const audit = await applyPdfOverlays(document, options);
    expect(audit.filter((entry) => entry.role === 'header').map((entry) => entry.text)).toEqual(['packet.pdf · 1/2', 'packet.pdf · 2/2']);
    expect(audit.filter((entry) => entry.role === 'footer').map((entry) => entry.text)).toEqual(['Filed 2026-09-12', 'Filed 2026-09-12']);
    expect(audit.filter((entry) => entry.role === 'bates').map((entry) => entry.text)).toEqual(['B-00100', 'B-00101']);
    expect(audit.filter((entry) => entry.role === 'text-watermark').map((entry) => entry.text)).toEqual(['DRAFT 1', 'DRAFT 2']);
    expect(audit.filter((entry) => entry.role === 'image-watermark')).toHaveLength(2);

    const saved = await document.save();
    expect(saved.byteLength).toBeGreaterThan(500);
  });

  it('rejects invalid Bates and watermark settings before drawing', async () => {
    expect(() => batesValue({ start: -1, padding: 6, prefix: '', suffix: '' }, 1)).toThrow(/Bates start/i);
    const document = await PDFDocument.create();
    document.addPage([300, 200]);
    await expect(applyPdfOverlays(document, {
      context: { filename: 'packet.pdf', date: '' },
      textWatermark: { template: 'DRAFT', fontSize: 30, opacity: 2, rotation: 0 },
    })).rejects.toThrow(/opacity/i);
  });
});

import { useRef, useState } from 'react';
import { preparePhotoRaster, releasePhotoRaster } from './photo-import';
import { POINTS_PER_INCH, PHOTO_PAPER_SIZES, layoutContactSheet, paperById } from './photo-print';
import { renderPhoto } from './photo-renderer';
import type { PhotoOutputSink } from './photo-export-queue';
import type { PhotoRecipe } from './photo-types';

export interface ContactSheetSource {
  name: string;
  file: Blob;
}

export interface PhotoContactSheetPanelProps {
  sources: ContactSheetSource[];
  recipe: PhotoRecipe;
  createSink: () => PhotoOutputSink;
  onStatus: (message: string) => void;
}

const SHEET_DPI = 200;
const MAX_SHEET_PHOTOS = 120;

function drawingSurface(width: number, height: number) {
  if (typeof OffscreenCanvas !== 'undefined') {
    const canvas = new OffscreenCanvas(width, height);
    return { canvas, context: canvas.getContext('2d') as OffscreenCanvasRenderingContext2D };
  }
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return { canvas, context: canvas.getContext('2d') as CanvasRenderingContext2D };
}

async function surfaceToBlob(canvas: OffscreenCanvas | HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
  if (canvas instanceof HTMLCanvasElement) {
    return new Promise((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('The page could not be encoded.'))), type, quality));
  }
  return canvas.convertToBlob({ type, quality });
}

/** Shortens `text` with an ellipsis so it fits `maxWidth` in the context's current font. */
function fitText(context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (context.measureText(text).width <= maxWidth) return text;
  let low = 0; let high = text.length;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (context.measureText(`${text.slice(0, middle)}…`).width <= maxWidth) low = middle;
    else high = middle - 1;
  }
  return `${text.slice(0, low)}…`;
}

export default function PhotoContactSheetPanel({ sources, recipe, createSink, onStatus }: PhotoContactSheetPanelProps) {
  const [paperId, setPaperId] = useState('A4');
  const [orientation, setOrientation] = useState<'portrait' | 'landscape'>('portrait');
  const [columns, setColumns] = useState(4);
  const [captions, setCaptions] = useState(true);
  const [title, setTitle] = useState('');
  const [applyEdits, setApplyEdits] = useState(true);
  const [format, setFormat] = useState<'pdf' | 'png'>('pdf');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const revisionRef = useRef(0);

  const count = Math.min(sources.length, MAX_SHEET_PHOTOS);

  async function thumbnail(source: ContactSheetSource, edge: number): Promise<ImageBitmap> {
    if (applyEdits) {
      const rendered = await renderPhoto({ file: source.file, recipe, revision: ++revisionRef.current, mode: 'preview', outputMime: 'image/png', maxPreviewEdge: edge });
      return createImageBitmap(rendered.blob);
    }
    try {
      const raster = await preparePhotoRaster(source.file);
      return await createImageBitmap(raster.blob, { imageOrientation: 'from-image' });
    } finally {
      releasePhotoRaster(source.file);
    }
  }

  async function create() {
    if (!count || busy) return;
    setBusy(true);
    const bitmaps: Array<ImageBitmap | null> = [];
    try {
      const paper = paperById(paperId);
      const pageWidth = orientation === 'portrait' ? paper.width : paper.height;
      const pageHeight = orientation === 'portrait' ? paper.height : paper.width;
      const margin = 0.4 * POINTS_PER_INCH;
      const captionHeight = captions ? 14 : 0;
      const header = title.trim() ? 30 : 0;
      const cellPoints = (pageWidth - margin * 2 - 8 * (columns - 1)) / columns;
      const thumbEdge = Math.max(96, Math.ceil((cellPoints / POINTS_PER_INCH) * SHEET_DPI));

      const failed: string[] = [];
      for (let index = 0; index < count; index += 1) {
        setProgress(`Preparing ${sources[index].name} (${index + 1} of ${count})…`);
        try {
          bitmaps.push(await thumbnail(sources[index], thumbEdge));
        } catch {
          bitmaps.push(null);
          failed.push(sources[index].name);
        }
      }
      const pages = layoutContactSheet(bitmaps.map((bitmap) => (bitmap ? bitmap.width / bitmap.height : 1)), {
        pageWidth, pageHeight, margin, gap: 8, columns, header, caption: captionHeight,
      });
      const scale = SHEET_DPI / POINTS_PER_INCH;
      const pixelWidth = Math.round(pageWidth * scale);
      const pixelHeight = Math.round(pageHeight * scale);
      const sink = createSink();
      const pdf = format === 'pdf' ? await (await import('pdf-lib')).PDFDocument.create() : null;
      if (pdf) {
        pdf.setTitle(title.trim() || 'Contact sheet');
        pdf.setCreator('InMo Tools Photo Studio');
        pdf.setProducer('InMo Tools Photo Studio');
      }
      const stem = (title.trim() || 'contact-sheet').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-').toLowerCase() || 'contact-sheet';
      for (let pageIndex = 0; pageIndex < pages.length; pageIndex += 1) {
        setProgress(`Laying out page ${pageIndex + 1} of ${pages.length}…`);
        const { canvas, context } = drawingSurface(pixelWidth, pixelHeight);
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, pixelWidth, pixelHeight);
        context.scale(scale, scale);
        if (header) {
          context.fillStyle = '#111111';
          context.font = '600 14px sans-serif';
          context.textBaseline = 'middle';
          context.fillText(fitText(context, `${title.trim()}${pages.length > 1 ? ` · page ${pageIndex + 1} of ${pages.length}` : ''}`, pageWidth - margin * 2), margin, margin + header / 2 - 4);
        }
        for (const cell of pages[pageIndex].cells) {
          const bitmap = bitmaps[cell.index];
          context.fillStyle = '#f1f1f1';
          context.fillRect(cell.cell.x, cell.cell.y, cell.cell.width, cell.cell.width);
          if (bitmap) {
            context.imageSmoothingQuality = 'high';
            context.drawImage(bitmap, cell.image.x, cell.image.y, cell.image.width, cell.image.height);
          } else {
            context.fillStyle = '#8a1c1c';
            context.font = '9px sans-serif';
            context.textAlign = 'center';
            context.fillText('Could not read', cell.cell.x + cell.cell.width / 2, cell.cell.y + cell.cell.width / 2);
            context.textAlign = 'start';
          }
          if (cell.caption) {
            context.fillStyle = '#222222';
            context.font = '8px sans-serif';
            context.textBaseline = 'top';
            const name = sources[cell.index].name;
            context.fillText(fitText(context, name, cell.caption.width), cell.caption.x, cell.caption.y + 3);
          }
        }
        if (pdf) {
          const jpeg = new Uint8Array(await (await surfaceToBlob(canvas, 'image/jpeg', 0.9)).arrayBuffer());
          const image = await pdf.embedJpg(jpeg);
          const page = pdf.addPage([pageWidth, pageHeight]);
          page.drawImage(image, { x: 0, y: 0, width: pageWidth, height: pageHeight });
        } else {
          await sink.write(await surfaceToBlob(canvas, 'image/png'), `${stem}${pages.length > 1 ? `-${pageIndex + 1}` : ''}.png`);
        }
      }
      let savedAs = '';
      if (pdf) savedAs = await sink.write(new Blob([(await pdf.save()) as Uint8Array<ArrayBuffer>], { type: 'application/pdf' }), `${stem}.pdf`);
      const skipped = sources.length > count ? ` Only the first ${MAX_SHEET_PHOTOS} photos fit one sheet run.` : '';
      onStatus(`Contact sheet ready · ${count} photo${count === 1 ? '' : 's'} on ${pages.length} page${pages.length === 1 ? '' : 's'}${savedAs ? ` · ${savedAs}` : ''} saved to ${sink.label}.${failed.length ? ` Could not read ${failed.join(', ')}.` : ''}${skipped}`);
    } catch (error) {
      onStatus(`Contact sheet failed: ${error instanceof Error ? error.message : 'unknown error'}`);
    } finally {
      for (const bitmap of bitmaps) bitmap?.close();
      setBusy(false);
      setProgress('');
    }
  }

  return (
    <div className="photo-contact-sheet" data-testid="photo-contact-sheet">
      <p className="photo-export-note">Lay out the photos queued above (or just this photo) on printable pages, with file names underneath. Handy for proofing a shoot or choosing picks with someone else.</p>
      <div className="photo-export-grid">
        <label>Paper
          <select aria-label="Contact sheet paper" value={paperId} disabled={busy} onChange={(event) => setPaperId(event.target.value)}>
            {PHOTO_PAPER_SIZES.map((paper) => <option key={paper.id} value={paper.id}>{paper.label}</option>)}
          </select>
        </label>
        <label>Orientation
          <select aria-label="Contact sheet orientation" value={orientation} disabled={busy} onChange={(event) => setOrientation(event.target.value as 'portrait' | 'landscape')}>
            <option value="portrait">Portrait</option>
            <option value="landscape">Landscape</option>
          </select>
        </label>
        <label>Photos per row
          <input aria-label="Contact sheet columns" type="number" min={1} max={8} value={columns} disabled={busy} onChange={(event) => setColumns(Math.min(8, Math.max(1, Math.round(Number(event.target.value) || 4))))} />
        </label>
        <label>Output
          <select aria-label="Contact sheet output" value={format} disabled={busy} onChange={(event) => setFormat(event.target.value as 'pdf' | 'png')}>
            <option value="pdf">PDF (all pages in one file)</option>
            <option value="png">PNG (one image per page)</option>
          </select>
        </label>
        <label className="photo-wide">Sheet heading (optional)
          <input aria-label="Contact sheet heading" value={title} maxLength={120} disabled={busy} onChange={(event) => setTitle(event.target.value)} placeholder="Wedding · first picks" />
        </label>
      </div>
      <label className="photo-check-row"><input type="checkbox" checked={captions} disabled={busy} onChange={(event) => setCaptions(event.target.checked)} />Show photo names under thumbnails</label>
      <label className="photo-check-row"><input type="checkbox" checked={applyEdits} disabled={busy} onChange={(event) => setApplyEdits(event.target.checked)} />Apply the current edits to every thumbnail</label>
      <div className="photo-inline-actions">
        <button type="button" disabled={!count || busy} onClick={() => void create()}>{busy ? 'Creating sheet…' : `Create contact sheet (${count} photo${count === 1 ? '' : 's'})`}</button>
      </div>
      {progress ? <p className="photo-export-note" role="status">{progress}</p> : null}
    </div>
  );
}

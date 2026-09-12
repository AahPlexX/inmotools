import { useMemo, useRef, useState } from 'react';
import { downloadBlob, downloadText } from '../../lib/download';
import {
  buildCrystalSvg,
  exportCrystalPng,
  fitCrystalPngDimensions,
} from './crystal-graphics-export';
import type { CrystalMeasurement, CrystalViewState } from './project-engine';
import {
  defaultExportOptions,
  exportCrystal,
  type CrystalExportResult,
  type CrystalExportTarget,
} from './structure-export-engine';
import type { CrystalDocument } from './crystal-types';
import type { CrystalRepresentation } from './viewport-model';

interface CrystalExportDialogProps {
  readonly document: CrystalDocument;
  readonly measurements: readonly CrystalMeasurement[];
  readonly view: CrystalViewState;
  readonly representation: CrystalRepresentation;
  readonly getViewportCanvas: () => HTMLCanvasElement | null;
}

type DialogExportTarget = CrystalExportTarget | 'svg' | 'png';
type PngBackground = 'transparent' | 'white';

const FORMATS: readonly { value: DialogExportTarget; label: string }[] = [
  { value: 'cif1', label: 'CIF 1.1' },
  { value: 'cif2', label: 'CIF 2.0' },
  { value: 'poscar', label: 'POSCAR' },
  { value: 'xyz', label: 'XYZ' },
  { value: 'extxyz', label: 'Extended XYZ' },
  { value: 'project', label: 'Crystal project' },
  { value: 'measurements-csv', label: 'Measurements CSV' },
  { value: 'svg', label: 'SVG' },
  { value: 'png', label: 'PNG' },
];

const PREVIEW_LIMIT = 16_000;
const DEFAULT_IMAGE_WIDTH = '1200';
const DEFAULT_IMAGE_HEIGHT = '900';

function renderTags(tags: readonly string[]): string {
  return tags.length ? tags.join(', ') : 'None';
}

function safeFilenameStem(value: string): string {
  const stem = value.trim()
    .replace(/[\\/:*?"<>|\u0000-\u001f]+/gu, '-')
    .replace(/\s+/gu, '-')
    .replace(/^-+|-+$/gu, '');
  return stem || 'crystal';
}

export default function CrystalExportDialog({
  document,
  measurements,
  view,
  representation,
  getViewportCanvas,
}: CrystalExportDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [target, setTarget] = useState<DialogExportTarget>('cif1');
  const [filenameStem, setFilenameStem] = useState('');
  const [preserveCifMetadata, setPreserveCifMetadata] = useState(true);
  const [imageWidth, setImageWidth] = useState(DEFAULT_IMAGE_WIDTH);
  const [imageHeight, setImageHeight] = useState(DEFAULT_IMAGE_HEIGHT);
  const [pngBackground, setPngBackground] = useState<PngBackground>('transparent');
  const [actionError, setActionError] = useState<string | null>(null);

  const open = (): void => {
    setTarget('cif1');
    setFilenameStem(document.metadata.title ?? document.name);
    setPreserveCifMetadata(true);
    setImageWidth(DEFAULT_IMAGE_WIDTH);
    setImageHeight(DEFAULT_IMAGE_HEIGHT);
    setPngBackground('transparent');
    setActionError(null);
    dialogRef.current?.showModal();
  };

  const generated = useMemo<{ result?: CrystalExportResult; error?: string }>(() => {
    try {
      if (target === 'png') return {};
      if (target === 'svg') {
        const text = buildCrystalSvg(document, {
          width: Number(imageWidth),
          height: Number(imageHeight),
          showCell: view.showCell,
          showLabels: true,
          background: 'transparent',
          representation,
        });
        return {
          result: {
            filename: `${safeFilenameStem(filenameStem || document.name)}.svg`,
            mime: 'image/svg+xml;charset=utf-8',
            text,
            diff: { preserved: [], changed: [], generated: [], omitted: [] },
          },
        };
      }
      return {
        result: exportCrystal(document, target, {
          ...defaultExportOptions,
          measurements,
          filenameStem,
          preserveCifMetadata,
          view,
        }),
      };
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) };
    }
  }, [document, filenameStem, imageHeight, imageWidth, measurements, preserveCifMetadata, representation, target, view]);

  const pngDimensions = useMemo(() => {
    if (target !== 'png') return undefined;
    try {
      return { value: fitCrystalPngDimensions(Number(imageWidth), Number(imageHeight)) };
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) };
    }
  }, [imageHeight, imageWidth, target]);

  const formatLabel = FORMATS.find((format) => format.value === target)?.label ?? target;
  const result = generated.result;
  const isCif = target === 'cif1' || target === 'cif2';
  const isGraphic = target === 'svg' || target === 'png';
  const preview = result
    ? `${result.text.slice(0, PREVIEW_LIMIT)}${result.text.length > PREVIEW_LIMIT ? '\n… preview truncated …' : ''}`
    : '';

  const download = async (): Promise<void> => {
    setActionError(null);
    try {
      if (target === 'png') {
        if (pngDimensions?.error || !pngDimensions?.value) {
          throw new RangeError(pngDimensions?.error ?? 'Choose valid PNG dimensions.');
        }
        const canvas = getViewportCanvas();
        if (!canvas) throw new Error('The 3D view is not ready for PNG export yet.');
        const blob = await exportCrystalPng(canvas, {
          width: Number(imageWidth),
          height: Number(imageHeight),
          background: pngBackground === 'transparent' ? 'transparent' : '#ffffff',
        });
        downloadBlob(blob, `${safeFilenameStem(filenameStem || document.name)}.png`);
        return;
      }
      if (!result) throw new Error(generated.error ?? 'The selected export could not be generated.');
      downloadText(result.text, result.filename, result.mime);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <>
      <button type="button" onClick={open}>Export</button>
      <dialog ref={dialogRef} className="crystal-dialog crystal-export-dialog" aria-labelledby="crystal-export-dialog-title">
        <div className="crystal-dialog__header">
          <div>
            <p className="eyebrow">Scientific output</p>
            <h2 id="crystal-export-dialog-title">Export crystal</h2>
            <p>Preview text and vector files, or export a bounded PNG from the current 3D view.</p>
          </div>
          <button type="button" onClick={() => dialogRef.current?.close()}>Close</button>
        </div>

        <div className="crystal-dialog__body">
          <section className="crystal-export-settings" aria-label="Export settings">
            <label>
              Export format
              <select value={target} onChange={(event) => {
                setTarget(event.target.value as DialogExportTarget);
                setActionError(null);
              }}>
                {FORMATS.map((format) => <option value={format.value} key={format.value}>{format.label}</option>)}
              </select>
            </label>
            <label>
              Filename
              <input value={filenameStem} onChange={(event) => setFilenameStem(event.target.value)} />
            </label>
            {isGraphic ? (
              <>
                <label>
                  Image width (px)
                  <input inputMode="numeric" value={imageWidth} onChange={(event) => setImageWidth(event.target.value)} />
                </label>
                <label>
                  Image height (px)
                  <input inputMode="numeric" value={imageHeight} onChange={(event) => setImageHeight(event.target.value)} />
                </label>
              </>
            ) : null}
            {target === 'png' ? (
              <label>
                PNG background
                <select value={pngBackground} onChange={(event) => setPngBackground(event.target.value as PngBackground)}>
                  <option value="transparent">Transparent</option>
                  <option value="white">White</option>
                </select>
              </label>
            ) : null}
            <label className="crystal-export-preserve-option">
              <input
                type="checkbox"
                checked={preserveCifMetadata}
                disabled={!isCif || !document.cif}
                onChange={(event) => setPreserveCifMetadata(event.target.checked)}
              />
              Preserve imported CIF metadata
            </label>
          </section>

          {target === 'png' ? (
            <section className="crystal-dialog__section" aria-labelledby="crystal-png-output-heading">
              <div>
                <h3 id="crystal-png-output-heading">PNG output</h3>
                {pngDimensions?.error ? (
                  <p className="crystal-editor-error" role="alert">{pngDimensions.error}</p>
                ) : pngDimensions?.value ? (
                  <p>
                    Output: {pngDimensions.value.width.toLocaleString()} × {pngDimensions.value.height.toLocaleString()} px
                    {pngDimensions.value.reduced ? ' — reduced proportionally to stay within the safe browser export limit.' : ''}
                  </p>
                ) : null}
                <p>The PNG uses the pixels currently rendered in the interactive 3D view.</p>
              </div>
            </section>
          ) : generated.error ? (
            <p className="crystal-editor-error" role="alert">{generated.error}</p>
          ) : result ? (
            <>
              {!isGraphic ? (
                <section className="crystal-dialog__section" aria-labelledby="crystal-export-impact-heading">
                  <div>
                    <h3 id="crystal-export-impact-heading">Metadata impact</h3>
                    <p>CIF data names are compared with the imported source when one is available.</p>
                  </div>
                  <div className="crystal-export-diff-grid">
                    <div>
                      <strong>Preserved</strong>
                      <p data-testid="crystal-export-preserved">{renderTags(result.diff.preserved)}</p>
                    </div>
                    <div>
                      <strong>Changed</strong>
                      <p data-testid="crystal-export-changed">{renderTags(result.diff.changed)}</p>
                    </div>
                    <div>
                      <strong>Generated</strong>
                      <p data-testid="crystal-export-generated">{renderTags(result.diff.generated)}</p>
                    </div>
                    <div>
                      <strong>Omitted</strong>
                      <p data-testid="crystal-export-omitted">{renderTags(result.diff.omitted)}</p>
                    </div>
                  </div>
                </section>
              ) : null}

              <section className="crystal-dialog__section" aria-labelledby="crystal-export-preview-heading">
                <div className="crystal-dialog__section-heading">
                  <div>
                    <h3 id="crystal-export-preview-heading">File preview</h3>
                    <p>{result.filename}</p>
                  </div>
                  <span>{result.text.length.toLocaleString()} characters</span>
                </div>
                <pre className="crystal-export-preview" data-testid="crystal-export-preview"><code>{preview}</code></pre>
              </section>
            </>
          ) : null}

          {actionError ? <p className="crystal-editor-error" role="alert">{actionError}</p> : null}
        </div>

        <div className="crystal-dialog__footer">
          <button type="button" onClick={() => dialogRef.current?.close()}>Cancel</button>
          <button
            type="button"
            onClick={() => { void download(); }}
            disabled={target === 'png' ? Boolean(pngDimensions?.error || !pngDimensions?.value) : !result}
          >
            Download {formatLabel}
          </button>
        </div>
      </dialog>
    </>
  );
}

import { useMemo, useRef, useState } from 'react';
import { downloadText } from '../../lib/download';
import type { CrystalMeasurement } from './project-engine';
import {
  defaultExportOptions,
  exportCrystal,
  type CrystalExportResult,
  type CrystalExportTarget,
} from './structure-export-engine';
import type { CrystalDocument } from './crystal-types';

interface CrystalExportDialogProps {
  readonly document: CrystalDocument;
  readonly measurements: readonly CrystalMeasurement[];
}

const FORMATS: readonly { value: CrystalExportTarget; label: string }[] = [
  { value: 'cif1', label: 'CIF 1.1' },
  { value: 'cif2', label: 'CIF 2.0' },
  { value: 'poscar', label: 'POSCAR' },
  { value: 'xyz', label: 'XYZ' },
  { value: 'extxyz', label: 'Extended XYZ' },
  { value: 'project', label: 'Crystal project' },
  { value: 'measurements-csv', label: 'Measurements CSV' },
];

const PREVIEW_LIMIT = 16_000;

function renderTags(tags: readonly string[]): string {
  return tags.length ? tags.join(', ') : 'None';
}

export default function CrystalExportDialog({ document, measurements }: CrystalExportDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [target, setTarget] = useState<CrystalExportTarget>('cif1');
  const [filenameStem, setFilenameStem] = useState('');
  const [preserveCifMetadata, setPreserveCifMetadata] = useState(true);

  const open = (): void => {
    setTarget('cif1');
    setFilenameStem(document.metadata.title ?? document.name);
    setPreserveCifMetadata(true);
    dialogRef.current?.showModal();
  };

  const generated = useMemo<{ result?: CrystalExportResult; error?: string }>(() => {
    try {
      return {
        result: exportCrystal(document, target, {
          ...defaultExportOptions,
          measurements,
          filenameStem,
          preserveCifMetadata,
        }),
      };
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) };
    }
  }, [document, filenameStem, measurements, preserveCifMetadata, target]);

  const formatLabel = FORMATS.find((format) => format.value === target)?.label ?? target;
  const result = generated.result;
  const isCif = target === 'cif1' || target === 'cif2';
  const preview = result
    ? `${result.text.slice(0, PREVIEW_LIMIT)}${result.text.length > PREVIEW_LIMIT ? '\n… preview truncated …' : ''}`
    : '';

  const download = (): void => {
    if (!result) return;
    downloadText(result.text, result.filename, result.mime);
  };

  return (
    <>
      <button type="button" onClick={open}>Export</button>
      <dialog ref={dialogRef} className="crystal-dialog crystal-export-dialog" aria-labelledby="crystal-export-dialog-title">
        <div className="crystal-dialog__header">
          <div>
            <p className="eyebrow">Scientific output</p>
            <h2 id="crystal-export-dialog-title">Export crystal</h2>
            <p>Preview the generated file and its metadata impact before downloading it.</p>
          </div>
          <button type="button" onClick={() => dialogRef.current?.close()}>Close</button>
        </div>

        <div className="crystal-dialog__body">
          <section className="crystal-export-settings" aria-label="Export settings">
            <label>
              Export format
              <select value={target} onChange={(event) => setTarget(event.target.value as CrystalExportTarget)}>
                {FORMATS.map((format) => <option value={format.value} key={format.value}>{format.label}</option>)}
              </select>
            </label>
            <label>
              Filename
              <input value={filenameStem} onChange={(event) => setFilenameStem(event.target.value)} />
            </label>
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

          {generated.error ? (
            <p className="crystal-editor-error" role="alert">{generated.error}</p>
          ) : result ? (
            <>
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
        </div>

        <div className="crystal-dialog__footer">
          <button type="button" onClick={() => dialogRef.current?.close()}>Cancel</button>
          <button type="button" onClick={download} disabled={!result}>Download {formatLabel}</button>
        </div>
      </dialog>
    </>
  );
}

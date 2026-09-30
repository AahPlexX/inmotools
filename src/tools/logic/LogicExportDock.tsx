import { useMemo, useState } from 'react';
import { downloadBlob, downloadBytes, downloadText } from '../../lib/download';
import { EXPORT_FORMATS, EXPORT_GROUPS, runExport, type ExportFormatId } from './export-formats';
import type { LogicDocument } from './logic-types';
import { ogFieldsFromMetadata, renderOgCardSvg, ogAltText, type OgOverrides } from './og-card';
import type { PaperSize } from './pdf-export';
import { svgToPngBlob } from './svg-raster';
import './LogicExportDock.css';

export interface LogicExportDockProps {
  /** The whole circuit, not the subcircuit that may be open for editing. */
  readonly document: LogicDocument;
  readonly onClose: () => void;
}

interface Outcome {
  readonly kind: 'saved' | 'problem';
  readonly text: string;
  readonly warnings: readonly string[];
}

const PAPERS: readonly { readonly id: PaperSize; readonly label: string }[] = [
  { id: 'a4', label: 'A4' },
  { id: 'a3', label: 'A3' },
  { id: 'letter', label: 'US Letter' },
];

export function LogicExportDock({ document: doc, onClose }: LogicExportDockProps) {
  const [paper, setPaper] = useState<PaperSize>('a4');
  const [og, setOg] = useState<Required<OgOverrides>>({ title: '', description: '', siteName: '', url: '', imageUrl: '' });
  const [busy, setBusy] = useState<ExportFormatId | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  const setField = (name: keyof OgOverrides, value: string) => setOg((current) => ({ ...current, [name]: value }));

  // The preview is an image element pointing at the card's SVG, so nothing in a title or description can run as script.
  const preview = useMemo(() => {
    const { fields } = ogFieldsFromMetadata(doc.metadata, og);
    return { src: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(renderOgCardSvg(doc, fields))}`, alt: ogAltText(fields) };
  }, [doc, og]);

  const handleExport = async (id: ExportFormatId) => {
    setBusy(id);
    setOutcome(null);
    try {
      const out = await runExport(id, doc, { paper, og });
      if (out.raster && out.text !== undefined) downloadBlob(await svgToPngBlob(out.text, out.raster.width, out.raster.height), out.filename);
      else if (out.bytes) downloadBytes(out.bytes, out.filename, out.mime);
      else downloadText(out.text ?? '', out.filename, out.mime);
      setOutcome({ kind: 'saved', text: `Saved ${out.filename}`, warnings: out.warnings });
    } catch (error) {
      setOutcome({ kind: 'problem', text: error instanceof Error ? error.message : 'This export could not be written.', warnings: [] });
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="logic-dock logic-export" aria-label="Export" data-testid="logic-export-dock">
      <div className="logic-export-bar">
        <p className="logic-export-summary">Exports describe the whole circuit. Title, author, version and license come from the project details in the inspector.</p>
        <button type="button" onClick={onClose}>Close</button>
      </div>

      {outcome ? (
        <div className={outcome.kind === 'problem' ? 'logic-export-outcome problem' : 'logic-export-outcome'} role={outcome.kind === 'problem' ? 'alert' : 'status'} data-testid="logic-export-outcome">
          <p>{outcome.text}</p>
          {outcome.warnings.length > 0 ? (
            <ul data-testid="logic-export-warnings">
              {outcome.warnings.map((warning, index) => <li key={index}>{warning}</li>)}
            </ul>
          ) : null}
        </div>
      ) : null}

      <div className="logic-export-settings">
        <label className="logic-export-field">
          <span>PDF paper</span>
          <select value={paper} onChange={(event) => setPaper(event.target.value as PaperSize)} data-testid="logic-export-paper">
            {PAPERS.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
          </select>
        </label>
      </div>

      {EXPORT_GROUPS.map((group) => (
        <div key={group} className="logic-export-group">
          <h3>{group}</h3>
          <ul>
            {EXPORT_FORMATS.filter((format) => format.group === group).map((format) => (
              <li key={format.id}>
                <div>
                  <strong>{format.label}</strong>
                  <span>{format.description}</span>
                </div>
                <button type="button" onClick={() => void handleExport(format.id)} disabled={busy !== null} data-testid={`logic-export-${format.id}`} aria-label={`Download ${format.label}`}>
                  {busy === format.id ? 'Writing…' : 'Download'}
                </button>
              </li>
            ))}
          </ul>
          {group === 'Sharing' ? (
            <div className="logic-export-card" data-testid="logic-export-card">
              <div className="logic-export-card-fields">
                <p className="logic-export-note">These fields apply to this export only; they are not saved in the project.</p>
                <label className="logic-export-field">
                  <span>Card title</span>
                  <input type="text" value={og.title} placeholder={doc.metadata.title} maxLength={200} onChange={(event) => setField('title', event.target.value)} data-testid="logic-export-og-title" />
                </label>
                <label className="logic-export-field">
                  <span>Card description</span>
                  <textarea value={og.description} placeholder={doc.metadata.description} rows={3} maxLength={500} onChange={(event) => setField('description', event.target.value)} data-testid="logic-export-og-description" />
                </label>
                <label className="logic-export-field">
                  <span>Site name</span>
                  <input type="text" value={og.siteName} placeholder="InMo Tools" maxLength={100} onChange={(event) => setField('siteName', event.target.value)} />
                </label>
                <label className="logic-export-field">
                  <span>Page address (og:url)</span>
                  <input type="text" inputMode="url" value={og.url} placeholder="https://example.com/my-circuit" onChange={(event) => setField('url', event.target.value)} data-testid="logic-export-og-url" />
                </label>
                <label className="logic-export-field">
                  <span>Image address (og:image)</span>
                  <input type="text" inputMode="url" value={og.imageUrl} placeholder="https://example.com/my-circuit.png" onChange={(event) => setField('imageUrl', event.target.value)} />
                </label>
              </div>
              <img className="logic-export-card-preview" src={preview.src} alt={preview.alt} width={600} height={315} data-testid="logic-export-card-preview" />
            </div>
          ) : null}
        </div>
      ))}
    </section>
  );
}

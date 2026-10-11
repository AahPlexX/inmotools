import { useId, useState } from 'react';
import type { PdfDiagnostics } from './pdf-diagnostics';
import './pdf-diagnostics.css';

type Dimensions = PdfDiagnostics['pageDimensions'][number];
export default function PdfDiagnosticsPanel({ filename, diagnostics, formFieldCount, metadataFields, attachmentCount, pages, firstPageOnly = false }: {
  filename: string;
  diagnostics: PdfDiagnostics;
  formFieldCount: number | null;
  metadataFields: string[] | null;
  attachmentCount: number | null;
  pages: Dimensions[];
  firstPageOnly?: boolean;
}) {
  const id = useId();
  const [pageNumber, setPageNumber] = useState(1);
  const page = pages[Math.min(Math.max(pageNumber, 1), pages.length) - 1];
  const dimension = (value: number) => Number.isFinite(value) ? value.toLocaleString(undefined, { maximumFractionDigits: 2 }) : 'Unknown';
  return <details className="pdf-diagnostics" data-testid="pdf-diagnostics" aria-label={`Diagnostics for ${filename}`}>
    <summary>Document diagnostics · {diagnostics.complete ? 'inspection completed' : 'inspection incomplete'}</summary>
    <dl>
      <div><dt>Encryption</dt><dd>{diagnostics.encrypted ? 'Encrypted · read-only' : 'Not encrypted'}{diagnostics.encrypted ? ` · Security handler: ${diagnostics.securityHandler ?? 'not available'}. Cipher details are not available.` : ''}</dd></div>
      <div><dt>Forms</dt><dd>{diagnostics.formsInspected && formFieldCount !== null ? `${formFieldCount} AcroForm fields` : 'AcroForm fields not fully inspected'} · XFA: {diagnostics.hasXfa === null ? 'not inspected' : diagnostics.hasXfa ? 'present' : 'not detected'}</dd></div>
      <div><dt>Metadata</dt><dd>{diagnostics.metadataInspected && metadataFields !== null ? metadataFields.length ? `Info fields: ${metadataFields.join(', ')}` : 'No common Info metadata detected' : 'Info metadata not fully inspected'} · XMP: {diagnostics.hasXmp === null ? 'not inspected' : diagnostics.hasXmp ? 'present' : 'not detected'}</dd></div>
      <div><dt>Attachments</dt><dd>{diagnostics.attachmentsInspected && attachmentCount !== null ? `${attachmentCount} embedded files` : 'Attachment inventory not fully inspected'}</dd></div>
      <div><dt>Active-content indicators</dt><dd>{diagnostics.indicators.length ? diagnostics.indicators.join(', ') : 'No indicators detected in inspected structures'}</dd></div>
      <div><dt>Structural inspection</dt><dd>{diagnostics.complete ? 'No structural warnings detected in scanned objects' : 'Incomplete; review the warnings below'}</dd></div>
    </dl>
    <p className="help-text">Stored PDF scripts and actions are never executed by this workstation. Indicators are observations, not proof that a document is safe. {diagnostics.encrypted ? 'Only reader-provided information is available for protected sources.' : `Post-parse inspection is limited to ${diagnostics.objectLimit.toLocaleString('en-US')} objects; parsing itself is not a complete validity check.`}</p>
    {diagnostics.warnings.length ? <ul aria-label="Diagnostic warnings">{diagnostics.warnings.map((warning, i) => <li key={i}>{warning}</li>)}</ul> : null}
    {!diagnostics.complete && !diagnostics.encrypted ? <p className="help-text">This source stays available for viewing. Export is blocked while required inspection is incomplete; remove the source to export the remaining readable files.</p> : null}
    {pages.length > 1 ? <div className="field"><label htmlFor={id}>Diagnostic page for {filename}</label><input id={id} type="number" min="1" max={pages.length} value={Math.min(pageNumber, pages.length)} onChange={(event) => { const next = Number(event.target.value); setPageNumber(Number.isFinite(next) ? Math.min(Math.max(Math.trunc(next), 1), pages.length) : 1); }} /></div> : null}
    {page ? <p className="help-text">{firstPageOnly ? 'First page' : `Page ${page.page}`} displayed size: {dimension(page.displayWidth)} × {dimension(page.displayHeight)} pt at 72 dpi · UserUnit {dimension(page.userUnit)}. Displayed dimensions include the visible page box and rotation; editing boxes retain their raw PDF units.{firstPageOnly ? ' Other page dimensions have not been inspected.' : ''}</p> : <p className="help-text">Page dimensions not inspected.</p>}
  </details>;
}

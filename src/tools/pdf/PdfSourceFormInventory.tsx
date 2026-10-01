import { useState } from 'react';
import {
  inspectPdfFormFields,
  type PdfFormFieldInspection,
  type PdfFormFieldInspectionValue,
} from './pdf-form-inventory';

type Props = {
  file: File;
  fieldCount: number;
};

function valueLabel(value: PdfFormFieldInspectionValue | undefined): string {
  if (value === undefined) return 'not set';
  if (typeof value === 'boolean') return value ? 'checked' : 'unchecked';
  if (Array.isArray(value)) return value.length ? value.join(', ') : 'none selected';
  return value || 'empty string';
}

function typeLabel(type: PdfFormFieldInspection['type']): string {
  if (type === 'option-list') return 'option list';
  return type;
}

export default function PdfSourceFormInventory({ file, fieldCount }: Props) {
  const [fields, setFields] = useState<PdfFormFieldInspection[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (!fieldCount) return null;

  async function inspect() {
    setBusy(true);
    setError('');
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      setFields(await inspectPdfFormFields(bytes));
    } catch (reason) {
      setFields(null);
      setError(reason instanceof Error ? reason.message : 'Could not inspect form fields.');
    } finally {
      setBusy(false);
    }
  }

  return <section style={{ marginTop: 12 }} aria-label={`Existing form fields in ${file.name}`}>
    <div className="button-row" style={{ marginTop: 0 }}>
      <button className="action-button secondary" type="button" disabled={busy} onClick={() => void inspect()}>
        {busy ? 'Inspecting fields…' : fields ? 'Refresh field inventory' : `Inspect ${fieldCount} existing form field${fieldCount === 1 ? '' : 's'}`}
      </button>
    </div>
    <p className="help-text">Inspection is local and read-only. It is loaded on demand so large source PDFs are not parsed a second time unless you ask for field detail.</p>
    {error ? <p className="help-text" role="alert">Field inventory failed: {error}</p> : null}
    {fields ? <div data-testid="pdf-source-form-inventory">
      <strong>Existing source fields</strong>
      <div style={{ overflowX: 'auto', marginTop: 8 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr><th scope="col">Name</th><th scope="col">Type</th><th scope="col">Page</th><th scope="col">Flags</th><th scope="col">Current</th><th scope="col">Reset/default</th></tr></thead>
          <tbody>{fields.map((field) => <tr key={`${field.name}:${field.pages.join(',')}`} data-testid="pdf-source-form-field">
            <th scope="row" style={{ textAlign: 'left', overflowWrap: 'anywhere' }}>{field.name}</th>
            <td>{typeLabel(field.type)}</td>
            <td>{field.pages.length ? field.pages.join(', ') : 'unknown'}</td>
            <td>{[field.required ? 'required' : '', field.readOnly ? 'read-only' : ''].filter(Boolean).join(', ') || 'none'}</td>
            <td style={{ overflowWrap: 'anywhere' }}>{valueLabel(field.value)}</td>
            <td style={{ overflowWrap: 'anywhere' }}>{valueLabel(field.defaultValue)}</td>
          </tr>)}</tbody>
        </table>
      </div>
    </div> : null}
  </section>;
}

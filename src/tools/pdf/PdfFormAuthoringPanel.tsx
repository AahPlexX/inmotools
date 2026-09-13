import { useEffect, useMemo, useState } from 'react';
import type { PdfFormFieldDefinition } from './pdf-engine';
import {
  EMPTY_FORM_DRAFT,
  formFieldFromDraft,
  formFieldSummary,
  type PdfFormAuthoringDraft,
  type PdfFormAuthoringType,
  type PdfOutputPageSize,
} from './pdf-form-stage';

type Props = {
  pages: PdfOutputPageSize[];
  staged: PdfFormFieldDefinition[];
  onStage: (field: PdfFormFieldDefinition) => void;
  onRemove: (index: number) => void;
};

const TYPE_OPTIONS: Array<{ value: PdfFormAuthoringType; label: string }> = [
  { value: 'text', label: 'Text field' },
  { value: 'checkbox', label: 'Checkbox' },
  { value: 'radio', label: 'Radio group' },
  { value: 'dropdown', label: 'Dropdown' },
  { value: 'option-list', label: 'Option list' },
];

function numberValue(value: string): number {
  return value === '' ? 0 : Number(value);
}

export default function PdfFormAuthoringPanel({ pages, staged, onStage, onRemove }: Props) {
  const [draft, setDraft] = useState<PdfFormAuthoringDraft>(EMPTY_FORM_DRAFT);
  const [draftError, setDraftError] = useState('');
  const selectedPage = pages[draft.page - 1];

  useEffect(() => {
    if (!pages.length) return;
    if (draft.page > pages.length) setDraft((current) => ({ ...current, page: pages.length }));
  }, [draft.page, pages.length]);

  const existingNames = useMemo(() => new Set(staged.map((field) => field.name)), [staged]);

  function update<Key extends keyof PdfFormAuthoringDraft>(key: Key, value: PdfFormAuthoringDraft[Key]) {
    setDraft((current) => ({ ...current, [key]: value }));
    setDraftError('');
  }

  function stage() {
    try {
      const field = formFieldFromDraft(draft);
      if (existingNames.has(field.name)) throw new Error(`A staged field named ${field.name} already exists.`);
      onStage(field);
      setDraft((current) => ({
        ...EMPTY_FORM_DRAFT,
        type: current.type,
        page: Math.min(current.page, Math.max(1, pages.length)),
      }));
      setDraftError('');
    } catch (error) {
      setDraftError(error instanceof Error ? error.message : 'Could not stage form field.');
    }
  }

  const needsOptions = draft.type === 'dropdown' || draft.type === 'radio' || draft.type === 'option-list';
  const selectedHelp = draft.type === 'option-list'
    ? 'Enter one selected value per line. Multiple values require Multiselect.'
    : 'Optional. Must exactly match one declared option.';

  return <section className="notice" style={{ marginTop: 18 }} aria-labelledby="pdf-form-authoring-title">
    <h3 id="pdf-form-authoring-title" style={{ margin: 0 }}>Create editable form fields</h3>
    <p className="help-text">Stage new AcroForm fields on final output pages. Coordinates use PDF points from the page bottom-left. This coordinate-first foundation is deterministic today; visual canvas placement arrives with the renderer milestone.</p>

    <div className="workspace-grid three" style={{ marginTop: 14 }}>
      <div className="field"><label htmlFor="pdf-form-type">Field type</label><select id="pdf-form-type" value={draft.type} onChange={(event) => update('type', event.target.value as PdfFormAuthoringType)}>{TYPE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></div>
      <div className="field"><label htmlFor="pdf-form-name">Field name</label><input id="pdf-form-name" value={draft.name} onChange={(event) => update('name', event.target.value)} placeholder="client.name" autoComplete="off" /></div>
      <div className="field"><label htmlFor="pdf-form-page">Output page</label><select id="pdf-form-page" value={Math.min(draft.page, Math.max(1, pages.length))} disabled={!pages.length} onChange={(event) => update('page', Number(event.target.value))}>{pages.map((page) => <option key={page.page} value={page.page}>{page.page} — {page.label}</option>)}</select><small>{selectedPage ? `${selectedPage.width.toFixed(2)} × ${selectedPage.height.toFixed(2)} pt` : 'Add output pages first.'}</small></div>
      <div className="field"><label htmlFor="pdf-form-x">X</label><input id="pdf-form-x" type="number" min="0" step="any" value={draft.x} onChange={(event) => update('x', numberValue(event.target.value))} /></div>
      <div className="field"><label htmlFor="pdf-form-y">Y</label><input id="pdf-form-y" type="number" min="0" step="any" value={draft.y} onChange={(event) => update('y', numberValue(event.target.value))} /></div>
      <div className="field"><label htmlFor="pdf-form-width">Width</label><input id="pdf-form-width" type="number" min="0.01" step="any" value={draft.width} onChange={(event) => update('width', numberValue(event.target.value))} /></div>
      <div className="field"><label htmlFor="pdf-form-height">Height</label><input id="pdf-form-height" type="number" min="0.01" step="any" value={draft.height} onChange={(event) => update('height', numberValue(event.target.value))} /></div>
    </div>

    <div className="button-row" style={{ marginTop: 12 }}>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}><input type="checkbox" checked={draft.required} onChange={(event) => update('required', event.target.checked)} /> Required</label>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}><input type="checkbox" checked={draft.readOnly} onChange={(event) => update('readOnly', event.target.checked)} /> Read-only</label>
    </div>

    {draft.type === 'text' ? <div className="workspace-grid" style={{ marginTop: 12 }}>
      <div className="field"><label htmlFor="pdf-form-value">Initial text</label><input id="pdf-form-value" value={draft.value} onChange={(event) => update('value', event.target.value)} autoComplete="off" /></div>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}><input type="checkbox" checked={draft.multiline} onChange={(event) => update('multiline', event.target.checked)} /> Multiline</label>
    </div> : null}

    {draft.type === 'checkbox' ? <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12 }}><input type="checkbox" checked={draft.checked} onChange={(event) => update('checked', event.target.checked)} /> Checked by default</label> : null}

    {needsOptions ? <div className="workspace-grid" style={{ marginTop: 12 }}>
      <div className="field"><label htmlFor="pdf-form-options">Options</label><textarea id="pdf-form-options" rows={4} value={draft.optionsText} onChange={(event) => update('optionsText', event.target.value)} /><small>One nonblank, unique option per line.</small></div>
      <div className="field"><label htmlFor="pdf-form-selected">Selected value{draft.type === 'option-list' ? 's' : ''}</label><textarea id="pdf-form-selected" rows={4} value={draft.selectedText} onChange={(event) => update('selectedText', event.target.value)} /><small>{selectedHelp}</small></div>
    </div> : null}

    {draft.type === 'option-list' ? <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12 }}><input type="checkbox" checked={draft.multiselect} onChange={(event) => update('multiselect', event.target.checked)} /> Multiselect</label> : null}

    {draft.type === 'radio' ? <div className="field" style={{ marginTop: 12, maxWidth: 320 }}><label htmlFor="pdf-radio-gap">Vertical option spacing</label><input id="pdf-radio-gap" type="number" min="0.01" step="any" value={draft.radioGap} onChange={(event) => update('radioGap', numberValue(event.target.value))} /><small>Each radio widget uses the width/height above and is stacked downward from Y by this many points.</small></div> : null}

    <div className="button-row"><button className="action-button secondary" type="button" disabled={!pages.length} onClick={stage}>Stage form field</button></div>
    {draftError ? <p className="help-text" role="alert">{draftError}</p> : null}

    {staged.length ? <div style={{ marginTop: 16 }}>
      <strong>Staged editable fields</strong>
      <ol style={{ margin: '8px 0 0', paddingInlineStart: 24 }}>
        {staged.map((field, index) => <li key={`${field.name}-${index}`} data-testid="pdf-staged-form-field" style={{ marginBottom: 8 }}><strong style={{ overflowWrap: 'anywhere' }}>{field.name}</strong> · {formFieldSummary(field)}{field.required ? ' · required' : ''}{field.readOnly ? ' · read-only' : ''} <button className="action-button secondary" type="button" onClick={() => onRemove(index)}>Remove</button></li>)}
      </ol>
    </div> : <p className="help-text">No new editable form fields are staged for output.</p>}
  </section>;
}

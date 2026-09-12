import { useRef, useState } from 'react';
import { setExportMetadata } from './metadata-engine';
import type { CrystalDocument } from './crystal-types';

interface CrystalMetadataDialogProps {
  readonly document: CrystalDocument;
  readonly onSave: (document: CrystalDocument) => void;
}

interface CustomTagDraft {
  readonly id: number;
  readonly tag: string;
  readonly value: string;
}

const CIF_TAG_PATTERN = /^_[^\s#'";]+$/u;

const optionalValue = (value: string): string | undefined => value === '' ? undefined : value;

export default function CrystalMetadataDialog({ document, onSave }: CrystalMetadataDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const nextTagId = useRef(1);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [creator, setCreator] = useState('');
  const [provenanceNotes, setProvenanceNotes] = useState('');
  const [customTags, setCustomTags] = useState<readonly CustomTagDraft[]>([]);
  const [error, setError] = useState('');

  const resetDraft = (): void => {
    setTitle(document.metadata.title ?? '');
    setDescription(document.metadata.description ?? '');
    setCreator(document.metadata.creator ?? '');
    setProvenanceNotes(document.metadata.provenanceNotes ?? '');
    setCustomTags(Object.entries(document.metadata.customCifTags ?? {}).map(([tag, value]) => ({
      id: nextTagId.current++,
      tag,
      value,
    })));
    setError('');
  };

  const open = (): void => {
    resetDraft();
    dialogRef.current?.showModal();
  };

  const save = (): void => {
    const normalized = new Set<string>();
    const customCifTags: Record<string, string> = Object.create(null) as Record<string, string>;

    for (const row of customTags) {
      const tag = row.tag.trim();
      if (!CIF_TAG_PATTERN.test(tag)) {
        setError(`Custom CIF data name “${row.tag || '(blank)'}” must begin with _ and contain no whitespace or reserved delimiters.`);
        return;
      }
      const key = tag.toLowerCase().replaceAll('.', '_');
      if (normalized.has(key)) {
        setError(`Custom CIF data name “${tag}” is duplicated.`);
        return;
      }
      normalized.add(key);
      customCifTags[tag] = row.value;
    }

    const next = setExportMetadata(document, {
      title: optionalValue(title),
      description: optionalValue(description),
      creator: optionalValue(creator),
      provenanceNotes: optionalValue(provenanceNotes),
      customCifTags,
    });
    onSave(next);
    dialogRef.current?.close();
  };

  const cifSummary = document.cif
    ? document.cif.blocks.map((block) => {
        const scalars = block.entries.filter((entry) => entry.kind === 'scalar').length;
        const loops = block.entries.filter((entry) => entry.kind === 'loop').length;
        const tags = block.entries.reduce((total, entry) => total + (entry.kind === 'scalar' ? 1 : entry.tags.length), 0);
        return { name: block.name, scalars, loops, tags };
      })
    : [];

  return (
    <>
      <button type="button" onClick={open}>Data &amp; metadata</button>
      <dialog ref={dialogRef} className="crystal-dialog" aria-labelledby="crystal-metadata-dialog-title">
        <div className="crystal-dialog__header">
          <div>
            <p className="eyebrow">Document data</p>
            <h2 id="crystal-metadata-dialog-title">Data &amp; metadata</h2>
            <p>Review publication fields and source CIF data without changing the atomic model.</p>
          </div>
          <button type="button" onClick={() => dialogRef.current?.close()}>Close</button>
        </div>

        <div className="crystal-dialog__body">
          <section className="crystal-dialog__section" aria-labelledby="crystal-metadata-fields-heading">
            <div>
              <h3 id="crystal-metadata-fields-heading">Document metadata</h3>
              <p>These fields travel with project files and are written to compatible exports.</p>
            </div>
            <div className="crystal-metadata-grid">
              <label>
                Title
                <input value={title} onChange={(event) => setTitle(event.target.value)} />
              </label>
              <label>
                Creator
                <input value={creator} onChange={(event) => setCreator(event.target.value)} />
              </label>
              <label className="crystal-dialog__wide-field">
                Description
                <textarea rows={3} value={description} onChange={(event) => setDescription(event.target.value)} />
              </label>
              <label className="crystal-dialog__wide-field">
                Provenance notes
                <textarea rows={3} value={provenanceNotes} onChange={(event) => setProvenanceNotes(event.target.value)} />
              </label>
            </div>
          </section>

          <section className="crystal-dialog__section" aria-labelledby="crystal-custom-cif-heading">
            <div className="crystal-dialog__section-heading">
              <div>
                <h3 id="crystal-custom-cif-heading">Custom CIF scalars</h3>
                <p>Add explicit data-name/value pairs for CIF export. Imported unknown CIF fields remain preserved separately.</p>
              </div>
              <button
                type="button"
                onClick={() => setCustomTags((current) => [...current, { id: nextTagId.current++, tag: '', value: '' }])}
              >
                Add CIF field
              </button>
            </div>
            {customTags.length === 0 ? (
              <p className="crystal-dialog__muted">No custom CIF scalars have been added.</p>
            ) : (
              <div className="crystal-custom-tags">
                {customTags.map((row) => (
                  <div className="crystal-custom-tag-row" key={row.id}>
                    <label>
                      Data name
                      <input
                        value={row.tag}
                        placeholder="_custom_data_name"
                        onChange={(event) => setCustomTags((current) => current.map((candidate) =>
                          candidate.id === row.id ? { ...candidate, tag: event.target.value } : candidate))}
                      />
                    </label>
                    <label>
                      Value
                      <input
                        value={row.value}
                        onChange={(event) => setCustomTags((current) => current.map((candidate) =>
                          candidate.id === row.id ? { ...candidate, value: event.target.value } : candidate))}
                      />
                    </label>
                    <button type="button" onClick={() => setCustomTags((current) => current.filter((candidate) => candidate.id !== row.id))}>
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="crystal-dialog__section" aria-labelledby="crystal-source-cif-heading">
            <div>
              <h3 id="crystal-source-cif-heading">Imported CIF preservation</h3>
              <p>Unknown source scalars and loop columns are kept when exporting CIF unless you explicitly replace the source metadata.</p>
            </div>
            {cifSummary.length === 0 ? (
              <p className="crystal-dialog__muted">This structure was not imported from CIF, so CIF export will generate structural data from the current document.</p>
            ) : (
              <ul className="crystal-source-cif-list">
                {cifSummary.map((block) => (
                  <li key={block.name}>
                    <strong>data_{block.name}</strong>
                    <span>{block.scalars} scalars · {block.loops} loops · {block.tags} data names</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {error ? <p className="crystal-editor-error" role="alert">{error}</p> : null}
        </div>

        <div className="crystal-dialog__footer">
          <button type="button" onClick={() => dialogRef.current?.close()}>Cancel</button>
          <button type="button" onClick={save}>Save metadata</button>
        </div>
      </dialog>
    </>
  );
}

import type { PdfAttachmentInventory } from './pdf-engine';

export type PdfStagedAttachment = {
  id: string;
  data: File | Uint8Array;
  sourceLabel: string;
  name: string;
  mimeType: string;
  description: string;
  creationDate: string;
  modificationDate: string;
  size: number;
};

export type PdfAttachmentSource = {
  id: string;
  fileName: string;
  attachments: PdfAttachmentInventory[];
  warnings: string[];
};

type Props = {
  sources: PdfAttachmentSource[];
  staged: PdfStagedAttachment[];
  onAddFiles: (files: File[]) => void;
  onUpdate: (id: string, patch: Partial<PdfStagedAttachment>) => void;
  onRemove: (id: string) => void;
  onDownloadSource: (sourceId: string, attachmentName: string) => void;
  onIncludeSource: (sourceId: string, attachmentName: string) => void;
};

const bytesLabel = (bytes: number | undefined) => {
  if (bytes === undefined) return 'size not declared';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
};

export default function PdfAttachmentPanel({ sources, staged, onAddFiles, onUpdate, onRemove, onDownloadSource, onIncludeSource }: Props) {
  const sourceAttachmentCount = sources.reduce((sum, source) => sum + source.attachments.length, 0);
  return <section className="notice" style={{ marginTop: 18 }} aria-labelledby="pdf-attachments-title">
    <h3 id="pdf-attachments-title" style={{ margin: 0 }}>Embedded files &amp; attachments</h3>
    <p className="help-text">Inspect and extract embedded source files locally. Source attachments are intentionally <strong>not</strong> copied into the rebuilt PDF unless you explicitly include one or add a new output attachment.</p>

    <div className="metric-row" style={{ marginTop: 12 }}>
      <div className="metric"><span>Source attachments</span><strong>{sourceAttachmentCount}</strong></div>
      <div className="metric"><span>Staged for output</span><strong>{staged.length}</strong></div>
    </div>

    {sources.map((source) => source.attachments.length || source.warnings.length ? <div className="notice" key={source.id} style={{ marginTop: 12 }}>
      <strong style={{ overflowWrap: 'anywhere' }}>{source.fileName}</strong>
      {source.attachments.length ? <ul style={{ margin: '8px 0 0', paddingInlineStart: 24 }}>
        {source.attachments.map((attachment, index) => <li key={`${attachment.name}-${index}`} data-testid="pdf-source-attachment" style={{ marginBottom: 10 }}>
          <strong style={{ overflowWrap: 'anywhere' }}>{attachment.name}</strong> · {attachment.mimeType ?? 'MIME type not declared'} · {bytesLabel(attachment.size)}
          {attachment.description ? <div className="help-text">{attachment.description}</div> : null}
          <div className="button-row" style={{ marginTop: 6 }}>
            <button className="action-button secondary" type="button" onClick={() => onDownloadSource(source.id, attachment.name)}>Download {attachment.name}</button>
            <button className="action-button secondary" type="button" onClick={() => onIncludeSource(source.id, attachment.name)}>Include {attachment.name} in output</button>
          </div>
        </li>)}
      </ul> : <p className="help-text">No extractable embedded files were inventoried.</p>}
      {source.warnings.map((warning, index) => <p className="help-text" role="alert" key={`${source.id}-warning-${index}`}>{warning}</p>)}
    </div> : null)}

    <div className="field" style={{ marginTop: 16 }}>
      <label htmlFor="pdf-output-attachments">Add output attachments</label>
      <input id="pdf-output-attachments" type="file" multiple onChange={(event) => {
        const files = Array.from(event.target.files ?? []);
        if (files.length) onAddFiles(files);
        event.target.value = '';
      }} />
      <small>Files stay in this browser session. Their current file name and MIME type are staged below and can be edited before export.</small>
    </div>

    {staged.map((attachment) => <div className="notice" key={attachment.id} style={{ marginTop: 12 }} data-testid="pdf-staged-attachment">
      <strong style={{ overflowWrap: 'anywhere' }}>{attachment.sourceLabel}</strong>
      <div className="help-text">{bytesLabel(attachment.size)} staged locally</div>
      <div className="workspace-grid three" style={{ marginTop: 10 }}>
        <div className="field"><label htmlFor={`pdf-attachment-name-${attachment.id}`}>Attachment filename for {attachment.sourceLabel}</label><input id={`pdf-attachment-name-${attachment.id}`} value={attachment.name} onChange={(event) => onUpdate(attachment.id, { name: event.target.value })} autoComplete="off" /></div>
        <div className="field"><label htmlFor={`pdf-attachment-mime-${attachment.id}`}>Attachment MIME type for {attachment.sourceLabel}</label><input id={`pdf-attachment-mime-${attachment.id}`} value={attachment.mimeType} onChange={(event) => onUpdate(attachment.id, { mimeType: event.target.value })} placeholder="application/octet-stream" autoComplete="off" /></div>
        <div className="field"><label htmlFor={`pdf-attachment-description-${attachment.id}`}>Attachment description for {attachment.sourceLabel}</label><input id={`pdf-attachment-description-${attachment.id}`} value={attachment.description} onChange={(event) => onUpdate(attachment.id, { description: event.target.value })} autoComplete="off" /></div>
        <div className="field"><label htmlFor={`pdf-attachment-created-${attachment.id}`}>Attachment creation date/time for {attachment.sourceLabel} (UTC)</label><input id={`pdf-attachment-created-${attachment.id}`} type="datetime-local" value={attachment.creationDate} onChange={(event) => onUpdate(attachment.id, { creationDate: event.target.value })} /></div>
        <div className="field"><label htmlFor={`pdf-attachment-modified-${attachment.id}`}>Attachment modification date/time for {attachment.sourceLabel} (UTC)</label><input id={`pdf-attachment-modified-${attachment.id}`} type="datetime-local" value={attachment.modificationDate} onChange={(event) => onUpdate(attachment.id, { modificationDate: event.target.value })} /></div>
      </div>
      <div className="button-row"><button className="action-button secondary" type="button" onClick={() => onRemove(attachment.id)}>Remove staged attachment</button></div>
    </div>)}
  </section>;
}

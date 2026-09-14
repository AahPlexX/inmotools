import type { PdfExportSummaryEntry, PdfExportImpact } from './pdf-export-summary';

type Props = {
  entries: PdfExportSummaryEntry[];
};

const LABELS: Record<PdfExportImpact, string> = {
  'destructive-output': 'Destructive in this output',
  'structural-output': 'Structural output change',
  'reversible-staging': 'Reversible before export',
};

export default function PdfExportSummaryPanel({ entries }: Props) {
  return <section className="notice" style={{ marginTop: 18 }} aria-labelledby="pdf-export-impact-title" data-testid="pdf-export-impact-summary">
    <h3 id="pdf-export-impact-title" style={{ margin: 0 }}>Export change summary</h3>
    <p className="help-text">This describes what the new output will contain before bytes are generated. “Destructive” means data/editability is omitted from this output; your original local source files are never overwritten.</p>
    <div style={{ display: 'grid', gap: 10, marginTop: 12 }}>
      {entries.map((entry, index) => <div className="metric" key={`${entry.impact}-${entry.label}-${index}`}>
        <span>{LABELS[entry.impact]}</span>
        <strong>{entry.label}</strong>
        <small>{entry.detail}</small>
      </div>)}
    </div>
  </section>;
}

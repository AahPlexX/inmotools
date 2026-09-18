// Feature 36 — Multi-Format Audit Report Exporter (PDF, JSON, Markdown, CSV).
// Feature 37's metadata (auditor/organization/notes/timestamp) is threaded
// through every format so all four exports stay consistent with what the
// user edited before exporting.

import Papa from 'papaparse';
import { jsPDF } from 'jspdf';
import type { Finding } from './site-intel-types';
import type { Scorecard } from './scoring-engine';

export interface ReportMetadata {
  auditorName: string;
  organization: string;
  notes: string;
  auditTimestamp: number;
}

export interface ExportBundle {
  url: string;
  metadata: ReportMetadata;
  scorecard: Scorecard;
  findingsByVector: Record<string, Finding[]>;
}

export function exportJson(bundle: ExportBundle): string {
  return JSON.stringify(bundle, null, 2);
}

export function exportMarkdown(bundle: ExportBundle): string {
  const lines: string[] = [];
  lines.push(`# Site Intelligence Audit — ${bundle.url}`);
  lines.push('');
  lines.push(`- Auditor: ${bundle.metadata.auditorName || '—'}`);
  lines.push(`- Organization: ${bundle.metadata.organization || '—'}`);
  lines.push(`- Audit timestamp: ${new Date(bundle.metadata.auditTimestamp).toISOString()}`);
  lines.push(`- Overall score: **${bundle.scorecard.overallScore} (${bundle.scorecard.overallGrade})**`);
  lines.push('');
  if (bundle.metadata.notes) { lines.push('## Notes', '', bundle.metadata.notes, ''); }
  lines.push('## Scorecard');
  lines.push('');
  lines.push('| Vector | Score | Grade |');
  lines.push('| --- | --- | --- |');
  for (const v of bundle.scorecard.vectors) lines.push(`| ${v.label} | ${v.score} | ${v.grade} |`);
  lines.push('');
  for (const v of bundle.scorecard.vectors) {
    lines.push(`## ${v.label}`);
    lines.push('');
    if (v.findings.length === 0) { lines.push('_No findings recorded for this vector._', ''); continue; }
    for (const f of v.findings) lines.push(`- **[${f.severity.toUpperCase()}] ${f.label}** — ${f.detail}`);
    lines.push('');
  }
  return lines.join('\n');
}

export function exportCsv(bundle: ExportBundle): string {
  const rows: Array<Record<string, string>> = [];
  for (const v of bundle.scorecard.vectors) {
    for (const f of v.findings) {
      rows.push({ vector: v.label, severity: f.severity, label: f.label, detail: f.detail, id: f.id });
    }
  }
  return Papa.unparse(rows, { header: true, newline: '\n', escapeFormulae: true });
}

export function exportPdf(bundle: ExportBundle): Blob {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'letter' });
  const pageWidth = doc.internal.pageSize.getWidth();
  let y = 56;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.text('Site Intelligence Audit', pageWidth / 2, y, { align: 'center' });
  y += 26;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(12);
  doc.text(bundle.url, pageWidth / 2, y, { align: 'center' });
  y += 24;

  doc.setFontSize(10);
  doc.text(`Auditor: ${bundle.metadata.auditorName || '—'}    Organization: ${bundle.metadata.organization || '—'}`, 56, y);
  y += 16;
  doc.text(`Generated: ${new Date(bundle.metadata.auditTimestamp).toISOString()}`, 56, y);
  y += 28;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text(`Overall: ${bundle.scorecard.overallScore} (${bundle.scorecard.overallGrade})`, 56, y);
  y += 24;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  for (const v of bundle.scorecard.vectors) {
    doc.text(`${v.label}: ${v.score} (${v.grade})`, 56, y);
    y += 16;
  }
  y += 12;

  if (bundle.metadata.notes) {
    doc.setFont('helvetica', 'bold');
    doc.text('Notes', 56, y);
    y += 16;
    doc.setFont('helvetica', 'normal');
    const noteLines = doc.splitTextToSize(bundle.metadata.notes, pageWidth - 112);
    doc.text(noteLines, 56, y);
    y += noteLines.length * 14 + 12;
  }

  for (const v of bundle.scorecard.vectors) {
    if (y > 700) { doc.addPage(); y = 56; }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.text(v.label, 56, y);
    y += 18;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    for (const f of v.findings) {
      if (y > 730) { doc.addPage(); y = 56; }
      const wrapped = doc.splitTextToSize(`[${f.severity.toUpperCase()}] ${f.label} — ${f.detail}`, pageWidth - 112);
      doc.text(wrapped, 64, y);
      y += wrapped.length * 12 + 6;
    }
    y += 10;
  }

  return doc.output('blob');
}

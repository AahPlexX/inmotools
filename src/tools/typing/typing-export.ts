// Export helpers for the typing workstation: CSV, JSON, PDF certificate, and
// tag/metadata editing at export time. Everything runs locally.

import Papa from 'papaparse';
import { jsPDF } from 'jspdf';
import type { StoredTest } from './typing-storage';
import type { KeystrokeEvent } from './typing-engine';

export interface ExportMetadata {
  typistName: string;
  organization: string;
  certifiedBy: string;
  tags: string[];
  notes: string;
  includeKeystrokes: boolean;
}

export const EMPTY_EXPORT_METADATA: ExportMetadata = {
  typistName: '',
  organization: '',
  certifiedBy: '',
  tags: [],
  notes: '',
  includeKeystrokes: false,
};

// --------------------------------------------------------------------
// CSV
// --------------------------------------------------------------------
export function testsToCsv(tests: StoredTest[], meta?: ExportMetadata): string {
  const rows = tests.map((t) => ({
    saved_at_iso: new Date(t.savedAt).toISOString(),
    mode: t.mode,
    duration_mode: t.durationMode,
    duration_value: t.durationValue,
    language: t.language,
    layout: t.layout,
    finish_reason: t.finishReason,
    net_wpm: t.netWpm,
    gross_wpm: t.grossWpm,
    raw_cpm: t.rawCpm,
    accuracy_pct: t.accuracy,
    consistency_pct: t.consistency,
    elapsed_ms: t.elapsedMs,
    correct_chars: t.correctChars,
    incorrect_chars: t.incorrectChars,
    missed_chars: t.missedChars,
    extra_chars: t.extraChars,
    tags: t.tags.join('|'),
    notes: t.notes,
    ...(meta ? {
      export_typist_name: meta.typistName,
      export_organization: meta.organization,
      export_certified_by: meta.certifiedBy,
      export_tags: meta.tags.join('|'),
      export_notes: meta.notes,
    } : {}),
  }));
  return Papa.unparse(rows, { header: true, newline: '\n' });
}

export function keystrokesToCsv(keystrokes: KeystrokeEvent[]): string {
  return Papa.unparse(
    keystrokes.map((k, i) => ({
      seq: i,
      time_ms: k.t,
      key: k.key,
      code: k.code,
      expected: k.expected,
      index: k.index,
      correct: k.correct ? 1 : 0,
    })),
    { header: true, newline: '\n' },
  );
}

// --------------------------------------------------------------------
// JSON
// --------------------------------------------------------------------
export function testToJson(test: StoredTest, meta: ExportMetadata): string {
  const merged = { ...test };
  if (!meta.includeKeystrokes) delete merged.keystrokes;
  if (meta.tags.length > 0) merged.tags = Array.from(new Set([...(merged.tags ?? []), ...meta.tags]));
  if (meta.notes) merged.notes = meta.notes ? `${merged.notes ? merged.notes + '\n' : ''}${meta.notes}` : merged.notes;
  const envelope = {
    tool: 'inmotools-typing-workstation',
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    typistName: meta.typistName,
    organization: meta.organization,
    certifiedBy: meta.certifiedBy,
    test: merged,
  };
  return JSON.stringify(envelope, null, 2);
}

export function testsToJson(tests: StoredTest[], meta: ExportMetadata): string {
  const envelope = {
    tool: 'inmotools-typing-workstation',
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    typistName: meta.typistName,
    organization: meta.organization,
    certifiedBy: meta.certifiedBy,
    globalTags: meta.tags,
    notes: meta.notes,
    tests: tests.map((t) => {
      const merged = { ...t };
      if (!meta.includeKeystrokes) delete merged.keystrokes;
      return merged;
    }),
  };
  return JSON.stringify(envelope, null, 2);
}

// --------------------------------------------------------------------
// PDF certificate
// --------------------------------------------------------------------
export function certificatePdf(test: StoredTest, meta: ExportMetadata): Blob {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'letter' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  // Border
  doc.setDrawColor(11, 18, 32);
  doc.setLineWidth(4);
  doc.rect(24, 24, pageWidth - 48, pageHeight - 48);
  doc.setLineWidth(1);
  doc.rect(36, 36, pageWidth - 72, pageHeight - 72);

  // Header
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(30);
  doc.setTextColor(11, 18, 32);
  doc.text('Certificate of Typing Proficiency', pageWidth / 2, 110, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(14);
  doc.text('Issued by the InMo Tools Typing Workstation', pageWidth / 2, 138, { align: 'center' });

  // Awardee
  doc.setFontSize(12);
  doc.text('This certificate is awarded to', pageWidth / 2, 190, { align: 'center' });
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(28);
  const name = meta.typistName || 'Anonymous Typist';
  doc.text(name, pageWidth / 2, 232, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(12);
  const introLines = [
    `for successfully completing a ${test.durationMode} test on ${new Date(test.savedAt).toLocaleString()}`,
    `Mode: ${test.mode} · Language: ${test.language} · Layout: ${test.layout}`,
  ];
  doc.text(introLines, pageWidth / 2, 262, { align: 'center' });

  // Metrics box
  const boxTop = 300;
  const cellWidth = (pageWidth - 200) / 4;
  const metrics: [string, string][] = [
    ['Net WPM', String(test.netWpm)],
    ['Accuracy', `${test.accuracy}%`],
    ['Consistency', `${test.consistency}%`],
    ['Errors', String(test.incorrectChars)],
  ];
  metrics.forEach(([label, value], i) => {
    const x = 100 + i * cellWidth;
    doc.setDrawColor(150);
    doc.setFillColor(247, 248, 250);
    doc.rect(x, boxTop, cellWidth - 12, 90, 'F');
    doc.setFontSize(9);
    doc.setTextColor(80);
    doc.text(label.toUpperCase(), x + 12, boxTop + 20);
    doc.setFontSize(28);
    doc.setTextColor(11, 18, 32);
    doc.setFont('helvetica', 'bold');
    doc.text(value, x + 12, boxTop + 60);
    doc.setFont('helvetica', 'normal');
  });

  // Footer
  doc.setFontSize(11);
  doc.setTextColor(60);
  const tags = meta.tags.length > 0 ? `Tags: ${meta.tags.join(', ')}` : '';
  if (tags) doc.text(tags, pageWidth / 2, 430, { align: 'center' });
  if (meta.notes) doc.text(meta.notes, pageWidth / 2, 448, { align: 'center', maxWidth: pageWidth - 160 });

  doc.setFontSize(10);
  const org = meta.organization || 'InMo Tools Typing Workstation';
  const certifier = meta.certifiedBy ? `Certified by ${meta.certifiedBy}` : '';
  doc.text(org, pageWidth / 2, pageHeight - 90, { align: 'center' });
  if (certifier) doc.text(certifier, pageWidth / 2, pageHeight - 74, { align: 'center' });

  doc.setFontSize(8);
  doc.setTextColor(120);
  const stamp = `Certificate ID: ${new Date(test.savedAt).toISOString()}-${test.id ?? 'draft'} · Generated ${new Date().toISOString()}`;
  doc.text(stamp, pageWidth / 2, pageHeight - 52, { align: 'center' });

  return doc.output('blob');
}

// --------------------------------------------------------------------
// Session summary Markdown (nice for pasting into a journal)
// --------------------------------------------------------------------
export function sessionMarkdown(tests: StoredTest[], meta: ExportMetadata): string {
  const lines: string[] = [];
  lines.push('# Typing Workstation Session');
  lines.push('');
  lines.push(`- Typist: ${meta.typistName || 'Anonymous'}`);
  lines.push(`- Organization: ${meta.organization || '—'}`);
  lines.push(`- Certified by: ${meta.certifiedBy || '—'}`);
  lines.push(`- Exported: ${new Date().toISOString()}`);
  lines.push(`- Tests: ${tests.length}`);
  if (meta.tags.length > 0) lines.push(`- Tags: ${meta.tags.join(', ')}`);
  if (meta.notes) lines.push(`- Notes: ${meta.notes}`);
  lines.push('');
  lines.push('| Saved | Mode | Net WPM | Accuracy | Consistency | Errors |');
  lines.push('| ----- | ---- | ------: | -------: | ----------: | -----: |');
  for (const t of tests) {
    lines.push(`| ${new Date(t.savedAt).toISOString()} | ${t.mode} | ${t.netWpm} | ${t.accuracy}% | ${t.consistency}% | ${t.incorrectChars} |`);
  }
  return lines.join('\n') + '\n';
}

export function fileFor(name: string, mime: string, data: string | Blob): Blob {
  if (data instanceof Blob) return data;
  return new Blob([data], { type: mime });
}

export function suggestFilename(kind: 'csv' | 'json' | 'pdf' | 'md', scope: 'test' | 'history', when = new Date()): string {
  const stamp = when.toISOString().replace(/[:.]/g, '-').slice(0, 19);
  return `typing-${scope}-${stamp}.${kind}`;
}

import { describe, expect, it } from 'vitest';
import { buildPdfExportSummary } from '../../src/tools/pdf/pdf-export-summary';

describe('PDF export impact summary', () => {
  it('classifies destructive, structural, and reversible staged changes before export', () => {
    const entries = buildPdfExportSummary({
      sourceDocumentCount: 2,
      sourcePageCount: 8,
      outputPageCount: 8,
      sourceFormFieldCount: 3,
      flattenSourceForms: true,
      sourceAttachmentCount: 2,
      stagedAttachmentCount: 1,
      sourceMetadataDocumentCount: 2,
      replacementMetadataCount: 2,
      stagedBlankPageCount: 1,
      duplicateSelectionCount: 1,
      rotationCount: 2,
      pageBoxEditCount: 1,
      authoredFormFieldCount: 2,
      overlayCount: 3,
      filenameChanged: true,
    });

    expect(entries.filter((entry) => entry.impact === 'destructive-output').map((entry) => entry.label)).toEqual([
      'Source pages omitted',
      'Source form editability removed',
      'Source attachments are not inherited',
      'Source Info metadata is stripped',
    ]);
    expect(entries.filter((entry) => entry.impact === 'structural-output').map((entry) => entry.label)).toContain('Documents combined');
    expect(entries.filter((entry) => entry.impact === 'structural-output').map((entry) => entry.label)).toContain('Visible overlays baked into pages');
    expect(entries.filter((entry) => entry.impact === 'reversible-staging').map((entry) => entry.label)).toEqual([
      'Replacement metadata staged',
      'Output filename customized',
    ]);
  });

  it('returns a single neutral staging entry when no extra mutation is staged', () => {
    expect(buildPdfExportSummary({
      sourceDocumentCount: 1,
      sourcePageCount: 1,
      outputPageCount: 1,
      sourceFormFieldCount: 0,
      flattenSourceForms: true,
      sourceAttachmentCount: 0,
      stagedAttachmentCount: 0,
      sourceMetadataDocumentCount: 0,
      replacementMetadataCount: 0,
      stagedBlankPageCount: 0,
      duplicateSelectionCount: 0,
      rotationCount: 0,
      pageBoxEditCount: 0,
      authoredFormFieldCount: 0,
      overlayCount: 0,
      filenameChanged: false,
    })).toEqual([{
      impact: 'reversible-staging',
      label: 'No additional mutations staged',
      detail: 'The workstation will rebuild the selected pages locally; source files remain unchanged.',
    }]);
  });
});

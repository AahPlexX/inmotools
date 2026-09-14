export type PdfExportImpact = 'destructive-output' | 'structural-output' | 'reversible-staging';

export interface PdfExportSummaryInput {
  sourceDocumentCount: number;
  sourcePageCount: number;
  outputPageCount: number;
  sourceFormFieldCount: number;
  flattenSourceForms: boolean;
  sourceAttachmentCount: number;
  stagedAttachmentCount: number;
  sourceMetadataDocumentCount: number;
  replacementMetadataCount: number;
  stagedBlankPageCount: number;
  duplicateSelectionCount: number;
  rotationCount: number;
  pageBoxEditCount: number;
  authoredFormFieldCount: number;
  overlayCount: number;
  filenameChanged: boolean;
}

export interface PdfExportSummaryEntry {
  impact: PdfExportImpact;
  label: string;
  detail: string;
}

export function buildPdfExportSummary(input: PdfExportSummaryInput): PdfExportSummaryEntry[] {
  const entries: PdfExportSummaryEntry[] = [];
  const omittedPages = Math.max(0, input.sourcePageCount - (input.outputPageCount - input.stagedBlankPageCount - input.duplicateSelectionCount));

  if (omittedPages > 0) entries.push({
    impact: 'destructive-output',
    label: 'Source pages omitted',
    detail: `${omittedPages} source page${omittedPages === 1 ? '' : 's'} will not appear in this output. Source files remain unchanged.`,
  });
  if (input.sourceFormFieldCount > 0 && input.flattenSourceForms) entries.push({
    impact: 'destructive-output',
    label: 'Source form editability removed',
    detail: `${input.sourceFormFieldCount} source AcroForm field${input.sourceFormFieldCount === 1 ? '' : 's'} will be flattened into page appearances.`,
  });
  if (input.sourceAttachmentCount > 0) entries.push({
    impact: 'destructive-output',
    label: 'Source attachments are not inherited',
    detail: `${input.sourceAttachmentCount} source embedded file${input.sourceAttachmentCount === 1 ? '' : 's'} will be omitted unless explicitly staged as output attachments. ${input.stagedAttachmentCount} attachment${input.stagedAttachmentCount === 1 ? ' is' : 's are'} currently staged.`,
  });
  if (input.sourceMetadataDocumentCount > 0) entries.push({
    impact: 'destructive-output',
    label: 'Source Info metadata is stripped',
    detail: `Common Info metadata from ${input.sourceMetadataDocumentCount} source document${input.sourceMetadataDocumentCount === 1 ? '' : 's'} is not inherited. ${input.replacementMetadataCount} replacement propert${input.replacementMetadataCount === 1 ? 'y is' : 'ies are'} staged.`,
  });

  if (input.sourceDocumentCount > 1) entries.push({
    impact: 'structural-output',
    label: 'Documents combined',
    detail: `${input.sourceDocumentCount} queued PDFs will be rebuilt into one output document in the displayed queue/page order.`,
  });
  if (input.stagedBlankPageCount > 0) entries.push({
    impact: 'structural-output',
    label: 'Blank pages inserted',
    detail: `${input.stagedBlankPageCount} blank page${input.stagedBlankPageCount === 1 ? '' : 's'} will be inserted.`,
  });
  if (input.duplicateSelectionCount > 0) entries.push({
    impact: 'structural-output',
    label: 'Pages duplicated',
    detail: `${input.duplicateSelectionCount} repeated page selection${input.duplicateSelectionCount === 1 ? '' : 's'} will create duplicate output pages.`,
  });
  if (input.rotationCount > 0) entries.push({
    impact: 'structural-output',
    label: 'Page rotations applied',
    detail: `${input.rotationCount} copied page${input.rotationCount === 1 ? '' : 's'} will receive a staged rotation.`,
  });
  if (input.pageBoxEditCount > 0) entries.push({
    impact: 'structural-output',
    label: 'Page boxes changed',
    detail: `${input.pageBoxEditCount} output page${input.pageBoxEditCount === 1 ? '' : 's'} will receive MediaBox/CropBox/BleedBox/TrimBox edits.`,
  });
  if (input.authoredFormFieldCount > 0) entries.push({
    impact: 'structural-output',
    label: 'Editable form fields authored',
    detail: `${input.authoredFormFieldCount} new editable AcroForm field${input.authoredFormFieldCount === 1 ? '' : 's'} will be added.`,
  });
  if (input.stagedAttachmentCount > 0) entries.push({
    impact: 'structural-output',
    label: 'Attachments authored',
    detail: `${input.stagedAttachmentCount} embedded file${input.stagedAttachmentCount === 1 ? '' : 's'} will be authored into the output.`,
  });
  if (input.overlayCount > 0) entries.push({
    impact: 'structural-output',
    label: 'Visible overlays baked into pages',
    detail: `${input.overlayCount} header/footer/Bates/watermark configuration${input.overlayCount === 1 ? '' : 's'} will be drawn into final page content.`,
  });

  if (input.replacementMetadataCount > 0) entries.push({
    impact: 'reversible-staging',
    label: 'Replacement metadata staged',
    detail: `${input.replacementMetadataCount} metadata propert${input.replacementMetadataCount === 1 ? 'y is' : 'ies are'} staged and can still be cleared before export.`,
  });
  if (input.filenameChanged) entries.push({
    impact: 'reversible-staging',
    label: 'Output filename customized',
    detail: 'The staged output filename can still be changed without modifying any source PDF bytes.',
  });

  if (!entries.length) entries.push({
    impact: 'reversible-staging',
    label: 'No additional mutations staged',
    detail: 'The workstation will rebuild the selected pages locally; source files remain unchanged.',
  });

  return entries;
}

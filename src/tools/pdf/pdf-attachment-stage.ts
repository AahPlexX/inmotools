import type { PdfAttachmentDefinition, PdfExtractedAttachment } from './pdf-engine';
import type { PdfStagedAttachment } from './PdfAttachmentPanel';

const CONTROL_CHARACTER = /[\u0000-\u001f\u007f]/;
const MAX_ATTACHMENT_NAME_CODEPOINTS = 255;

export function utcInputFromDate(date: Date | undefined): string {
  return date ? date.toISOString().slice(0, 16) : '';
}

export function utcDateFromAttachmentInput(value: string): Date | undefined {
  if (!value) return undefined;
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value);
  if (!match) return undefined;
  const [, year, month, day, hour, minute, second = '0'] = match;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second)));
  if (date.getUTCFullYear() !== Number(year)
    || date.getUTCMonth() !== Number(month) - 1
    || date.getUTCDate() !== Number(day)
    || date.getUTCHours() !== Number(hour)
    || date.getUTCMinutes() !== Number(minute)
    || date.getUTCSeconds() !== Number(second)) return undefined;
  return date;
}

export function attachmentStageError(staged: PdfStagedAttachment[]): string {
  const names = new Set<string>();
  for (const attachment of staged) {
    const name = attachment.name.trim();
    if (!name) return `Attachment ${attachment.sourceLabel} needs an output filename.`;
    if (Array.from(name).length > MAX_ATTACHMENT_NAME_CODEPOINTS) return `Attachment filename ${name} must be 255 characters or fewer.`;
    if (CONTROL_CHARACTER.test(name)) return `Attachment filename ${name} cannot contain control characters.`;
    if (name.includes('/') || name.includes('\\') || name === '.' || name === '..') return `Attachment filename ${name} cannot contain path separators or path segments.`;
    const collisionKey = name.toLocaleLowerCase('en-US');
    if (names.has(collisionKey)) return `Duplicate attachment filename: ${name}.`;
    names.add(collisionKey);
  }
  return '';
}

export function safeAttachmentDownloadFilename(value: string): string {
  const safe = value
    .replace(/[\\/\u0000-\u001f\u007f]/g, '-')
    .trim();
  const normalized = safe === '.' || safe === '..' ? 'attachment' : safe || 'attachment';
  return Array.from(normalized).slice(0, MAX_ATTACHMENT_NAME_CODEPOINTS).join('');
}

export function stagedAttachmentFromFile(file: File): PdfStagedAttachment {
  return {
    id: crypto.randomUUID(),
    data: file,
    sourceLabel: file.name,
    name: file.name,
    mimeType: file.type,
    description: '',
    creationDate: '',
    modificationDate: '',
    size: file.size,
  };
}

export function stagedAttachmentFromExtracted(attachment: PdfExtractedAttachment): PdfStagedAttachment {
  return {
    id: crypto.randomUUID(),
    data: attachment.bytes,
    sourceLabel: attachment.name,
    name: attachment.name,
    mimeType: attachment.mimeType ?? '',
    description: attachment.description ?? '',
    creationDate: utcInputFromDate(attachment.creationDate),
    modificationDate: utcInputFromDate(attachment.modificationDate),
    size: attachment.bytes.byteLength,
  };
}

export async function attachmentDefinitionsFromStages(staged: PdfStagedAttachment[]): Promise<PdfAttachmentDefinition[]> {
  const error = attachmentStageError(staged);
  if (error) throw new Error(error);
  return Promise.all(staged.map(async (attachment) => ({
    bytes: attachment.data instanceof File
      ? new Uint8Array(await attachment.data.arrayBuffer())
      : attachment.data.slice(),
    name: attachment.name.trim(),
    mimeType: attachment.mimeType.trim() || undefined,
    description: attachment.description.trim() || undefined,
    creationDate: utcDateFromAttachmentInput(attachment.creationDate),
    modificationDate: utcDateFromAttachmentInput(attachment.modificationDate),
  })));
}

import {
  decodePDFRawStream,
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFHexString,
  PDFName,
  PDFNumber,
  PDFRawStream,
  PDFString,
} from 'pdf-lib';

export interface PdfAttachmentDefinition {
  bytes: Uint8Array;
  name: string;
  mimeType?: string;
  description?: string;
  creationDate?: Date;
  modificationDate?: Date;
}

export interface PdfAttachmentInventory {
  name: string;
  mimeType?: string;
  description?: string;
  size?: number;
  creationDate?: Date;
  modificationDate?: Date;
}

export interface PdfExtractedAttachment extends PdfAttachmentInventory {
  bytes: Uint8Array;
}

export interface PdfAttachmentScan {
  attachments: PdfAttachmentInventory[];
  warnings: string[];
}

type LiteralString = PDFString | PDFHexString;
type RawAttachment = {
  treeName: string;
  fileSpec: PDFDict;
};

const NAME_TREE_NODE_LIMIT = 10_000;
const ATTACHMENT_LIMIT = 10_000;
const MAX_EMBEDDED_NAME_CODEPOINTS = 255;
const MAX_PDF_DATE_TEXT = 32;
const CONTROL_CHARACTER = /[\u0000-\u001f\u007f]/;
const PDF_DATE = /^D:(\d{4})(\d{2})?(\d{2})?(\d{2})?(\d{2})?(\d{2})?([+\-Z])?(\d{2})?'?(\d{2})?'?$/;

const NamesKey = PDFName.of('Names');
const EmbeddedFilesKey = PDFName.of('EmbeddedFiles');
const KidsKey = PDFName.of('Kids');
const EFKey = PDFName.of('EF');
const FKey = PDFName.of('F');
const UFKey = PDFName.of('UF');
const DescKey = PDFName.of('Desc');
const SubtypeKey = PDFName.of('Subtype');
const ParamsKey = PDFName.of('Params');
const SizeKey = PDFName.of('Size');
const CreationDateKey = PDFName.of('CreationDate');
const ModDateKey = PDFName.of('ModDate');

function decodeLiteral(value: LiteralString | undefined): string | undefined {
  return value?.decodeText();
}

function safePdfDate(value: LiteralString | undefined): Date | undefined {
  if (!value) return undefined;
  const text = value.decodeText();
  if (text.length > MAX_PDF_DATE_TEXT) return undefined;
  const match = PDF_DATE.exec(text);
  if (!match) return undefined;
  const [, year, month = '01', day = '01', hour = '00', minute = '00', second = '00', offset = 'Z', offsetHour = '00', offsetMinute = '00'] = match;
  const utc = Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second));
  if (!Number.isFinite(utc)) return undefined;
  const parsed = new Date(utc);
  if (parsed.getUTCFullYear() !== Number(year)
    || parsed.getUTCMonth() !== Number(month) - 1
    || parsed.getUTCDate() !== Number(day)
    || parsed.getUTCHours() !== Number(hour)
    || parsed.getUTCMinutes() !== Number(minute)
    || parsed.getUTCSeconds() !== Number(second)) return undefined;
  if (offset === 'Z') return parsed;
  const offsetMinutes = Number(offsetHour) * 60 + Number(offsetMinute);
  if (offsetMinutes > 23 * 60 + 59) return undefined;
  return new Date(utc + (offset === '+' ? -1 : 1) * offsetMinutes * 60_000);
}

export function validatePdfAttachmentDefinitions(definitions: PdfAttachmentDefinition[]): PdfAttachmentDefinition[] {
  const names = new Set<string>();
  return definitions.map((definition) => {
    const name = definition.name.trim();
    if (!name) throw new Error('Attachment name cannot be blank.');
    if (Array.from(name).length > MAX_EMBEDDED_NAME_CODEPOINTS) throw new Error('Attachment names must be 255 characters or fewer.');
    if (CONTROL_CHARACTER.test(name)) throw new Error(`Attachment name ${name} cannot contain control characters.`);
    if (name.includes('/') || name.includes('\\')) throw new Error(`Attachment name ${name} cannot contain path separators.`);
    if (name === '.' || name === '..') throw new Error(`Attachment name ${name} cannot be a path segment.`);
    const collisionKey = name.toLocaleLowerCase('en-US');
    if (names.has(collisionKey)) throw new Error(`Duplicate attachment name: ${name}.`);
    names.add(collisionKey);
    if (!(definition.bytes instanceof Uint8Array)) throw new Error(`Attachment ${name} must provide binary bytes.`);
    return { ...definition, name };
  });
}

function collectRawAttachments(document: PDFDocument): { attachments: RawAttachment[]; warnings: string[] } {
  const warnings: string[] = [];
  const names = document.catalog.lookupMaybe(NamesKey, PDFDict);
  if (!names) return { attachments: [], warnings };
  const root = names.lookupMaybe(EmbeddedFilesKey, PDFDict);
  if (!root) return { attachments: [], warnings };

  const attachments: RawAttachment[] = [];
  const visited = new Set<PDFDict>();
  const stack = [root];
  let visitedNodes = 0;

  while (stack.length) {
    const node = stack.pop()!;
    if (visited.has(node)) continue;
    visited.add(node);
    visitedNodes += 1;
    if (visitedNodes > NAME_TREE_NODE_LIMIT) {
      warnings.push(`Embedded-file name tree exceeded the ${NAME_TREE_NODE_LIMIT.toLocaleString()} node safety limit; inventory is partial.`);
      break;
    }

    const entries = node.lookupMaybe(NamesKey, PDFArray);
    if (entries) {
      if (entries.size() % 2 !== 0) warnings.push('Embedded-file name tree contains an unmatched name entry; the final unmatched value was ignored.');
      for (let index = 0; index + 1 < entries.size(); index += 2) {
        if (attachments.length >= ATTACHMENT_LIMIT) {
          warnings.push(`Embedded-file inventory reached the ${ATTACHMENT_LIMIT.toLocaleString()} attachment safety limit; inventory is partial.`);
          return { attachments, warnings };
        }
        const nameObject = entries.lookupMaybe(index, PDFString, PDFHexString);
        const fileSpec = entries.lookupMaybe(index + 1, PDFDict);
        if (!fileSpec) {
          warnings.push(`Embedded-file name entry ${Math.floor(index / 2) + 1} did not resolve to a file specification and was skipped.`);
          continue;
        }
        attachments.push({ treeName: decodeLiteral(nameObject) ?? `attachment-${attachments.length + 1}`, fileSpec });
      }
    }

    const kids = node.lookupMaybe(KidsKey, PDFArray);
    if (kids) {
      for (let index = kids.size() - 1; index >= 0; index -= 1) {
        const child = kids.lookupMaybe(index, PDFDict);
        if (child) stack.push(child);
        else warnings.push(`Embedded-file name-tree child ${index + 1} did not resolve to a dictionary and was skipped.`);
      }
    }
  }

  return { attachments, warnings };
}

function decodeAttachment(raw: RawAttachment, includeBytes: boolean): { inventory: PdfAttachmentInventory; bytes?: Uint8Array; warning?: string } {
  const filename = decodeLiteral(raw.fileSpec.lookupMaybe(UFKey, PDFString, PDFHexString))
    ?? decodeLiteral(raw.fileSpec.lookupMaybe(FKey, PDFString, PDFHexString))
    ?? raw.treeName;
  const description = decodeLiteral(raw.fileSpec.lookupMaybe(DescKey, PDFString, PDFHexString));
  const ef = raw.fileSpec.lookupMaybe(EFKey, PDFDict);
  const stream = ef?.lookupMaybe(UFKey, PDFRawStream) ?? ef?.lookupMaybe(FKey, PDFRawStream);
  if (!stream) {
    return {
      inventory: { name: filename, description },
      warning: `Embedded file ${filename} has no decodable /EF stream and cannot be extracted.`,
    };
  }

  const mimeType = stream.dict.lookupMaybe(SubtypeKey, PDFName)?.decodeText();
  const params = stream.dict.lookupMaybe(ParamsKey, PDFDict);
  const declaredSize = params?.lookupMaybe(SizeKey, PDFNumber)?.asNumber();
  const creationDate = safePdfDate(params?.lookupMaybe(CreationDateKey, PDFString, PDFHexString));
  const modificationDate = safePdfDate(params?.lookupMaybe(ModDateKey, PDFString, PDFHexString));
  const inventory: PdfAttachmentInventory = {
    name: filename,
    mimeType,
    description,
    size: declaredSize,
    creationDate,
    modificationDate,
  };
  if (!includeBytes) return { inventory };

  try {
    const bytes = new Uint8Array(decodePDFRawStream(stream).decode());
    return { inventory: { ...inventory, size: declaredSize ?? bytes.byteLength }, bytes };
  } catch (error) {
    return {
      inventory,
      warning: `Embedded file ${filename} could not be decoded: ${error instanceof Error ? error.message : 'unknown stream error'}.`,
    };
  }
}

export function inspectDocumentAttachments(document: PDFDocument): PdfAttachmentScan {
  const raw = collectRawAttachments(document);
  const warnings = [...raw.warnings];
  const attachments = raw.attachments.map((attachment) => {
    const decoded = decodeAttachment(attachment, false);
    if (decoded.warning) warnings.push(decoded.warning);
    return decoded.inventory;
  });
  return { attachments, warnings };
}

export async function extractPdfAttachments(bytes: Uint8Array): Promise<PdfExtractedAttachment[]> {
  const document = await PDFDocument.load(bytes.slice(), { updateMetadata: false });
  const raw = collectRawAttachments(document);
  const extracted: PdfExtractedAttachment[] = [];
  for (const attachment of raw.attachments) {
    const decoded = decodeAttachment(attachment, true);
    if (!decoded.bytes) continue;
    extracted.push({ ...decoded.inventory, size: decoded.inventory.size ?? decoded.bytes.byteLength, bytes: decoded.bytes });
  }
  return extracted;
}

export async function attachPdfFiles(document: PDFDocument, definitions: PdfAttachmentDefinition[]): Promise<void> {
  const validated = validatePdfAttachmentDefinitions(definitions);
  for (const attachment of validated) {
    await document.attach(attachment.bytes, attachment.name, {
      mimeType: attachment.mimeType?.trim() || undefined,
      description: attachment.description?.trim() || undefined,
      creationDate: attachment.creationDate,
      modificationDate: attachment.modificationDate,
    });
  }
}

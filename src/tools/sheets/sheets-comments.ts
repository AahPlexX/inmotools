import { XMLParser } from 'fast-xml-parser';
import JSZip from 'jszip';
import { a1FromParts, parseA1Ref } from './sheets-formula';
import { cloneWorkbook } from './sheets-model';
import {
  cellKey,
  cryptoRandomId,
  parseCellKey,
  type PortableWorkbook,
  type SheetComment,
} from './sheets-types';

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@',
  trimValues: true,
  parseTagValue: false,
  parseAttributeValue: false,
});

type XmlRecord = Record<string, unknown>;

function asArray<T>(value: T | T[] | undefined | null): T[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

function asRecord(value: unknown): XmlRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as XmlRecord : {};
}

export function excelNoteText(note: unknown): string {
  if (typeof note === 'string') return note;
  if (note === null || note === undefined || typeof note !== 'object') return '';
  const record = note as { texts?: Array<{ text?: string }>; text?: string };
  if (typeof record.text === 'string' && record.text.trim()) return record.text;
  if (Array.isArray(record.texts)) {
    return record.texts.map((part) => part.text ?? '').join('').trim();
  }
  return '';
}

function collectText(node: unknown): string {
  if (typeof node === 'string' || typeof node === 'number' || typeof node === 'boolean') return String(node);
  if (node === null || node === undefined) return '';
  if (Array.isArray(node)) return node.map((item) => collectText(item)).join('');
  const record = asRecord(node);
  if (typeof record['#text'] === 'string') return record['#text'];
  if (typeof record.t === 'string') return record.t;
  return Object.entries(record)
    .filter(([key]) => key !== '@' && !key.startsWith('@'))
    .map(([, value]) => collectText(value))
    .join('');
}

export function hydrateComments(book: PortableWorkbook, now = Date.now()): PortableWorkbook {
  const next = cloneWorkbook(book);
  if (!Array.isArray(next.comments)) next.comments = [];
  const comments: SheetComment[] = [...next.comments];
  for (const sheet of next.sheets) {
    for (const [key, cell] of Object.entries(sheet.cells)) {
      const body = cell.note?.trim() ?? '';
      if (!body) continue;
      const parsed = parseCellKey(key);
      if (!parsed) continue;
      const a1 = a1FromParts(parsed.row, parsed.col);
      const existing = comments.find((item) => item.sheetId === sheet.id && item.a1 === a1);
      if (existing) {
        if (!existing.body.trim()) existing.body = body;
        continue;
      }
      comments.push({
        id: cryptoRandomId(),
        sheetId: sheet.id,
        a1,
        body,
        updatedAt: now,
      });
    }
  }
  for (const comment of comments) {
    const body = comment.body.trim();
    if (!body) continue;
    const ref = parseA1Ref(comment.a1);
    const sheet = next.sheets.find((item) => item.id === comment.sheetId);
    if (!ref || !sheet) continue;
    const key = cellKey(ref.row, ref.col);
    const current = sheet.cells[key] ?? {};
    if (!current.note) sheet.cells[key] = { ...current, note: body };
  }
  next.comments = comments.filter((item) => item.body.trim());
  return next;
}

function relationshipTarget(relsXml: string, typeNeedle: string): string[] {
  const parsed = asRecord(xmlParser.parse(relsXml));
  const relsRoot = asRecord(parsed.Relationships ?? parsed);
  const rels = asArray<XmlRecord>(relsRoot.Relationship as XmlRecord | XmlRecord[] | undefined);
  return rels
    .filter((rel) => String(rel['@Type'] ?? '').includes(typeNeedle))
    .map((rel) => String(rel['@Target'] ?? ''))
    .filter(Boolean);
}

function relationshipMap(relsXml: string): Map<string, { type: string; target: string }> {
  const parsed = asRecord(xmlParser.parse(relsXml));
  const relsRoot = asRecord(parsed.Relationships ?? parsed);
  const rels = asArray<XmlRecord>(relsRoot.Relationship as XmlRecord | XmlRecord[] | undefined);
  const map = new Map<string, { type: string; target: string }>();
  for (const rel of rels) {
    const id = String(rel['@Id'] ?? '');
    if (!id) continue;
    map.set(id, { type: String(rel['@Type'] ?? ''), target: String(rel['@Target'] ?? '') });
  }
  return map;
}

function resolveZipPath(fromFile: string, target: string): string {
  if (target.startsWith('/')) return target.replace(/^\//, '');
  const parts = fromFile.split('/');
  parts.pop();
  for (const piece of target.split('/')) {
    if (!piece || piece === '.') continue;
    if (piece === '..') parts.pop();
    else parts.push(piece);
  }
  return parts.join('/');
}

function commentsFromXml(xml: string): Array<{ a1: string; body: string }> {
  const parsed = asRecord(xmlParser.parse(xml));
  const commentsRoot = asRecord(parsed.comments ?? parsed.Comments ?? parsed);
  const list = asRecord(commentsRoot.commentList ?? commentsRoot.CommentList ?? commentsRoot);
  const comments = asArray<XmlRecord>(list.comment as XmlRecord | XmlRecord[] | undefined);
  const out: Array<{ a1: string; body: string }> = [];
  for (const comment of comments) {
    const a1 = String(comment['@ref'] ?? comment.ref ?? '').trim();
    const body = collectText(comment.text ?? comment.t ?? '').replace(/\r\n/g, '\n').trim();
    if (!a1 || !body) continue;
    out.push({ a1, body });
  }
  return out;
}

export async function commentsFromXlsxBuffer(buffer: ArrayBuffer): Promise<Array<{ sheetName: string; a1: string; body: string }>> {
  const zip = await JSZip.loadAsync(buffer);
  const workbookFile = zip.file('xl/workbook.xml');
  const workbookRels = zip.file('xl/_rels/workbook.xml.rels');
  if (!workbookFile || !workbookRels) return [];
  const workbookXml = await workbookFile.async('string');
  const rels = relationshipMap(await workbookRels.async('string'));
  const workbook = asRecord(xmlParser.parse(workbookXml));
  const workbookRoot = asRecord(workbook.workbook ?? workbook);
  const sheetsRoot = asRecord(workbookRoot.sheets ?? workbookRoot);
  const sheets = asArray<XmlRecord>(sheetsRoot.sheet as XmlRecord | XmlRecord[] | undefined);
  const found: Array<{ sheetName: string; a1: string; body: string }> = [];
  for (const sheet of sheets) {
    const name = String(sheet['@name'] ?? sheet.name ?? '').trim();
    const rid = String(sheet['@r:id'] ?? sheet['@r:Id'] ?? sheet['@Id'] ?? '').trim();
    const rel = rels.get(rid);
    if (!name || !rel?.target) continue;
    const sheetPath = resolveZipPath('xl/workbook.xml', rel.target);
    const relsPath = sheetPath.replace(/([^/]+)$/, '_rels/$1.rels');
    const sheetRelsFile = zip.file(relsPath);
    if (!sheetRelsFile) continue;
    const commentTargets = relationshipTarget(await sheetRelsFile.async('string'), 'comments');
    for (const target of commentTargets) {
      const commentsPath = resolveZipPath(sheetPath, target);
      const commentsFile = zip.file(commentsPath);
      if (!commentsFile) continue;
      for (const comment of commentsFromXml(await commentsFile.async('string'))) {
        found.push({ sheetName: name, a1: comment.a1, body: comment.body });
      }
    }
  }
  return found;
}

export async function applyXlsxComments(book: PortableWorkbook, buffer: ArrayBuffer, now = Date.now()): Promise<PortableWorkbook> {
  const comments = await commentsFromXlsxBuffer(buffer);
  if (comments.length === 0) return hydrateComments(book, now);
  const next = cloneWorkbook(book);
  for (const comment of comments) {
    const sheet = next.sheets.find((item) => item.name === comment.sheetName);
    const ref = parseA1Ref(comment.a1);
    if (!sheet || !ref) continue;
    const key = cellKey(ref.row, ref.col);
    const current = sheet.cells[key] ?? {};
    sheet.cells[key] = { ...current, note: comment.body };
    next.comments = [
      ...next.comments.filter((item) => !(item.sheetId === sheet.id && item.a1 === comment.a1)),
      {
        id: cryptoRandomId(),
        sheetId: sheet.id,
        a1: comment.a1,
        body: comment.body,
        updatedAt: now,
      },
    ];
  }
  return hydrateComments(next, now);
}

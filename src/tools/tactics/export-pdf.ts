import JSZip from 'jszip';
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import { readExportMetadata, sampleExportTimes } from './export-engine';
import { displayPitchOverlays } from './pitch-engine';
import type { ExportMetadata } from './export-types';
import type { MatchboardUnicodeFonts } from './pdf-unicode-font';
import { sampleTacticalProjectAtTime } from './timeline-engine';
import type { NormalizedPoint, TacticalProject } from './tactics-types';

export const PDF_INFO_FIELDS = ['title', 'creator', 'description', 'tags', 'createdAt', 'modifiedAt'] as const;
export const PDF_PAGE_TEXT_FIELDS = ['club', 'ageGroup', 'sessionType', 'tacticalTheme', 'rights', 'license', 'language', 'notes'] as const;

const PAGE_WIDTH = 792;
const PAGE_HEIGHT = 612;
const MARGIN = 36;
const PDF_PAGE_TEXT_FALLBACK = '?';

interface PageFonts {
  regular: PDFFont;
  bold: PDFFont;
  unicode: MatchboardUnicodeFonts | null;
}

interface PreparedPageText {
  text: string;
  unicode: boolean;
}

function normalizePageWhitespace(value: string): string {
  return Array.from(value).map((char) => {
    const code = char.codePointAt(0) ?? 0;
    return code === 9 || code === 10 || code === 13 ? ' ' : char;
  }).join('').replace(/\s+/g, ' ').trim();
}

function leavesBasicLatin(value: string): boolean {
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0;
    if (code < 32 || code > 126) return true;
  }
  return false;
}

function degradeToBasicLatin(value: string): string {
  let text = '';
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0;
    text += code >= 32 && code <= 126 ? char : PDF_PAGE_TEXT_FALLBACK;
  }
  return text;
}

function preparePageText(value: string, unicode: MatchboardUnicodeFonts | null): PreparedPageText {
  const normalized = normalizePageWhitespace(value);
  if (!leavesBasicLatin(normalized)) return { text: normalized, unicode: false };
  if (!unicode) return { text: degradeToBasicLatin(normalized), unicode: false };
  let text = '';
  for (const char of normalized) {
    const code = char.codePointAt(0) ?? 0;
    text += unicode.covered(code) ? char : PDF_PAGE_TEXT_FALLBACK;
  }
  return { text, unicode: true };
}

function fontFor(fonts: PageFonts, prepared: PreparedPageText, bold: boolean): PDFFont {
  if (prepared.unicode && fonts.unicode) return bold ? fonts.unicode.bold : fonts.unicode.regular;
  return bold ? fonts.bold : fonts.regular;
}

function drawPageString(
  page: PDFPage,
  fonts: PageFonts,
  value: string,
  bold: boolean,
  options: { x: number; y: number; size: number; color: ReturnType<typeof rgb> },
): void {
  const prepared = preparePageText(value, fonts.unicode);
  const text = prepared.unicode ? prepared.text : degradeToBasicLatin(prepared.text);
  if (!text) return;
  page.drawText(text, { ...options, font: fontFor(fonts, prepared, bold) });
}

function requireScene(project: TacticalProject, sceneId: string): void {
  if (!project.scenes.some((scene) => scene.id === sceneId)) {
    throw new Error(`Scene "${sceneId}" does not exist.`);
  }
}

function hexColor(value: string): { r: number; g: number; b: number } {
  const match = /^#([0-9a-fA-F]{6})$/.exec(value.trim());
  if (!match?.[1]) return { r: 0.114, g: 0.306, b: 0.847 };
  const channels = Number.parseInt(match[1], 16);
  return {
    r: ((channels >> 16) & 255) / 255,
    g: ((channels >> 8) & 255) / 255,
    b: (channels & 255) / 255,
  };
}

function teamRosterLine(project: TacticalProject): string {
  return project.teams.map((team) => {
    const names = team.roster.map((player) => player.displayName.trim()).filter(Boolean);
    const teamName = team.name.trim();
    if (!teamName && names.length === 0) return '';
    return names.length ? `${teamName}: ${names.join(', ')}` : teamName;
  }).filter(Boolean).join(' · ');
}

function wrap(fonts: PageFonts, text: string, size: number, width: number, bold = false): string[] {
  const prepared = preparePageText(text, fonts.unicode);
  const font = fontFor(fonts, prepared, bold);
  const words = prepared.text.split(' ').filter(Boolean);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(next, size) > width && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);
  return lines.slice(0, 6);
}

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

function mapPoint(point: NormalizedPoint, box: Box): { x: number; y: number } {
  return {
    x: box.x + point.x * box.width,
    y: box.y + (1 - point.y) * box.height,
  };
}

function layerVisible(project: TacticalProject, sceneId: string, layerId: string): boolean {
  return project.scenes.find((scene) => scene.id === sceneId)?.layers.find((layer) => layer.id === layerId)?.visible === true;
}

function drawDiagram(page: PDFPage, fonts: PageFonts, project: TacticalProject, sceneId: string, box: Box): void {
  page.drawRectangle({
    x: box.x,
    y: box.y,
    width: box.width,
    height: box.height,
    color: rgb(47 / 255, 125 / 255, 69 / 255),
  });
  const inset = 4;
  page.drawRectangle({
    x: box.x + inset,
    y: box.y + inset,
    width: Math.max(1, box.width - inset * 2),
    height: Math.max(1, box.height - inset * 2),
    borderColor: rgb(1, 1, 1),
    borderWidth: 1,
  });
  page.drawLine({
    start: { x: box.x + box.width / 2, y: box.y + inset },
    end: { x: box.x + box.width / 2, y: box.y + box.height - inset },
    color: rgb(1, 1, 1),
    thickness: 1,
  });

  for (const overlay of displayPitchOverlays(project.pitch)) {
    if (overlay.points.length < 2) continue;
    for (let index = 1; index < overlay.points.length; index += 1) {
      const start = mapPoint(overlay.points[index - 1]!, box);
      const end = mapPoint(overlay.points[index]!, box);
      page.drawLine({ start, end, color: rgb(1, 1, 1), thickness: 0.8, opacity: 0.8 });
    }
  }

  for (const item of project.equipment) {
    if (item.sceneId !== sceneId || !item.visible || !layerVisible(project, sceneId, item.layerId)) continue;
    const point = mapPoint(item.position, box);
    page.drawRectangle({
      x: point.x - 4,
      y: point.y - 4,
      width: 8,
      height: 8,
      color: rgb(0.96, 0.62, 0.04),
    });
  }

  for (const annotation of project.annotations) {
    if (annotation.sceneId !== sceneId || annotation.visible === false || !layerVisible(project, sceneId, annotation.layerId)) continue;
    for (let index = 1; index < annotation.points.length; index += 1) {
      const start = mapPoint(annotation.points[index - 1]!, box);
      const end = mapPoint(annotation.points[index]!, box);
      page.drawLine({ start, end, color: rgb(0.996, 0.941, 0.541), thickness: 1.5 });
    }
    const label = annotation.label?.trim();
    const last = annotation.points[annotation.points.length - 1];
    if (label && last) {
      const point = mapPoint(last, box);
      drawPageString(page, fonts, label, false, {
        x: Math.min(box.x + box.width - 40, point.x + 6),
        y: point.y + 6,
        size: 8,
        color: rgb(1, 1, 1),
      });
    }
  }

  for (const token of project.playerTokens) {
    if (token.sceneId !== sceneId || !token.visible || !layerVisible(project, sceneId, token.layerId)) continue;
    const team = project.teams.find((candidate) => candidate.id === token.teamId);
    const player = team?.roster.find((candidate) => candidate.id === token.playerId);
    const point = mapPoint(token.position, box);
    const fill = hexColor(team?.primaryColor ?? '');
    page.drawCircle({
      x: point.x,
      y: point.y,
      size: Math.max(10, Math.min(box.width, box.height) * 0.035),
      color: rgb(fill.r, fill.g, fill.b),
      borderColor: rgb(1, 1, 1),
      borderWidth: 1,
    });
    const jersey = player?.jerseyNumber?.trim();
    if (jersey) {
      drawPageString(page, fonts, jersey, false, {
        x: point.x - 3,
        y: point.y - 3,
        size: 7,
        color: rgb(1, 1, 1),
      });
    }
  }

  const ball = mapPoint(project.ball.position, box);
  page.drawCircle({
    x: ball.x,
    y: ball.y,
    size: 8,
    color: rgb(1, 1, 1),
    borderColor: rgb(0.07, 0.09, 0.15),
    borderWidth: 1,
  });
}

function drawMetadata(page: PDFPage, fonts: PageFonts, metadata: ExportMetadata, roster: string): number {
  let y = PAGE_HEIGHT - MARGIN;
  const title = preparePageText(metadata.title, fonts.unicode);
  const titleText = (title.unicode ? title.text : degradeToBasicLatin(title.text)) || 'Untitled tactical project';
  page.drawText(titleText, {
    x: MARGIN,
    y,
    size: 16,
    font: fontFor(fonts, title.text ? title : { text: 'Untitled tactical project', unicode: false }, true),
    color: rgb(0.04, 0.07, 0.13),
  });
  y -= 18;
  const fields: Array<[string, string]> = [
    ['Club', metadata.club],
    ['Age group', metadata.ageGroup],
    ['Session', metadata.sessionType],
    ['Theme', metadata.tacticalTheme],
    ['Rights', metadata.rights],
    ['License', metadata.license],
    ['Language', metadata.language],
    ['Notes', metadata.notes],
  ];
  if (leavesBasicLatin(normalizePageWhitespace(roster))) fields.push(['Teams', roster]);
  for (const [label, value] of fields) {
    if (!value.trim()) continue;
    const prepared = preparePageText(`${label}: ${value}`, fonts.unicode);
    const font = fontFor(fonts, prepared, false);
    for (const line of wrap(fonts, `${label}: ${value}`, 9, PAGE_WIDTH - MARGIN * 2)) {
      y -= 12;
      page.drawText(line, { x: MARGIN, y, size: 9, font, color: rgb(0.12, 0.16, 0.22) });
    }
  }
  return y - 16;
}

function applyInfoDictionary(pdf: PDFDocument, metadata: ExportMetadata): void {
  pdf.setTitle(normalizePageWhitespace(metadata.title) || 'Untitled tactical project');
  if (metadata.creator) pdf.setAuthor(normalizePageWhitespace(metadata.creator));
  if (metadata.description) pdf.setSubject(normalizePageWhitespace(metadata.description));
  const keywords = metadata.tags.map((tag) => normalizePageWhitespace(tag)).filter(Boolean);
  if (keywords.length) pdf.setKeywords(keywords);
  pdf.setCreator('InMo Tools Tactical Matchboard Studio');
  const created = new Date(metadata.createdAt);
  if (!Number.isNaN(created.getTime())) pdf.setCreationDate(created);
  const modified = new Date(metadata.modifiedAt);
  if (!Number.isNaN(modified.getTime())) pdf.setModificationDate(modified);
}

function pageTextNeedsUnicode(project: TacticalProject, metadata: ExportMetadata, roster: string): boolean {
  const values = [
    metadata.title,
    metadata.club,
    metadata.ageGroup,
    metadata.sessionType,
    metadata.tacticalTheme,
    metadata.rights,
    metadata.license,
    metadata.language,
    metadata.notes,
    roster,
    ...metadata.tags,
  ];
  for (const annotation of project.annotations) {
    if (annotation.label) values.push(annotation.label);
  }
  for (const token of project.playerTokens) {
    const team = project.teams.find((candidate) => candidate.id === token.teamId);
    const player = team?.roster.find((candidate) => candidate.id === token.playerId);
    if (player?.jerseyNumber) values.push(player.jerseyNumber);
    if (player?.displayName) values.push(player.displayName);
  }
  return values.some((value) => leavesBasicLatin(normalizePageWhitespace(value)));
}

export async function renderCoachingPdfPackage(
  project: TacticalProject,
  sceneId: string,
  options?: { contactFrames?: number },
): Promise<Uint8Array> {
  requireScene(project, sceneId);
  const contactFrames = options?.contactFrames ?? 4;
  if (!Number.isInteger(contactFrames) || contactFrames < 1 || contactFrames > 12) {
    throw new RangeError('Contact-sheet frame count must be an integer from 1 to 12.');
  }
  const metadata = readExportMetadata(project);
  const roster = teamRosterLine(project);
  const pdf = await PDFDocument.create();
  const fonts: PageFonts = {
    regular: await pdf.embedFont(StandardFonts.Helvetica),
    bold: await pdf.embedFont(StandardFonts.HelveticaBold),
    unicode: null,
  };
  if (pageTextNeedsUnicode(project, metadata, roster)) {
    try {
      const { embedMatchboardUnicodeFonts } = await import('./pdf-unicode-font');
      fonts.unicode = await embedMatchboardUnicodeFonts(pdf);
    } catch {
      fonts.unicode = null;
    }
  }
  applyInfoDictionary(pdf, metadata);

  const cover = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  const contentTop = drawMetadata(cover, fonts, metadata, roster);
  const diagramHeight = Math.max(180, contentTop - MARGIN);
  drawDiagram(cover, fonts, project, sceneId, {
    x: MARGIN,
    y: MARGIN,
    width: PAGE_WIDTH - MARGIN * 2,
    height: diagramHeight,
  });

  const samples = sampleExportTimes(project.timeline.durationMs, project.exportPreferences.frameRate, contactFrames);
  if (samples.length > 1) {
    for (let offset = 0; offset < samples.length; offset += 4) {
      const page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      drawPageString(page, fonts, 'Contact sheet', true, {
        x: MARGIN,
        y: PAGE_HEIGHT - MARGIN,
        size: 14,
        color: rgb(0.04, 0.07, 0.13),
      });
      const group = samples.slice(offset, offset + 4);
      const columns = 2;
      const rows = 2;
      const gap = 16;
      const top = PAGE_HEIGHT - MARGIN - 28;
      const cellWidth = (PAGE_WIDTH - MARGIN * 2 - gap) / columns;
      const cellHeight = (top - MARGIN - gap) / rows;
      group.forEach((timeMs, index) => {
        const column = index % columns;
        const row = Math.floor(index / columns);
        const x = MARGIN + column * (cellWidth + gap);
        const y = top - (row + 1) * cellHeight - row * gap;
        drawPageString(page, fonts, `${timeMs} ms`, false, {
          x,
          y: y + cellHeight - 12,
          size: 9,
          color: rgb(0.12, 0.16, 0.22),
        });
        drawDiagram(page, fonts, sampleTacticalProjectAtTime(project, timeMs), sceneId, {
          x,
          y,
          width: cellWidth,
          height: cellHeight - 16,
        });
      });
    }
  }

  const pdfBytes = await pdf.save();
  const zip = new JSZip();
  const zipDate = new Date('1980-01-01T00:00:00.000Z');
  zip.file('coaching.pdf', pdfBytes, { date: zipDate });
  zip.file('metadata.json', JSON.stringify({
    tool: 'inmotools-tactical-matchboard',
    kind: 'coaching-pdf-package',
    schemaVersion: 1,
    metadata,
    placement: {
      pdfInfoDictionary: [...PDF_INFO_FIELDS],
      drawnOnPage: [...PDF_PAGE_TEXT_FIELDS],
    },
    samplesMs: samples,
  }, null, 2), { date: zipDate });
  return zip.generateAsync({
    type: 'uint8array',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
    platform: 'DOS',
  });
}

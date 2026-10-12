import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { PDFArray, PDFDict, PDFDocument, PDFName, PDFRawStream, PDFRef, decodePDFRawStream } from 'pdf-lib';
import JSZip from 'jszip';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { measureTrajectory, sampleAuthoredTrajectory } from '../../src/tools/tactics/analysis-engine';
import { addPlayerToken, addRosterPlayer, addTeam, addAnnotation } from '../../src/tools/tactics/editor-engine';
import {
  ANALYTICS_CLAIM_BOUNDARY,
  MAX_FRAME_SEQUENCE_FRAMES,
  MAX_VIDEO_EXPORT_FRAMES,
  MEDIABUNNY_CONTAINER_CODECS,
  MEDIABUNNY_PIN,
  RASTER_STILL_FORMATS,
  SOCIAL_STILL_PRESETS,
  VIDEO_EXPORT_CANDIDATES,
  applyExportMetadata,
  buildAnalyticsReport,
  buildStandalonePlaybackHtml,
  composeSocialCardSvg,
  exportAnalyticsCsv,
  exportAnalyticsJson,
  exportFileStem,
  exportFrameSequenceZip,
  exportNegotiatedVideo,
  negotiateVideoExports,
  probeRasterFormats,
  rasterSignatureMatches,
  rasterizeSvg,
  readExportMetadata,
  requireNegotiatedCandidate,
  sampleExportTimes,
  videoContainerTags,
  type RasterSurface,
  type VideoExportCandidate,
} from '../../src/tools/tactics/export-engine';
import { PDF_INFO_FIELDS, PDF_PAGE_TEXT_FIELDS, renderCoachingPdfPackage } from '../../src/tools/tactics/export-pdf';
import { encodeTacticalVideo, probeTacticalVideoExports } from '../../src/tools/tactics/export-video-runtime';
import { addTimelineTrack } from '../../src/tools/tactics/timeline-engine';
import { createStarterTacticalProject } from '../../src/tools/tactics/tactics-engine';
import type { TacticalProject } from '../../src/tools/tactics/tactics-types';

function utf16be(bytes: Buffer): string {
  let text = '';
  for (let index = 0; index + 1 < bytes.length; index += 2) {
    text += String.fromCharCode((bytes[index]! << 8) | bytes[index + 1]!);
  }
  return text;
}

function decodePdfLiterals(source: string): string {
  return source.replace(/<([0-9A-Fa-f\s]+)>/g, (literal, hex: string) => {
    const compact = hex.replace(/\s+/g, '');
    if (!compact || compact.length % 2 !== 0) return literal;
    const bytes = Buffer.from(compact, 'hex');
    if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) return utf16be(bytes.subarray(2));
    return bytes.toString('latin1');
  });
}

function unicodeCmapCodePoints(source: string): number[] {
  const points: number[] = [];
  for (const block of source.split('beginbfchar').slice(1)) {
    const body = block.split('endbfchar')[0] ?? '';
    const pairs = body.matchAll(/<[0-9A-Fa-f]{4}>\s+<([0-9A-Fa-f]+)>/g);
    for (const pair of pairs) {
      const unicode = pair[1] ?? '';
      for (let index = 0; index < unicode.length; index += 4) {
        points.push(Number.parseInt(unicode.slice(index, index + 4), 16));
      }
    }
  }
  return points;
}

function streamText(stream: unknown): string {
  return stream instanceof PDFRawStream ? Buffer.from(decodePDFRawStream(stream).decode()).toString('latin1') : '';
}

/** Strings drawn on one page, decoded through each font's ToUnicode map (WinAnsi fonts read as Latin-1). */
async function drawnPageText(pdfBytes: Uint8Array, pageIndex = 0): Promise<string[]> {
  const pdf = await PDFDocument.load(pdfBytes);
  const page = pdf.getPage(pageIndex);
  const fontDict = page.node.Resources()?.lookup(PDFName.of('Font'), PDFDict);
  const maps = new Map<string, Map<string, string> | null>();
  for (const [name, ref] of fontDict?.entries() ?? []) {
    const font = pdf.context.lookup(ref, PDFDict);
    const cmap = streamText(font.lookup(PDFName.of('ToUnicode')));
    if (!cmap) {
      maps.set(name.asString(), null);
      continue;
    }
    const glyphs = new Map<string, string>();
    for (const pair of cmap.matchAll(/<([0-9A-Fa-f]{4})>\s+<([0-9A-Fa-f]+)>/g)) {
      glyphs.set(pair[1]!.toUpperCase(), Buffer.from(pair[2]!, 'hex').swap16().toString('utf16le'));
    }
    maps.set(name.asString(), glyphs);
  }
  const contents = page.node.get(PDFName.of('Contents'));
  const refs = contents instanceof PDFArray ? contents.asArray() : [contents];
  const source = refs.map((ref) => streamText(ref instanceof PDFRef ? pdf.context.lookup(ref) : ref)).join('\n');
  const strings: string[] = [];
  let current: Map<string, string> | null = null;
  for (const match of source.matchAll(/(\/\S+)\s+[\d.]+\s+Tf|<([0-9A-Fa-f]*)>\s*Tj/g)) {
    if (match[1]) {
      current = maps.get(match[1]) ?? null;
      continue;
    }
    const hex = match[2] ?? '';
    if (!current) {
      strings.push(Buffer.from(hex, 'hex').toString('latin1'));
      continue;
    }
    let text = '';
    for (let index = 0; index < hex.length; index += 4) text += current.get(hex.slice(index, index + 4).toUpperCase()) ?? '\uFFFD';
    strings.push(text);
  }
  return strings;
}

function namedProject(teams: Array<{ id: string; name: string; players: string[] }>): TacticalProject {
  let project = { ...coachingProject(), teams: [] } as TacticalProject;
  project = { ...project, playerTokens: [] };
  for (const team of teams) {
    project = addTeam(project, { id: team.id, name: team.name, primaryColor: '#154c79', secondaryColor: '#ffffff', roster: [] });
    team.players.forEach((displayName, index) => {
      project = addRosterPlayer(project, team.id, { id: `${team.id}-${index}`, displayName, jerseyNumber: String(index + 1), role: 'Midfielder', status: 'active' });
    });
  }
  return project;
}

async function loadExportPdfWithFontSpy(fail = false) {
  vi.resetModules();
  const embed = vi.fn();
  vi.doMock('../../src/tools/tactics/pdf-unicode-font', async () => {
    const actual = await vi.importActual<typeof import('../../src/tools/tactics/pdf-unicode-font')>('../../src/tools/tactics/pdf-unicode-font');
    return {
      ...actual,
      embedMatchboardUnicodeFonts: (...args: Parameters<typeof actual.embedMatchboardUnicodeFonts>) => {
        embed(...args);
        return fail ? Promise.reject(new Error('font chunk blocked')) : actual.embedMatchboardUnicodeFonts(...args);
      },
    };
  });
  const module = await import('../../src/tools/tactics/export-pdf');
  return { render: module.renderCoachingPdfPackage, embed };
}

async function readPackage(bytes: Uint8Array) {
  const zip = await JSZip.loadAsync(bytes);
  const pdfBytes = await zip.file('coaching.pdf')?.async('uint8array') ?? new Uint8Array();
  const sidecar = JSON.parse(await zip.file('metadata.json')?.async('string') ?? '{}') as {
    metadata: { notes: string };
    teams: Array<{ name: string; players: string[] }>;
    placement: { drawnOnPageOutsideBasicLatin: string[] };
  };
  return { pdfBytes, sidecar, inflated: inflatePdfStreams(pdfBytes) };
}

function inflatePdfStreams(bytes: Uint8Array): string {
  const source = Buffer.from(bytes);
  let decoded = '';
  let cursor = 0;
  while (cursor < source.length) {
    const start = source.indexOf('stream\n', cursor);
    if (start < 0) break;
    const dataStart = start + 'stream\n'.length;
    const end = source.indexOf('\nendstream', dataStart);
    if (end < 0) break;
    const chunk = source.subarray(dataStart, end);
    try {
      decoded += inflateSync(chunk).toString('latin1');
    } catch {
      decoded += chunk.toString('latin1');
    }
    cursor = end + '\nendstream'.length;
  }
  return decoded;
}

const PNG_BYTES = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='), (char) => char.charCodeAt(0));
const JPEG_BYTES = Uint8Array.from([0xff, 0xd8, 0xff, 0xd9]);
const WEBP_BYTES = Uint8Array.from([
  0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
]);

function coachingProject(): TacticalProject {
  let project = createStarterTacticalProject();
  project = applyExportMetadata(project, {
    title: 'Pressing shape',
    description: 'Near-side press',
    creator: 'Coach Rivera',
    club: 'Harbor FC',
    ageGroup: 'U14',
    sessionType: 'Training',
    tacticalTheme: 'Press',
    tagsText: 'press, wide',
    rights: 'Club training use',
    license: 'Internal',
    language: 'en',
    notes: 'Keep the press. </script><script>alert(1)</script>',
  }, '2026-09-29T12:00:00.000Z');
  project = addTeam(project, {
    id: 'home',
    name: 'Harbor',
    primaryColor: '#154c79',
    secondaryColor: '#ffffff',
    roster: [],
  });
  project = addRosterPlayer(project, 'home', {
    id: 'p9',
    displayName: 'Player 9',
    jerseyNumber: '9',
    role: 'Forward',
    status: 'active',
  });
  project = addPlayerToken(project, {
    id: 'token-p9',
    playerId: 'p9',
    teamId: 'home',
    sceneId: 'scene-1',
    layerId: 'layer-1',
    position: { x: 0.2, y: 0.5 },
    rotationDeg: 0,
    visible: true,
    locked: false,
  });
  project = addAnnotation(project, {
    id: 'arrow-press',
    sceneId: 'scene-1',
    layerId: 'layer-1',
    kind: 'arrow',
    label: 'Press',
    points: [{ x: 0.2, y: 0.4 }, { x: 0.7, y: 0.3 }],
    visible: true,
  });
  project = {
    ...project,
    timeline: addTimelineTrack({
      ...project.timeline,
      durationMs: 1000,
    }, {
      id: 'track-token-p9',
      targetId: 'token-p9',
      keyframes: [
        { id: 'k0', timeMs: 0, position: { x: 0.2, y: 0.5 }, interpolation: 'linear' },
        { id: 'k1', timeMs: 1000, position: { x: 0.8, y: 0.5 }, interpolation: 'linear' },
      ],
    }),
  };
  return project;
}

function surface(bytes: Uint8Array, mime: string): RasterSurface {
  return {
    width: 32,
    height: 32,
    async drawSvg() {
      return undefined;
    },
    async toBlob(requested) {
      return new Blob([bytes], { type: requested === mime ? mime : 'application/octet-stream' });
    },
  };
}

describe('Tactical export metadata', () => {
  it('stores the coaching fields and preserves the original creation date', () => {
    const project = createStarterTacticalProject();
    const createdAt = project.metadata.createdAt;
    const next = applyExportMetadata(project, {
      title: 'Build & press <session>',
      description: 'First action',
      creator: 'A. Coach',
      club: 'Northside',
      ageGroup: 'U12',
      sessionType: 'Drill',
      tacticalTheme: 'Build-out',
      tagsText: 'build-out, press\npress',
      rights: 'Private',
      license: 'All rights reserved',
      language: 'en-US',
      notes: 'Stay compact.',
    }, '2026-09-29T15:04:05.000Z');

    expect(readExportMetadata(next)).toMatchObject({
      title: 'Build & press <session>',
      creator: 'A. Coach',
      club: 'Northside',
      ageGroup: 'U12',
      sessionType: 'Drill',
      tacticalTheme: 'Build-out',
      tags: ['build-out', 'press'],
      language: 'en-US',
      createdAt,
      modifiedAt: '2026-09-29T15:04:05.000Z',
      notes: 'Stay compact.',
    });
    expect(exportFileStem(next.metadata.title)).toBe('build-press-session');
    expect(project.metadata.title).toBe('Untitled tactical project');
  });

  it('rejects metadata that cannot be stored honestly', () => {
    const project = createStarterTacticalProject();
    expect(() => applyExportMetadata(project, {
      title: 'x'.repeat(121),
      description: '',
      creator: '',
      club: '',
      ageGroup: '',
      sessionType: '',
      tacticalTheme: '',
      tagsText: '',
      rights: '',
      license: '',
      language: '',
      notes: '',
    }, '2026-09-29T15:04:05.000Z')).toThrow(/title/i);
    expect(() => applyExportMetadata(project, {
      title: 'Session',
      description: '',
      creator: '',
      club: '',
      ageGroup: '',
      sessionType: '',
      tacticalTheme: '',
      tagsText: '',
      rights: '',
      license: '',
      language: 'english',
      notes: '',
    }, '2026-09-29T15:04:05.000Z')).toThrow(/language/i);
  });
});

describe('Tactical still, social, and standalone export', () => {
  it('composes even social-card sizes and escapes active text', () => {
    const project = coachingProject();
    const svg = composeSocialCardSvg(project, 'scene-1', 'square');
    expect(SOCIAL_STILL_PRESETS.square).toMatchObject({ width: 1080, height: 1080 });
    expect(svg).toContain('width="1080"');
    expect(svg).toContain('height="1080"');
    expect(svg).toContain('Pressing shape');
    expect(svg).toContain('Harbor FC');
    expect(svg).not.toContain('<script');
    expect(svg).toContain('&lt;/script&gt;');
    expect(svg).toContain('data-tactical-kind="player"');
  });

  it('builds a local playback document that cannot execute notes as HTML', () => {
    const html = buildStandalonePlaybackHtml(coachingProject(), 'scene-1', { maxFrames: 3, frameRate: 10 });
    expect(html.startsWith('<!DOCTYPE html>')).toBe(true);
    expect(html).toContain('type="application/json"');
    expect(html).toContain('\\u003c/script\\u003e');
    expect(html).not.toContain('<script src');
    expect(html.replaceAll('http://www.w3.org/2000/svg', '')).not.toMatch(/https?:\/\//);
    expect(html).toContain('@media (max-width: 720px)');
    expect(html).toContain('prefers-reduced-motion');
    expect(html).toContain('prefers-color-scheme: light');
    expect(html).toContain('clamp(');
    expect(html).toContain('Local playback of authored frames');
    const json = html.match(/<script type="application\/json" id="tactical-playback-data">([\s\S]*?)<\/script>/)?.[1];
    const payload = JSON.parse(json ?? '{}') as { frames: Array<{ timeMs: number; svg: string }> };
    expect(payload.frames.length).toBeGreaterThan(1);
    expect(payload.frames[0]?.timeMs).toBe(0);
    expect(payload.frames.every((frame) => frame.svg.includes('<svg'))).toBe(true);
  });

  it('offers a raster format only after the browser write probe succeeds and checks the file signature', async () => {
    const supported = await probeRasterFormats(async (mime) => mime === 'image/png');
    expect(supported.map((format) => format.mime)).toEqual(['image/png']);
    expect(RASTER_STILL_FORMATS.map((format) => format.id)).toEqual(['png', 'jpeg', 'webp']);

    const png = await rasterizeSvg('<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"></svg>', {
      mime: 'image/png',
      width: 32,
      height: 32,
      quality: 0.92,
      createSurface: () => surface(PNG_BYTES, 'image/png'),
    });
    const pngBytes = new Uint8Array(await png.arrayBuffer());
    expect(rasterSignatureMatches(pngBytes, 'image/png')).toBe(true);
    expect(Array.from(pngBytes.slice(0, 8))).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

    await expect(rasterizeSvg('<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"></svg>', {
      mime: 'image/webp',
      width: 32,
      height: 32,
      quality: 0.92,
      createSurface: () => surface(JPEG_BYTES, 'image/jpeg'),
    })).rejects.toThrow(/webp/i);
    expect(rasterSignatureMatches(WEBP_BYTES, 'image/webp')).toBe(true);
  });
});

describe('Tactical PDF contact sheets and analytics reports', () => {
  it('writes a vector PDF package with info-dictionary fields and a metadata sidecar', async () => {
    const project = coachingProject();
    const bytes = await renderCoachingPdfPackage(project, 'scene-1', { contactFrames: 4 });
    expect(Array.from(bytes.slice(0, 2))).toEqual([0x50, 0x4b]);
    const zip = await JSZip.loadAsync(bytes);
    const pdfBytes = await zip.file('coaching.pdf')?.async('uint8array');
    const sidecar = JSON.parse(await zip.file('metadata.json')?.async('string') ?? '{}') as {
      metadata: { club: string; notes: string };
      placement: { pdfInfoDictionary: string[]; drawnOnPage: string[] };
    };
    expect(pdfBytes?.slice(0, 5)).toEqual(Uint8Array.from([0x25, 0x50, 0x44, 0x46, 0x2d]));
    const pdf = await PDFDocument.load(pdfBytes ?? new Uint8Array());
    expect(pdf.getPageCount()).toBeGreaterThan(1);
    expect(pdf.getTitle()).toBe('Pressing shape');
    expect(pdf.getAuthor()).toBe('Coach Rivera');
    expect(pdf.getSubject()).toBe('Near-side press');
    expect(pdf.getKeywords()).toContain('press');
    expect(sidecar.metadata.club).toBe('Harbor FC');
    expect(sidecar.metadata.notes).toContain('Keep the press.');
    expect(sidecar.placement.pdfInfoDictionary).toEqual([...PDF_INFO_FIELDS]);
    expect(sidecar.placement.drawnOnPage).toEqual([...PDF_PAGE_TEXT_FIELDS]);
    const decoded = decodePdfLiterals(inflatePdfStreams(pdfBytes ?? new Uint8Array()));
    expect(decoded).toContain('Press');
    expect(decoded).toContain('Harbor FC');
    expect(decoded).toContain('Contact sheet');
    expect(decoded).not.toContain('Harbor: Player 9');
  });

  it('embeds accented Latin, Greek, and Cyrillic player and team names with the Unicode font', async () => {
    let project = coachingProject();
    project = applyExportMetadata(project, {
      title: 'José',
      description: 'Near-side press',
      creator: 'Coach Rivera',
      club: 'Αθήνα',
      ageGroup: 'U14',
      sessionType: 'Training',
      tacticalTheme: 'Press',
      tagsText: 'press',
      rights: 'Club training use',
      license: 'Internal',
      language: 'en',
      notes: 'é ß',
    }, '2026-09-29T12:00:00.000Z');
    project = {
      ...project,
      teams: project.teams.map((team) => team.id === 'home'
        ? { ...team, name: 'Спартак', roster: team.roster.map((player) => player.id === 'p9' ? { ...player, displayName: 'André' } : player) }
        : team),
    };
    project = addRosterPlayer(project, 'home', {
      id: 'p10',
      displayName: 'Иванов',
      jerseyNumber: '10',
      role: 'Forward',
      status: 'active',
    });
    project = addAnnotation(project, {
      id: 'arrow-name',
      sceneId: 'scene-1',
      layerId: 'layer-1',
      kind: 'arrow',
      label: 'Αθήνα',
      points: [{ x: 0.3, y: 0.4 }, { x: 0.6, y: 0.4 }],
      visible: true,
    });

    const bytes = await renderCoachingPdfPackage(project, 'scene-1', { contactFrames: 1 });
    const zip = await JSZip.loadAsync(bytes);
    const pdfBytes = await zip.file('coaching.pdf')?.async('uint8array');
    const sidecar = JSON.parse(await zip.file('metadata.json')?.async('string') ?? '{}') as { metadata: { notes: string; club: string } };
    expect(pdfBytes).toBeDefined();
    const pdf = await PDFDocument.load(pdfBytes ?? new Uint8Array());
    expect(pdf.getTitle()).toBe('José');
    expect(sidecar.metadata.club).toBe('Αθήνα');
    expect(sidecar.metadata.notes).toBe('é ß');
    const inflated = inflatePdfStreams(pdfBytes ?? new Uint8Array());
    expect(inflated).toContain('/Encoding /Identity-H');
    expect(inflated).toContain('/FontFile2');
    expect(inflated).toMatch(/\/BaseFont \/NotoSans-Regular/);
    expect(inflated).toMatch(/\/BaseFont \/NotoSans-Bold/);
    expect(inflated).not.toMatch(/\/BaseFont \/NotoSans\S*\n\/Encoding \/WinAnsiEncoding/);
    const encoded = unicodeCmapCodePoints(inflated);
    for (const sample of ['José', 'Αθήνα', 'André', 'Спартак', 'Иванов', 'é', 'ß']) {
      for (const char of sample) expect(encoded).toContain(char.codePointAt(0) ?? -1);
    }
    expect(inflated).toContain('/WinAnsiEncoding');
    expect(decodePdfLiterals(inflated)).toContain('Press');
  });

  it('draws an uncovered glyph as a question mark and still builds the PDF', async () => {
    const project = applyExportMetadata(coachingProject(), {
      title: 'Pressing shape',
      description: 'Near-side press',
      creator: 'Coach Rivera',
      club: 'Harbor FC',
      ageGroup: 'U14',
      sessionType: 'Training',
      tacticalTheme: 'Press',
      tagsText: 'press',
      rights: 'Club training use',
      license: 'Internal',
      language: 'en',
      notes: 'Keep 字',
    }, '2026-09-29T12:00:00.000Z');
    const bytes = await renderCoachingPdfPackage(project, 'scene-1', { contactFrames: 1 });
    const zip = await JSZip.loadAsync(bytes);
    const pdfBytes = await zip.file('coaching.pdf')?.async('uint8array');
    const sidecar = JSON.parse(await zip.file('metadata.json')?.async('string') ?? '{}') as { metadata: { notes: string } };
    expect(sidecar.metadata.notes).toContain('字');
    const pdf = await PDFDocument.load(pdfBytes ?? new Uint8Array());
    expect(pdf.getPageCount()).toBe(1);
    const inflated = inflatePdfStreams(pdfBytes ?? new Uint8Array());
    const encoded = unicodeCmapCodePoints(inflated);
    expect(encoded).not.toContain('字'.codePointAt(0) ?? -1);
    expect(encoded).toContain('?'.codePointAt(0) ?? -1);
    expect(inflated).toContain('/Encoding /Identity-H');
  });

  it('keeps an unsupported roster name in metadata.json while the page shows ?', async () => {
    const project = namedProject([{ id: 'home', name: 'Harbor', players: ['字', 'José'] }]);
    const { pdfBytes, sidecar } = await readPackage(await renderCoachingPdfPackage(project, 'scene-1', { contactFrames: 1 }));
    expect(sidecar.teams).toEqual([{ name: 'Harbor', players: ['字', 'José'] }]);
    expect(sidecar.placement.drawnOnPageOutsideBasicLatin).toEqual(['teams']);
    const drawn = await drawnPageText(pdfBytes);
    expect(drawn).toContain('Teams: Harbor: ?, José');
    expect(drawn.join('\n')).not.toContain('字');
  });

  it('keeps two basic-Latin teams on Helvetica with no Teams line and no Unicode font load', async () => {
    const { render, embed } = await loadExportPdfWithFontSpy();
    try {
      const project = namedProject([
        { id: 'home', name: 'Harbor', players: ['Player 9', 'Player 10'] },
        { id: 'away', name: 'Rivers', players: ['Player 4'] },
      ]);
      const { pdfBytes, sidecar, inflated } = await readPackage(await render(project, 'scene-1', { contactFrames: 1 }));
      expect(embed).not.toHaveBeenCalled();
      expect(inflated).not.toContain('/Identity-H');
      expect(inflated).not.toMatch(/\/BaseFont \/NotoSans/);
      expect((await drawnPageText(pdfBytes)).some((text) => text.startsWith('Teams:'))).toBe(false);
      expect(sidecar.teams.map((team) => team.name)).toEqual(['Harbor', 'Rivers']);
    } finally {
      vi.doUnmock('../../src/tools/tactics/pdf-unicode-font');
      vi.resetModules();
    }
  });

  it('loads the Unicode font only for drawn text, not for tags or another scene', async () => {
    const { render, embed } = await loadExportPdfWithFontSpy();
    try {
      let project = applyExportMetadata(coachingProject(), {
        title: 'Pressing shape',
        description: 'Αθήνα',
        creator: 'Иванов',
        club: 'Harbor FC',
        ageGroup: 'U14',
        sessionType: 'Training',
        tacticalTheme: 'Press',
        tagsText: 'Αθήνα',
        rights: 'Club training use',
        license: 'Internal',
        language: 'en',
        notes: 'Keep the press.',
      }, '2026-09-29T12:00:00.000Z');
      project = { ...project, scenes: [...project.scenes, { ...project.scenes[0]!, id: 'scene-other', name: 'Other scene' }] };
      project = addAnnotation(project, {
        id: 'elsewhere',
        sceneId: 'scene-other',
        layerId: 'layer-1',
        kind: 'arrow',
        label: 'Спартак',
        points: [{ x: 0.1, y: 0.1 }, { x: 0.2, y: 0.2 }],
        visible: true,
      });
      const { pdfBytes } = await readPackage(await render(project, 'scene-1', { contactFrames: 1 }));
      expect(embed).not.toHaveBeenCalled();
      const pdf = await PDFDocument.load(pdfBytes);
      expect(pdf.getSubject()).toBe('Αθήνα');
      expect(pdf.getAuthor()).toBe('Иванов');
    } finally {
      vi.doUnmock('../../src/tools/tactics/pdf-unicode-font');
      vi.resetModules();
    }
  });

  it('ends a roster longer than six lines with a visible +N more marker', async () => {
    const players = Array.from({ length: 64 }, (_, index) => `Игрок номер ${index + 1}`);
    const project = namedProject([{ id: 'home', name: 'Спартак', players }]);
    const { pdfBytes, sidecar } = await readPackage(await renderCoachingPdfPackage(project, 'scene-1', { contactFrames: 1 }));
    expect(sidecar.teams[0]?.players).toHaveLength(64);
    const drawn = await drawnPageText(pdfBytes);
    const teamsStart = drawn.findIndex((text) => text.startsWith('Teams: Спартак: Игрок номер 1,'));
    expect(teamsStart).toBeGreaterThanOrEqual(0);
    const teamLines = drawn.slice(teamsStart, teamsStart + 6);
    const marker = /\(\+(\d+) more in metadata\.json\)$/.exec(teamLines[5] ?? '');
    expect(marker).not.toBeNull();
    const shown = teamLines.join(' ').match(/Игрок номер \d+/g) ?? [];
    expect(shown.length + Number(marker?.[1])).toBe(64);
    expect(drawn[teamsStart + 6] ?? '').not.toMatch(/Игрок номер/);
  });

  it('prints a team with no name without a leading colon', async () => {
    const project = namedProject([{ id: 'home', name: '', players: ['André', 'Иванов'] }]);
    const { pdfBytes } = await readPackage(await renderCoachingPdfPackage(project, 'scene-1', { contactFrames: 1 }));
    expect(await drawnPageText(pdfBytes)).toContain('Teams: André, Иванов');
  });

  it('composes a decomposed accent before drawing it', async () => {
    const project = applyExportMetadata(coachingProject(), {
      title: 'Jose\u0301',
      description: 'Near-side press',
      creator: 'Coach Rivera',
      club: 'Harbor FC',
      ageGroup: 'U14',
      sessionType: 'Training',
      tacticalTheme: 'Press',
      tagsText: 'press',
      rights: 'Club training use',
      license: 'Internal',
      language: 'en',
      notes: 'Keep the press.',
    }, '2026-09-29T12:00:00.000Z');
    const { pdfBytes, inflated } = await readPackage(await renderCoachingPdfPackage(project, 'scene-1', { contactFrames: 1 }));
    expect(await drawnPageText(pdfBytes)).toContain('José');
    const encoded = unicodeCmapCodePoints(inflated);
    expect(encoded).toContain(0x00e9);
    expect(encoded).not.toContain(0x0301);
  });

  it('reports a Unicode font load failure and still builds the PDF with ?', async () => {
    const { render, embed } = await loadExportPdfWithFontSpy(true);
    try {
      const project = namedProject([{ id: 'home', name: 'Αθήνα', players: ['José'] }]);
      const unavailable = vi.fn();
      const { pdfBytes, sidecar } = await readPackage(await render(project, 'scene-1', { contactFrames: 1, onUnicodeFontUnavailable: unavailable }));
      expect(embed).toHaveBeenCalledTimes(1);
      expect(unavailable).toHaveBeenCalledTimes(1);
      expect(sidecar.teams).toEqual([{ name: 'Αθήνα', players: ['José'] }]);
      expect(await drawnPageText(pdfBytes)).toContain('Teams: ?????: Jos?');
    } finally {
      vi.doUnmock('../../src/tools/tactics/pdf-unicode-font');
      vi.resetModules();
    }
  });

  it('exports source-honest trajectory and team-geometry metrics', () => {
    const project = coachingProject();
    const report = buildAnalyticsReport(project, 'scene-1');
    const track = project.timeline.tracks[0];
    expect(track).toBeDefined();
    const samples = sampleAuthoredTrajectory(track!, 0, 1000, 100);
    const metrics = measureTrajectory(samples, project.pitch.dimensions, 'authored');
    const distance = report.rows.find((row) => row.subjectId === 'token-p9' && row.metric === 'distance_meters');
    expect(distance?.value).toBeCloseTo(metrics.distanceMeters, 3);
    expect(distance?.source).toBe('authored');
    expect(report.honesty).toBe(ANALYTICS_CLAIM_BOUNDARY);
    expect(report.rows.every((row) => row.claimBoundary === ANALYTICS_CLAIM_BOUNDARY)).toBe(true);
    expect(report.rows.some((row) => row.section === 'team-geometry' && row.subjectId === 'home')).toBe(true);

    const imported = buildAnalyticsReport({
      ...project,
      importProvenance: [...project.importProvenance, {
        sourceType: 'trajectory-csv',
        sourceName: 'session.csv',
        importedAt: '2026-09-29T12:00:00.000Z',
      }],
    }, 'scene-1');
    expect(imported.trajectoryProvenance).toBe('imported');
    expect(imported.rows.find((row) => row.metric === 'distance_meters')?.source).toBe('imported');

    const csv = exportAnalyticsCsv(report);
    const json = exportAnalyticsJson(report);
    expect(csv.split('\n')[0]).toBe('section,subject_id,metric,value,unit,source,claim_boundary');
    expect(csv).toContain('distance_meters');
    expect(json).toContain(ANALYTICS_CLAIM_BOUNDARY);
    expect(json).not.toMatch(/expected goals|win probability|gps latitude|gps track/i);
    expect(Object.keys(report.rows[0] ?? {})).not.toContain('probability');
  });
});

describe('Tactical video capability negotiation and frame fallback', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('samples integer times inside the frame cap', () => {
    const times = sampleExportTimes(1000, 30, 4);
    expect(times[0]).toBe(0);
    expect(times[times.length - 1]).toBe(1000);
    expect(times.length).toBeLessThanOrEqual(4);
    expect(times.every((time) => Number.isInteger(time))).toBe(true);
    expect(MAX_FRAME_SEQUENCE_FRAMES).toBeGreaterThan(4);
    expect(MAX_VIDEO_EXPORT_FRAMES).toBe(60);
    expect(MAX_VIDEO_EXPORT_FRAMES).toBeGreaterThan(12);
    const capped = sampleExportTimes(60_000, 30, MAX_VIDEO_EXPORT_FRAMES);
    expect(capped.length).toBe(MAX_VIDEO_EXPORT_FRAMES);
    expect(capped.length).toBeGreaterThan(12);
  });

  it('exposes a video combination only when the container and encoder both accept it', async () => {
    const probed: string[] = [];
    const probe = {
      async canEncodeVideo(codec: VideoExportCandidate['codec']) {
        probed.push(codec);
        return codec === 'vp9';
      },
    };
    const negotiated = await negotiateVideoExports(probe);
    expect(negotiated.map((candidate) => candidate.id)).toEqual(['webm-vp9-1280x720-30']);
    expect(MEDIABUNNY_CONTAINER_CODECS.webm).toEqual(['vp8', 'vp9', 'av1']);
    expect(MEDIABUNNY_CONTAINER_CODECS.mp4).toContain('avc');

    const rejected = await negotiateVideoExports({
      async canEncodeVideo() {
        return true;
      },
    }, [{
      id: 'webm-avc-1280x720-30',
      container: 'webm',
      codec: 'avc',
      width: 1280,
      height: 720,
      frameRate: 30,
      bitrate: 2_500_000,
    }]);
    expect(rejected).toEqual([]);
    expect(() => requireNegotiatedCandidate('mp4-avc-1280x720-30', negotiated)).toThrow(/encoder/i);
  });

  it('does not call the encoder for an unconfirmed format and writes a vector frame ZIP', async () => {
    const project = coachingProject();
    let encoded = 0;
    await expect(exportNegotiatedVideo({
      project,
      sceneId: 'scene-1',
      candidateId: 'mp4-avc-1280x720-30',
      negotiated: [],
      encode: async () => {
        encoded += 1;
        return new Uint8Array([1]);
      },
    })).rejects.toThrow(/encoder/i);
    expect(encoded).toBe(0);

    const confirmed = VIDEO_EXPORT_CANDIDATES.find((candidate) => candidate.id === 'webm-vp9-1280x720-30');
    expect(confirmed).toBeDefined();
    const video = await exportNegotiatedVideo({
      project,
      sceneId: 'scene-1',
      candidateId: confirmed!.id,
      negotiated: [confirmed!],
      maxFrames: 3,
      encode: async (request) => {
        expect(request.candidate.id).toBe(confirmed!.id);
        expect(request.frames.length).toBeGreaterThan(1);
        expect(request.frames[0]?.svg).toContain('data-tactical-kind="player"');
        expect(request.tags.artist).toBe('Coach Rivera');
        expect(request.tags).not.toHaveProperty('club');
        return Uint8Array.from([0x1a, 0x45, 0xdf, 0xa3, 0x01]);
      },
    });
    expect(Array.from(video.slice(0, 4))).toEqual([0x1a, 0x45, 0xdf, 0xa3]);
    expect(videoContainerTags(readExportMetadata(project)).comment).toContain('Keep the press.');

    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-04T10:00:00.900Z'));
    const first = await exportFrameSequenceZip(project, 'scene-1', { maxFrames: 3, frameRate: 10 });
    vi.setSystemTime(new Date('2026-10-04T10:00:03.100Z'));
    const second = await exportFrameSequenceZip(project, 'scene-1', { maxFrames: 3, frameRate: 10 });
    vi.useRealTimers();
    expect(Array.from(first)).toEqual(Array.from(second));
    const zip = await JSZip.loadAsync(first);
    const manifest = JSON.parse(await zip.file('manifest.json')?.async('string') ?? '{}') as {
      kind: string;
      note: string;
      frames: Array<{ file: string; timeMs: number }>;
    };
    expect(manifest.kind).toBe('frame-sequence');
    expect(manifest.note).toMatch(/not a playable video/i);
    expect(manifest.frames.length).toBeGreaterThan(1);
    const frame = await zip.file(manifest.frames[0]?.file ?? '')?.async('string');
    expect(frame).toContain('<svg');
    expect(frame).toContain('Pressing shape');
    const sidecar = JSON.parse(await zip.file('metadata.json')?.async('string') ?? '{}') as { club: string };
    expect(sidecar.club).toBe('Harbor FC');
  });

  it('stamps every frame ZIP entry, including the frames/ folder, with the fixed 1980-01-01 date', async () => {
    const zip = await JSZip.loadAsync(await exportFrameSequenceZip(coachingProject(), 'scene-1', { maxFrames: 3, frameRate: 10 }));
    const entries = Object.values(zip.files);
    expect(entries.some((entry) => entry.dir && entry.name === 'frames/')).toBe(true);
    for (const entry of entries) expect(entry.date.toISOString(), entry.name).toBe('1980-01-01T00:00:00.000Z');
  });

  it('pins MEDIABUNNY_PIN to the mediabunny version installed by package.json', () => {
    const manifest = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
    const installed = manifest.dependencies?.mediabunny ?? manifest.devDependencies?.mediabunny;
    expect(installed).toMatch(/^\d+\.\d+\.\d+$/);
    expect(MEDIABUNNY_PIN).toBe(installed);
  });

  it('uses the pinned Mediabunny probe and withholds video when VideoEncoder is absent', async () => {
    const negotiated = await probeTacticalVideoExports();
    for (const candidate of negotiated) {
      expect(VIDEO_EXPORT_CANDIDATES.map((item) => item.id)).toContain(candidate.id);
      expect(MEDIABUNNY_CONTAINER_CODECS[candidate.container]).toContain(candidate.codec);
    }
    if (typeof VideoEncoder === 'undefined') expect(negotiated).toEqual([]);
    const project = coachingProject();
    await expect(encodeTacticalVideo(
      project,
      'scene-1',
      VIDEO_EXPORT_CANDIDATES[0]!,
      [VIDEO_EXPORT_CANDIDATES[0]!],
    )).rejects.toThrow(/frame-sequence|encoder/i);
  });
});

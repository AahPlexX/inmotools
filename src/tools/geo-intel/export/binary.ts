// Binary exports: PDF brief (jsPDF), PNG with tEXt metadata, social card, ZIP bundle.

import { formatDuration } from '../core/solar';
import type { LocationProfile } from '../core/types';
import { attributionLines, type ResolvedMetadata } from './formats';

// ---------------- PNG metadata (tEXt chunks, PNG spec §11.3.4.3) ----------------

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const byte of bytes) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** tEXt is Latin-1 only; characters outside it are replaced so the chunk stays valid. */
const latin1 = (text: string) => Uint8Array.from([...text.normalize('NFC')].map((c) => (c.charCodeAt(0) <= 255 && c.length === 1 ? c.charCodeAt(0) : 63)));

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  out.set(latin1(type), 4);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

export function pngTextEntries(meta: ResolvedMetadata, extra: Record<string, string> = {}): Record<string, string> {
  const entries: Record<string, string> = {
    Title: meta.title, Author: meta.author, Description: meta.description, Copyright: meta.licenseText,
    'Creation Time': meta.date, Software: 'InMo Tools · Geo Intelligence Hub', Keywords: meta.tags.join(', '), Comment: meta.notes, ...extra,
  };
  return Object.fromEntries(Object.entries(entries).filter(([, value]) => value && value.trim()));
}

/** Inserts tEXt chunks right after IHDR. */
export function injectPngText(png: Uint8Array, entries: Record<string, string>): Uint8Array {
  const ihdrEnd = 8 + 12 + new DataView(png.buffer, png.byteOffset).getUint32(8);
  const chunks = Object.entries(entries).map(([key, value]) => chunk('tEXt', Uint8Array.from([...latin1(key.slice(0, 79)), 0, ...latin1(value)])));
  const total = png.length + chunks.reduce((sum, item) => sum + item.length, 0);
  const out = new Uint8Array(total);
  out.set(png.subarray(0, ihdrEnd), 0);
  let offset = ihdrEnd;
  for (const item of chunks) { out.set(item, offset); offset += item.length; }
  out.set(png.subarray(ihdrEnd), offset);
  return out;
}

export function readPngText(png: Uint8Array): Record<string, string> {
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  const out: Record<string, string> = {};
  let offset = 8;
  while (offset + 8 <= png.length) {
    const length = view.getUint32(offset);
    const type = String.fromCharCode(...png.subarray(offset + 4, offset + 8));
    if (type === 'tEXt') {
      const data = png.subarray(offset + 8, offset + 8 + length);
      const zero = data.indexOf(0);
      out[String.fromCharCode(...data.subarray(0, zero))] = String.fromCharCode(...data.subarray(zero + 1));
    }
    if (type === 'IEND') break;
    offset += 12 + length;
  }
  return out;
}

/** Rasterises an SVG document (browser only). Scale is capped at 2× device pixels. */
export async function svgToPng(svg: string, width: number, height: number, scale = Math.min(2, globalThis.devicePixelRatio || 1)): Promise<Uint8Array> {
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
  try {
    const image = new Image();
    image.decoding = 'async';
    const loaded = new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = () => reject(new Error('Could not render the map image')); });
    image.src = url;
    await loaded;
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas is not available');
    context.scale(scale, scale);
    context.drawImage(image, 0, 0, width, height);
    return await canvasToPng(canvas);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function canvasToPng(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('PNG encoding failed');
  return new Uint8Array(await blob.arrayBuffer());
}

export const svgSize = (svg: string) => {
  const match = /<svg[^>]*\bwidth="(\d+)"[^>]*\bheight="(\d+)"/.exec(svg);
  return { width: Number(match?.[1] ?? 1600), height: Number(match?.[2] ?? 900) };
};

// ---------------- Social card (1200 × 630) ----------------

export interface CardModel { title: string; subtitle: string; flag: string; stats: Array<[string, string]>; tags: string[]; footer: string }

const fieldValue = (profile: LocationProfile, key: string) => profile.fields.find((item) => item.key === key)?.value ?? null;

export function cardModel(profile: LocationProfile, meta: ResolvedMetadata, timeText: string): CardModel {
  const countryName = String(fieldValue(profile, 'country.name') ?? '').replace(/^\p{Regional_Indicator}{2}\s*/u, '');
  const population = fieldValue(profile, 'wb.SP.POP.TOTL');
  const elevation = fieldValue(profile, 'elevation.metres');
  const stats: Array<[string, string]> = [
    ['Coordinates', `${profile.lat.toFixed(4)}, ${profile.lon.toFixed(4)}`],
    ['Time zone', `${profile.timezone ?? '—'} · ${String(fieldValue(profile, 'tz.offset') ?? '')}`],
    ['Local time', timeText],
    ['Elevation', typeof elevation === 'number' ? `${Math.round(elevation).toLocaleString('en-US')} m` : '—'],
    ['Country population', typeof population === 'number' ? new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(population) : '—'],
    ['Daylight', formatDuration(profile.solar?.dayLengthSeconds ?? null)],
  ];
  const flag = profile.countryCode ? String.fromCodePoint(...[...profile.countryCode].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65)) : '';
  return { title: meta.title, subtitle: [profile.label !== meta.title ? profile.label : '', countryName].filter(Boolean).join(' · '), flag, stats, tags: meta.tags.slice(0, 6), footer: `${meta.author ? `${meta.author} · ` : ''}${meta.date} · Data: ${profile.sourcesUsed.filter((id) => !['computed', 'user', 'device'].includes(id)).length} open sources` };
}

function fitText(context: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (context.measureText(text).width <= maxWidth) return text;
  let out = text;
  while (out.length > 1 && context.measureText(`${out}…`).width > maxWidth) out = out.slice(0, -1);
  return `${out}…`;
}

export function drawCard(canvas: HTMLCanvasElement, model: CardModel): void {
  canvas.width = 1200; canvas.height = 630;
  const c = canvas.getContext('2d');
  if (!c) throw new Error('Canvas is not available');
  const gradient = c.createLinearGradient(0, 0, 1200, 630);
  gradient.addColorStop(0, '#0b1220'); gradient.addColorStop(1, '#16335c');
  c.fillStyle = gradient; c.fillRect(0, 0, 1200, 630);
  c.fillStyle = '#ffd166'; c.fillRect(64, 64, 8, 120);
  c.fillStyle = '#ffffff'; c.textBaseline = 'top';
  c.font = '700 60px system-ui, -apple-system, "Segoe UI", sans-serif';
  c.fillText(fitText(c, `${model.flag ? `${model.flag} ` : ''}${model.title}`, 1060), 96, 64);
  c.fillStyle = '#c9d6ea'; c.font = '400 30px system-ui, -apple-system, "Segoe UI", sans-serif';
  c.fillText(fitText(c, model.subtitle, 1060), 96, 144);
  model.stats.forEach(([label, value], i) => {
    const x = 64 + (i % 3) * 360; const y = 250 + Math.floor(i / 3) * 130;
    c.fillStyle = 'rgba(255,255,255,0.08)'; c.fillRect(x, y, 336, 108);
    c.fillStyle = '#9fb3cf'; c.font = '600 20px system-ui, sans-serif'; c.fillText(label.toUpperCase(), x + 20, y + 18);
    c.fillStyle = '#ffffff'; c.font = '700 30px system-ui, sans-serif'; c.fillText(fitText(c, value, 296), x + 20, y + 54);
  });
  let tx = 64;
  c.font = '600 20px system-ui, sans-serif';
  for (const tag of model.tags) {
    const w = c.measureText(`#${tag}`).width + 28;
    if (tx + w > 1136) break;
    c.fillStyle = 'rgba(255,209,102,0.18)'; c.fillRect(tx, 530, w, 36);
    c.fillStyle = '#ffd166'; c.fillText(`#${tag}`, tx + 14, 538);
    tx += w + 12;
  }
  c.fillStyle = '#9fb3cf'; c.font = '400 18px system-ui, sans-serif';
  c.fillText(fitText(c, model.footer, 1072), 64, 590);
}

// ---------------- PDF brief ----------------

/** Standard PDF fonts cover WinAnsi only: keep Latin letters (stripping marks if needed) and drop the rest. */
export function pdfSafe(text: string): string {
  return [...text.replace(/\p{Regional_Indicator}/gu, '').replace(/[–—]/g, '-').replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/≈/g, '~').replace(/→/g, '->').replace(/−/g, '-').replace(/·/g, '|')]
    .map((char) => (char.charCodeAt(0) <= 255 ? char : char.normalize('NFKD').replace(/[^\u0000-\u00ff]/g, '')))
    .join('').trim();
}

export interface PdfTimeFormatter { (iso: string | null): string }

export async function buildPdf(profile: LocationProfile, meta: ResolvedMetadata, formatTime: PdfTimeFormatter): Promise<Blob> {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  doc.setProperties({ title: pdfSafe(meta.title), author: pdfSafe(meta.author), subject: pdfSafe(meta.description || `Location brief for ${profile.label}`), keywords: pdfSafe(meta.tags.join(', ')), creator: 'InMo Tools · Geo Intelligence Hub' });
  const W = doc.internal.pageSize.getWidth();
  const margin = 40;
  let y = 48;
  const get = (key: string) => profile.fields.find((item) => item.key === key);
  const text = (value: unknown) => (value === null || value === undefined || value === '' ? '-' : pdfSafe(String(value)));
  doc.setFont('helvetica', 'bold'); doc.setFontSize(18);
  doc.text(doc.splitTextToSize(text(meta.title), W - 2 * margin) as string[], margin, y); y += 24;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(90);
  doc.text(text(`${meta.date}${meta.author ? ` | ${meta.author}` : ''}${meta.tags.length ? ` | ${meta.tags.map((t) => `#${t}`).join(' ')}` : ''} | License: ${meta.licenseText}`), margin, y); y += 14;
  if (meta.description) { doc.text(doc.splitTextToSize(text(meta.description), W - 2 * margin) as string[], margin, y); y += 14; }
  doc.setTextColor(0);
  const section = (title: string, rows: Array<[string, unknown]>) => {
    const visible = rows.filter(([, value]) => value !== null && value !== undefined && value !== '');
    if (!visible.length) return;
    if (y > 760) { doc.addPage(); y = 48; }
    y += 10; doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.text(title, margin, y); y += 4;
    doc.setDrawColor(200); doc.line(margin, y, W - margin, y); y += 12;
    doc.setFontSize(9);
    for (const [label, value] of visible) {
      const lines = doc.splitTextToSize(text(value), W - 2 * margin - 170) as string[];
      if (y + lines.length * 11 > 800) { doc.addPage(); y = 48; }
      doc.setFont('helvetica', 'bold'); doc.text(label, margin, y);
      doc.setFont('helvetica', 'normal'); doc.text(lines, margin + 170, y);
      y += lines.length * 11 + 2;
    }
  };
  const holidays = profile.holidays;
  section('Location', [['Label', profile.label], ['Coordinates', `${profile.lat.toFixed(6)}, ${profile.lon.toFixed(6)}`], ['Confidence', get('location.lat')?.confidence_class], ['Plus Code', get('codes.plusCode')?.value], ['DMS', get('codes.dms')?.value], ['UTM / MGRS', [get('codes.utm')?.value, get('codes.mgrs')?.value].filter(Boolean).join(' | ')], ['Address', get('address.display')?.value ?? [get('address.street')?.value, get('address.postcode')?.value, get('address.city')?.value].filter(Boolean).join(', ')]]);
  section('Administrative areas', profile.adminChain.map((level) => [`ADM${level.level}`, `${level.name}${level.code ? ` (${level.code})` : ''}`]));
  section('Country', [['Country', get('country.name')?.value], ['ISO codes', [get('country.a2')?.value, get('country.a3')?.value, get('country.n3')?.value].filter(Boolean).join(' / ')], ['Capital', get('country.capital')?.value], ['Region', [get('country.region')?.value, get('country.subregion')?.value].filter(Boolean).join(' / ')], ['Currency', get('country.currency')?.value], ['Calling code | TLD', [get('country.callingCodes')?.value, get('country.tld')?.value].filter(Boolean).join(' | ')], ['Languages', get('country.languages')?.value], ['Drives on the', get('country.drivingSide')?.value]]);
  const pop = get('wb.SP.POP.TOTL');
  section('Population & indicators', [
    ['Country population', pop ? `${Number(pop.value).toLocaleString('en-US')} (${pop.reference_year}, World Bank)` : null],
    ...profile.fields.filter((item) => item.group === 'indicators' || item.key.startsWith('eu.population') || item.key === 'wb.EN.POP.DNST').map((item): [string, unknown] => [item.label, `${typeof item.value === 'number' ? item.value.toLocaleString('en-US', { maximumFractionDigits: 1 }) : item.value}${item.unit ? ` ${item.unit}` : ''}${item.reference_year ? ` (${item.reference_year})` : ''}`]),
    ['Nearest populated place', get('population.nearestPlace')?.value],
  ]);
  section('Time', [['Time zone', get('tz.name')?.value], ['UTC offset', `${get('tz.offset')?.value ?? ''}${get('tz.dst')?.value === true ? ' (DST)' : ''}`], ['Next change', get('tz.nextTransition')?.value]]);
  const solar = profile.solar;
  section('Sun', solar ? [['Sunrise / sunset', `${formatTime(solar.sunrise)} / ${formatTime(solar.sunset)}`], ['Solar noon', formatTime(solar.solarNoon)], ['Daylight', formatDuration(solar.dayLengthSeconds)], ['Golden hour', [solar.goldenMorning, solar.goldenEvening].map((w) => (w ? `${formatTime(w[0])}-${formatTime(w[1])}` : '-')).join(' | ')], ['Blue hour', [solar.blueMorning, solar.blueEvening].map((w) => (w ? `${formatTime(w[0])}-${formatTime(w[1])}` : '-')).join(' | ')]] : []);
  const elevation = get('elevation.metres');
  section('Elevation', elevation ? [['Elevation', `${elevation.value} m (${get('elevation.feet')?.value} ft)`], ['Dataset', elevation.note]] : []);
  section('Public holidays', holidays ? [['Holidays in year', `${holidays.items.length} (${holidays.items.filter((h) => h.global).length} nationwide) in ${holidays.year}`], ['Next', get('holidays.next')?.value]] : []);
  if (meta.notes) section('Notes', [['Notes', meta.notes]]);
  section('Sources & licenses', attributionLines([profile]).map((line, i) => [`[${i + 1}]`, line]));
  if (profile.warnings.length) section('Caveats', profile.warnings.map((warning, i) => [`${i + 1}.`, warning]));
  return doc.output('blob');
}

// ---------------- ZIP bundle ----------------

export interface BundleFile { name: string; data: Blob | Uint8Array | string }

export async function buildZip(files: BundleFile[], readme: string): Promise<Blob> {
  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();
  zip.file('README.txt', readme);
  for (const file of files) zip.file(file.name, file.data);
  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
}

export function bundleReadme(profiles: LocationProfile[], meta: ResolvedMetadata, files: string[]): string {
  return [
    meta.title, '='.repeat(Math.min(72, meta.title.length || 1)), '',
    meta.description, '',
    `Author: ${meta.author || '-'}`, `Date: ${meta.date}`, `License: ${meta.licenseText}`, `Tags: ${meta.tags.join(', ') || '-'}`, meta.notes ? `Notes: ${meta.notes}` : '', '',
    'Contents:', ...files.map((name) => `  - ${name}`), '',
    'Locations:', ...profiles.map((p) => `  - ${p.label} (${p.lat.toFixed(6)}, ${p.lon.toFixed(6)})`), '',
    'Sources and required attribution:', ...attributionLines(profiles).map((line) => `  - ${line}`), '',
    'Generated with InMo Tools · Geo Intelligence Hub. Every value in the JSON export carries its source, license, reference year, retrieval time and confidence class.',
  ].filter((line, i, all) => !(line === '' && all[i - 1] === '')).join('\r\n');
}

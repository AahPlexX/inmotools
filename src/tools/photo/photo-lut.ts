import type { PhotoLut } from './photo-types';

export const MAX_CUBE_FILE_BYTES = 16 * 1024 * 1024;
export const MAX_CUBE_LUT_SIZE = 65;

const BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const decodedCache = new Map<string, Float32Array>();
const MAX_CACHE_ENTRIES = 4;

export interface PreparedPhotoLut {
  lut: PhotoLut;
  values: Float32Array;
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function cacheDecoded(data: string, values: Float32Array): void {
  decodedCache.delete(data);
  decodedCache.set(data, values);
  while (decodedCache.size > MAX_CACHE_ENTRIES) decodedCache.delete(decodedCache.keys().next().value as string);
}

function safeFileName(value: string): string {
  const leaf = value.split(/[\\/]/).at(-1)?.trim() || 'imported.cube';
  return leaf.replace(/[\u0000-\u001f<>:"|?*]/g, '-').slice(0, 160) || 'imported.cube';
}

function safeTitle(value: string, fallback: string): string {
  const clean = value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  return (clean || fallback.replace(/\.cube$/i, '') || 'Imported LUT').slice(0, 120);
}

function stripComment(line: string): string {
  let quote = '';
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if ((character === '"' || character === "'") && (!quote || quote === character)) {
      quote = quote ? '' : character;
    } else if (character === '#' && !quote) {
      return line.slice(0, index);
    }
  }
  return line;
}

function parseFiniteValues(value: string, count: number, lineNumber: number, label: string): number[] {
  const tokens = value.trim().split(/\s+/).filter(Boolean);
  if (tokens.length !== count) throw new Error(`${label} on line ${lineNumber} must contain ${count} numeric values.`);
  const values = tokens.map(Number);
  if (values.some((entry) => !Number.isFinite(entry) || Math.abs(entry) > 1_000_000)) {
    throw new Error(`${label} on line ${lineNumber} contains an invalid number.`);
  }
  return values;
}

function encodeFloatData(values: Float32Array): string {
  const bytes = new Uint8Array(values.length * 4);
  const view = new DataView(bytes.buffer);
  values.forEach((value, index) => view.setFloat32(index * 4, value, true));
  let result = '';
  for (let index = 0; index < bytes.length; index += 3) {
    const a = bytes[index];
    const hasB = index + 1 < bytes.length;
    const hasC = index + 2 < bytes.length;
    const b = hasB ? bytes[index + 1] : 0;
    const c = hasC ? bytes[index + 2] : 0;
    result += BASE64[a >> 2];
    result += BASE64[((a & 3) << 4) | (b >> 4)];
    result += hasB ? BASE64[((b & 15) << 2) | (c >> 6)] : '=';
    result += hasC ? BASE64[c & 63] : '=';
  }
  return result;
}

function decodeFloatData(data: string, expectedValues: number): Float32Array {
  const cached = decodedCache.get(data);
  if (cached?.length === expectedValues) return cached;
  if (data.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(data)) throw new Error('The LUT pixel data is not valid base64.');
  const padding = data.endsWith('==') ? 2 : data.endsWith('=') ? 1 : 0;
  const bytes = new Uint8Array((data.length / 4) * 3 - padding);
  let write = 0;
  for (let index = 0; index < data.length; index += 4) {
    const a = BASE64.indexOf(data[index]);
    const b = BASE64.indexOf(data[index + 1]);
    const c = data[index + 2] === '=' ? 0 : BASE64.indexOf(data[index + 2]);
    const d = data[index + 3] === '=' ? 0 : BASE64.indexOf(data[index + 3]);
    if (a < 0 || b < 0 || c < 0 || d < 0) throw new Error('The LUT pixel data is not valid base64.');
    bytes[write] = (a << 2) | (b >> 4);
    if (write + 1 < bytes.length) bytes[write + 1] = ((b & 15) << 4) | (c >> 2);
    if (write + 2 < bytes.length) bytes[write + 2] = ((c & 3) << 6) | d;
    write += 3;
  }
  if (bytes.length !== expectedValues * 4) throw new Error('The LUT pixel data length does not match its grid size.');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const values = new Float32Array(expectedValues);
  for (let index = 0; index < expectedValues; index += 1) values[index] = view.getFloat32(index * 4, true);
  for (const value of values) {
    if (!Number.isFinite(value)) throw new Error('The LUT pixel data contains a non-finite value.');
  }
  cacheDecoded(data, values);
  return values;
}

function validDomain(value: unknown): value is [number, number, number] {
  return Array.isArray(value)
    && value.length === 3
    && value.every((entry) => typeof entry === 'number' && Number.isFinite(entry) && Math.abs(entry) <= 1_000_000);
}

export function normalizePhotoLut(value: unknown): PhotoLut | null {
  if (!value || typeof value !== 'object') return null;
  const source = value as Partial<PhotoLut>;
  const size = Number(source.size);
  if (!Number.isInteger(size) || size < 2 || size > MAX_CUBE_LUT_SIZE) return null;
  if (!validDomain(source.domainMin) || !validDomain(source.domainMax)) return null;
  if (source.domainMin.some((entry, index) => entry >= source.domainMax![index])) return null;
  if (typeof source.data !== 'string') return null;
  try {
    decodeFloatData(source.data, size ** 3 * 3);
  } catch {
    return null;
  }
  const fileName = safeFileName(typeof source.fileName === 'string' ? source.fileName : 'imported.cube');
  return {
    fileName,
    title: safeTitle(typeof source.title === 'string' ? source.title : '', fileName),
    size,
    domainMin: [...source.domainMin] as [number, number, number],
    domainMax: [...source.domainMax] as [number, number, number],
    data: source.data,
    strength: clamp(typeof source.strength === 'number' ? source.strength : 1, 0, 1),
  };
}

export function parseCubeLut(text: string, sourceFileName = 'imported.cube'): PhotoLut {
  if (text.length > MAX_CUBE_FILE_BYTES) throw new Error('Cube files must be 16 MiB or smaller.');
  const fileName = safeFileName(sourceFileName);
  let title = '';
  let size: number | null = null;
  let domainMin: [number, number, number] = [0, 0, 0];
  let domainMax: [number, number, number] = [1, 1, 1];
  const rows: number[] = [];
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/);

  for (let index = 0; index < lines.length; index += 1) {
    const lineNumber = index + 1;
    const line = stripComment(lines[index]).trim();
    if (!line) continue;
    const [keyword = '', ...rest] = line.split(/\s+/);
    const value = rest.join(' ');
    switch (keyword.toUpperCase()) {
      case 'TITLE': {
        const match = value.match(/^(["'])(.*)\1$/);
        title = safeTitle(match ? match[2] : value, fileName);
        break;
      }
      case 'LUT_3D_SIZE': {
        const parsed = Number(value);
        if (!Number.isInteger(parsed) || parsed < 2 || parsed > MAX_CUBE_LUT_SIZE) {
          throw new Error(`LUT_3D_SIZE on line ${lineNumber} must be between 2 and ${MAX_CUBE_LUT_SIZE}.`);
        }
        if (size !== null) throw new Error(`LUT_3D_SIZE is repeated on line ${lineNumber}.`);
        size = parsed;
        break;
      }
      case 'DOMAIN_MIN':
        domainMin = parseFiniteValues(value, 3, lineNumber, 'DOMAIN_MIN') as [number, number, number];
        break;
      case 'DOMAIN_MAX':
        domainMax = parseFiniteValues(value, 3, lineNumber, 'DOMAIN_MAX') as [number, number, number];
        break;
      case 'LUT_3D_INPUT_RANGE': {
        const range = parseFiniteValues(value, 2, lineNumber, 'LUT_3D_INPUT_RANGE');
        domainMin = [range[0], range[0], range[0]];
        domainMax = [range[1], range[1], range[1]];
        break;
      }
      case 'LUT_1D_SIZE':
      case 'LUT_1D_INPUT_RANGE':
        throw new Error('1D LUTs and combined 1D/3D Cube files are not supported. Import a 3D Cube LUT.');
      default: {
        if (size === null) throw new Error(`Expected LUT_3D_SIZE before data on line ${lineNumber}.`);
        const values = parseFiniteValues(line, 3, lineNumber, 'LUT data');
        rows.push(...values);
        if (rows.length / 3 > size ** 3) throw new Error(`LUT_3D_SIZE ${size} requires exactly ${size ** 3} rows.`);
      }
    }
  }

  if (size === null) throw new Error('The Cube file is missing LUT_3D_SIZE.');
  if (domainMin.some((entry, index) => entry >= domainMax[index])) {
    throw new Error('Every DOMAIN_MIN value must be smaller than its DOMAIN_MAX value.');
  }
  const expectedRows = size ** 3;
  if (rows.length / 3 !== expectedRows) throw new Error(`LUT_3D_SIZE ${size} requires exactly ${expectedRows} rows.`);
  const values = Float32Array.from(rows);
  const data = encodeFloatData(values);
  cacheDecoded(data, values);
  return {
    fileName,
    title: safeTitle(title, fileName),
    size,
    domainMin,
    domainMax,
    data,
    strength: 1,
  };
}

export function preparePhotoLut(lut: PhotoLut | null | undefined): PreparedPhotoLut | null {
  const normalized = normalizePhotoLut(lut);
  if (!normalized || normalized.strength <= 0) return null;
  return { lut: normalized, values: decodeFloatData(normalized.data, normalized.size ** 3 * 3) };
}

function rawSample({ lut, values }: PreparedPhotoLut, rgb: [number, number, number]): [number, number, number] {
  const position = rgb.map((value, channel) => (
    clamp((value - lut.domainMin[channel]) / (lut.domainMax[channel] - lut.domainMin[channel]), 0, 1) * (lut.size - 1)
  ));
  const low = position.map(Math.floor);
  const high = low.map((value) => Math.min(lut.size - 1, value + 1));
  const fraction = position.map((value, channel) => value - low[channel]);
  const output: [number, number, number] = [0, 0, 0];
  for (let blue = 0; blue < 2; blue += 1) {
    for (let green = 0; green < 2; green += 1) {
      for (let red = 0; red < 2; red += 1) {
        const r = red ? high[0] : low[0];
        const g = green ? high[1] : low[1];
        const b = blue ? high[2] : low[2];
        const weight = (red ? fraction[0] : 1 - fraction[0])
          * (green ? fraction[1] : 1 - fraction[1])
          * (blue ? fraction[2] : 1 - fraction[2]);
        const offset = ((b * lut.size + g) * lut.size + r) * 3;
        output[0] += values[offset] * weight;
        output[1] += values[offset + 1] * weight;
        output[2] += values[offset + 2] * weight;
      }
    }
  }
  return output;
}

export function samplePreparedPhotoLut(prepared: PreparedPhotoLut, rgb: [number, number, number]): [number, number, number] {
  const original: [number, number, number] = rgb.map((value) => clamp(value, 0, 1)) as [number, number, number];
  const sampled = rawSample(prepared, original);
  return sampled.map((value, channel) => clamp(
    original[channel] + (value - original[channel]) * prepared.lut.strength,
    0,
    1,
  )) as [number, number, number];
}

export function samplePhotoLut(lut: PhotoLut, rgb: [number, number, number]): [number, number, number] {
  const prepared = preparePhotoLut(lut);
  if (!prepared) return rgb.map((value) => clamp(value, 0, 1)) as [number, number, number];
  return samplePreparedPhotoLut(prepared, rgb);
}

function formatCubeNumber(value: number): string {
  return Number(value.toPrecision(9)).toString();
}

export function serializeCubeLut(lut: PhotoLut): string {
  const normalized = normalizePhotoLut(lut);
  if (!normalized) throw new Error('There is no valid active 3D LUT to export.');
  const prepared = { lut: normalized, values: decodeFloatData(normalized.data, normalized.size ** 3 * 3) };
  const percent = Math.round(normalized.strength * 100);
  const title = safeTitle(`${normalized.title} (${percent}% strength)`, normalized.fileName).replace(/"/g, "'");
  const lines = [
    `TITLE "${title}"`,
    `LUT_3D_SIZE ${normalized.size}`,
    `DOMAIN_MIN ${normalized.domainMin.map(formatCubeNumber).join(' ')}`,
    `DOMAIN_MAX ${normalized.domainMax.map(formatCubeNumber).join(' ')}`,
  ];
  for (let blue = 0; blue < normalized.size; blue += 1) {
    for (let green = 0; green < normalized.size; green += 1) {
      for (let red = 0; red < normalized.size; red += 1) {
        const offset = ((blue * normalized.size + green) * normalized.size + red) * 3;
        const source = [red, green, blue].map((index, channel) => (
          normalized.domainMin[channel]
            + (normalized.domainMax[channel] - normalized.domainMin[channel]) * index / (normalized.size - 1)
        ));
        const output = [0, 1, 2].map((channel) => (
          source[channel] + (prepared.values[offset + channel] - source[channel]) * normalized.strength
        ));
        lines.push(output.map(formatCubeNumber).join(' '));
      }
    }
  }
  return `${lines.join('\n')}\n`;
}

export function suggestPhotoLutFilename(lut: PhotoLut): string {
  const stem = safeFileName(lut.fileName).replace(/\.cube$/i, '') || 'photo-lut';
  return `${stem}-${Math.round(clamp(lut.strength, 0, 1) * 100)}pct.cube`;
}

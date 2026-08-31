import Papa from 'papaparse';
import { XMLBuilder, XMLParser } from 'fast-xml-parser';
import { parse as parseToml, stringify as stringifyToml } from 'smol-toml';
import YAML from 'yaml';

export type StructuredFormat = 'json' | 'yaml' | 'toml' | 'xml' | 'csv';
export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

const isPlainRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export const normalizeJsonValue = (value: unknown): JsonValue => {
  if (value === null) return null;
  if (typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'bigint') return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map((item) => normalizeJsonValue(item));
  if (isPlainRecord(value)) {
    const entries = Object.entries(value)
      .filter(([, item]) => item !== undefined && typeof item !== 'function' && typeof item !== 'symbol')
      .map(([key, item]) => [key, normalizeJsonValue(item)] as const);
    return Object.fromEntries(entries) as { [key: string]: JsonValue };
  }
  return String(value);
};

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@',
  parseTagValue: true,
  parseAttributeValue: true,
  trimValues: true,
});

const xmlBuilder = new XMLBuilder({
  ignoreAttributes: false,
  attributeNamePrefix: '@',
  format: true,
});

export const parseStructuredText = (text: string, format: StructuredFormat): JsonValue => {
  if (format === 'json') return normalizeJsonValue(JSON.parse(text));
  if (format === 'yaml') return normalizeJsonValue(YAML.parse(text));
  if (format === 'toml') return normalizeJsonValue(parseToml(text));
  if (format === 'xml') return normalizeJsonValue(xmlParser.parse(text));

  const parsed = Papa.parse<Record<string, unknown>>(text, {
    header: true,
    dynamicTyping: true,
    skipEmptyLines: 'greedy',
  });
  const fatal = parsed.errors.find((item) => item.type === 'Quotes' || item.type === 'Delimiter');
  if (fatal) throw new Error(`CSV parse failed: ${fatal.message}`);
  return normalizeJsonValue(parsed.data);
};

const requireTomlObject = (value: JsonValue): Record<string, unknown> => {
  if (!isPlainRecord(value)) throw new Error('TOML export requires an object at the document root.');
  return value;
};

export const serializeStructuredData = (value: JsonValue, format: StructuredFormat): string => {
  const canonical = normalizeJsonValue(value);
  if (format === 'json') return `${JSON.stringify(canonical, null, 2)}\n`;
  if (format === 'yaml') return YAML.stringify(canonical);
  if (format === 'toml') return stringifyToml(requireTomlObject(canonical));
  if (format === 'xml') return xmlBuilder.build(canonical);
  if (!Array.isArray(canonical)) throw new Error('CSV export requires an array of rows.');
  return Papa.unparse(canonical as Array<Record<string, JsonValue>>);
};

import Papa from 'papaparse';
import { XMLBuilder, XMLParser, XMLValidator } from 'fast-xml-parser';
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

// XML and CSV are schema-free. Infer only scalars whose lexical form survives
// the conversion exactly; identifier-like values such as "00123", unsafe
// integers, explicit plus signs, and precision-significant forms remain text.
const inferSchemaFreeScalar = (value: string): string | number | boolean => {
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (!value.length) return value;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return value;
  if (Number.isInteger(numeric) && !Number.isSafeInteger(numeric)) return value;
  return String(numeric) === value ? numeric : value;
};

const inferSchemaFreeValue = (value: unknown): unknown => {
  if (typeof value === 'string') return inferSchemaFreeScalar(value);
  if (Array.isArray(value)) return value.map(inferSchemaFreeValue);
  if (isPlainRecord(value)) return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, inferSchemaFreeValue(item)]));
  return value;
};

function assertJsonNumbersPreservable(text: string): void {
  let index = 0;
  let inString = false;
  let escaped = false;

  while (index < text.length) {
    const character = text[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === '"') inString = false;
      index += 1;
      continue;
    }

    if (character === '"') {
      inString = true;
      index += 1;
      continue;
    }

    if (character === '-' || (character >= '0' && character <= '9')) {
      const match = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(text.slice(index));
      if (match) {
        const token = match[0];
        const numeric = Number(token);
        if (!Number.isFinite(numeric) || (Number.isInteger(numeric) && !Number.isSafeInteger(numeric))) {
          throw new Error(`JSON numeric precision or range cannot be preserved exactly: ${token}. Quote this value as text before importing it.`);
        }
        index += token.length;
        continue;
      }
    }

    index += 1;
  }
}

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@',
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: true,
});

const xmlBuilder = new XMLBuilder({
  ignoreAttributes: false,
  attributeNamePrefix: '@',
  format: true,
});

export const parseStructuredText = (text: string, format: StructuredFormat): JsonValue => {
  if (format === 'json') {
    assertJsonNumbersPreservable(text);
    return normalizeJsonValue(JSON.parse(text));
  }
  if (format === 'yaml') return normalizeJsonValue(YAML.parse(text));
  if (format === 'toml') return normalizeJsonValue(parseToml(text));
  if (format === 'xml') {
    const validation = XMLValidator.validate(text);
    if (validation !== true) {
      const message = validation.err?.msg || 'Document is not well-formed XML.';
      throw new Error(`XML parse failed: ${message}`);
    }
    return normalizeJsonValue(inferSchemaFreeValue(xmlParser.parse(text)));
  }

  const parsed = Papa.parse<Record<string, unknown>>(text, {
    header: true,
    dynamicTyping: false,
    skipEmptyLines: 'greedy',
  });
  const fatal = parsed.errors.find((item) => item.type === 'Quotes' || item.type === 'Delimiter');
  if (fatal) throw new Error(`CSV parse failed: ${fatal.message}`);
  return normalizeJsonValue(inferSchemaFreeValue(parsed.data));
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

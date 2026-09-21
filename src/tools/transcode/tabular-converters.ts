// Registry wiring for the tabular & structured-data suite (F01-F08) and the
// plain-text/encoding suite (F19, F30).

import {
  documentToTable, emitXlsx, jsonToXml, parseDelimited, parseJsonTable,
  parseMarkdownTable, parseNdjson, parseParquet, parseHtmlTable, parseTomlValue, parseXlsx,
  parseYamlValue, plistToJson, tableToPlist, tableToRecords, tableToXml, toDelimited, toHtmlTable,
  toMarkdownTable, toNdjson, toJson, toSql, unflattenRecords, xmlToJson, xmlToTable, emitToml, emitYaml,
  type JsonValue, type SqlDialect, type TableData,
} from './tabular';
import { decodeText } from './text-codecs';
import { writeParquet, type ParquetCompression } from './parquet-writer';
import { registerConverter, swapExtension, textArtifact, bytesArtifact, type ConversionInput, type ConversionOptions } from './transcode-engine';
import { FORMATS, type FormatId } from './formats';

const TABULAR_SOURCES: FormatId[] = ['csv', 'tsv', 'json', 'ndjson', 'parquet', 'xlsx', 'xml', 'plist', 'yaml', 'toml'];

interface TabularParseOptions {
  delimiter?: string;
  hasHeader?: boolean;
  encoding?: string;
  flatten?: boolean;
  sheet?: string;
}

async function parseTabularSource(input: ConversionInput, options: TabularParseOptions): Promise<TableData> {
  const decode = () => decodeText(input.bytes, options.encoding).text;
  switch (input.sourceId) {
    case 'csv':
    case 'tsv': {
      const delimiter = options.delimiter ?? (input.sourceId === 'csv' ? ',' : '\t');
      return parseDelimited(decode(), { delimiter, hasHeader: options.hasHeader ?? true });
    }
    case 'json':
      return parseJsonTable(decode(), options.flatten ?? true);
    case 'ndjson':
      return parseNdjson(decode());
    case 'parquet':
      return parseParquet(input.bytes);
    case 'xlsx': {
      const sheets = await parseXlsx(input.bytes);
      if (sheets.length === 0) throw new Error('The workbook contains no sheets.');
      const wanted = options.sheet ? sheets.find((sheet) => sheet.name === options.sheet) : undefined;
      if (options.sheet && !wanted) throw new Error(`Sheet "${options.sheet}" was not found.`);
      return (wanted ?? sheets[0]).table;
    }
    case 'xml':
      return xmlToTable(xmlToJson(decode()));
    case 'plist':
      return documentToTable(plistToJson(decode()) as unknown as JsonValue);
    case 'yaml':
      return documentToTable(parseYamlValue(decode()));
    case 'toml':
      return documentToTable(parseTomlValue(decode()));
    default:
      throw new Error(`Unsupported tabular source: ${input.sourceId}`);
  }
}

const str = (options: ConversionOptions, key: string, fallback: string): string =>
  typeof options[key] === 'string' ? (options[key] as string) : fallback;

const bool = (options: ConversionOptions, key: string, fallback: boolean): boolean =>
  typeof options[key] === 'boolean' ? (options[key] as boolean) : fallback;

export function registerTabularConverters(): void {
  const emitForTarget = async (table: TableData, input: ConversionInput, options: ConversionOptions, target: string) => {
    switch (target) {
      case 'csv':
        return [textArtifact(swapExtension(input.fileName, 'csv'), toDelimited(table, {
          delimiter: str(options, 'delimiter', ','),
          includeHeader: bool(options, 'header', true),
          quoteAll: bool(options, 'quoteAll', false),
          lineEnding: str(options, 'lineEnding', 'lf') as 'lf' | 'crlf',
        }), 'text/csv;charset=utf-8')];
      case 'tsv':
        return [textArtifact(swapExtension(input.fileName, 'tsv'), toDelimited(table, {
          delimiter: '\t', includeHeader: bool(options, 'header', true), quoteAll: false,
          lineEnding: str(options, 'lineEnding', 'lf') as 'lf' | 'crlf',
        }), 'text/tab-separated-values;charset=utf-8')];
      case 'json': {
        const shape = str(options, 'shape', 'records') as 'records' | 'values';
        const text = toJson(bool(options, 'unflatten', false) ? { columns: table.columns, rows: table.rows } : table, shape, bool(options, 'pretty', true));
        const payload = bool(options, 'unflatten', false)
          ? JSON.stringify(unflattenRecords(table), null, bool(options, 'pretty', true) ? 2 : undefined)
          : text;
        return [textArtifact(swapExtension(input.fileName, 'json'), payload, 'application/json')];
      }
      case 'ndjson':
        return [textArtifact(swapExtension(input.fileName, 'ndjson'), toNdjson(table), 'application/x-ndjson')];
      case 'parquet':
        return [bytesArtifact(swapExtension(input.fileName, 'parquet'), await writeParquet(table, str(options, 'compression', 'snappy') as ParquetCompression), 'application/vnd.apache.parquet')];
      case 'xlsx':
        return [bytesArtifact(swapExtension(input.fileName, 'xlsx'), await emitXlsx([{ name: 'Converted', table }]), FORMATS.xlsx.mime)];
      case 'xml':
        return [textArtifact(swapExtension(input.fileName, 'xml'), tableToXml(table), 'application/xml')];
      case 'plist':
        return [textArtifact(swapExtension(input.fileName, 'plist'), tableToPlist(table), 'application/x-plist')];
      case 'yaml':
        return [textArtifact(swapExtension(input.fileName, 'yaml'), emitYaml(tableToRecords(table) as unknown as JsonValue), 'application/yaml')];
      case 'toml':
        return [textArtifact(swapExtension(input.fileName, 'toml'), emitToml(tableToRecords(table) as unknown as JsonValue), 'application/toml')];
      case 'sql':
        return [textArtifact(swapExtension(input.fileName, 'sql'), toSql(table, {
          dialect: str(options, 'dialect', 'postgresql') as SqlDialect,
          tableName: str(options, 'tableName', 'converted_data'),
          batchSize: Number(options.batchSize ?? 500) || 500,
          createTable: bool(options, 'createTable', true),
        }), 'application/sql')];
      case 'markdown-table':
        return [textArtifact(swapExtension(input.fileName, 'md'), toMarkdownTable(table, str(options, 'style', 'pipe') as 'pipe' | 'grid'), 'text/markdown')];
      case 'html-table':
        return [textArtifact(swapExtension(input.fileName, 'html'), toHtmlTable(table), 'text/html')];
      default:
        throw new Error(`Unsupported tabular target: ${target}`);
    }
  };

  for (const source of TABULAR_SOURCES) {
    const targets = ['csv', 'tsv', 'json', 'ndjson', 'parquet', 'xlsx', 'xml', 'plist', 'yaml', 'toml', 'sql', 'markdown-table', 'html-table'];
    for (const target of targets) {
      // XML-family sources have a reduced target set according to the matrix.
      if (source === 'xml' && !['csv', 'tsv', 'json', 'yaml', 'plist'].includes(target)) continue;
      if (source === 'plist' && !['json', 'xml', 'yaml'].includes(target)) continue;
      if (source === 'yaml' && !['json', 'toml', 'xml', 'csv'].includes(target)) continue;
      if (source === 'toml' && !['json', 'yaml', 'xml'].includes(target)) continue;
      registerConverter(source, target as Parameters<typeof registerConverter>[1], `Convert ${FORMATS[source].label} to ${target.toUpperCase()}`, async (input, options) => {
        const table = await parseTabularSource(input, options as TabularParseOptions);
        return emitForTarget(table, input, options, target);
      });
    }
  }

  // Markdown table -> tabular formats.
  registerConverter('markdown', 'csv', 'Convert a Markdown pipe table to CSV', async (input, options) => {
    const table = parseMarkdownTable(input.text());
    return emitForTarget(table, input, options, 'csv');
  });
  registerConverter('markdown', 'html-table', 'Convert a Markdown pipe table to an HTML table', async (input, options) => {
    const table = parseMarkdownTable(input.text());
    return emitForTarget(table, input, options, 'html-table');
  });

  // HTML table -> tabular formats (when the HTML contains a <table>).
  registerConverter('html', 'csv', 'Extract an HTML table to CSV', async (input, options) => {
    const table = parseHtmlTable(input.text());
    return emitForTarget(table, input, options, 'csv');
  });
  registerConverter('html', 'json', 'Extract an HTML table to JSON', async (input, options) => {
    const table = parseHtmlTable(input.text());
    return emitForTarget(table, input, options, 'json');
  });
  registerConverter('html', 'markdown-table', 'Extract an HTML table to Markdown', async (input, options) => {
    const table = parseHtmlTable(input.text());
    return emitForTarget(table, input, options, 'markdown-table');
  });
}

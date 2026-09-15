import { describe, expect, it } from 'vitest';
import {
  documentToTable, flattenRecords, inferSqlType, jsonToPlist, jsonToXml, parseDelimited, parseJsonTable,
  parseMarkdownTable, parseNdjson, parseTomlValue, parseYamlValue, plistToJson, tableToRecords,
  tableToXml, toDelimited, toMarkdownTable, toNdjson, toJson, toSql, unflattenRecords, xmlToJson,
  xmlToTable, emitToml, emitYaml, type JsonValue, type TableData,
} from '../../src/tools/transcode/tabular';

const sample: TableData = {
  columns: ['id', 'name', 'score', 'active'],
  rows: [
    [1, 'Ada "Ace" Lovelace', 97.5, true],
    [2, 'Grace, Hopper', 99, false],
    [3, 'Multi\nLine', null, null],
  ],
};

describe('delimited codecs', () => {
  it('parses CSV with quotes, embedded commas and newlines', () => {
    const text = 'id,name\n1,"Ada ""Ace"" Lovelace"\n2,"Grace, Hopper"\n3,"Multi\nLine"\n';
    const table = parseDelimited(text, { delimiter: ',' });
    expect(table.columns).toEqual(['id', 'name']);
    expect(table.rows[0]).toEqual(['1', 'Ada "Ace" Lovelace']);
    expect(table.rows[1]).toEqual(['2', 'Grace, Hopper']);
    expect(table.rows[2]).toEqual(['3', 'Multi\nLine']);
  });

  it('round-trips quoting and escaping', () => {
    const csv = toDelimited(sample, { delimiter: ',' });
    const reparsed = parseDelimited(csv, { delimiter: ',' });
    expect(reparsed.rows[0][1]).toBe('Ada "Ace" Lovelace');
    expect(reparsed.rows[1][1]).toBe('Grace, Hopper');
    expect(reparsed.rows[2][1]).toBe('Multi\nLine');
  });

  it('supports headerless parsing and TSV output', () => {
    const table = parseDelimited('a\tb\nc\td', { delimiter: '\t', hasHeader: false });
    expect(table.columns).toEqual(['column_1', 'column_2']);
    expect(table.rows).toEqual([['a', 'b'], ['c', 'd']]);
    const tsv = toDelimited(table, { delimiter: '\t' });
    expect(tsv).toBe('column_1\tcolumn_2\na\tb\nc\td\n');
  });

  it('honors CRLF and quote-all options', () => {
    const csv = toDelimited({ columns: ['a'], rows: [['x']] }, { delimiter: ',', lineEnding: 'crlf', quoteAll: true });
    expect(csv).toBe('"a"\r\n"x"\r\n');
  });

  it('strips a UTF-8 BOM before parsing', () => {
    const table = parseDelimited('\uFEFFa,b\n1,2', { delimiter: ',' });
    expect(table.columns).toEqual(['a', 'b']);
  });
});

describe('json codecs', () => {
  const nested = [
    { id: 1, profile: { name: 'Ada', tags: ['x', 'y'] }, active: true },
    { id: 2, profile: { name: 'Grace' }, active: false },
  ];

  it('flattens nested records into dot-path columns', () => {
    const table = flattenRecords(nested as Array<Record<string, JsonValue>>);
    expect(table.columns).toContain('profile.name');
    expect(table.columns).toContain('profile.tags');
    const tagsCell = table.rows[0][table.columns.indexOf('profile.tags')];
    expect(tagsCell).toBe('["x","y"]');
  });

  it('unflattens dot-path columns back into nesting', () => {
    const table = flattenRecords(nested as Array<Record<string, JsonValue>>);
    const restored = unflattenRecords(table);
    expect(restored[0]).toMatchObject({ id: 1, profile: { name: 'Ada' }, active: true });
    expect(restored[0].profile).toMatchObject({ tags: ['x', 'y'] });
  });

  it('parses top-level objects as single-record tables', () => {
    const table = parseJsonTable('{"a": 1, "b": "two"}', true);
    expect(table.columns).toEqual(['a', 'b']);
    expect(table.rows[0]).toEqual([1, 'two']);
  });

  it('emits records and values shapes', () => {
    const records = toJson(sample, 'records', false);
    expect(JSON.parse(records)[0]).toMatchObject({ id: 1, active: true });
    const values = toJson(sample, 'values', false);
    expect(JSON.parse(values)[0]).toEqual(['id', 'name', 'score', 'active']);
  });

  it('parses and emits NDJSON', () => {
    const table = parseNdjson('{"a":1}\n{"a":2,"b":"x"}\n');
    expect(table.columns).toEqual(['a', 'b']);
    expect(table.rows[1]).toEqual([2, 'x']);
    const ndjson = toNdjson(table);
    expect(ndjson.trim().split('\n')).toHaveLength(2);
  });
});

describe('xml and plist codecs', () => {
  it('converts tables to XML and back', () => {
    const xml = tableToXml(sample);
    expect(xml).toContain('<rows>');
    expect(xml).toContain('<row>');
    const parsed = xmlToTable(xmlToJson(xml));
    expect(parsed.columns).toEqual(expect.arrayContaining(['id', 'name']));
    expect(parsed.rows).toHaveLength(3);
  });

  it('emits valid plist and parses it back', () => {
    const plist = jsonToPlist({ name: 'test', count: 3, flag: true, items: ['a', 'b'] });
    expect(plist).toContain('<plist version="1.0">');
    const back = plistToJson(plist);
    expect(back).toMatchObject({ name: 'test', count: 3, flag: true, items: ['a', 'b'] });
  });
});

describe('yaml and toml codecs', () => {
  it('round-trips YAML documents through tables', () => {
    const value = parseYamlValue('servers:\n  - name: a\n    port: 1\n  - name: b\n    port: 2\n');
    const table = documentToTable(value);
    expect(table.columns).toEqual(expect.arrayContaining(['name', 'port']));
    const yaml = emitYaml(tableToRecords(table) as unknown as JsonValue);
    expect(yaml).toContain('name: a');
  });

  it('round-trips TOML documents', () => {
    const value = parseTomlValue('title = "demo"\n[owner]\nname = "Ada"\n');
    const toml = emitToml(value);
    expect(toml).toContain('title = "demo"');
    expect(toml).toContain('name = "Ada"');
  });
});

describe('sql generation', () => {
  it('infers column types', () => {
    expect(inferSqlType(['1', '2', null])).toBe('INTEGER');
    expect(inferSqlType(['1.5', '2'])).toBe('REAL');
    expect(inferSqlType(['true', 'false'])).toBe('BOOLEAN');
    expect(inferSqlType(['2024-01-02T03:04:05Z', '2024-02-02 03:04:05'])).toBe('TIMESTAMP');
    expect(inferSqlType(['abc', '2'])).toBe('TEXT');
  });

  it('quotes identifiers per dialect and escapes literals', () => {
    const sql = toSql(sample, { dialect: 'postgresql', tableName: 'results' });
    expect(sql).toContain('CREATE TABLE "results"');
    expect(sql).toContain('"name" TEXT');
    expect(sql).toContain("'Ada \"Ace\" Lovelace'");
    expect(sql).toContain("'Grace, Hopper'");
    const quoted = toSql({ columns: ['n'], rows: [["O'Neil"]] }, { dialect: 'sqlite', tableName: 't' });
    expect(quoted).toContain("'O''Neil'");
    const mysql = toSql(sample, { dialect: 'mysql', tableName: 'results' });
    expect(mysql).toContain('`results`');
    expect(mysql).toContain('TINYINT(1)');
  });

  it('batches INSERT statements', () => {
    const big: TableData = { columns: ['n'], rows: Array.from({ length: 7 }, (_, i) => [i]) };
    const sql = toSql(big, { dialect: 'sqlite', tableName: 't', batchSize: 3 });
    expect(sql.match(/INSERT INTO/g)).toHaveLength(3);
  });
});

describe('markdown tables', () => {
  it('emits pipe tables', () => {
    const md = toMarkdownTable(sample);
    expect(md.split('\n')[0]).toBe('| id | name | score | active |');
    expect(md).toContain('| --- | --- | --- | --- |');
    expect(md).toContain('Ada "Ace" Lovelace');
  });

  it('emits grid tables', () => {
    const md = toMarkdownTable({ columns: ['a', 'b'], rows: [['1', '2']] }, 'grid');
    expect(md.startsWith('+')).toBe(true);
    expect(md).toContain('===');
  });

  it('parses pipe tables with escaped pipes', () => {
    const table = parseMarkdownTable('| a | b |\n| --- | --- |\n| x\\|y | 2 |\n');
    expect(table.columns).toEqual(['a', 'b']);
    expect(table.rows[0][0]).toBe('x|y');
  });
});

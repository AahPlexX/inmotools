import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import TranscodeWorkspace from '../../src/tools/transcode/TranscodeWorkspace';
import { availableTargets } from '../../src/tools/transcode/transcode-engine';
import { registerTabularConverters } from '../../src/tools/transcode/tabular-converters';
import { registerEncodingConverters } from '../../src/tools/transcode/encoding-converters';
import { registerDocumentConverters } from '../../src/tools/transcode/documents-converters';
import { registerImageConverters } from '../../src/tools/transcode/images-converters';
import { registerGeoConverters } from '../../src/tools/transcode/geo-converters';
import { registerArchiveConverters } from '../../src/tools/transcode/archives-converters';
import { registerFontConverters } from '../../src/tools/transcode/fonts-converters';
import { registerAudioConverters } from '../../src/tools/transcode/audio-converters';
import { FORMAT_MATRIX } from '../../src/tools/transcode/formats';
import { runConversion } from '../../src/tools/transcode/transcode-engine';

registerTabularConverters();
registerEncodingConverters();
registerDocumentConverters();
registerImageConverters();
registerGeoConverters();
registerArchiveConverters();
registerFontConverters();
registerAudioConverters();

describe('TranscodeWorkspace shell', () => {
  it('renders the intake surface without crashing', () => {
    const html = renderToString(createElement(TranscodeWorkspace));
    expect(html).toContain('Drop files anywhere');
    expect(html).toContain('Choose files');
  });

  it('offers the full tabular target matrix for CSV sources', () => {
    const targets = availableTargets('csv').map((entry) => entry.target);
    for (const expected of ['tsv', 'json', 'ndjson', 'parquet', 'xlsx', 'xml', 'plist', 'yaml', 'toml', 'sql', 'markdown-table', 'html-table']) {
      expect(targets).toContain(expected);
    }
  });

  it('offers encoding targets for binary sources', () => {
    const targets = availableTargets('binary').map((entry) => entry.target);
    expect(targets).toEqual(expect.arrayContaining(['base64', 'hex', 'data-uri']));
  });

  it('runs a CSV -> JSON conversion end to end in memory', async () => {
    const csv = 'id,name\n1,Ada\n2,Grace\n';
    const artifacts = await runConversion('csv', 'json', {
      sourceId: 'csv',
      fileName: 'people.csv',
      bytes: new TextEncoder().encode(csv),
      text: () => csv,
    }, {});
    expect(artifacts).toHaveLength(1);
    expect(artifacts[0].name).toBe('people.json');
    expect(JSON.parse(new TextDecoder().decode(artifacts[0].bytes))).toEqual([
      { id: '1', name: 'Ada' },
      { id: '2', name: 'Grace' },
    ]);
  });

  it('runs a JSON -> SQL conversion end to end in memory', async () => {
    const json = JSON.stringify([{ id: 1, note: "O'Neil" }, { id: 2, note: 'x' }]);
    const artifacts = await runConversion('json', 'sql', {
      sourceId: 'json',
      fileName: 'data.json',
      bytes: new TextEncoder().encode(json),
      text: () => json,
    }, { dialect: 'sqlite', tableName: 'notes' });
    const sql = new TextDecoder().decode(artifacts[0].bytes);
    expect(sql).toContain('CREATE TABLE "notes"');
    expect(sql).toContain("'O''Neil'");
  });

  it('offers document targets for Markdown sources', () => {
    const targets = availableTargets('markdown').map((entry) => entry.target);
    for (const expected of ['html', 'pdf', 'rtf', 'txt', 'docx', 'epub']) {
      expect(targets).toContain(expected);
    }
  });

  it('offers raster, icon, and trace targets for PNG sources', () => {
    const targets = availableTargets('png').map((entry) => entry.target);
    for (const expected of ['jpeg', 'webp', 'avif', 'bmp', 'ico', 'icns', 'svg', 'pdf', 'base64', 'data-uri']) {
      expect(targets).toContain(expected);
    }
  });

  it('offers geospatial targets for GeoJSON, GPX, and KML sources', () => {
    expect(availableTargets('geojson').map((entry) => entry.target)).toEqual(
      expect.arrayContaining(['kml', 'kmz', 'gpx', 'csv', 'wkt', 'svg']),
    );
    expect(availableTargets('gpx').map((entry) => entry.target)).toEqual(
      expect.arrayContaining(['geojson', 'csv', 'kml']),
    );
    expect(availableTargets('kml').map((entry) => entry.target)).toEqual(
      expect.arrayContaining(['geojson', 'gpx', 'csv']),
    );
  });

  it('offers archive and binary targets', () => {
    expect(availableTargets('zip').map((entry) => entry.target)).toEqual(
      expect.arrayContaining(['binary', 'tar', 'tar-gz']),
    );
    expect(availableTargets('tar').map((entry) => entry.target)).toEqual(
      expect.arrayContaining(['zip', 'binary']),
    );
    expect(availableTargets('binary').map((entry) => entry.target)).toEqual(
      expect.arrayContaining(['base64', 'hex', 'data-uri']),
    );
  });

  it('offers audio transcode and analysis targets', () => {
    expect(availableTargets('wav').map((entry) => entry.target)).toEqual(
      expect.arrayContaining(['mp3', 'ogg', 'flac', 'aac', 'waveform-svg', 'spectrogram-png']),
    );
    expect(availableTargets('mp3').map((entry) => entry.target)).toEqual(
      expect.arrayContaining(['wav', 'ogg', 'flac', 'aac', 'waveform-svg', 'spectrogram-png']),
    );
    expect(availableTargets('flac').map((entry) => entry.target)).toEqual(
      expect.arrayContaining(['wav', 'mp3', 'ogg', 'aac']),
    );
  });

  it('offers font targets for TTF/WOFF sources and SVG fonts', () => {
    expect(availableTargets('ttf').map((entry) => entry.target)).toEqual(
      expect.arrayContaining(['woff', 'woff2', 'otf']),
    );
    expect(availableTargets('woff2').map((entry) => entry.target)).toEqual(
      expect.arrayContaining(['ttf', 'otf', 'woff']),
    );
    expect(availableTargets('svg-font').map((entry) => entry.target)).toEqual(
      expect.arrayContaining(['ttf', 'woff', 'woff2']),
    );
  });

  it('offers animation targets for GIF and TIFF sources', () => {
    expect(availableTargets('gif').map((entry) => entry.target)).toEqual(
      expect.arrayContaining(['apng', 'webp', 'sprite-png', 'frames-zip']),
    );
    expect(availableTargets('tiff').map((entry) => entry.target)).toEqual(
      expect.arrayContaining(['png', 'jpeg', 'webp', 'frames-zip']),
    );
  });

  it('runs an RTF -> Markdown conversion end to end in memory', async () => {
    const rtf = '{\\rtf1\\ansi Hello {\\b world}\\par}';
    const artifacts = await runConversion('rtf', 'markdown', {
      sourceId: 'rtf',
      fileName: 'note.rtf',
      bytes: new TextEncoder().encode(rtf),
      text: () => rtf,
    }, {});
    expect(new TextDecoder().decode(artifacts[0].bytes)).toContain('**world**');
  });

  it('declares a deterministic matrix entry for every source format', () => {
    const sources = Object.keys(FORMAT_MATRIX);
    expect(sources.length).toBeGreaterThanOrEqual(40);
    for (const source of sources) {
      expect(Array.isArray(FORMAT_MATRIX[source as keyof typeof FORMAT_MATRIX])).toBe(true);
    }
  });
});

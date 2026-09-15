import { useMemo, useRef, useState } from 'react';
import { zipSync } from 'fflate';
import { downloadBlob } from '../../lib/download';
import { consumeFileInput } from '../../lib/file-input';
import { detectFormat, FORMATS, formatInfo, type AnyFormatId, type FormatCategory, type FormatId } from './formats';
import {
  availableTargets, baseName, runConversion,
  type ConversionArtifact, type ConversionOptions,
} from './transcode-engine';
import { registerTabularConverters } from './tabular-converters';
import { registerEncodingConverters } from './encoding-converters';
import { registerDocumentConverters } from './documents-converters';
import { registerImageConverters } from './images-converters';
import { registerGeoConverters } from './geo-converters';
import { registerArchiveConverters } from './archives-converters';
import { registerFontConverters } from './fonts-converters';
import { registerAudioConverters } from './audio-converters';
import { decodeText, DECODE_ENCODINGS } from './text-codecs';
import './transcode-workspace.css';

let convertersRegistered = false;
function ensureConverters(): void {
  if (convertersRegistered) return;
  registerTabularConverters();
  registerEncodingConverters();
  registerDocumentConverters();
  registerImageConverters();
  registerGeoConverters();
  registerArchiveConverters();
  registerFontConverters();
  registerAudioConverters();
  convertersRegistered = true;
}

interface LoadedFile {
  id: string;
  name: string;
  size: number;
  bytes: Uint8Array;
  sourceId: FormatId | null;
}

interface ResultCard {
  key: string;
  fileId: string;
  sourceName: string;
  targetLabel: string;
  artifacts: ConversionArtifact[];
  error?: string;
}

type OptionField =
  | { kind: 'text'; key: string; label: string; placeholder?: string }
  | { kind: 'number'; key: string; label: string; min?: number; max?: number; step?: number }
  | { kind: 'checkbox'; key: string; label: string }
  | { kind: 'select'; key: string; label: string; options: Array<{ value: string; label: string }> };

const AUDIO_TRANSCODE_OPTIONS: OptionField[] = [
  { kind: 'number', key: 'bitrate', label: 'Bitrate (kbps)', min: 32, max: 320, step: 1 },
  { kind: 'number', key: 'sampleRate', label: 'Sample rate Hz (blank = keep)', min: 8000, max: 192000, step: 1 },
  { kind: 'number', key: 'channels', label: 'Channels (1 mono, 2 stereo)', min: 1, max: 8, step: 1 },
  { kind: 'number', key: 'trimStart', label: 'Trim start (s)', min: 0, step: 0.1 },
  { kind: 'number', key: 'trimEnd', label: 'Trim end (s)', min: 0, step: 0.1 },
  { kind: 'text', key: 'tagTitle', label: 'Tag: title', placeholder: 'Optional' },
  { kind: 'text', key: 'tagArtist', label: 'Tag: artist', placeholder: 'Optional' },
  { kind: 'text', key: 'tagAlbum', label: 'Tag: album', placeholder: 'Optional' },
  { kind: 'text', key: 'tagYear', label: 'Tag: year', placeholder: 'Optional' },
  { kind: 'text', key: 'tagGenre', label: 'Tag: genre', placeholder: 'Optional' },
];

const DELIMITER_OPTIONS = [
  { value: ',', label: 'Comma (,)' },
  { value: '\t', label: 'Tab' },
  { value: ';', label: 'Semicolon (;)' },
  { value: '|', label: 'Pipe (|)' },
  { value: ' ', label: 'Space' },
];

const ENCODING_OPTIONS = [
  { value: '', label: 'Auto-detect' },
  ...DECODE_ENCODINGS.map((entry) => ({ value: entry.id, label: entry.label })),
];

const TARGET_OPTIONS: Record<string, OptionField[]> = {
  csv: [
    { kind: 'select', key: 'delimiter', label: 'Delimiter', options: DELIMITER_OPTIONS },
    { kind: 'checkbox', key: 'header', label: 'Include header row' },
    { kind: 'checkbox', key: 'quoteAll', label: 'Quote every field' },
    { kind: 'select', key: 'lineEnding', label: 'Line ending', options: [{ value: 'lf', label: 'LF (Unix)' }, { value: 'crlf', label: 'CRLF (Windows)' }] },
  ],
  tsv: [
    { kind: 'checkbox', key: 'header', label: 'Include header row' },
    { kind: 'select', key: 'lineEnding', label: 'Line ending', options: [{ value: 'lf', label: 'LF (Unix)' }, { value: 'crlf', label: 'CRLF (Windows)' }] },
  ],
  json: [
    { kind: 'select', key: 'shape', label: 'Shape', options: [{ value: 'records', label: 'Array of records' }, { value: 'values', label: 'Header + value arrays' }] },
    { kind: 'checkbox', key: 'pretty', label: 'Pretty print' },
    { kind: 'checkbox', key: 'unflatten', label: 'Restore nested objects' },
  ],
  parquet: [
    { kind: 'select', key: 'compression', label: 'Compression', options: [
      { value: 'snappy', label: 'Snappy (default)' },
      { value: 'zstd', label: 'Zstandard' },
      { value: 'gzip', label: 'Gzip' },
      { value: 'uncompressed', label: 'Uncompressed' },
    ] },
  ],
  sql: [
    { kind: 'select', key: 'dialect', label: 'SQL dialect', options: [
      { value: 'postgresql', label: 'PostgreSQL' },
      { value: 'mysql', label: 'MySQL' },
      { value: 'sqlite', label: 'SQLite' },
      { value: 'snowflake', label: 'Snowflake' },
    ] },
    { kind: 'text', key: 'tableName', label: 'Table name', placeholder: 'converted_data' },
    { kind: 'number', key: 'batchSize', label: 'Rows per INSERT', min: 1, max: 10000, step: 1 },
    { kind: 'checkbox', key: 'createTable', label: 'Include CREATE TABLE' },
  ],
  'markdown-table': [
    { kind: 'select', key: 'style', label: 'Table style', options: [{ value: 'pipe', label: 'Pipe table' }, { value: 'grid', label: 'ASCII grid table' }] },
  ],
  txt: [
    { kind: 'select', key: 'targetEncoding', label: 'Target character set', options: [
      { value: 'utf-8', label: 'UTF-8' },
      { value: 'utf-16le', label: 'UTF-16 LE' },
      { value: 'utf-16be', label: 'UTF-16 BE' },
      { value: 'windows-1252', label: 'Windows-1252' },
      { value: 'ascii', label: 'ASCII' },
    ] },
    { kind: 'checkbox', key: 'bom', label: 'Write byte-order mark' },
  ],
  base64: [
    { kind: 'number', key: 'lineWrap', label: 'Line wrap (0 = none)', min: 0, max: 256, step: 4 },
  ],
  html: [{ kind: 'text', key: 'title', label: 'Document title', placeholder: 'From file name' }],
  pdf: [{ kind: 'text', key: 'title', label: 'Document title', placeholder: 'From file name' }],
  rtf: [{ kind: 'text', key: 'title', label: 'Document title', placeholder: 'From file name' }],
  docx: [{ kind: 'text', key: 'title', label: 'Document title', placeholder: 'From file name' }],
  epub: [
    { kind: 'text', key: 'title', label: 'Book title', placeholder: 'From file name' },
    { kind: 'text', key: 'author', label: 'Author', placeholder: 'Unknown' },
    { kind: 'text', key: 'language', label: 'Language code', placeholder: 'en' },
  ],
  woff2: [{ kind: 'text', key: 'subsetText', label: 'Subset to characters (blank = full font)', placeholder: 'e.g. ABC abc 0123456789' }],
  jpeg: [
    { kind: 'number', key: 'quality', label: 'Quality (1-100)', min: 1, max: 100, step: 1 },
    { kind: 'text', key: 'title', label: 'EXIF title', placeholder: 'Optional' },
    { kind: 'text', key: 'artist', label: 'EXIF artist', placeholder: 'Optional' },
    { kind: 'text', key: 'copyright', label: 'EXIF copyright', placeholder: 'Optional' },
    { kind: 'checkbox', key: 'xmp', label: 'Also write an XMP packet (title/artist/copyright/description)' },
    { kind: 'checkbox', key: 'iptc', label: 'Also write IPTC-IIM fields (title/byline/copyright/caption)' },
    { kind: 'checkbox', key: 'stripMeta', label: 'Strip existing metadata (EXIF/XMP/IPTC) first' },
  ],
  png: [
    { kind: 'text', key: 'title', label: 'PNG title (tEXt)', placeholder: 'Optional' },
    { kind: 'text', key: 'artist', label: 'PNG author (tEXt)', placeholder: 'Optional' },
    { kind: 'text', key: 'copyright', label: 'PNG copyright (tEXt)', placeholder: 'Optional' },
    { kind: 'checkbox', key: 'stripMeta', label: 'Strip existing text chunks first' },
  ],
  webp: [{ kind: 'number', key: 'quality', label: 'Quality (1-100)', min: 1, max: 100, step: 1 }],
  avif: [{ kind: 'number', key: 'quality', label: 'Quality (1-100)', min: 1, max: 100, step: 1 }],
  svg: [
    { kind: 'number', key: 'colors', label: 'Palette colors (2-256)', min: 2, max: 256, step: 1 },
    { kind: 'number', key: 'detail', label: 'Detail (0-10)', min: 0, max: 10, step: 1 },
    { kind: 'number', key: 'pathOmit', label: 'Path omit threshold', min: 0, max: 64, step: 1 },
  ],
  mp3: [
    { kind: 'number', key: 'bitrate', label: 'Bitrate (kbps)', min: 32, max: 320, step: 1 },
    { kind: 'number', key: 'sampleRate', label: 'Sample rate Hz (blank = keep)', min: 8000, max: 192000, step: 1 },
    { kind: 'number', key: 'channels', label: 'Channels (1 mono, 2 stereo)', min: 1, max: 8, step: 1 },
    { kind: 'number', key: 'trimStart', label: 'Trim start (s)', min: 0, step: 0.1 },
    { kind: 'number', key: 'trimEnd', label: 'Trim end (s)', min: 0, step: 0.1 },
    { kind: 'text', key: 'tagTitle', label: 'ID3 title', placeholder: 'Optional' },
    { kind: 'text', key: 'tagArtist', label: 'ID3 artist', placeholder: 'Optional' },
    { kind: 'text', key: 'tagAlbum', label: 'ID3 album', placeholder: 'Optional' },
    { kind: 'text', key: 'tagYear', label: 'ID3 year', placeholder: 'Optional' },
    { kind: 'text', key: 'tagGenre', label: 'ID3 genre', placeholder: 'Optional' },
  ],
  ogg: AUDIO_TRANSCODE_OPTIONS,
  flac: AUDIO_TRANSCODE_OPTIONS,
  aac: AUDIO_TRANSCODE_OPTIONS,
  wav: AUDIO_TRANSCODE_OPTIONS,
};

const SVG_SOURCE_OPTIONS: OptionField[] = [
  { kind: 'number', key: 'width', label: 'Output width px (blank = auto)', min: 1, max: 16384, step: 1 },
  { kind: 'number', key: 'height', label: 'Output height px (blank = auto)', min: 1, max: 16384, step: 1 },
  { kind: 'number', key: 'scale', label: 'Scale factor', min: 0.1, max: 20, step: 0.1 },
];

const SOURCE_OPTIONS_FOR: Partial<Record<FormatId, OptionField[]>> = {
  csv: [
    { kind: 'select', key: 'sourceEncoding', label: 'Source character set', options: ENCODING_OPTIONS },
    { kind: 'text', key: 'sourceDelimiter', label: 'Source delimiter (blank = auto)', placeholder: ', ; | or tab' },
    { kind: 'checkbox', key: 'sourceNoHeader', label: 'No header row in source' },
  ],
  tsv: [
    { kind: 'select', key: 'sourceEncoding', label: 'Source character set', options: ENCODING_OPTIONS },
    { kind: 'checkbox', key: 'sourceNoHeader', label: 'No header row in source' },
  ],
  json: [
    { kind: 'select', key: 'sourceEncoding', label: 'Source character set', options: ENCODING_OPTIONS },
  ],
  ndjson: [
    { kind: 'select', key: 'sourceEncoding', label: 'Source character set', options: ENCODING_OPTIONS },
  ],
  xlsx: [
    { kind: 'text', key: 'sheet', label: 'Sheet name (blank = first)', placeholder: 'Sheet1' },
  ],
  xml: [
    { kind: 'select', key: 'sourceEncoding', label: 'Source character set', options: ENCODING_OPTIONS },
  ],
  yaml: [
    { kind: 'select', key: 'sourceEncoding', label: 'Source character set', options: ENCODING_OPTIONS },
  ],
  toml: [
    { kind: 'select', key: 'sourceEncoding', label: 'Source character set', options: ENCODING_OPTIONS },
  ],
  svg: SVG_SOURCE_OPTIONS,
};

const CATEGORY_ORDER: FormatCategory[] = ['tabular', 'document', 'image', 'audio', 'font', 'geo', 'archive', 'encoding'];
const CATEGORY_LABELS: Record<FormatCategory, string> = {
  tabular: 'Tabular & structured data',
  image: 'Images & icons',
  document: 'Documents & markup',
  audio: 'Audio',
  font: 'Fonts',
  geo: 'Geospatial',
  archive: 'Archives',
  encoding: 'Encodings',
};

function formatBytes(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(2)} MB`;
}

let nextFileId = 1;

export default function TranscodeWorkspace() {
  const [files, setFiles] = useState<LoadedFile[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [target, setTarget] = useState<AnyFormatId | null>(null);
  const [optionsByTarget, setOptionsByTarget] = useState<Record<string, ConversionOptions>>({});
  const [results, setResults] = useState<ResultCard[]>([]);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  ensureConverters();

  const selectedFiles = useMemo(() => files.filter((file) => selectedIds.has(file.id)), [files, selectedIds]);

  const offeredTargets = useMemo(() => {
    if (selectedFiles.length === 0) return [];
    const perFile = selectedFiles
      .filter((file): file is LoadedFile & { sourceId: FormatId } => file.sourceId !== null)
      .map((file) => new Map(availableTargets(file.sourceId).map((entry) => [entry.target, entry])));
    if (perFile.length === 0) return [];
    const common = [...perFile[0].entries()].filter(([id]) => perFile.every((map) => map.has(id)));
    return common.map(([id, entry]) => ({ id, entry }));
  }, [selectedFiles]);

  const groupedTargets = useMemo(() => {
    const groups = new Map<FormatCategory, Array<{ id: AnyFormatId; label: string; longLabel: string; description: string }>>();
    for (const { id, entry } of offeredTargets) {
      const info = formatInfo(id);
      const category = info.category;
      if (!groups.has(category)) groups.set(category, []);
      groups.get(category)!.push({ id, label: info.label, longLabel: info.longLabel, description: entry.description });
    }
    return CATEGORY_ORDER.filter((category) => groups.has(category)).map((category) => ({ category, items: groups.get(category)! }));
  }, [offeredTargets]);

  const addFiles = async (list: FileList | File[]) => {
    const incoming = Array.from(list);
    const loaded: LoadedFile[] = [];
    for (const file of incoming) {
      try {
        const bytes = new Uint8Array(await file.arrayBuffer());
        const sourceId = detectFormat(bytes, file.name);
        loaded.push({ id: `file-${nextFileId++}`, name: file.name, size: file.size, bytes, sourceId });
      } catch (fileError) {
        setError(`Could not read ${file.name}: ${(fileError as Error).message}`);
      }
    }
    if (loaded.length > 0) {
      setFiles((previous) => [...previous, ...loaded]);
      setSelectedIds((previous) => {
        const next = new Set(previous);
        loaded.forEach((file) => next.add(file.id));
        return next;
      });
      setError('');
      setStatus(`${loaded.length} file${loaded.length === 1 ? '' : 's'} ready.`);
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const removeFile = (id: string) => {
    setFiles((previous) => previous.filter((file) => file.id !== id));
    setSelectedIds((previous) => {
      const next = new Set(previous);
      next.delete(id);
      return next;
    });
    setResults((previous) => previous.filter((card) => card.fileId !== id));
  };

  const setOption = (targetId: string, key: string, value: unknown) => {
    setOptionsByTarget((previous) => ({
      ...previous,
      [targetId]: { ...(previous[targetId] ?? {}), [key]: value },
    }));
  };

  const currentOptions = target ? optionsByTarget[target] ?? {} : {};

  const convert = async () => {
    if (!target || selectedFiles.length === 0) return;
    setBusy(true);
    setError('');
    setStatus('Converting…');
    const cards: ResultCard[] = [];
    for (const file of selectedFiles) {
      const key = `${file.id}:${String(target)}`;
      if (!file.sourceId) {
        cards.push({ key, fileId: file.id, sourceName: file.name, targetLabel: String(target), artifacts: [], error: 'Unrecognized source format.' });
        continue;
      }
      try {
        const rawOptions = { ...currentOptions };
        const parseOptions: ConversionOptions = {};
        if (typeof rawOptions.sourceEncoding === 'string' && rawOptions.sourceEncoding !== '') parseOptions.encoding = rawOptions.sourceEncoding;
        if (typeof rawOptions.sourceDelimiter === 'string' && rawOptions.sourceDelimiter !== '') parseOptions.delimiter = rawOptions.sourceDelimiter;
        if (rawOptions.sourceNoHeader === true) parseOptions.hasHeader = false;
        if (typeof rawOptions.sheet === 'string' && rawOptions.sheet.trim() !== '') parseOptions.sheet = rawOptions.sheet.trim();
        delete rawOptions.sourceEncoding;
        delete rawOptions.sourceDelimiter;
        delete rawOptions.sourceNoHeader;
        delete rawOptions.sheet;
        const artifacts = await runConversion(file.sourceId, target, {
          sourceId: file.sourceId,
          fileName: file.name,
          bytes: file.bytes,
          text: () => decodeText(file.bytes, parseOptions.encoding as string | undefined).text,
        }, { ...parseOptions, ...rawOptions });
        cards.push({ key, fileId: file.id, sourceName: file.name, targetLabel: formatInfo(target).label, artifacts });
      } catch (conversionError) {
        cards.push({ key, fileId: file.id, sourceName: file.name, targetLabel: formatInfo(target).label, artifacts: [], error: (conversionError as Error).message });
      }
    }
    setResults((previous) => {
      const keys = new Set(cards.map((card) => card.key));
      return [...cards, ...previous.filter((card) => !keys.has(card.key))];
    });
    const failures = cards.filter((card) => card.error).length;
    setStatus(failures > 0 ? `Finished with ${failures} failure${failures === 1 ? '' : 's'}.` : 'Conversion complete.');
    setBusy(false);
  };

  const downloadAllZip = () => {
    const entries: Record<string, Uint8Array> = {};
    let index = 0;
    for (const card of results) {
      for (const artifact of card.artifacts) {
        let name = artifact.name;
        while (entries[name]) {
          index += 1;
          name = `${baseName(artifact.name)}_${index}.${artifact.name.split('.').pop()}`;
        }
        entries[name] = artifact.bytes;
      }
    }
    if (Object.keys(entries).length === 0) return;
    const zipped = zipSync(entries, { level: 6 });
    downloadBlob(new Blob([zipped.buffer as ArrayBuffer], { type: 'application/zip' }), 'transcode-results.zip');
  };

  const totalArtifacts = results.reduce((count, card) => count + card.artifacts.length, 0);

  return (
    <div className="tc-shell">
      <section
        className={`tc-intake${dragging ? ' dragging' : ''}`}
        aria-label="Add files to convert"
        onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => { event.preventDefault(); setDragging(false); if (event.dataTransfer.files.length > 0) void addFiles(event.dataTransfer.files); }}
      >
        <h3>Drop files anywhere in this box</h3>
        <p>Everything converts on this device — files never leave your browser. Add one file or a whole batch.</p>
        <div className="tc-intake-actions">
          <button type="button" className="tc-convert-button" onClick={() => inputRef.current?.click()}>Choose files</button>
          {files.length > 0 && (
            <button type="button" className="tc-secondary-button" onClick={() => { setFiles([]); setSelectedIds(new Set()); setResults([]); setStatus(''); setError(''); setTarget(null); }}>
              Clear all
            </button>
          )}
        </div>
        <input
          ref={inputRef}
          type="file"
          multiple
          style={{ display: 'none' }}
          aria-label="Choose files to convert"
          onChange={() => consumeFileInput(inputRef.current!, () => {
            const list = inputRef.current?.files;
            if (list && list.length > 0) void addFiles(Array.from(list));
          })}
        />
      </section>

      {files.length > 0 && (
        <div className="tc-columns">
          <section className="tc-files" aria-label="Loaded files">
            <h3>Files ({files.length})</h3>
            <ul className="tc-file-list">
              {files.map((file) => (
                <li key={file.id} className="tc-file-row">
                  <input
                    type="checkbox"
                    checked={selectedIds.has(file.id)}
                    onChange={() => toggleSelect(file.id)}
                    aria-label={`Select ${file.name}`}
                  />
                  <div className="tc-file-name" title={file.name}>
                    <strong>{file.name}</strong>
                    <span>{formatBytes(file.size)}</span>
                  </div>
                  {file.sourceId
                    ? <span className="tc-badge">{FORMATS[file.sourceId].label}</span>
                    : <span className="tc-badge unknown">?</span>}
                  <button type="button" className="tc-file-remove" aria-label={`Remove ${file.name}`} onClick={() => removeFile(file.id)}>✕</button>
                </li>
              ))}
            </ul>
          </section>

          <section className="tc-panel" aria-label="Conversion controls">
            <h3>Choose a destination format</h3>
            <div className="tc-panel-body">
              {groupedTargets.length === 0 && (
                <p className="tc-empty">
                  {selectedFiles.length === 0
                    ? 'Select one or more files on the left to see where they can be converted.'
                    : 'No conversions are available yet for this source format in the current milestone.'}
                </p>
              )}
              {groupedTargets.map((group) => (
                <fieldset key={group.category} className="tc-target-group">
                  <legend>{CATEGORY_LABELS[group.category]}</legend>
                  <div className="tc-target-grid" role="group" aria-label={CATEGORY_LABELS[group.category]}>
                    {group.items.map((item) => (
                      <button
                        key={String(item.id)}
                        type="button"
                        className="tc-target-chip"
                        data-format={String(item.id)}
                        aria-pressed={target === item.id}
                        title={item.description}
                        onClick={() => setTarget(item.id)}
                      >
                        {item.label}
                        <small>{item.longLabel}</small>
                      </button>
                    ))}
                  </div>
                </fieldset>
              ))}

              {target && (
                <>
                  {(() => {
                    const primarySource = selectedFiles[0]?.sourceId ?? null;
                    const sourceFields = primarySource ? SOURCE_OPTIONS_FOR[primarySource] ?? [] : [];
                    const targetFields = TARGET_OPTIONS[String(target)] ?? [];
                    if (sourceFields.length + targetFields.length === 0) return null;
                    return (
                      <div className="tc-options">
                        {sourceFields.map((field) => renderField(field, currentOptions, (key, value) => setOption(String(target), key, value)))}
                        {targetFields.map((field) => renderField(field, currentOptions, (key, value) => setOption(String(target), key, value)))}
                      </div>
                    );
                  })()}
                  <div className="tc-actions">
                    <button type="button" className="tc-convert-button" onClick={() => void convert()} disabled={busy || selectedFiles.length === 0}>
                      {busy ? 'Converting…' : `Convert ${selectedFiles.length} file${selectedFiles.length === 1 ? '' : 's'} → ${formatInfo(target).label}`}
                    </button>
                    {totalArtifacts > 1 && (
                      <button type="button" className="tc-secondary-button" onClick={downloadAllZip}>Download all as ZIP</button>
                    )}
                  </div>
                </>
              )}
              <p className="tc-status" role="status" aria-live="polite">{status}</p>
              {error && <p className="tc-error" role="alert">{error}</p>}
            </div>
          </section>
        </div>
      )}

      {results.length > 0 && (
        <section className="tc-results" aria-label="Conversion results">
          {results.map((card) => (
            <article key={card.key} className="tc-result-card">
              <h4>{card.sourceName} → {card.targetLabel}</h4>
              {card.error && <p className="tc-error">{card.error}</p>}
              {!card.error && card.artifacts.length === 0 && <p className="tc-empty">No output was produced.</p>}
              {card.artifacts.map((artifact) => (
                <div key={artifact.name} className="tc-result-row">
                  <div className="tc-file-name" title={artifact.name}>
                    <strong>{artifact.name}</strong>
                    <span>{formatBytes(artifact.bytes.length)}</span>
                  </div>
                  <div className="tc-result-buttons">
                    {artifact.preview !== undefined && (
                      <details>
                        <summary className="tc-secondary-button" style={{ listStyle: 'none' }}>Preview</summary>
                        <pre className="tc-preview">{artifact.preview}</pre>
                      </details>
                    )}
                    <button
                      type="button"
                      className="tc-secondary-button"
                      onClick={() => downloadBlob(new Blob([artifact.bytes.slice().buffer as ArrayBuffer], { type: artifact.mime }), artifact.name)}
                    >
                      Download
                    </button>
                  </div>
                </div>
              ))}
            </article>
          ))}
        </section>
      )}
    </div>
  );
}

function renderField(field: OptionField, options: ConversionOptions, apply: (key: string, value: unknown) => void) {
  const value = options[field.key];
  if (field.kind === 'checkbox') {
    const checked = typeof value === 'boolean' ? value : Boolean(defaultFor(field.key));
    return (
      <label key={field.key} className="tc-inline">
        <input
          type="checkbox"
          checked={checked}
          onChange={(event) => apply(field.key, event.target.checked)}
        />
        {field.label}
      </label>
    );
  }
  if (field.kind === 'select') {
    const selected = typeof value === 'string' && value !== '' ? value : String(defaultFor(field.key, field.options[0]?.value ?? ''));
    return (
      <label key={field.key}>
        {field.label}
        <select value={selected} onChange={(event) => apply(field.key, event.target.value)}>
          {field.options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </label>
    );
  }
  if (field.kind === 'number') {
    const numeric = typeof value === 'number' ? value : (defaultFor(field.key, field.min ?? 0) as number);
    return (
      <label key={field.key}>
        {field.label}
        <input
          type="number"
          value={numeric}
          min={field.min}
          max={field.max}
          step={field.step}
          onChange={(event) => apply(field.key, Number(event.target.value))}
        />
      </label>
    );
  }
  const text = typeof value === 'string' ? value : '';
  return (
    <label key={field.key}>
      {field.label}
      <input
        type="text"
        value={text}
        placeholder={field.placeholder}
        onChange={(event) => apply(field.key, event.target.value)}
      />
    </label>
  );
}

function defaultFor(key: string, fallback: unknown = undefined): unknown {
  switch (key) {
    case 'header': return true;
    case 'createTable': return true;
    case 'pretty': return true;
    case 'delimiter': return ',';
    case 'lineEnding': return 'lf';
    case 'shape': return 'records';
    case 'compression': return 'snappy';
    case 'dialect': return 'postgresql';
    case 'tableName': return '';
    case 'batchSize': return 500;
    case 'style': return 'pipe';
    case 'targetEncoding': return 'utf-8';
    case 'bom': return false;
    case 'lineWrap': return 0;
    default: return fallback;
  }
}

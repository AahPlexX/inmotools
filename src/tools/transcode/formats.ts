// Format registry for the Transcode Workstation.
// Central place that knows every source/target format, how to detect a source
// file (magic bytes first, extension fallback), and which targets each source
// supports according to the approved conversion relationship matrix.

export type FormatCategory =
  | 'tabular'
  | 'image'
  | 'document'
  | 'audio'
  | 'font'
  | 'geo'
  | 'archive'
  | 'encoding';

export type FormatId =
  // tabular
  | 'csv' | 'tsv' | 'json' | 'ndjson' | 'parquet' | 'xlsx' | 'xml' | 'plist' | 'yaml' | 'toml'
  // images
  | 'png' | 'jpeg' | 'webp' | 'avif' | 'bmp' | 'tiff' | 'svg' | 'gif' | 'apng' | 'ico' | 'icns'
  // documents
  | 'markdown' | 'html' | 'rtf' | 'txt' | 'latex-math' | 'epub' | 'docx' | 'pdf'
  // audio
  | 'wav' | 'mp3' | 'ogg' | 'flac' | 'aac'
  // fonts
  | 'ttf' | 'otf' | 'woff' | 'woff2' | 'svg-font'
  // geospatial
  | 'geojson' | 'gpx' | 'kml' | 'kmz' | 'wkt'
  // archives & encodings
  | 'zip' | 'tar' | 'tar-gz' | 'tar-bz2' | 'seven-zip' | 'rar' | 'base64' | 'binary';

export interface FormatInfo {
  id: FormatId;
  label: string;
  longLabel: string;
  category: FormatCategory;
  extensions: string[];
  mime: string;
  /** True when this format can appear as a source file (not only as output). */
  source: boolean;
}

export const FORMATS: Record<FormatId, FormatInfo> = {
  csv: { id: 'csv', label: 'CSV', longLabel: 'Comma-Separated Values', category: 'tabular', extensions: ['csv'], mime: 'text/csv', source: true },
  tsv: { id: 'tsv', label: 'TSV', longLabel: 'Tab-Separated Values', category: 'tabular', extensions: ['tsv', 'tab'], mime: 'text/tab-separated-values', source: true },
  json: { id: 'json', label: 'JSON', longLabel: 'JavaScript Object Notation', category: 'tabular', extensions: ['json'], mime: 'application/json', source: true },
  ndjson: { id: 'ndjson', label: 'NDJSON', longLabel: 'Newline-Delimited JSON', category: 'tabular', extensions: ['ndjson', 'jsonl'], mime: 'application/x-ndjson', source: true },
  parquet: { id: 'parquet', label: 'Parquet', longLabel: 'Apache Parquet (columnar)', category: 'tabular', extensions: ['parquet'], mime: 'application/vnd.apache.parquet', source: true },
  xlsx: { id: 'xlsx', label: 'XLSX', longLabel: 'Excel Workbook', category: 'tabular', extensions: ['xlsx'], mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', source: true },
  xml: { id: 'xml', label: 'XML', longLabel: 'Extensible Markup Language', category: 'tabular', extensions: ['xml'], mime: 'application/xml', source: true },
  plist: { id: 'plist', label: 'Plist', longLabel: 'Apple Property List (XML)', category: 'tabular', extensions: ['plist'], mime: 'application/x-plist', source: true },
  yaml: { id: 'yaml', label: 'YAML', longLabel: 'YAML Ain’t Markup Language', category: 'tabular', extensions: ['yaml', 'yml'], mime: 'application/yaml', source: true },
  toml: { id: 'toml', label: 'TOML', longLabel: 'Tom’s Obvious Markup Language', category: 'tabular', extensions: ['toml'], mime: 'application/toml', source: true },

  png: { id: 'png', label: 'PNG', longLabel: 'Portable Network Graphics', category: 'image', extensions: ['png'], mime: 'image/png', source: true },
  jpeg: { id: 'jpeg', label: 'JPEG', longLabel: 'JPEG Image', category: 'image', extensions: ['jpg', 'jpeg', 'jpe'], mime: 'image/jpeg', source: true },
  webp: { id: 'webp', label: 'WebP', longLabel: 'WebP Image', category: 'image', extensions: ['webp'], mime: 'image/webp', source: true },
  avif: { id: 'avif', label: 'AVIF', longLabel: 'AV1 Image Format', category: 'image', extensions: ['avif'], mime: 'image/avif', source: true },
  bmp: { id: 'bmp', label: 'BMP', longLabel: 'Bitmap Image', category: 'image', extensions: ['bmp'], mime: 'image/bmp', source: true },
  tiff: { id: 'tiff', label: 'TIFF', longLabel: 'Tagged Image File Format', category: 'image', extensions: ['tif', 'tiff'], mime: 'image/tiff', source: true },
  svg: { id: 'svg', label: 'SVG', longLabel: 'Scalable Vector Graphics', category: 'image', extensions: ['svg'], mime: 'image/svg+xml', source: true },
  gif: { id: 'gif', label: 'GIF', longLabel: 'Graphics Interchange Format', category: 'image', extensions: ['gif'], mime: 'image/gif', source: true },
  apng: { id: 'apng', label: 'APNG', longLabel: 'Animated PNG', category: 'image', extensions: ['apng'], mime: 'image/apng', source: true },
  // ico/icns are also listed in the matrix key space below.
  ico: { id: 'ico', label: 'ICO', longLabel: 'Windows Icon Container', category: 'image', extensions: ['ico'], mime: 'image/x-icon', source: true },
  icns: { id: 'icns', label: 'ICNS', longLabel: 'Apple Icon Image', category: 'image', extensions: ['icns'], mime: 'image/icns', source: true },

  markdown: { id: 'markdown', label: 'Markdown', longLabel: 'Markdown Document', category: 'document', extensions: ['md', 'markdown', 'mdown'], mime: 'text/markdown', source: true },
  html: { id: 'html', label: 'HTML', longLabel: 'HTML Document', category: 'document', extensions: ['html', 'htm', 'xhtml'], mime: 'text/html', source: true },
  rtf: { id: 'rtf', label: 'RTF', longLabel: 'Rich Text Format', category: 'document', extensions: ['rtf'], mime: 'application/rtf', source: true },
  txt: { id: 'txt', label: 'TXT', longLabel: 'Plain Text', category: 'document', extensions: ['txt', 'text', 'log'], mime: 'text/plain', source: true },
  'latex-math': { id: 'latex-math', label: 'LaTeX Math', longLabel: 'LaTeX Equation Source', category: 'document', extensions: ['tex'], mime: 'application/x-tex', source: true },
  epub: { id: 'epub', label: 'EPUB', longLabel: 'Electronic Publication', category: 'document', extensions: ['epub'], mime: 'application/epub+zip', source: true },
  docx: { id: 'docx', label: 'DOCX', longLabel: 'WordprocessingML Document', category: 'document', extensions: ['docx'], mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', source: false },
  pdf: { id: 'pdf', label: 'PDF', longLabel: 'Portable Document Format', category: 'document', extensions: ['pdf'], mime: 'application/pdf', source: false },

  wav: { id: 'wav', label: 'WAV', longLabel: 'Waveform Audio (PCM)', category: 'audio', extensions: ['wav', 'wave'], mime: 'audio/wav', source: true },
  mp3: { id: 'mp3', label: 'MP3', longLabel: 'MPEG-1 Audio Layer III', category: 'audio', extensions: ['mp3'], mime: 'audio/mpeg', source: true },
  ogg: { id: 'ogg', label: 'OGG', longLabel: 'Ogg Audio (Vorbis/Opus)', category: 'audio', extensions: ['ogg', 'oga', 'opus'], mime: 'audio/ogg', source: true },
  flac: { id: 'flac', label: 'FLAC', longLabel: 'Free Lossless Audio Codec', category: 'audio', extensions: ['flac'], mime: 'audio/flac', source: true },
  aac: { id: 'aac', label: 'AAC', longLabel: 'Advanced Audio Coding (M4A/ADTS)', category: 'audio', extensions: ['m4a', 'aac'], mime: 'audio/aac', source: true },

  ttf: { id: 'ttf', label: 'TTF', longLabel: 'TrueType Font', category: 'font', extensions: ['ttf'], mime: 'font/ttf', source: true },
  otf: { id: 'otf', label: 'OTF', longLabel: 'OpenType Font (CFF)', category: 'font', extensions: ['otf'], mime: 'font/otf', source: true },
  woff: { id: 'woff', label: 'WOFF', longLabel: 'Web Open Font Format 1.0', category: 'font', extensions: ['woff'], mime: 'font/woff', source: true },
  woff2: { id: 'woff2', label: 'WOFF2', longLabel: 'Web Open Font Format 2.0', category: 'font', extensions: ['woff2'], mime: 'font/woff2', source: true },
  'svg-font': { id: 'svg-font', label: 'SVG Font', longLabel: 'SVG Font Definition', category: 'font', extensions: ['svg'], mime: 'image/svg+xml', source: true },

  geojson: { id: 'geojson', label: 'GeoJSON', longLabel: 'GeoJSON Feature Data', category: 'geo', extensions: ['geojson'], mime: 'application/geo+json', source: true },
  gpx: { id: 'gpx', label: 'GPX', longLabel: 'GPS Exchange Format', category: 'geo', extensions: ['gpx'], mime: 'application/gpx+xml', source: true },
  kml: { id: 'kml', label: 'KML', longLabel: 'Keyhole Markup Language', category: 'geo', extensions: ['kml'], mime: 'application/vnd.google-earth.kml+xml', source: true },
  kmz: { id: 'kmz', label: 'KMZ', longLabel: 'Compressed KML Package', category: 'geo', extensions: ['kmz'], mime: 'application/vnd.google-earth.kmz', source: true },
  wkt: { id: 'wkt', label: 'WKT', longLabel: 'Well-Known Text Geometry', category: 'geo', extensions: ['wkt'], mime: 'text/plain', source: true },

  zip: { id: 'zip', label: 'ZIP', longLabel: 'ZIP Archive', category: 'archive', extensions: ['zip'], mime: 'application/zip', source: true },
  tar: { id: 'tar', label: 'TAR', longLabel: 'Tape Archive', category: 'archive', extensions: ['tar'], mime: 'application/x-tar', source: true },
  'tar-gz': { id: 'tar-gz', label: 'TAR.GZ', longLabel: 'Gzip-compressed TAR', category: 'archive', extensions: ['tgz'], mime: 'application/gzip', source: true },
  'tar-bz2': { id: 'tar-bz2', label: 'TAR.BZ2', longLabel: 'Bzip2-compressed TAR', category: 'archive', extensions: ['tbz2'], mime: 'application/x-bzip2', source: true },
  'seven-zip': { id: 'seven-zip', label: '7Z', longLabel: '7-zip Archive', category: 'archive', extensions: ['7z'], mime: 'application/x-7z-compressed', source: true },
  rar: { id: 'rar', label: 'RAR', longLabel: 'RAR Archive', category: 'archive', extensions: ['rar'], mime: 'application/vnd.rar', source: true },
  base64: { id: 'base64', label: 'Base64', longLabel: 'Base64 / Data URI Text', category: 'encoding', extensions: ['b64', 'base64'], mime: 'text/plain', source: true },
  binary: { id: 'binary', label: 'Binary', longLabel: 'Raw Binary File', category: 'encoding', extensions: ['bin'], mime: 'application/octet-stream', source: true },
};

// ---------------------------------------------------------------------------
// Approved source -> target relationship matrix.
// ---------------------------------------------------------------------------

const TABULAR_TARGETS: FormatId[] = ['csv', 'tsv', 'json', 'ndjson', 'parquet', 'xlsx', 'xml', 'plist', 'yaml', 'toml', 'sql' as FormatId, 'markdown-table' as FormatId, 'html-table' as FormatId];

// SQL and table outputs are virtual targets (never source formats). Extend ids:
export type VirtualFormatId = 'sql' | 'markdown-table' | 'html-table' | 'data-uri' | 'hex' | 'frames-zip' | 'sprite-png' | 'waveform-svg' | 'spectrogram-png' | 'mathml' | 'svg-equation' | 'png-equation';

export const VIRTUAL_FORMATS: Record<VirtualFormatId, FormatInfo> = {
  sql: { id: 'sql' as FormatId, label: 'SQL', longLabel: 'CREATE TABLE + INSERT statements', category: 'tabular', extensions: ['sql'], mime: 'application/sql', source: false },
  'markdown-table': { id: 'markdown-table' as FormatId, label: 'MD Table', longLabel: 'Markdown pipe table', category: 'tabular', extensions: ['md'], mime: 'text/markdown', source: false },
  'html-table': { id: 'html-table' as FormatId, label: 'HTML Table', longLabel: 'HTML <table> element', category: 'tabular', extensions: ['html'], mime: 'text/html', source: false },
  'data-uri': { id: 'data-uri' as FormatId, label: 'Data URI', longLabel: 'RFC 2397 data: URI text', category: 'encoding', extensions: ['txt'], mime: 'text/plain', source: false },
  hex: { id: 'hex' as FormatId, label: 'Hex Dump', longLabel: 'Canonical hex + ASCII dump', category: 'encoding', extensions: ['txt'], mime: 'text/plain', source: false },
  'frames-zip': { id: 'frames-zip' as FormatId, label: 'Frame ZIP', longLabel: 'Frame sequence archive', category: 'image', extensions: ['zip'], mime: 'application/zip', source: false },
  'sprite-png': { id: 'sprite-png' as FormatId, label: 'Sprite Sheet', longLabel: 'PNG sprite sheet', category: 'image', extensions: ['png'], mime: 'image/png', source: false },
  'waveform-svg': { id: 'waveform-svg' as FormatId, label: 'Waveform SVG', longLabel: 'Vector waveform plot', category: 'audio', extensions: ['svg'], mime: 'image/svg+xml', source: false },
  'spectrogram-png': { id: 'spectrogram-png' as FormatId, label: 'Spectrogram', longLabel: 'Frequency spectrogram image', category: 'audio', extensions: ['png'], mime: 'image/png', source: false },
  mathml: { id: 'mathml' as FormatId, label: 'MathML', longLabel: 'MathML markup', category: 'document', extensions: ['xml'], mime: 'application/mathml+xml', source: false },
  'svg-equation': { id: 'svg-equation' as FormatId, label: 'Equation SVG', longLabel: 'Vector equation rendering', category: 'document', extensions: ['svg'], mime: 'image/svg+xml', source: false },
  'png-equation': { id: 'png-equation' as FormatId, label: 'Equation PNG', longLabel: 'Raster equation rendering', category: 'document', extensions: ['png'], mime: 'image/png', source: false },
};

export type AnyFormatId = FormatId | VirtualFormatId;

export const FORMAT_MATRIX: Record<FormatId, AnyFormatId[]> = {
  // tabular
  csv: TABULAR_TARGETS,
  tsv: TABULAR_TARGETS,
  json: TABULAR_TARGETS,
  ndjson: TABULAR_TARGETS,
  parquet: TABULAR_TARGETS,
  xlsx: TABULAR_TARGETS,
  xml: ['json', 'yaml', 'csv', 'tsv', 'plist'],
  plist: ['json', 'xml', 'yaml'],
  yaml: ['json', 'toml', 'xml', 'csv'],
  toml: ['json', 'yaml', 'xml'],

  // images (ico/icns sources are queued for a later milestone; they remain valid targets)
  ico: [],
  icns: [],
  png: ['jpeg', 'webp', 'avif', 'bmp', 'ico', 'icns', 'tiff', 'data-uri', 'base64', 'svg'],
  jpeg: ['png', 'webp', 'avif', 'bmp', 'ico', 'pdf', 'data-uri', 'base64'],
  webp: ['png', 'jpeg', 'avif', 'bmp', 'ico', 'gif', 'data-uri', 'base64'],
  avif: ['png', 'jpeg', 'webp', 'bmp', 'ico'],
  bmp: ['png', 'jpeg', 'webp', 'avif', 'ico'],
  tiff: ['png', 'jpeg', 'webp', 'frames-zip'],
  svg: ['png', 'jpeg', 'webp', 'avif', 'ico', 'pdf', 'data-uri', 'base64'],
  gif: ['apng', 'webp', 'sprite-png', 'frames-zip'],
  apng: ['gif', 'webp', 'frames-zip'],

  // documents (docx/pdf are output-only targets in this release)
  docx: [],
  pdf: [],
  markdown: ['html', 'pdf', 'rtf', 'txt', 'epub', 'docx'],
  html: ['markdown', 'pdf', 'rtf', 'txt', 'epub'],
  rtf: ['html', 'markdown', 'txt'],
  txt: ['markdown', 'html', 'pdf', 'base64', 'data-uri'],
  'latex-math': ['mathml', 'svg-equation', 'png-equation', 'html'],
  epub: ['markdown', 'html', 'txt'],

  // audio
  wav: ['mp3', 'ogg', 'flac', 'aac', 'waveform-svg', 'spectrogram-png'],
  mp3: ['wav', 'ogg', 'flac', 'aac', 'waveform-svg', 'spectrogram-png'],
  ogg: ['wav', 'mp3', 'flac', 'aac'],
  flac: ['wav', 'mp3', 'ogg', 'aac'],
  aac: ['wav', 'mp3', 'ogg', 'flac'],

  // fonts
  ttf: ['woff', 'woff2', 'otf'],
  otf: ['woff', 'woff2', 'ttf'],
  woff: ['ttf', 'otf', 'woff2'],
  woff2: ['ttf', 'otf', 'woff'],
  'svg-font': ['ttf', 'woff', 'woff2'],

  // geospatial
  geojson: ['kml', 'kmz', 'gpx', 'csv', 'wkt', 'svg'],
  gpx: ['geojson', 'csv', 'kml'],
  kml: ['geojson', 'gpx', 'csv'],
  kmz: ['geojson', 'gpx', 'csv', 'kml'],
  wkt: ['geojson', 'svg'],

  // archives & encodings
  zip: ['binary', 'tar', 'tar-gz'],
  tar: ['zip', 'binary'],
  'tar-gz': ['zip', 'binary'],
  'tar-bz2': ['zip', 'binary'],
  'seven-zip': ['zip', 'binary'],
  rar: ['binary'],
  base64: ['binary', 'txt', 'data-uri'],
  binary: ['base64', 'hex', 'data-uri'],
};

export function formatInfo(id: AnyFormatId): FormatInfo {
  return (FORMATS as Record<string, FormatInfo>)[id] ?? VIRTUAL_FORMATS[id as VirtualFormatId];
}

// ---------------------------------------------------------------------------
// Detection
// ---------------------------------------------------------------------------

const startsWith = (bytes: Uint8Array, seq: number[], offset = 0): boolean => {
  if (bytes.length < offset + seq.length) return false;
  for (let i = 0; i < seq.length; i += 1) if (bytes[offset + i] !== seq[i]) return false;
  return true;
};

function textHead(bytes: Uint8Array, limit = 1024): string {
  const view = bytes.subarray(0, Math.min(bytes.length, limit));
  let out = '';
  for (const b of view) {
    if (b === 0) return out; // binary content
    out += b < 128 ? String.fromCharCode(b) : '';
  }
  return out;
}

function looksLikeRtf(head: string): boolean {
  return /^\s*\{\\rtf/.test(head);
}

function looksLikeSvg(head: string): boolean {
  return /<svg[\s>]/i.test(head) || /<\?xml[\s\S]*<svg/i.test(head);
}

function looksLikeHtml(head: string): boolean {
  return /<!doctype\s+html/i.test(head) || /<html[\s>]/i.test(head) || /<body[\s>]/i.test(head);
}

function looksLikeXml(head: string): boolean {
  return /^\s*<\?xml/.test(head);
}

/** Detect the format of a file from its bytes and (fallback) its name. */
export function detectFormat(bytes: Uint8Array, filename: string): FormatId | null {
  const name = filename.toLowerCase();
  const ext = name.includes('.') ? name.slice(name.lastIndexOf('.') + 1) : '';

  // Magic bytes take priority over the extension.
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    // APNG carries an acTL chunk; scan the first 4KB for it.
    const head = textHead(bytes, 4096);
    return head.includes('acTL') ? 'apng' : 'png';
  }
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return 'jpeg';
  if (startsWith(bytes, [0x47, 0x49, 0x46, 0x38])) return 'gif';
  if (startsWith(bytes, [0x42, 0x4d]) && bytes.length > 14) return 'bmp';
  if (startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8)) return 'webp';
  if (startsWith(bytes, [0x00, 0x00, 0x00]) && startsWith(bytes, [0x66, 0x74, 0x79, 0x70, 0x61, 0x76, 0x69, 0x66], 4)) return 'avif';
  if (startsWith(bytes, [0x49, 0x49, 0x2a, 0x00]) || startsWith(bytes, [0x4d, 0x4d, 0x00, 0x2a]) || startsWith(bytes, [0x49, 0x49, 0x2b, 0x00]) || startsWith(bytes, [0x4d, 0x4d, 0x00, 0x2b])) return 'tiff';
  if (startsWith(bytes, [0x50, 0x4b, 0x03, 0x04]) || startsWith(bytes, [0x50, 0x4b, 0x05, 0x06])) {
    if (ext === 'epub') return 'epub';
    if (ext === 'xlsx' || ext === 'docx') return ext;
    if (ext === 'kmz') return 'kmz';
    return 'zip';
  }
  if (startsWith(bytes, [0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c])) return 'seven-zip';
  if (startsWith(bytes, [0x52, 0x61, 0x72, 0x21, 0x1a, 0x07])) return 'rar';
  if (startsWith(bytes, [0x1f, 0x8b])) return ext === 'tgz' ? 'tar-gz' : 'tar-gz';
  if (startsWith(bytes, [0x42, 0x5a, 0x68])) return 'tar-bz2';
  if (startsWith(bytes, [0x00, 0x00, 0x01, 0x00]) || startsWith(bytes, [0x00, 0x00, 0x02, 0x00])) return 'ico';
  if (startsWith(bytes, [0x69, 0x63, 0x6e, 0x73])) return 'icns';
  if (startsWith(bytes, [0x77, 0x4f, 0x46, 0x46])) return 'woff';
  if (startsWith(bytes, [0x77, 0x4f, 0x46, 0x32])) return 'woff2';
  if (startsWith(bytes, [0x00, 0x01, 0x00, 0x00]) || startsWith(bytes, [0x74, 0x72, 0x75, 0x65])) return 'ttf';
  if (startsWith(bytes, [0x4f, 0x54, 0x54, 0x4f])) return 'otf';
  if (startsWith(bytes, [0x25, 0x50, 0x44, 0x46])) return 'pdf';
  if (startsWith(bytes, [0x4f, 0x67, 0x67, 0x53])) return 'ogg';
  if (startsWith(bytes, [0x49, 0x44, 0x33]) || (startsWith(bytes, [0xff]) && (bytes[1] & 0xe0) === 0xe0)) return 'mp3';
  if (startsWith(bytes, [0x66, 0x4c, 0x61, 0x43])) return 'flac';
  if (startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && startsWith(bytes, [0x57, 0x41, 0x56, 0x45], 8)) return 'wav';
  if (startsWith(bytes, [0xff, 0xf1]) || startsWith(bytes, [0xff, 0xf9])) return 'aac';
  if (startsWith(bytes, [0x50, 0x41, 0x52, 0x31])) return 'parquet';
  if (ext === 'parquet') return 'parquet';

  // Text-based formats: sniff content, then fall back to extension.
  const head = textHead(bytes, 2048).trim();
  if (head.length > 0) {
    if (looksLikeRtf(head)) return 'rtf';
    if (looksLikeSvg(head)) return ext === 'svg' && /<font[\s>]/i.test(head) ? 'svg-font' : 'svg';
    if (looksLikeHtml(head)) return 'html';
    if (looksLikeXml(head)) {
      if (/<!doctype\s+plist/i.test(head) || /<plist[\s>]/i.test(head)) return 'plist';
      if (/<gpx[\s>]/i.test(head)) return 'gpx';
      if (/<kml[\s>]/i.test(head)) return 'kml';
      if (/<svg[\s>]/i.test(head) && /<font[\s>]/i.test(head)) return 'svg-font';
      return 'xml';
    }
    if (head.startsWith('{') || head.startsWith('[')) {
      // Distinguish GeoJSON, NDJSON, and plain JSON.
      if (/"type"\s*:\s*"(FeatureCollection|Feature|Point|LineString|Polygon|MultiPoint|MultiLineString|MultiPolygon|GeometryCollection)"/.test(head)) return 'geojson';
      if (ext === 'ndjson' || ext === 'jsonl') return 'ndjson';
      try {
        const trimmed = head.length === bytes.length ? head : new TextDecoder().decode(bytes);
        JSON.parse(trimmed);
        return 'json';
      } catch {
        return ext === 'ndjson' || ext === 'jsonl' ? 'ndjson' : 'json';
      }
    }
    // NDJSON: multiple lines that each parse as JSON objects.
    const lines = head.split(/\r?\n/).filter((line) => line.trim().length > 0);
    if (lines.length >= 2 && lines.slice(0, 3).every((line) => line.trimStart().startsWith('{'))) {
      const probe = lines.slice(0, 3).every((line) => {
        try { JSON.parse(line); return true; } catch { return false; }
      });
      if (probe) return 'ndjson';
    }
    if (/^(point|linestring|polygon|multipoint|multilinestring|multipolygon|geometrycollection)\s/i.test(head)) return 'wkt';
    if (/^[\s\S]*\t/.test(lines[0] ?? '') && (lines[0]?.split('\t').length ?? 0) > 2 && ext !== 'csv') {
      return ext === 'tsv' || ext === 'tab' ? 'tsv' : 'csv';
    }
    // Extension-driven text fallbacks.
    const byExt = (Object.values(FORMATS) as FormatInfo[]).find((info) => info.extensions.includes(ext));
    if (byExt) {
      if (byExt.id === 'csv' || byExt.id === 'tsv' || byExt.id === 'txt' || byExt.id === 'markdown' || byExt.id === 'yaml' || byExt.id === 'toml' || byExt.id === 'xml' || byExt.id === 'json' || byExt.id === 'ndjson' || byExt.id === 'wkt' || byExt.id === 'base64') return byExt.id;
    }
    if (ext === 'md' || ext === 'markdown' || ext === 'mdown') return 'markdown';
    if (ext === 'yml' || ext === 'yaml') return 'yaml';
    if (ext === 'toml') return 'toml';
    if (ext === 'tex') return 'latex-math';
    if (ext === 'gpx') return 'gpx';
    if (ext === 'kml') return 'kml';
    if (ext === 'geojson') return 'geojson';
    if (ext === 'tar') return 'tar';
    if (ext === 'b64' || ext === 'base64') return 'base64';
    return 'txt';
  }

  // Empty or pure binary: extension, otherwise raw binary.
  const byExt = (Object.values(FORMATS) as FormatInfo[]).find((info) => info.extensions.includes(ext));
  return byExt ? byExt.id : 'binary';
}

export function extensionOf(name: string): string {
  const lower = name.toLowerCase();
  if (lower.endsWith('.tar.gz')) return 'tar.gz';
  if (lower.endsWith('.tar.bz2')) return 'tar.bz2';
  return lower.includes('.') ? lower.slice(lower.lastIndexOf('.') + 1) : '';
}

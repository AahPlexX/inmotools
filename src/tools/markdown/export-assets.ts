export interface ExportAsset {
  readonly path: string;
  readonly mediaType: string;
  readonly data: Uint8Array;
}

export interface BundledHtml {
  readonly html: string;
  readonly assets: ExportAsset[];
  readonly unresolved: string[];
}

export interface InlinedCss {
  readonly css: string;
  readonly unresolved: string[];
}

const BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

const bytesToBase64 = (bytes: Uint8Array): string => {
  let output = '';
  for (let index = 0; index < bytes.length; index += 3) {
    const a = bytes[index] ?? 0;
    const b = bytes[index + 1] ?? 0;
    const c = bytes[index + 2] ?? 0;
    const triple = (a << 16) | (b << 8) | c;
    output += BASE64[(triple >> 18) & 63];
    output += BASE64[(triple >> 12) & 63];
    output += index + 1 < bytes.length ? BASE64[(triple >> 6) & 63] : '=';
    output += index + 2 < bytes.length ? BASE64[triple & 63] : '=';
  }
  return output;
};

const mediaTypeFromUrl = (url: string): string | null => {
  const pathname = url.split(/[?#]/, 1)[0].toLowerCase();
  if (pathname.endsWith('.png')) return 'image/png';
  if (pathname.endsWith('.jpg') || pathname.endsWith('.jpeg')) return 'image/jpeg';
  if (pathname.endsWith('.gif')) return 'image/gif';
  if (pathname.endsWith('.webp')) return 'image/webp';
  if (pathname.endsWith('.svg')) return 'image/svg+xml';
  if (pathname.endsWith('.woff2')) return 'font/woff2';
  if (pathname.endsWith('.woff')) return 'font/woff';
  if (pathname.endsWith('.ttf')) return 'font/ttf';
  if (pathname.endsWith('.otf')) return 'font/otf';
  return null;
};

const extensionForMediaType = (mediaType: string): string => {
  switch (mediaType.toLowerCase().split(';', 1)[0]) {
    case 'image/png': return 'png';
    case 'image/jpeg': return 'jpg';
    case 'image/gif': return 'gif';
    case 'image/webp': return 'webp';
    case 'image/svg+xml': return 'svg';
    default: return 'bin';
  }
};

const decodeHtmlAttribute = (value: string): string =>
  value.replace(/&amp;/g, '&').replace(/&#38;/g, '&').replace(/&#x26;/gi, '&');

const fetchAsset = async (url: string, fetcher: typeof fetch): Promise<{ data: Uint8Array; mediaType: string } | null> => {
  try {
    const response = await fetcher(url);
    if (!response.ok) return null;
    const mediaType = response.headers.get('content-type')?.split(';', 1)[0] || mediaTypeFromUrl(url);
    if (!mediaType) return null;
    return { data: new Uint8Array(await response.arrayBuffer()), mediaType };
  } catch {
    return null;
  }
};

export const inlineStylesheetAssets = async (
  css: string,
  baseUrl: string,
  fetcher: typeof fetch = fetch,
): Promise<InlinedCss> => {
  const references = Array.from(css.matchAll(/url\(\s*(['"]?)([^'"\)]+)\1\s*\)/gi));
  let output = css;
  const unresolved: string[] = [];
  const seen = new Map<string, string>();

  for (const match of references) {
    const raw = match[2].trim();
    if (!raw || raw.startsWith('data:') || raw.startsWith('#')) continue;
    if (seen.has(raw)) continue;
    let absolute: string;
    try {
      absolute = new URL(raw, baseUrl).href;
    } catch {
      unresolved.push(raw);
      continue;
    }
    const asset = await fetchAsset(absolute, fetcher);
    if (!asset) {
      unresolved.push(raw);
      continue;
    }
    const dataUrl = `data:${asset.mediaType};base64,${bytesToBase64(asset.data)}`;
    seen.set(raw, dataUrl);
    output = output.split(raw).join(dataUrl);
  }

  return { css: output, unresolved };
};

export const bundleHtmlImages = async (
  html: string,
  baseUrl: string,
  mode: 'inline' | 'epub',
  fetcher: typeof fetch = fetch,
): Promise<BundledHtml> => {
  const references = Array.from(html.matchAll(/<img\b[^>]*\bsrc=(['"])(.*?)\1/gi));
  let output = html;
  const unresolved: string[] = [];
  const assets: ExportAsset[] = [];
  const replacements = new Map<string, string>();

  for (const match of references) {
    const encodedSource = match[2];
    if (!encodedSource || encodedSource.startsWith('data:')) continue;
    if (replacements.has(encodedSource)) continue;
    const source = decodeHtmlAttribute(encodedSource);
    let absolute: string;
    try {
      absolute = new URL(source, baseUrl).href;
    } catch {
      unresolved.push(source);
      continue;
    }
    const asset = await fetchAsset(absolute, fetcher);
    if (!asset || !asset.mediaType.startsWith('image/')) {
      unresolved.push(source);
      continue;
    }

    if (mode === 'inline') {
      replacements.set(encodedSource, `data:${asset.mediaType};base64,${bytesToBase64(asset.data)}`);
    } else {
      const path = `assets/image-${assets.length + 1}.${extensionForMediaType(asset.mediaType)}`;
      assets.push({ path, mediaType: asset.mediaType, data: asset.data });
      replacements.set(encodedSource, path);
    }
  }

  for (const [source, replacement] of replacements) {
    output = output.split(`src="${source}"`).join(`src="${replacement}"`);
    output = output.split(`src='${source}'`).join(`src='${replacement}'`);
  }

  return { html: output, assets, unresolved };
};

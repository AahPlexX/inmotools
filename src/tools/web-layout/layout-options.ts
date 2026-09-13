export type LayoutOptions = {
  wrap: 'wrap' | 'nowrap' | 'wrap-reverse';
  tracks: string;
  textDirection: 'ltr' | 'rtl';
  writingMode: 'horizontal-tb' | 'vertical-rl' | 'vertical-lr';
  metaTitle: string;
  metaDescription: string;
  keywords: string;
  socialTitle: string;
  socialDescription: string;
  customMeta: { name: string; content: string }[];
};

export const DEFAULT_OPTIONS: LayoutOptions = {
  wrap: 'wrap', tracks: '', textDirection: 'ltr', writingMode: 'horizontal-tb',
  metaTitle: '', metaDescription: '', keywords: '', socialTitle: '', socialDescription: '', customMeta: [],
};

// Parse a deliberately bounded track grammar. Never interpolate arbitrary CSS tokens.
export function validateTracks(input: string): string {
  if (input.length > 500) throw new Error('Track definition is limited to 500 characters.');
  if (!input.trim()) return '';
  const tokens = input.match(/(?:\d+(?:\.\d+)?(?:fr|px|rem|%)?|[a-z-]+|[(),])/g) || [];
  if (tokens.join('') !== input.replace(/\s/g, '')) throw new Error('Use fr, px, rem, %, auto, minmax() or repeat() track values.');
  let cursor = 0;
  function size(): void {
    const token = tokens[cursor++];
    if (!token) throw new Error('A track size is missing.');
    if (/^(?:\d+(?:\.\d+)?(?:fr|px|rem|%)|0)$/.test(token) || ['auto','min-content','max-content'].includes(token)) return;
    if (token === 'minmax') {
      expect('('); const first = tokens[cursor]; size(); if (first?.endsWith('fr')) throw new Error('The minimum of minmax() cannot use fr.'); expect(','); size(); expect(')'); return;
    }
    if (token === 'repeat') {
      expect('('); const count = tokens[cursor++];
      if (!count || !/^(?:[1-9]|1[0-2]|auto-fit|auto-fill)$/.test(count)) throw new Error('Repeat count must be 1–12, auto-fit or auto-fill.');
      expect(','); size(); expect(')'); return;
    }
    throw new Error(`Unsupported track value: ${token}`);
  }
  function expect(value: string) { if (tokens[cursor++] !== value) throw new Error(`Expected ${value} in track definition.`); }
  while (cursor < tokens.length) size();
  return input.trim();
}

export function parseOptions(input: unknown): LayoutOptions {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Invalid layout options.');
  const p = input as Record<string, unknown>;
  const out = { ...DEFAULT_OPTIONS };
  for (const key of ['metaTitle','metaDescription','keywords','socialTitle','socialDescription','tracks'] as const) {
    if (typeof p[key] !== 'string' || (p[key] as string).length > 2000) throw new Error(`${key} must be text up to 2000 characters.`);
    out[key] = p[key] as string;
  }
  out.tracks = validateTracks(out.tracks);
  if (!['wrap','nowrap','wrap-reverse'].includes(p.wrap as string)) throw new Error('Invalid Flexbox wrapping.');
  if (!['ltr','rtl'].includes(p.textDirection as string)) throw new Error('Invalid text direction.');
  if (!['horizontal-tb','vertical-rl','vertical-lr'].includes(p.writingMode as string)) throw new Error('Invalid writing mode.');
  out.wrap = p.wrap as LayoutOptions['wrap']; out.textDirection = p.textDirection as LayoutOptions['textDirection']; out.writingMode = p.writingMode as LayoutOptions['writingMode'];
  if (!Array.isArray(p.customMeta) || p.customMeta.length > 30) throw new Error('Use at most 30 custom metadata fields.');
  out.customMeta = p.customMeta.map(row => {
    if (!row || typeof row !== 'object' || typeof row.name !== 'string' || !/^[a-z][a-z0-9:._-]{0,79}$/i.test(row.name) || typeof row.content !== 'string' || row.content.length > 2000) throw new Error('Metadata needs a name and text value (up to 2000 characters).');
    if (/^(?:viewport|description|author|robots|keywords|referrer|charset|og:.*|twitter:.*)$/i.test(row.name)) throw new Error('Use the dedicated fields for standard document and social metadata.');
    return { name: row.name, content: row.content };
  });
  if (new Set(out.customMeta.map(m => m.name.toLowerCase())).size !== out.customMeta.length) throw new Error('Custom metadata names must be unique.');
  return out;
}

import { optimize } from 'svgo/browser';

export interface SvgSource { name: string; text: string }
export interface SvgCompileOptions { currentColor?: boolean }

function slugify(name: string): string {
  return name.replace(/\.svg$/i, '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'icon';
}

function normalizeCurrentColor(svg: string): string {
  // Presentation attributes: fill="#f00" / stroke='red'.
  const withAttributes = svg.replace(/\s(?:fill|stroke)=(['"])(?!none\b|currentColor\b)[^'"]+\1/gi, (match) =>
    match.replace(/=(['"])[^'"]+\1/, '="currentColor"'),
  );

  // CSS declarations inside a style attribute: style="fill:#f00;stroke:red".
  //
  // Handling only presentation attributes left these untouched, so a sprite
  // compiled with currentColor normalization still contained hard-coded colours
  // and silently refused to inherit. svgo's preset-default does not rescue this -
  // it has no convertStyleToAttrs plugin, and its inlineStyles plugin can move
  // <style> rules *into* style attributes, so colours end up here rather than in
  // the attributes the first pass covers.
  return withAttributes.replace(/\sstyle=(['"])([^'"]*)\1/gi, (match, quote: string, body: string) => {
    const rewritten = body.replace(
      /(^|;)\s*(fill|stroke)\s*:\s*([^;]+)/gi,
      (declaration, prefix: string, property: string, value: string) => {
        const trimmed = value.trim().toLowerCase();
        if (trimmed === 'none' || trimmed === 'currentcolor' || trimmed.startsWith('url(')) return declaration;
        return `${prefix}${property}:currentColor`;
      },
    );
    return rewritten === body ? match : ` style=${quote}${rewritten}${quote}`;
  });
}

// A <symbol> with no viewBox has no intrinsic coordinate system, so <use>
// renders it against the referencing element's box at the wrong scale. When the
// source omits viewBox but carries width and height, an equivalent viewBox can
// be synthesized from them rather than emitting a symbol that cannot scale.
// Unitless and px values are usable; anything else (em, %, unknown) is not, and
// is left alone rather than guessed at.
function deriveViewBox(attributes: string): string | undefined {
  const explicit = /viewBox=(['"])(.*?)\1/i.exec(attributes)?.[2];
  if (explicit) return explicit;

  const dimension = (name: 'width' | 'height'): number | undefined => {
    const raw = new RegExp(`\\s${name}=(['"])([^'"]+)\\1`, 'i').exec(attributes)?.[2]?.trim();
    if (!raw) return undefined;
    const match = /^(\d*\.?\d+)(px)?$/i.exec(raw);
    if (!match) return undefined;
    const value = Number(match[1]);
    return Number.isFinite(value) && value > 0 ? value : undefined;
  };

  const width = dimension('width');
  const height = dimension('height');
  return width !== undefined && height !== undefined ? `0 0 ${width} ${height}` : undefined;
}

export function compileSvgSprite(sources: SvgSource[], options: SvgCompileOptions = {}) {
  const seen = new Map<string, number>();
  const files = sources.map((source) => {
    const result = optimize(source.text, { multipass: true });
    const optimized = result.data;
    const compiled = options.currentColor ? normalizeCurrentColor(optimized) : optimized;
    const svgMatch = compiled.match(/<svg\b([^>]*)>([\s\S]*?)<\/svg>/i);
    if (!svgMatch) throw new Error(`${source.name} is not a valid SVG.`);
    const viewBox = deriveViewBox(svgMatch[1]);
    const base = slugify(source.name);
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    const id = count === 0 ? base : `${base}-${count + 1}`;
    const symbol = `<symbol id="${id}"${viewBox ? ` viewBox="${viewBox}"` : ''}>${svgMatch[2]}</symbol>`;
    return {
      name: source.name,
      id,
      symbol,
      originalBytes: new TextEncoder().encode(source.text).byteLength,
      optimizedBytes: new TextEncoder().encode(optimized).byteLength,
    };
  });
  return { sprite: `<svg xmlns="http://www.w3.org/2000/svg" style="display:none">${files.map((file) => file.symbol).join('')}</svg>`, files };
}

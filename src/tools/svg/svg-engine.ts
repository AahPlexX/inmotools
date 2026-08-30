import { optimize } from 'svgo/browser';

export interface SvgSource { name: string; text: string }
export interface SvgCompileOptions { currentColor?: boolean }

function slugify(name: string): string {
  return name.replace(/\.svg$/i, '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'icon';
}

function normalizeCurrentColor(svg: string): string {
  return svg.replace(/\s(?:fill|stroke)=(['"])(?!none\b|currentColor\b)[^'"]+\1/gi, (match) =>
    match.replace(/=(['"])[^'"]+\1/, '="currentColor"'),
  );
}

export function compileSvgSprite(sources: SvgSource[], options: SvgCompileOptions = {}) {
  const seen = new Map<string, number>();
  const files = sources.map((source) => {
    const result = optimize(source.text, { multipass: true });
    const optimized = result.data;
    const compiled = options.currentColor ? normalizeCurrentColor(optimized) : optimized;
    const svgMatch = compiled.match(/<svg\b([^>]*)>([\s\S]*?)<\/svg>/i);
    if (!svgMatch) throw new Error(`${source.name} is not a valid SVG.`);
    const viewBox = /viewBox=(['"])(.*?)\1/i.exec(svgMatch[1])?.[2];
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

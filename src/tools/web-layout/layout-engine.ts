import { inspectTokens, tokenCss, type TokenDocument } from './token-engine';
import { parseAppearance, appearanceCss, type Appearance } from './appearance';
import { parseBlockStyle, validateTree, blockCss, type BlockStyle } from './block-tree';
import { parseCode, escapeStyle, escapeScript, type CodeProject } from './code-tools';
import { DEFAULT_OPTIONS, parseOptions, type LayoutOptions } from './layout-options';
export type BlockKind = 'card' | 'accordion' | 'form' | 'navigation' | 'notice';
export type LayoutProject = {
  version: 1;
  options?: LayoutOptions;
  code?: CodeProject;
  appearance?: Appearance;
  tokens?: TokenDocument;
  title: string;
  description: string;
  author: string;
  canonical: string;
  language: string;
  robots: 'index,follow' | 'noindex,nofollow';
  layout: 'grid' | 'flex';
  columns: number;
  gridAreas: string[];
  gap: number;
  padding: number;
  radius: number;
  maxWidth: number;
  breakpoint: number;
  direction: 'row' | 'column';
  alignment: 'stretch' | 'flex-start' | 'center' | 'flex-end';
  distribution: 'flex-start' | 'center' | 'space-between' | 'space-evenly';
  theme: 'light' | 'dark' | 'contrast';
  accent: string;
  fontMin: number;
  fontMax: number;
  reset: boolean;
  blocks: { id: string; kind: BlockKind; title: string; text: string; parentId?: string; tag?: 'article' | 'section' | 'aside' | 'div'; style?: BlockStyle }[];
};

export const INITIAL_PROJECT: LayoutProject = {
  version: 1, title: 'A place for good ideas', description: 'A thoughtful space to learn, make, and share.',
  author: '', canonical: '', language: 'en', robots: 'index,follow', layout: 'grid',
  columns: 3, gridAreas: [], gap: 24, padding: 32, radius: 16, maxWidth: 1120, breakpoint: 640,
  direction: 'row', alignment: 'stretch', distribution: 'flex-start', theme: 'light',
  accent: '#2563eb', fontMin: 28, fontMax: 56, reset: true,
  blocks: [
    { id: 'welcome', kind: 'card', title: 'Make something useful', text: 'Start with a clear idea. Give it room to grow.' },
    { id: 'learn', kind: 'accordion', title: 'How does this work?', text: 'Open this panel, change the layout, and see the same page at different widths.' },
    { id: 'join', kind: 'form', title: 'Stay in the loop', text: 'A form pattern with visible labels. This example does not send or store submissions.' },
  ],
};

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]!));
const text = (value: unknown, name: string, max = 2000) => {
  if (typeof value !== 'string' || value.length > max) throw new Error(`${name} must be text no longer than ${max} characters.`);
  return value;
};
const number = (value: unknown, name: string, min: number, max: number) => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) throw new Error(`${name} must be between ${min} and ${max}.`);
  return value;
};
const choice = <T extends string>(value: unknown, values: readonly T[], name: string): T => {
  if (!values.includes(value as T)) throw new Error(`Unsupported ${name}.`);
  return value as T;
};
function validateGridAreas(value: unknown, columns: number): string[] {
  if (!Array.isArray(value) || value.length > 12) throw new Error('Grid areas allow up to 12 rows. Leave empty for automatic flow.');
  const rows = value.map(row => text(row, 'Grid area row', 240).trim().split(/\s+/));
  if (rows.some(row => row.length !== columns || row.some(cell => cell !== '.' && (!/^[a-z][a-z0-9_-]*$/i.test(cell) || /^(auto|span|inherit|initial|unset|revert|revert-layer|default)$/i.test(cell))))) throw new Error(`Every grid-area row must contain exactly ${columns} non-reserved names or dots.`);
  const names = [...new Set(rows.flat().filter(cell => cell !== '.'))];
  for (const name of names) {
    const cells = rows.flatMap((row, r) => row.map((cell, c) => cell === name ? [r, c] : null)).filter(Boolean) as number[][];
    const rs = cells.map(cell => cell[0]), cs = cells.map(cell => cell[1]);
    for (let r = Math.min(...rs); r <= Math.max(...rs); r++) for (let c = Math.min(...cs); c <= Math.max(...cs); c++) if (rows[r][c] !== name) throw new Error(`Grid area "${name}" must form a rectangle.`);
  }
  return rows.map(row => row.join(' '));
}

export function parseProject(input: string): LayoutProject {
  if (input.length > 1_000_000) throw new Error('Project exceeds the 1 MB text limit.');
  const p = JSON.parse(input);
  if (!p || typeof p !== 'object' || p.version !== 1 || !Array.isArray(p.blocks) || p.blocks.length > 100) throw new Error('Choose a version 1 Web Layout Studio project with at most 100 blocks.');
  const canonical = text(p.canonical, 'Canonical URL');
  if (canonical && !/^https?:\/\//i.test(canonical)) throw new Error('Canonical URL must start with https:// or http://.');
  if (canonical) new URL(canonical);
  const language = text(p.language, 'Language', 35);
  if (!/^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/i.test(language)) throw new Error('Use a language tag such as en or en-US.');
  const accent = text(p.accent, 'Accent');
  if (!/^#[0-9a-f]{6}$/i.test(accent)) throw new Error('Use a six-digit hexadecimal accent color.');
  const ids = new Set<string>(['page-title']);
  const blocks = p.blocks.map((block: unknown) => {
    if (!block || typeof block !== 'object') throw new Error('Invalid block.');
    const b = block as Record<string, unknown>;
    const id = text(b.id, 'Block ID', 80);
    if (!/^[a-zA-Z][\w-]*$/.test(id) || [id, `${id}-title`, `${id}-email`].some(value => ids.has(value))) throw new Error('Block identifiers must be unique and start with a letter.');
    [id, `${id}-title`, `${id}-email`].forEach(value => ids.add(value));
    if (b.tag !== undefined && !['article','section','aside','div'].includes(b.tag as string)) throw new Error('Unsupported semantic block tag.');
    return { ...(b.parentId === undefined ? {} : { parentId: text(b.parentId, 'Parent ID', 80) }), ...(b.tag === undefined ? {} : {tag: b.tag as 'article'|'section'|'aside'|'div'}), ...(b.style === undefined ? {} : {style:parseBlockStyle(b.style)}), id, kind: choice(b.kind, ['card', 'accordion', 'form', 'navigation', 'notice'] as const, 'block kind'), title: text(b.title, 'Block title', 200), text: text(b.text, 'Block text') };
  });
  validateTree(blocks);
  if (typeof p.reset !== 'boolean') throw new Error('Invalid reset setting.');
  const result: LayoutProject = {
    ...(p.tokens === undefined ? {} : {tokens:inspectTokens(p.tokens).document}),
    ...(p.appearance === undefined ? {} : {appearance:parseAppearance(p.appearance)}),
    ...(p.code === undefined ? {} : { code: parseCode(p.code) }),
    ...(p.options === undefined ? {} : { options: parseOptions(p.options) }),
    version: 1, title: text(p.title, 'Title', 200), description: text(p.description, 'Description'), author: text(p.author, 'Author', 200), canonical, language,
    robots: choice(p.robots, ['index,follow', 'noindex,nofollow'], 'robots setting'),
    layout: choice(p.layout, ['grid', 'flex'], 'layout'), columns: number(p.columns, 'Columns', 1, 12), gridAreas: validateGridAreas(p.gridAreas === undefined ? [] : p.gridAreas, p.columns),
    gap: number(p.gap, 'Gap', 0, 120), padding: number(p.padding, 'Padding', 12, 120), radius: number(p.radius, 'Radius', 0, 100),
    maxWidth: number(p.maxWidth, 'Content width', 320, 2400), breakpoint: number(p.breakpoint, 'Breakpoint', 320, 1200),
    direction: choice(p.direction, ['row', 'column'], 'direction'), alignment: choice(p.alignment, ['stretch', 'flex-start', 'center', 'flex-end'], 'alignment'),
    distribution: choice(p.distribution, ['flex-start', 'center', 'space-between', 'space-evenly'], 'distribution'), theme: choice(p.theme, ['light', 'dark', 'contrast'], 'theme'),
    accent, fontMin: number(p.fontMin, 'Minimum heading size', 16, 96), fontMax: number(p.fontMax, 'Maximum heading size', 16, 144), reset: p.reset, blocks,
  };
  if (!Number.isInteger(result.columns)) throw new Error('Column count must be a whole number.');
  if (result.fontMax < result.fontMin) throw new Error('Maximum heading size cannot be smaller than minimum size.');
  return result;
}

export function buildCss(p: LayoutProject): string {
  p = parseProject(JSON.stringify(p));
  const options = p.options ?? DEFAULT_OPTIONS;
  const dark = p.theme === 'dark';
  const bg = dark ? '#111827' : '#ffffff';
  const fg = dark ? '#f9fafb' : '#111827';
  const surface = dark ? '#1f2937' : p.theme === 'contrast' ? '#ffffff' : '#f3f4f6';
  const slope = (p.fontMax - p.fontMin) / (1440 - 320);
  const areas = p.gridAreas.map(row => `"${row}"`).join(' ');
  const areaNames = [...new Set(p.gridAreas.join(' ').split(/\s+/).filter(cell => cell !== '.'))];
  const placements = areaNames.slice(0, p.blocks.length).map((area, index) => `.layout>.block:nth-child(${index + 1}){grid-area:${area}}`).join('');
  return `${p.reset ? '*,*::before,*::after{box-sizing:border-box} img,video,svg{max-width:100%;height:auto} button,input,select,textarea{font:inherit}' : ''}
:root{--accent:${p.accent};--space:${p.gap}px;--radius:${p.radius}px;--surface:${surface};--ink:${fg};--canvas:${bg};color-scheme:${dark ? 'dark' : 'light'}}
body{margin:0;background:var(--canvas);color:var(--ink);font:1rem/1.6 system-ui,sans-serif;direction:${options.textDirection};writing-mode:${options.writingMode};overflow-wrap:anywhere}
main{container-type:inline-size;box-sizing:border-box;max-width:${p.maxWidth}px;margin-inline:auto;padding:clamp(12px,4vw,${Math.max(12, p.padding)}px)}
h1{font-size:clamp(${p.fontMin}px,${(p.fontMin - slope * 320).toFixed(4)}px + ${(slope * 100).toFixed(4)}vw,${p.fontMax}px);line-height:1.12;max-width:22ch}
h2,summary{line-height:1.35} p{max-width:68ch;white-space:pre-wrap} a{color:var(--ink);text-decoration-thickness:2px;text-underline-offset:3px}
.layout{display:${p.layout};gap:var(--space);grid-template-columns:repeat(auto-fit,minmax(min(100%,max(12rem,calc((100% - ${p.columns - 1} * var(--space)) / ${p.columns}))),1fr));flex-direction:${p.direction};flex-wrap:${options.wrap};align-items:${p.alignment};justify-content:${p.distribution}}
${p.layout === 'grid' && options.tracks && !p.gridAreas.length ? `@media(min-width:${p.breakpoint + 1}px){.layout{grid-template-columns:${options.tracks}}}` : ''}
${p.layout === 'grid' && p.gridAreas.length ? `@container(min-width:calc(${p.columns * 12}rem + ${(p.columns - 1) * p.gap}px)){.layout{grid-template-columns:repeat(${p.columns},minmax(0,1fr));grid-template-areas:${areas}}${placements}}` : ''}
.block{box-sizing:border-box;min-width:0;flex:1 1 220px;padding:clamp(12px,3vw,24px);border:1px solid #64748b;border-top:4px solid var(--accent);border-radius:var(--radius);background:var(--surface)}
.block h2{margin-top:0}.block p:last-child{margin-bottom:0}summary{cursor:pointer;font-weight:700;min-height:44px}label{display:block;margin-top:12px}input{box-sizing:border-box;max-width:100%;width:100%;min-height:44px;border:1px solid currentColor;border-radius:6px;padding:8px;background:var(--canvas);color:var(--ink)}nav{display:flex;flex-wrap:wrap;gap:16px}a,button{min-height:44px} :focus-visible{outline:3px solid var(--ink);outline-offset:4px}
@media(max-width:${p.breakpoint}px){.layout{grid-template-columns:minmax(0,1fr);grid-template-areas:none;flex-direction:column}.block{grid-area:auto!important;flex-basis:auto;width:100%}}
@media(prefers-reduced-motion:reduce){*,*::before,*::after{scroll-behavior:auto!important;animation:none!important;transition:none!important}}
@media print{:root{--surface:#fff;--ink:#000;--canvas:#fff;color-scheme:light}body{background:white;color:black}.block{break-inside:avoid}main{max-width:none}}
.block-children{display:grid;gap:var(--space);min-width:0;margin-top:var(--space)}
${p.blocks.map(blockCss).join('\n')}
${appearanceCss(p.appearance,p.theme)}
${p.tokens ? tokenCss(p.tokens) : ''}
${p.code?.enabled ? p.code.css : ''}
`;
}

export function buildHtml(project: LayoutProject): string {
  const p = parseProject(JSON.stringify(project));
  const options = p.options ?? DEFAULT_OPTIONS;
  const renderBlocks = (parentId = '', depth = 0): string => p.blocks.filter(b => (b.parentId || '') === parentId).map(b => {
    const heading = `h${Math.min(6,2+depth)}`;
    const title = escapeHtml(b.title), body = escapeHtml(b.text), id = escapeHtml(b.id);
    if (b.kind === 'accordion') return `<details class="block" id="${id}"><summary>${title}</summary><p>${body}</p></details>`;
    if (b.kind === 'form') return `<section class="block" id="${id}" aria-labelledby="${id}-title"><${heading} id="${id}-title">${title}</${heading}><p>${body}</p><label for="${id}-email">Email address</label><input id="${id}-email" type="email" autocomplete="email" placeholder="you@example.com"></section>`;
    if (b.kind === 'navigation') return `<section class="block" id="${id}"><${heading}>${title}</${heading}><p>${body}</p><nav aria-label="${title}"><a href="#page-title">Back to top</a>${p.blocks.filter(other => other.id !== b.id).map(other => `<a href="#${escapeHtml(other.id)}">${escapeHtml(other.title)}</a>`).join('')}</nav></section>`;
    const tag = b.tag ?? (b.kind === 'card' ? 'article' : 'aside');
    const children = renderBlocks(b.id,depth+1);
    return `<${tag} class="block" id="${id}"><${heading}>${title}</${heading}><p>${body}</p>${children ? `<div class="block-children">${children}</div>` : ''}</${tag}>`;
  }).join('\n');
  const blocks = renderBlocks();
  return `<!doctype html>\n<html lang="${escapeHtml(p.language)}" dir="${options.textDirection}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(options.metaTitle || p.title)}</title><meta name="description" content="${escapeHtml(options.metaDescription || p.description)}"><meta name="keywords" content="${escapeHtml(options.keywords)}">${options.customMeta.map(meta => `<meta name="${escapeHtml(meta.name)}" content="${escapeHtml(meta.content)}">`).join('')}<meta name="author" content="${escapeHtml(p.author)}"><meta name="robots" content="${p.robots}"><meta property="og:type" content="website"><meta property="og:title" content="${escapeHtml(options.socialTitle || options.metaTitle || p.title)}"><meta property="og:description" content="${escapeHtml(options.socialDescription || options.metaDescription || p.description)}"><meta name="twitter:card" content="summary"><meta name="twitter:title" content="${escapeHtml(options.socialTitle || options.metaTitle || p.title)}"><meta name="twitter:description" content="${escapeHtml(options.socialDescription || options.metaDescription || p.description)}">${p.canonical ? `<link rel="canonical" href="${escapeHtml(p.canonical)}"><meta property="og:url" content="${escapeHtml(p.canonical)}">` : ''}<style>${escapeStyle(buildCss(p))}</style></head><body><main><header><h1 id="page-title">${escapeHtml(p.title)}</h1><p>${escapeHtml(p.description)}</p></header><div class="layout">${p.code?.enabled ? p.code.html : blocks}</div></main>${p.code?.enabled && p.code.js ? `<script>${escapeScript(p.code.js)}</script>` : ''}</body></html>`;
}

export function buildPreview(p: LayoutProject): string {
  let html = buildHtml(p);
  if (p.code?.enabled && typeof document !== 'undefined') {
    const inert = document.createElement('template');
    inert.innerHTML = p.code.html;
    inert.content.querySelectorAll('script,meta,base,iframe,object,embed,link').forEach(node => node.remove());
    html = buildHtml({ ...p, code: { ...p.code, html: inert.innerHTML, js: '' } });
  }
  return html.replace('<head>', '<head><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'; form-action \'none\'; base-uri \'none\'">');
}

export function projectWarnings(p: LayoutProject): string[] {
  return [
    ...(!p.title.trim() ? ['The page needs a title before publication.'] : []),
    ...p.blocks.filter(b => !b.title.trim()).map(b => `Block ${b.id} needs a title for its heading, links or accessible label.`),
  ];
}

export function buildTokens(p: LayoutProject): string {
  p = parseProject(JSON.stringify(p));
  if(p.tokens)return JSON.stringify(p.tokens,null,2);
  const color = (hex: string) => ({ $type: 'color', $value: { colorSpace: 'srgb', components: [1,3,5].map(offset => parseInt(hex.slice(offset, offset + 2), 16) / 255), alpha: 1, hex } });
  const dimension = (value: number) => ({ $type: 'dimension', $value: { value, unit: 'px' } });
  return JSON.stringify({
    color: { accent: color(p.accent), ink: color(p.theme === 'dark' ? '#f9fafb' : '#111827'), canvas: color(p.theme === 'dark' ? '#111827' : '#ffffff'), surface: color(p.theme === 'dark' ? '#1f2937' : p.theme === 'contrast' ? '#ffffff' : '#f3f4f6') },
    spacing: { gap: dimension(p.gap), padding: { ...dimension(p.padding), $description: 'Maximum fluid page padding; CSS uses clamp(12px, 4vw, this value).' } },
    radius: { panel: dimension(p.radius) },
    typography: { family: { $type: 'fontFamily', $value: ['system-ui', 'sans-serif'] }, headingMin: dimension(p.fontMin), headingMax: dimension(p.fontMax), bodyLineHeight: { $type: 'number', $value: 1.6 } },
    layout: { maxWidth: dimension(p.maxWidth), breakpoint: dimension(p.breakpoint), columns: { $type: 'number', $value: p.columns } },
  }, null, 2);
}

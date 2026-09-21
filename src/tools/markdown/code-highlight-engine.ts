// Feature (Markdown audit follow-up) — preview fenced-code language coloring.
//
// Reuses the exact highlighting infrastructure already applied to the source
// editor (`defaultHighlightStyle` from @codemirror/language, the same style
// MarkdownEditor.tsx mounts via `syntaxHighlighting(defaultHighlightStyle)`)
// so preview tokens carry the same CSS classes and colors as the editor,
// rather than introducing a second highlighting library/theme. Mermaid and
// Graphviz fences are excluded: diagram-renderer.ts replaces those blocks
// entirely with a rendered diagram. An unrecognized fence language is left
// as plain, un-colored text rather than guessed at.
//
// Each language's CodeMirror 5 "legacy mode" stream parser is loaded lazily
// (one dynamic import per distinct language actually present, cached across
// calls) via @codemirror/legacy-modes, then wrapped as a StreamLanguage so
// its parse tree can be walked by @lezer/highlight's `highlightCode` — the
// documented approach for applying CodeMirror highlighting outside of a live
// editor (https://codemirror.net/examples/styling/#highlighting-in-html).

import { StreamLanguage, defaultHighlightStyle, type StreamParser } from '@codemirror/language';
import { highlightCode } from '@lezer/highlight';

type Loader = () => Promise<StreamParser<unknown>>;

const LOADERS: Record<string, Loader> = {
  javascript: async () => (await import('@codemirror/legacy-modes/mode/javascript')).javascript,
  js: async () => (await import('@codemirror/legacy-modes/mode/javascript')).javascript,
  jsx: async () => (await import('@codemirror/legacy-modes/mode/javascript')).javascript,
  mjs: async () => (await import('@codemirror/legacy-modes/mode/javascript')).javascript,
  cjs: async () => (await import('@codemirror/legacy-modes/mode/javascript')).javascript,
  typescript: async () => (await import('@codemirror/legacy-modes/mode/javascript')).typescript,
  ts: async () => (await import('@codemirror/legacy-modes/mode/javascript')).typescript,
  tsx: async () => (await import('@codemirror/legacy-modes/mode/javascript')).typescript,
  json: async () => (await import('@codemirror/legacy-modes/mode/javascript')).json,
  json5: async () => (await import('@codemirror/legacy-modes/mode/javascript')).json,
  jsonc: async () => (await import('@codemirror/legacy-modes/mode/javascript')).json,
  c: async () => (await import('@codemirror/legacy-modes/mode/clike')).c,
  h: async () => (await import('@codemirror/legacy-modes/mode/clike')).c,
  cpp: async () => (await import('@codemirror/legacy-modes/mode/clike')).cpp,
  cc: async () => (await import('@codemirror/legacy-modes/mode/clike')).cpp,
  cxx: async () => (await import('@codemirror/legacy-modes/mode/clike')).cpp,
  hpp: async () => (await import('@codemirror/legacy-modes/mode/clike')).cpp,
  java: async () => (await import('@codemirror/legacy-modes/mode/clike')).java,
  csharp: async () => (await import('@codemirror/legacy-modes/mode/clike')).csharp,
  cs: async () => (await import('@codemirror/legacy-modes/mode/clike')).csharp,
  scala: async () => (await import('@codemirror/legacy-modes/mode/clike')).scala,
  kotlin: async () => (await import('@codemirror/legacy-modes/mode/clike')).kotlin,
  kt: async () => (await import('@codemirror/legacy-modes/mode/clike')).kotlin,
  objectivec: async () => (await import('@codemirror/legacy-modes/mode/clike')).objectiveC,
  'objective-c': async () => (await import('@codemirror/legacy-modes/mode/clike')).objectiveC,
  dart: async () => (await import('@codemirror/legacy-modes/mode/clike')).dart,
  css: async () => (await import('@codemirror/legacy-modes/mode/css')).css,
  scss: async () => (await import('@codemirror/legacy-modes/mode/css')).sCSS,
  less: async () => (await import('@codemirror/legacy-modes/mode/css')).less,
  html: async () => (await import('@codemirror/legacy-modes/mode/xml')).html,
  htm: async () => (await import('@codemirror/legacy-modes/mode/xml')).html,
  xml: async () => (await import('@codemirror/legacy-modes/mode/xml')).xml,
  svg: async () => (await import('@codemirror/legacy-modes/mode/xml')).xml,
  xhtml: async () => (await import('@codemirror/legacy-modes/mode/xml')).xml,
  sh: async () => (await import('@codemirror/legacy-modes/mode/shell')).shell,
  bash: async () => (await import('@codemirror/legacy-modes/mode/shell')).shell,
  shell: async () => (await import('@codemirror/legacy-modes/mode/shell')).shell,
  zsh: async () => (await import('@codemirror/legacy-modes/mode/shell')).shell,
  console: async () => (await import('@codemirror/legacy-modes/mode/shell')).shell,
  sql: async () => (await import('@codemirror/legacy-modes/mode/sql')).standardSQL,
  mysql: async () => (await import('@codemirror/legacy-modes/mode/sql')).mySQL,
  postgresql: async () => (await import('@codemirror/legacy-modes/mode/sql')).pgSQL,
  postgres: async () => (await import('@codemirror/legacy-modes/mode/sql')).pgSQL,
  plsql: async () => (await import('@codemirror/legacy-modes/mode/sql')).plSQL,
  sqlite: async () => (await import('@codemirror/legacy-modes/mode/sql')).sqlite,
  yaml: async () => (await import('@codemirror/legacy-modes/mode/yaml')).yaml,
  yml: async () => (await import('@codemirror/legacy-modes/mode/yaml')).yaml,
  python: async () => (await import('@codemirror/legacy-modes/mode/python')).python,
  py: async () => (await import('@codemirror/legacy-modes/mode/python')).python,
  ruby: async () => (await import('@codemirror/legacy-modes/mode/ruby')).ruby,
  rb: async () => (await import('@codemirror/legacy-modes/mode/ruby')).ruby,
  rust: async () => (await import('@codemirror/legacy-modes/mode/rust')).rust,
  rs: async () => (await import('@codemirror/legacy-modes/mode/rust')).rust,
  go: async () => (await import('@codemirror/legacy-modes/mode/go')).go,
  golang: async () => (await import('@codemirror/legacy-modes/mode/go')).go,
  swift: async () => (await import('@codemirror/legacy-modes/mode/swift')).swift,
  r: async () => (await import('@codemirror/legacy-modes/mode/r')).r,
  perl: async () => (await import('@codemirror/legacy-modes/mode/perl')).perl,
  pl: async () => (await import('@codemirror/legacy-modes/mode/perl')).perl,
  lua: async () => (await import('@codemirror/legacy-modes/mode/lua')).lua,
  powershell: async () => (await import('@codemirror/legacy-modes/mode/powershell')).powerShell,
  ps1: async () => (await import('@codemirror/legacy-modes/mode/powershell')).powerShell,
  haskell: async () => (await import('@codemirror/legacy-modes/mode/haskell')).haskell,
  hs: async () => (await import('@codemirror/legacy-modes/mode/haskell')).haskell,
  toml: async () => (await import('@codemirror/legacy-modes/mode/toml')).toml,
  dockerfile: async () => (await import('@codemirror/legacy-modes/mode/dockerfile')).dockerFile,
  docker: async () => (await import('@codemirror/legacy-modes/mode/dockerfile')).dockerFile,
  groovy: async () => (await import('@codemirror/legacy-modes/mode/groovy')).groovy,
  pascal: async () => (await import('@codemirror/legacy-modes/mode/pascal')).pascal,
  fortran: async () => (await import('@codemirror/legacy-modes/mode/fortran')).fortran,
  diff: async () => (await import('@codemirror/legacy-modes/mode/diff')).diff,
  patch: async () => (await import('@codemirror/legacy-modes/mode/diff')).diff,
  properties: async () => (await import('@codemirror/legacy-modes/mode/properties')).properties,
  ini: async () => (await import('@codemirror/legacy-modes/mode/properties')).properties,
  nginx: async () => (await import('@codemirror/legacy-modes/mode/nginx')).nginx,
  protobuf: async () => (await import('@codemirror/legacy-modes/mode/protobuf')).protobuf,
  proto: async () => (await import('@codemirror/legacy-modes/mode/protobuf')).protobuf,
  coffeescript: async () => (await import('@codemirror/legacy-modes/mode/coffeescript')).coffeeScript,
  coffee: async () => (await import('@codemirror/legacy-modes/mode/coffeescript')).coffeeScript,
  elm: async () => (await import('@codemirror/legacy-modes/mode/elm')).elm,
  haxe: async () => (await import('@codemirror/legacy-modes/mode/haxe')).haxe,
  julia: async () => (await import('@codemirror/legacy-modes/mode/julia')).julia,
  jl: async () => (await import('@codemirror/legacy-modes/mode/julia')).julia,
};

const languageCache = new Map<string, StreamLanguage<unknown> | null>();

async function loadLanguage(rawName: string): Promise<StreamLanguage<unknown> | null> {
  const key = rawName.toLowerCase();
  const cached = languageCache.get(key);
  if (cached !== undefined) return cached;
  const loader = LOADERS[key];
  if (!loader) {
    languageCache.set(key, null);
    return null;
  }
  try {
    const parser = await loader();
    const language = StreamLanguage.define(parser);
    languageCache.set(key, language);
    return language;
  } catch {
    // A malformed/unavailable legacy-mode module degrades to plain text,
    // never to a broken preview.
    languageCache.set(key, null);
    return null;
  }
}

const escapeHtml = (text: string): string =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export interface HighlightedSnippet {
  /** True when `lang` matched a known language and `html` carries real token spans. */
  readonly recognized: boolean;
  /** Escaped, span-wrapped markup safe to assign as innerHTML; equals the escaped source when unrecognized. */
  readonly html: string;
}

/**
 * Pure code -> HTML highlighting, with no DOM dependency, so it is directly
 * unit-testable (this project's Vitest environment has no DOM; see
 * markdown-diagram.test.ts for the same split between pure logic and DOM
 * wiring). `highlightCodeBlocks` below is the DOM-facing caller.
 */
export async function highlightSnippet(code: string, lang: string): Promise<HighlightedSnippet> {
  const language = await loadLanguage(lang);
  if (!language) return { recognized: false, html: escapeHtml(code) };

  const tree = language.parser.parse(code);
  let out = '';
  highlightCode(
    code,
    tree,
    defaultHighlightStyle,
    (text, classes) => {
      out += classes ? `<span class="${classes}">${escapeHtml(text)}</span>` : escapeHtml(text);
    },
    () => { out += '\n'; },
  );
  return { recognized: true, html: out };
}

export interface HighlightBlocksOptions {
  readonly isCurrent?: () => boolean;
}

/**
 * Colors every non-diagram fenced code block in `container` in place.
 * Returns whether any block was actually recolored, so the caller knows
 * whether previously measured scroll-sync anchors need remeasuring.
 */
export async function highlightCodeBlocks(
  container: HTMLElement,
  options: HighlightBlocksOptions = {},
): Promise<boolean> {
  const isCurrent = options.isCurrent ?? (() => true);
  const blocks = Array.from(
    container.querySelectorAll<HTMLElement>(
      'pre > code[class*="language-"]:not(.language-mermaid):not(.language-dot)',
    ),
  );
  let changed = false;

  for (const block of blocks) {
    if (!isCurrent()) return changed;
    const match = /(?:^|\s)language-(\S+)/.exec(block.className);
    const lang = match?.[1];
    if (!lang) continue;

    const { recognized, html } = await highlightSnippet(block.textContent ?? '', lang);
    if (!isCurrent()) return changed;
    if (!recognized) continue;

    block.innerHTML = html;
    block.classList.add('markdown-workbench-code-highlighted');
    changed = true;
  }

  return changed;
}

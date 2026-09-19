import { StreamLanguage, type Language } from '@codemirror/language';
import { classHighlighter, highlightCode } from '@lezer/highlight';
import { json as jsonLanguageSupport } from '@codemirror/lang-json';
import { markdown as markdownLanguageSupport } from '@codemirror/lang-markdown';
import { javascript, typescript } from '@codemirror/legacy-modes/mode/javascript';
import { python } from '@codemirror/legacy-modes/mode/python';
import { shell } from '@codemirror/legacy-modes/mode/shell';
import { css, less, sCSS } from '@codemirror/legacy-modes/mode/css';
import { xml, html } from '@codemirror/legacy-modes/mode/xml';
import { yaml } from '@codemirror/legacy-modes/mode/yaml';
import { standardSQL } from '@codemirror/legacy-modes/mode/sql';
import { toml } from '@codemirror/legacy-modes/mode/toml';
import { dockerFile } from '@codemirror/legacy-modes/mode/dockerfile';
import { diff } from '@codemirror/legacy-modes/mode/diff';
import { ruby } from '@codemirror/legacy-modes/mode/ruby';
import { rust } from '@codemirror/legacy-modes/mode/rust';
import { go } from '@codemirror/legacy-modes/mode/go';
import { swift } from '@codemirror/legacy-modes/mode/swift';
import { c, cpp, java, csharp } from '@codemirror/legacy-modes/mode/clike';
import { powerShell } from '@codemirror/legacy-modes/mode/powershell';

// Statically highlights a fenced code block's text for the rendered preview
// and every HTML-derived export (standalone HTML, EPUB), using the same
// `@lezer/highlight` machinery CodeMirror's own live source editor is
// styled with (see MarkdownEditor.tsx's `syntaxHighlighting`). Reusing the
// grammars this catalog already depends on for other tools' CodeMirror
// editors (see ShaderEditor.tsx, which established the
// `StreamLanguage.define` + `@codemirror/legacy-modes` pattern this module
// follows) means no highlighting-specific dependency is introduced beyond
// `@lezer/highlight` itself, which every one of those grammars already
// depends on transitively.
//
// `classHighlighter` assigns stable `tok-*` class names
// (https://github.com/codemirror/highlight) rather than inline colors, so
// the actual palette lives in markdown-workbench.css and can be themed
// without touching this module.

const streamLanguages: Readonly<Record<string, Language>> = {
  javascript: StreamLanguage.define(javascript),
  typescript: StreamLanguage.define(typescript),
  python: StreamLanguage.define(python),
  shell: StreamLanguage.define(shell),
  css: StreamLanguage.define(css),
  scss: StreamLanguage.define(sCSS),
  less: StreamLanguage.define(less),
  xml: StreamLanguage.define(xml),
  html: StreamLanguage.define(html),
  yaml: StreamLanguage.define(yaml),
  sql: StreamLanguage.define(standardSQL),
  toml: StreamLanguage.define(toml),
  dockerfile: StreamLanguage.define(dockerFile),
  diff: StreamLanguage.define(diff),
  ruby: StreamLanguage.define(ruby),
  rust: StreamLanguage.define(rust),
  go: StreamLanguage.define(go),
  swift: StreamLanguage.define(swift),
  c: StreamLanguage.define(c),
  cpp: StreamLanguage.define(cpp),
  java: StreamLanguage.define(java),
  csharp: StreamLanguage.define(csharp),
  powershell: StreamLanguage.define(powerShell),
};

// Fenced-code language tags this tool's authors and the wider Markdown/GFM
// ecosystem commonly write, mapped to the canonical key above. An
// unrecognized tag (including a tag with no dedicated grammar at all, such
// as "text" or "plain") intentionally falls through to no highlighting
// rather than a guessed one.
const LANGUAGE_ALIASES: Readonly<Record<string, string>> = {
  js: 'javascript', mjs: 'javascript', cjs: 'javascript', jsx: 'javascript', node: 'javascript',
  ts: 'typescript', tsx: 'typescript',
  py: 'python', py3: 'python', python3: 'python',
  sh: 'shell', bash: 'shell', zsh: 'shell', console: 'shell', shellsession: 'shell',
  htm: 'html', xhtml: 'html',
  yml: 'yaml',
  'c++': 'cpp', cplusplus: 'cpp', cc: 'cpp',
  cs: 'csharp', 'c#': 'csharp',
  rb: 'ruby',
  rs: 'rust',
  ps1: 'powershell', pwsh: 'powershell',
  patch: 'diff',
};

// Fenced-code languages this tool renders as a diagram instead of literal
// text (see diagram-renderer.ts); highlighting their source would be
// discarded work, since the block is replaced with an SVG before the reader
// ever sees the code.
const DIAGRAM_LANGUAGE_TAGS = new Set(['mermaid', 'dot']);

const resolveLanguage = (tag: string): Language | undefined => {
  const normalized = LANGUAGE_ALIASES[tag] ?? tag;
  if (normalized === 'json') return jsonLanguageSupport().language;
  if (normalized === 'markdown' || normalized === 'md') return markdownLanguageSupport().language;
  return streamLanguages[normalized];
};

export const isDiagramLanguageTag = (tag: string): boolean => DIAGRAM_LANGUAGE_TAGS.has(tag.trim().toLowerCase());

export interface HighlightedToken {
  // A run of source text. `classes` is empty for unstyled text (including
  // the "\n" tokens standing in for the line breaks `@lezer/highlight`
  // reports separately from surrounding text).
  readonly text: string;
  readonly classes: string;
}

// Splits `code` into a flat, ordered sequence of highlighted tokens for the
// fenced-code language named by `languageTag` (as written after the
// opening ``` fence), or returns `undefined` when no grammar is registered
// for that tag - callers render the block as plain escaped text in that
// case, which is the correct, honest fallback for a language this tool
// does not recognize rather than a guessed or silently wrong highlight.
//
// StreamLanguage-based tokenizers are heuristic line scanners with no
// documented failure mode for arbitrary text, but this is the one place in
// this tool that hands arbitrary author-typed content to a third-party
// parser purely for a cosmetic effect - a highlighting defect must never be
// able to blank the surrounding preview, so any exception here is treated
// exactly like "no highlighter available".
export const highlightFencedCode = (code: string, languageTag: string): HighlightedToken[] | undefined => {
  const language = resolveLanguage(languageTag.trim().toLowerCase());
  if (!language) return undefined;

  try {
    const tree = language.parser.parse(code);
    const tokens: HighlightedToken[] = [];
    highlightCode(
      code,
      tree,
      classHighlighter,
      (text, classes) => tokens.push({ text, classes }),
      () => tokens.push({ text: '\n', classes: '' }),
    );
    return tokens;
  } catch {
    return undefined;
  }
};

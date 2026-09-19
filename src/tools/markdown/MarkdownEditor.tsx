import { useEffect, useRef } from 'react';
import { autocompletion, closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { markdown, markdownKeymap } from '@codemirror/lang-markdown';
import { defaultHighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { openSearchPanel, searchKeymap } from '@codemirror/search';
import { Compartment, EditorState, Transaction } from '@codemirror/state';
import { drawSelection, EditorView, highlightActiveLine, keymap, lineNumbers } from '@codemirror/view';
import { vim } from '@replit/codemirror-vim';
import { markdownSyntaxCompletions } from './markdown-completions';
import { buildOutline } from './outline-engine';
import { HEADING_ID_PREFIX } from './heading-slug';

// CodeMirror 6 markdown source editor, mirroring the wiring pattern already
// used by this catalog's other CodeMirror-based tools (see LatticeEditor.tsx,
// ShaderEditor.tsx): a host div ref, an EditorView held in a ref (not React
// state, since CodeMirror owns its own DOM), and an updateListener that
// reports changes back out via a stable callback ref so the effect that
// creates the view does not need to depend on the latest onChange closure.
//
// Every user-toggleable setting lives in a Compartment so it can be
// reconfigured in place. This matters for more than tidiness: recreating the
// view on each change dropped the caret, the selection, the scroll position,
// and CodeMirror's own undo history - which made the font-size slider
// unusable, since every step of a drag rebuilt the editor from scratch.

// Local-only image embedding: a pasted or dropped image never leaves the
// browser. Capped well under typical email/base64 bloat concerns so one
// large screenshot cannot silently balloon the document; past this, point
// people at the Image button's URL form instead of guessing at compression.
const MAX_EMBEDDED_IMAGE_BYTES = 5 * 1024 * 1024;

const readImageAsDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('Could not read that image.'));
    reader.readAsDataURL(file);
  });

export interface MarkdownEditorProps {
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly onCursorLineChange?: (line: number) => void;
  readonly onStatus?: (message: string) => void;
  readonly lineWrapping: boolean;
  readonly fontSize: number;
  readonly vimMode: boolean;
  readonly spellcheck: boolean;
  readonly syntaxSuggestions: boolean;
  // Incremented by the parent to request that a given line be scrolled into
  // view and focused (used by the document outline). A counter rather than a
  // bare line number so selecting the same heading twice still re-reveals it.
  readonly revealRequest?: { readonly line: number; readonly nonce: number };
}

export default function MarkdownEditor({
  value,
  onChange,
  onCursorLineChange,
  onStatus,
  lineWrapping,
  fontSize,
  vimMode,
  spellcheck,
  syntaxSuggestions,
  revealRequest,
}: MarkdownEditorProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  const onCursorLineChangeRef = useRef(onCursorLineChange);
  const onStatusRef = useRef(onStatus);
  // Set around a programmatic dispatch (the value-sync effect below, used
  // when an external change - undo/redo, restoring a draft, opening a file -
  // replaces the document from outside the editor). Without this guard, that
  // dispatch fires the same updateListener a real keystroke does, which calls
  // onChange and re-commits the restored text as a brand-new edit, wiping out
  // the workspace's own redo stack on every undo.
  const isExternalSyncRef = useRef(false);

  const vimCompartment = useRef(new Compartment()).current;
  const wrapCompartment = useRef(new Compartment()).current;
  const attributesCompartment = useRef(new Compartment()).current;
  const suggestionsCompartment = useRef(new Compartment()).current;

  // Latest-value refs let the mount effect below seed the initial state
  // without taking a dependency on props that must not trigger a rebuild.
  const valueRef = useRef(value);
  const fontSizeRef = useRef(fontSize);
  const spellcheckRef = useRef(spellcheck);
  const lineWrappingRef = useRef(lineWrapping);
  const vimModeRef = useRef(vimMode);
  const syntaxSuggestionsRef = useRef(syntaxSuggestions);
  valueRef.current = value;
  fontSizeRef.current = fontSize;
  spellcheckRef.current = spellcheck;
  lineWrappingRef.current = lineWrapping;
  vimModeRef.current = vimMode;
  syntaxSuggestionsRef.current = syntaxSuggestions;

  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);
  useEffect(() => { onCursorLineChangeRef.current = onCursorLineChange; }, [onCursorLineChange]);
  useEffect(() => { onStatusRef.current = onStatus; }, [onStatus]);

  const insertImageAtSelection = async (view: EditorView, file: File, at?: number) => {
    if (file.size > MAX_EMBEDDED_IMAGE_BYTES) {
      onStatusRef.current?.(`"${file.name}" is larger than 5 MB and was not embedded. Resize it first, or use the Image button for an external URL instead.`);
      return;
    }
    let dataUrl: string;
    try {
      dataUrl = await readImageAsDataUrl(file);
    } catch {
      onStatusRef.current?.(`Could not read "${file.name}" as an image in this browser.`);
      return;
    }
    const markdown = `![${file.name.replace(/\.[^.]+$/, '')}](${dataUrl})`;
    const from = at ?? view.state.selection.main.from;
    const to = at !== undefined ? at : view.state.selection.main.to;
    view.dispatch({
      changes: { from, to, insert: markdown },
      selection: { anchor: from + markdown.length },
      userEvent: 'input',
    });
    view.focus();
    onStatusRef.current?.(`Embedded "${file.name}" as an inline image. Nothing was uploaded.`);
  };

  // Built once per mount. `value`, `fontSize`, `spellcheck`, `lineWrapping`,
  // `vimMode`, and `syntaxSuggestions` are intentionally absent from the
  // dependency list: the initial document is seeded here and every later
  // change is applied through the effects below instead of rebuilding the view.
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const buildAttributes = (size: number, spell: boolean) => [
      EditorView.contentAttributes.of({
        'aria-label': 'Markdown source',
        spellcheck: spell ? 'true' : 'false',
        style: `font-size:${size}px`,
      }),
      EditorView.editorAttributes.of({ style: `font-size:${size}px` }),
    ];

    const buildSuggestions = (enabled: boolean) => enabled
      ? autocompletion({ override: [markdownSyntaxCompletions], activateOnTyping: true })
      : [];

    const state = EditorState.create({
      doc: valueRef.current,
      extensions: [
        // Kept first so vim's keymap keeps its precedence over the default
        // keymap when the compartment is reconfigured.
        vimCompartment.of(vimModeRef.current ? vim() : []),
        lineNumbers(),
        history(),
        drawSelection(),
        highlightActiveLine(),
        closeBrackets(),
        markdown(),
        syntaxHighlighting(defaultHighlightStyle),
        wrapCompartment.of(lineWrappingRef.current ? EditorView.lineWrapping : []),
        suggestionsCompartment.of(buildSuggestions(syntaxSuggestionsRef.current)),
        keymap.of([...closeBracketsKeymap, ...markdownKeymap, ...defaultKeymap, ...historyKeymap, ...searchKeymap]),
        attributesCompartment.of(buildAttributes(fontSizeRef.current, spellcheckRef.current)),
        // Pasting or dropping an image embeds it as a data URI at the drop
        // point/selection instead of falling through to CodeMirror's default
        // (pasting nothing useful for a paste, or the browser navigating to
        // the file for a drop). A non-image paste/drop returns false so the
        // browser's normal text-paste, and the workspace's own outer
        // file-drop handler (opening a dropped .md file), still run.
        EditorView.domEventHandlers({
          paste: (event, view) => {
            const file = Array.from(event.clipboardData?.files ?? []).find((item) => item.type.startsWith('image/'));
            if (!file) return false;
            event.preventDefault();
            void insertImageAtSelection(view, file);
            return true;
          },
          drop: (event, view) => {
            const file = Array.from(event.dataTransfer?.files ?? []).find((item) => item.type.startsWith('image/'));
            if (!file) return false;
            event.preventDefault();
            event.stopPropagation();
            const at = view.posAtCoords({ x: event.clientX, y: event.clientY }) ?? view.state.selection.main.head;
            void insertImageAtSelection(view, file, at);
            return true;
          },
        }),
        EditorView.updateListener.of((update) => {
          if (update.docChanged && !isExternalSyncRef.current) onChangeRef.current(update.state.doc.toString());
          if (update.selectionSet || update.docChanged) {
            const line = update.state.doc.lineAt(update.state.selection.main.head).number;
            onCursorLineChangeRef.current?.(line);
          }
        }),
        EditorView.theme({
          '&': { minHeight: '360px', height: '100%', backgroundColor: 'var(--surface)', color: 'var(--ink)' },
          '.cm-scroller': { overflow: 'auto', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' },
          '.cm-content': { minHeight: '340px', padding: '10px 0' },
          '.cm-gutters': { backgroundColor: 'var(--surface-strong)', color: 'var(--muted)', borderRight: '1px solid var(--line)' },
          '.cm-activeLine, .cm-activeLineGutter': { backgroundColor: 'var(--signal-soft)' },
          '&.cm-focused': { outline: '2px solid var(--signal)', outlineOffset: '-2px' },
        }),
      ],
    });

    const view = new EditorView({ state, parent: host });
    viewRef.current = view;
    return () => { view.destroy(); viewRef.current = null; };
  }, [vimCompartment, wrapCompartment, attributesCompartment, suggestionsCompartment]);

  useEffect(() => {
    viewRef.current?.dispatch({
      effects: vimCompartment.reconfigure(vimMode ? vim() : []),
    });
  }, [vimMode, vimCompartment]);

  useEffect(() => {
    viewRef.current?.dispatch({
      effects: wrapCompartment.reconfigure(lineWrapping ? EditorView.lineWrapping : []),
    });
  }, [lineWrapping, wrapCompartment]);

  useEffect(() => {
    viewRef.current?.dispatch({
      effects: suggestionsCompartment.reconfigure(
        syntaxSuggestions
          ? autocompletion({ override: [markdownSyntaxCompletions], activateOnTyping: true })
          : [],
      ),
    });
  }, [syntaxSuggestions, suggestionsCompartment]);

  useEffect(() => {
    viewRef.current?.dispatch({
      effects: attributesCompartment.reconfigure([
        EditorView.contentAttributes.of({
          'aria-label': 'Markdown source',
          spellcheck: spellcheck ? 'true' : 'false',
          style: `font-size:${fontSize}px`,
        }),
        EditorView.editorAttributes.of({ style: `font-size:${fontSize}px` }),
      ]),
    });
  }, [fontSize, spellcheck, attributesCompartment]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (current === value) return;
    isExternalSyncRef.current = true;
    view.dispatch({
      changes: { from: 0, to: current.length, insert: value },
      // This tool keeps two deliberately separate levels of history:
      // CodeMirror's own fine-grained text history (Ctrl+Z inside the editor,
      // which preserves the caret) and the workspace's document-level
      // snapshots behind the toolbar's Undo/Redo. Keeping an externally
      // applied document swap out of CodeMirror's history is what stops the
      // two from fighting - otherwise pressing Ctrl+Z straight after a
      // toolbar Undo would "undo the undo" and reinstate the newer text.
      annotations: [Transaction.addToHistory.of(false)],
    });
    isExternalSyncRef.current = false;
  }, [value]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view || !revealRequest) return;
    const lineCount = view.state.doc.lines;
    const target = Math.min(Math.max(revealRequest.line, 1), lineCount);
    const info = view.state.doc.line(target);
    view.dispatch({
      selection: { anchor: info.from },
      effects: EditorView.scrollIntoView(info.from, { y: 'start' }),
    });
    view.focus();
  }, [revealRequest]);

  const insertPattern = (before: string, after: string, fallback: string, useSelection = true) => {
    const view = viewRef.current;
    if (!view) return;
    const { from, to } = view.state.selection.main;
    const selected = (useSelection ? view.state.sliceDoc(from, to) : '') || fallback;
    view.dispatch({ changes: { from, to, insert: before + selected + after },
      selection: { anchor: from + before.length, head: from + before.length + selected.length },
      userEvent: 'input' });
    view.focus();
  };

  // Lines touched by the current selection (or just the caret's line when
  // nothing is selected), for prefix-style block formatting (blockquote,
  // lists) that acts per-line rather than wrapping a single span.
  const selectedLines = (view: EditorView) => {
    const { from, to } = view.state.selection.main;
    const startLine = view.state.doc.lineAt(from).number;
    const endLine = view.state.doc.lineAt(to).number;
    const lines = [];
    for (let number = startLine; number <= endLine; number += 1) lines.push(view.state.doc.line(number));
    return lines;
  };

  const toggleLinePrefix = (prefix: string) => {
    const view = viewRef.current;
    if (!view) return;
    const lines = selectedLines(view);
    const allPrefixed = lines.every((line) => line.text.startsWith(prefix));
    view.dispatch({
      changes: lines.map((line) => allPrefixed
        ? { from: line.from, to: line.from + prefix.length, insert: '' }
        : { from: line.from, to: line.from, insert: prefix }),
      userEvent: 'input',
    });
    view.focus();
  };

  const toggleOrderedList = () => {
    const view = viewRef.current;
    if (!view) return;
    const lines = selectedLines(view);
    const numbered = /^\d+\.\s/;
    const allNumbered = lines.every((line) => numbered.test(line.text));
    view.dispatch({
      changes: lines.map((line, index) => {
        const match = numbered.exec(line.text);
        return allNumbered && match
          ? { from: line.from, to: line.from + match[0].length, insert: '' }
          : { from: line.from, to: line.from, insert: `${index + 1}. ` };
      }),
      userEvent: 'input',
    });
    view.focus();
  };

  // Cycles the caret's current line through H1 - H6, then back to a plain
  // paragraph, rather than a controlled level picker: this stays stateless
  // like every other formatting action here, with no extra render-tracked
  // cursor-position state to keep in sync.
  const cycleHeading = () => {
    const view = viewRef.current;
    if (!view) return;
    const line = view.state.doc.lineAt(view.state.selection.main.head);
    const match = /^(#{1,6})\s+/.exec(line.text);
    const level = match ? match[1].length : 0;
    const nextPrefix = level >= 6 ? '' : `${'#'.repeat(level + 1)} `;
    const stripLength = match ? match[0].length : 0;
    view.dispatch({
      changes: { from: line.from, to: line.from + stripLength, insert: nextPrefix },
      userEvent: 'input',
    });
    view.focus();
  };

  const insertHorizontalRule = () => {
    const view = viewRef.current;
    if (!view) return;
    const { to } = view.state.selection.main;
    const line = view.state.doc.lineAt(to);
    const insert = `${line.text.length > 0 ? '\n\n' : ''}---\n\n`;
    const at = line.to;
    view.dispatch({
      changes: { from: at, to: at, insert },
      selection: { anchor: at + insert.length },
      userEvent: 'input',
    });
    view.focus();
  };

  // Reuses the exact same GitHub-style slugs the rendered preview assigns to
  // each heading (heading-id-plugin.ts) with the same user-content- clobber
  // prefix rehype-sanitize applies, so every generated link actually lands
  // on its heading instead of going nowhere.
  const insertTableOfContents = () => {
    const view = viewRef.current;
    if (!view) return;
    const outline = buildOutline(view.state.doc.toString());
    if (outline.length === 0) {
      onStatusRef.current?.('Add at least one heading before inserting a table of contents.');
      return;
    }
    const minDepth = Math.min(...outline.map((entry) => entry.depth));
    const toc = outline
      .map((entry) => `${'  '.repeat(entry.depth - minDepth)}- [${entry.text || '(untitled heading)'}](#${HEADING_ID_PREFIX}${entry.id})`)
      .join('\n');
    const { from, to } = view.state.selection.main;
    const line = view.state.doc.lineAt(from);
    const insert = `${line.text.length > 0 ? '\n\n' : ''}${toc}\n\n`;
    view.dispatch({
      changes: { from, to, insert },
      selection: { anchor: from + insert.length },
      userEvent: 'input',
    });
    view.focus();
  };

  return <>
    <div className="markdown-workbench-format-actions" role="group" aria-label="Insert Markdown">
      <button type="button" onClick={cycleHeading}>Heading</button>
      <button type="button" onClick={insertTableOfContents}>Table of contents</button>
      <button type="button" onClick={() => insertPattern('**', '**', 'bold text')}>Bold</button>
      <button type="button" onClick={() => insertPattern('*', '*', 'italic text')}>Italic</button>
      <button type="button" onClick={() => insertPattern('~~', '~~', 'deleted text')}>Strikethrough</button>
      <button type="button" onClick={() => insertPattern('`', '`', 'code')}>Inline code</button>
      <button type="button" onClick={() => insertPattern('```\n', '\n```', 'code block', false)}>Code block</button>
      <button type="button" onClick={() => toggleLinePrefix('> ')}>Blockquote</button>
      <button type="button" onClick={() => toggleLinePrefix('- ')}>Bullet list</button>
      <button type="button" onClick={toggleOrderedList}>Numbered list</button>
      <button type="button" onClick={insertHorizontalRule}>Horizontal rule</button>
      <button type="button" onClick={() => insertPattern('[', '](https://example.com)', 'link text')}>Link</button>
      <button type="button" onClick={() => insertPattern('![', '](https://example.com/image.png)', 'alt text')}>Image</button>
      <button type="button" onClick={() => insertPattern('\n\n- [ ] ', '\n', 'task')}>Task</button>
      <button type="button" onClick={() => insertPattern('\n\n', '\n', '| Column | Value |\n| --- | --- |\n| Item | Text |', false)}>Table</button>
      <button type="button" onClick={() => { const view = viewRef.current; if (view) openSearchPanel(view); }}>Find / replace</button>
    </div>
    <div className="markdown-workbench-editor" ref={hostRef} />
  </>;
}

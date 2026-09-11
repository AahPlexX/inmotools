import {
  snippetCompletion,
  type Completion,
  type CompletionSource,
} from '@codemirror/autocomplete';

const completion = (label: string, detail: string, snippet: string, type = 'keyword'): Completion =>
  snippetCompletion(snippet, { label, detail, type });

const HEADING_OPTIONS: Completion[] = [
  completion('Heading 1', '# heading', '# ${heading}'),
  completion('Heading 2', '## heading', '## ${heading}'),
  completion('Heading 3', '### heading', '### ${heading}'),
  completion('Heading 4', '#### heading', '#### ${heading}'),
  completion('Heading 5', '##### heading', '##### ${heading}'),
  completion('Heading 6', '###### heading', '###### ${heading}'),
];

const LIST_OPTIONS: Completion[] = [
  completion('Bullet list', '- item', '- ${item}'),
  completion('Task', '- [ ] task', '- [ ] ${task}'),
];

const INLINE_OPTIONS: Completion[] = [
  completion('Bold', '**text**', '**${text}**', 'text'),
  completion('Italic', '*text*', '*${text}*', 'text'),
  completion('Strikethrough', '~~text~~', '~~${text}~~', 'text'),
];

const LINK_OPTIONS: Completion[] = [
  completion('Link', '[text](url)', '[${text}](${url})', 'link'),
  completion('Citation', '[@citekey]', '[@${citekey}]', 'reference'),
];

const CODE_OPTIONS: Completion[] = [
  completion('Inline code', '`code`', '`${code}`', 'text'),
  completion('Code block', 'fenced code block', '``` ${language}\n${code}\n```', 'text'),
  completion('Mermaid diagram', '```mermaid', '```mermaid\n${diagram}\n```', 'text'),
  completion('Graphviz diagram', '```dot', '```dot\n${diagram}\n```', 'text'),
];

const MATH_OPTIONS: Completion[] = [
  completion('Inline math', '$…$', '$${math}$', 'text'),
  completion('Math block', '$$…$$', '$$\n${math}\n$$', 'text'),
];

const TABLE_OPTION = completion(
  'Table',
  'Markdown table',
  '| ${Column 1} | ${Column 2} |\n| --- | --- |\n| ${Value 1} | ${Value 2} |',
  'text',
);

const ALL_OPTIONS: Completion[] = [
  ...HEADING_OPTIONS,
  ...LIST_OPTIONS,
  completion('Numbered list', '1. item', '1. ${item}'),
  completion('Blockquote', '> quote', '> ${quote}'),
  ...INLINE_OPTIONS,
  ...LINK_OPTIONS,
  completion('Image', '![alt](path)', '![${alt}](${path})', 'link'),
  ...CODE_OPTIONS,
  TABLE_OPTION,
  ...MATH_OPTIONS,
];

const optionsForPrefix = (typed: string): Completion[] => {
  if (/^#{1,6}$/.test(typed)) return HEADING_OPTIONS;
  if (typed === '-') return LIST_OPTIONS;
  if (typed === '1' || typed === '1.') return [completion('Numbered list', '1. item', '1. ${item}')];
  if (typed === '>') return [completion('Blockquote', '> quote', '> ${quote}')];
  if (typed === '*' || typed === '**') return INLINE_OPTIONS.filter((item) => item.label !== 'Strikethrough');
  if (typed === '~' || typed === '~~') return INLINE_OPTIONS.filter((item) => item.label === 'Strikethrough');
  if (typed === '[') return LINK_OPTIONS;
  if (typed === '!') return [completion('Image', '![alt](path)', '![${alt}](${path})', 'link')];
  if (/^`{1,3}$/.test(typed)) return CODE_OPTIONS;
  if (typed === '|') return [TABLE_OPTION];
  if (typed === '$' || typed === '$$') return MATH_OPTIONS;
  return [];
};

/**
 * Suggestions intentionally activate only at the start of a Markdown line.
 * That keeps normal prose quiet while making structural Markdown syntax easy
 * to discover. Ctrl/Cmd+Space on an empty line exposes the complete palette.
 */
export const markdownSyntaxCompletions: CompletionSource = (context) => {
  const line = context.state.doc.lineAt(context.pos);
  const beforeCursor = context.state.sliceDoc(line.from, context.pos);
  const indent = beforeCursor.match(/^ {0,3}/)?.[0] ?? '';
  const typed = beforeCursor.slice(indent.length);

  if (typed.length === 0) {
    if (!context.explicit) return null;
    return { from: context.pos, options: ALL_OPTIONS };
  }

  const options = optionsForPrefix(typed);
  if (options.length === 0) return null;

  return {
    from: line.from + indent.length,
    options,
  };
};

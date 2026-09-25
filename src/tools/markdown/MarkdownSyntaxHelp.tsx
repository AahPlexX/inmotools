import { useRef } from 'react';

const SYNTAX_GROUPS = [
  {
    title: 'Headings',
    examples: ['# Heading 1', '## Heading 2', '### Heading 3', '###### Heading 6'],
  },
  {
    title: 'Emphasis',
    examples: ['**Bold text**', '*Italic text*', '~~Strikethrough~~', '`inline code`'],
  },
  {
    title: 'Lists, quotes & structure',
    examples: ['- Bullet item', '1. Numbered item', '- [ ] Task', '> Blockquote', '---'],
  },
  {
    title: 'Links & images',
    examples: ['[Link text](https://example.com)', '![Alt text](image.png)', 'Paste or drop an image to embed it'],
  },
  {
    title: 'Code & tables',
    examples: ['```js\nconst ready = true;\n```', '| Name | Value |\n| --- | --- |\n| A | 1 |'],
  },
  {
    title: 'Math, diagrams & citations',
    examples: ['$E = mc^2$', '$$\nx^2 + y^2 = z^2\n$$', '```mermaid\ngraph TD\nA --> B\n```', '[@citekey]'],
  },
  {
    title: 'Alerts, footnotes & emoji',
    examples: [
      '> [!NOTE]\n> One of NOTE, TIP, IMPORTANT,\n> WARNING, or CAUTION',
      'A claim needing a source.[^1]\n\n[^1]: The source.',
      ':tada: :rocket: :bulb:',
    ],
  },
] as const;

export default function MarkdownSyntaxHelp() {
  const dialogRef = useRef<HTMLDialogElement>(null);

  return (
    <>
      <button type="button" title="Markdown syntax guide" onClick={() => dialogRef.current?.showModal()}>Markdown help · Syntax guide</button>
      <dialog
        ref={dialogRef}
        className="markdown-workbench-help-dialog"
        aria-labelledby="markdown-syntax-guide-title"
      >
        <div className="markdown-workbench-help-header">
          <div>
            <p className="markdown-workbench-help-eyebrow">Quick reference</p>
            <h2 id="markdown-syntax-guide-title">Markdown syntax guide</h2>
          </div>
          <form method="dialog">
            <button type="submit" className="markdown-workbench-help-close">Close</button>
          </form>
        </div>
        <div className="markdown-workbench-help-body">
          <p className="markdown-workbench-help-intro">
            Type these patterns in the editor, or use the buttons above the source to format selected text. Find / replace is available there too. Syntax suggestions offer common structures as you start a line; Ctrl or Command + Space opens suggestions on an empty line.
          </p>
          <div className="markdown-workbench-help-grid">
            {SYNTAX_GROUPS.map((group) => (
              <section key={group.title} className="markdown-workbench-help-item">
                <h3>{group.title}</h3>
                {group.examples.map((example) => <pre key={example}><code>{example}</code></pre>)}
              </section>
            ))}
          </div>
        </div>
      </dialog>
    </>
  );
}

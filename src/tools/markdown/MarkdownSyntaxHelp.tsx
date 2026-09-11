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
    title: 'Lists & quotes',
    examples: ['- Bullet item', '1. Numbered item', '- [ ] Task', '> Blockquote'],
  },
  {
    title: 'Links & images',
    examples: ['[Link text](https://example.com)', '![Alt text](image.png)'],
  },
  {
    title: 'Code & tables',
    examples: ['```js\nconst ready = true;\n```', '| Name | Value |\n| --- | --- |\n| A | 1 |'],
  },
  {
    title: 'Math, diagrams & citations',
    examples: ['$E = mc^2$', '$$\nx^2 + y^2 = z^2\n$$', '```mermaid\ngraph TD\nA --> B\n```', '[@citekey]'],
  },
] as const;

export default function MarkdownSyntaxHelp() {
  const dialogRef = useRef<HTMLDialogElement>(null);

  return (
    <>
      <button type="button" onClick={() => dialogRef.current?.showModal()}>Markdown help</button>
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
            Type these patterns in the editor. Syntax suggestions can also offer common structures as you start a line.
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

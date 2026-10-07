// Local HTML import for Markdown Workbench.
//
// Turndown is already pinned by this repository. Import it lazily so opening
// the Markdown tool does not pay for HTML conversion until a user actually
// opens or drops an HTML file. Executable/container elements are removed
// before conversion; the result remains ordinary Markdown and still passes
// through the workbench's normal sanitized preview/export pipeline.

const BLOCKED_HTML = 'script, style, noscript, iframe, object, embed';

export const htmlToMarkdownDocument = async (html: string): Promise<string> => {
  const parser = new DOMParser();
  const document = parser.parseFromString(html, 'text/html');
  document.querySelectorAll(BLOCKED_HTML).forEach((node) => node.remove());
  for (const details of document.querySelectorAll('details')) {
    let summary = details.querySelector(':scope > summary');
    if (!summary) { summary = document.createElement('summary'); summary.textContent = 'Details'; }
    details.prepend(summary);
  }

  const { default: TurndownService } = await import('turndown');
  const service = new TurndownService({
    headingStyle: 'atx',
    codeBlockStyle: 'fenced',
    bulletListMarker: '-',
    emDelimiter: '*',
    strongDelimiter: '**',
  });
  const escapedAttribute = (value: string) => value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
  service.addRule('disclosureSummary', {
    filter: 'summary',
    replacement: (_content, node) => `<summary>${escapedAttribute(service.escape(node.textContent?.trim() || 'Details'))}</summary>\n\n`,
  });
  service.addRule('disclosure', {
    filter: 'details',
    replacement: (content, node) => {
      const element = node as HTMLElement;
      const name = element.getAttribute('name');
      const attributes = `${element.hasAttribute('open') ? ' open' : ''}${name ? ` name="${escapedAttribute(name)}"` : ''}`;
      return `\n\n<details${attributes}>\n${content.trim()}\n\n</details>\n\n`;
    },
  });
  service.addRule('definitionList', {
    filter: 'dl',
    replacement: (content) => `\n\n${content.trim()}\n\n`,
  });
  service.addRule('definitionTerm', {
    filter: 'dt',
    replacement: (content) => `\n\n${content.trim()}\n`,
  });
  service.addRule('definitionDescription', {
    filter: 'dd',
    replacement: (content) => {
      const [first, ...rest] = content.trim().split('\n');
      return `\n:   ${first}\n${rest.map((line) => line ? `    ${line}` : '').join('\n')}\n`;
    },
  });
  return service.turndown(document.body).trim();
};

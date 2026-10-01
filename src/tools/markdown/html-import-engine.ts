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

  const { default: TurndownService } = await import('turndown');
  const service = new TurndownService({
    headingStyle: 'atx',
    codeBlockStyle: 'fenced',
    bulletListMarker: '-',
    emDelimiter: '*',
    strongDelimiter: '**',
  });
  return service.turndown(document.body).trim();
};

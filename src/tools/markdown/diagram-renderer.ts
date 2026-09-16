import mermaid from 'mermaid';
import {
  MAX_MERMAID_SOURCE_CHARS,
  renderGraphvizDiagram,
  renderMermaidDiagram,
} from './diagram-engine';

// Mermaid 12 changed the default layout and visual appearance. Keep the
// workbench's established output stable across the major upgrade while still
// using the current renderer and parser fixes.
mermaid.initialize({
  startOnLoad: false,
  securityLevel: 'strict',
  maxTextSize: MAX_MERMAID_SOURCE_CHARS,
  layout: 'dagre',
  theme: 'default',
  look: 'classic',
});

let mermaidDiagramCounter = 0;

export interface DiagramRenderOptions {
  readonly isCurrent?: () => boolean;
  readonly trackCancel?: (cancel: () => void) => void;
  readonly onLayoutChanged?: () => void;
}

const formatError = (kind: 'Mermaid' | 'Graphviz', message: string): string => {
  const normalized = message.replace(/\s+/g, ' ').trim();
  const detail = normalized.length > 500 ? `${normalized.slice(0, 497)}…` : normalized;
  return `${kind} diagram could not be rendered.${detail ? ` ${detail}` : ''}`;
};

const showDiagramError = (pre: HTMLElement, kind: 'Mermaid' | 'Graphviz', message: string): void => {
  pre.classList.add('markdown-workbench-diagram-error');
  pre.removeAttribute('title');

  const existing = pre.nextElementSibling;
  if (existing?.classList.contains('markdown-workbench-diagram-error-message')) existing.remove();

  const error = document.createElement('p');
  error.className = 'markdown-workbench-diagram-error-message';
  error.setAttribute('role', 'alert');
  error.textContent = formatError(kind, message);
  pre.insertAdjacentElement('afterend', error);
};

const replaceWithDiagram = (
  pre: HTMLElement,
  svg: string,
  bindFunctions?: (element: Element) => void,
): void => {
  const wrapper = document.createElement('div');
  wrapper.className = 'markdown-workbench-diagram';
  const sourceLine = pre.getAttribute('data-source-line');
  if (sourceLine) wrapper.setAttribute('data-source-line', sourceLine);
  wrapper.innerHTML = svg;
  pre.replaceWith(wrapper);
  bindFunctions?.(wrapper);
};

export const renderDiagramBlocks = async (
  container: HTMLElement,
  options: DiagramRenderOptions = {},
): Promise<void> => {
  const isCurrent = options.isCurrent ?? (() => true);
  const trackCancel = options.trackCancel ?? (() => undefined);
  const blocks = Array.from(
    container.querySelectorAll<HTMLElement>('pre > code.language-mermaid, pre > code.language-dot'),
  );

  for (const block of blocks) {
    if (!isCurrent()) return;
    const pre = block.parentElement;
    if (!pre) continue;
    const source = block.textContent ?? '';
    const isMermaid = block.classList.contains('language-mermaid');

    if (isMermaid) {
      mermaidDiagramCounter += 1;
      const result = await renderMermaidDiagram(
        (diagramId, text) => mermaid.render(diagramId, text),
        `markdown-workbench-mermaid-${mermaidDiagramCounter}`,
        source,
      );
      if (!isCurrent()) return;
      if ('svg' in result) {
        replaceWithDiagram(pre, result.svg, result.bindFunctions);
      } else {
        showDiagramError(pre, 'Mermaid', result.error);
      }
    } else {
      const handle = renderGraphvizDiagram(source);
      trackCancel(handle.cancel);
      try {
        const response = await handle.promise;
        if (!isCurrent()) return;
        if (response.svg) replaceWithDiagram(pre, response.svg);
        else if (response.error) showDiagramError(pre, 'Graphviz', response.error);
      } catch (error) {
        if (!isCurrent()) return;
        showDiagramError(
          pre,
          'Graphviz',
          error instanceof Error ? error.message : 'Graphviz rendering failed.',
        );
      }
    }
  }

  options.onLayoutChanged?.();
};

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

const BLOCKED_GRAPHVIZ_ELEMENTS = 'script, foreignObject, iframe, object, embed';

const isSafeGraphvizNavigationHref = (value: string): boolean => {
  const trimmed = value.trim();
  if (trimmed.startsWith('#')) return true;
  try {
    const url = new URL(trimmed, document.baseURI);
    return url.protocol === 'http:' || url.protocol === 'https:' || url.protocol === 'mailto:' || url.protocol === 'tel:';
  } catch {
    return false;
  }
};

const hasUnsafeCssUrl = (value: string): boolean => {
  const references = [...value.matchAll(/url\(\s*(['"]?)(.*?)\1\s*\)/gi)];
  return references.some((match) => !match[2]?.trim().startsWith('#'));
};

const parseSafeGraphvizSvg = (svg: string): SVGElement => {
  const parsed = new DOMParser().parseFromString(svg, 'image/svg+xml');
  if (parsed.querySelector('parsererror') || parsed.documentElement.localName.toLowerCase() !== 'svg') {
    throw new Error('Graphviz returned invalid SVG.');
  }

  const root = parsed.documentElement;
  root.querySelectorAll(BLOCKED_GRAPHVIZ_ELEMENTS).forEach((element) => element.remove());

  for (const element of [root, ...Array.from(root.querySelectorAll('*'))]) {
    for (const attribute of Array.from(element.attributes)) {
      const name = attribute.localName.toLowerCase();
      const value = attribute.value.trim();

      if (name.startsWith('on')) {
        element.removeAttributeNode(attribute);
        continue;
      }

      // Graphviz's documented URL/href attributes are copied into SVG links.
      // Keep deliberate navigation on <a> only for ordinary web/contact
      // protocols; every other SVG href must be an in-document fragment.
      if (name === 'href' || name === 'src') {
        const isAnchorNavigation = element.localName.toLowerCase() === 'a' && name === 'href';
        const safe = isAnchorNavigation
          ? isSafeGraphvizNavigationHref(value)
          : value.startsWith('#');
        if (!safe) element.removeAttributeNode(attribute);
        continue;
      }

      // Prevent resource-bearing CSS URLs from turning generated SVG into an
      // automatic external fetch surface. Graphviz's normal fragment refs
      // such as url(#clipPath) remain intact.
      if (value.includes('url(') && hasUnsafeCssUrl(value)) {
        element.removeAttributeNode(attribute);
      }
    }
  }

  return document.importNode(root, true) as unknown as SVGElement;
};

const replaceWithGraphvizDiagram = (pre: HTMLElement, svg: string): void => {
  const wrapper = document.createElement('div');
  wrapper.className = 'markdown-workbench-diagram';
  const sourceLine = pre.getAttribute('data-source-line');
  if (sourceLine) wrapper.setAttribute('data-source-line', sourceLine);
  wrapper.append(parseSafeGraphvizSvg(svg));
  pre.replaceWith(wrapper);
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
        if (response.svg) replaceWithGraphvizDiagram(pre, response.svg);
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

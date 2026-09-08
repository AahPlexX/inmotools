import { useEffect, useRef, useState } from 'react';
import mermaid from 'mermaid';
import { renderMarkdown } from './render-engine';
import { renderMermaidDiagram, renderGraphvizDiagram, scheduleIdle } from './diagram-engine';
import type { ScrollAnchor } from './markdown-types';

mermaid.initialize({ startOnLoad: false, securityLevel: 'strict' });

export interface MarkdownPreviewProps {
  readonly preparedSource: string;
  readonly onAnchorsMeasured: (anchors: { sourceLine: number; offsetTop: number }[]) => void;
  readonly onRenderStateChange?: (pending: boolean) => void;
}

const DIAGRAM_DEBOUNCE_MS = 250;
let mermaidDiagramCounter = 0;

const renderDiagramBlocks = async (
  container: HTMLElement,
  isCurrent: () => boolean,
  trackCancel: (cancel: () => void) => void,
): Promise<void> => {
  const blocks = Array.from(
    container.querySelectorAll('pre > code.language-mermaid, pre > code.language-dot'),
  );

  for (const block of blocks) {
    if (!isCurrent()) return;
    const pre = block.parentElement;
    if (!pre) continue;
    const source = block.textContent ?? '';
    const isMermaid = block.classList.contains('language-mermaid');

    if (isMermaid) {
      mermaidDiagramCounter += 1;
      const id = `markdown-workbench-mermaid-${mermaidDiagramCounter}`;
      const result = await renderMermaidDiagram(
        (diagramId, text) => mermaid.render(diagramId, text),
        id,
        source,
      );
      if (!isCurrent()) return;
      if (result.svg) {
        const wrapper = document.createElement('div');
        wrapper.className = 'markdown-workbench-diagram';
        wrapper.innerHTML = result.svg;
        pre.replaceWith(wrapper);
      } else if (result.error) {
        pre.classList.add('markdown-workbench-diagram-error');
        pre.setAttribute('title', result.error);
      }
    } else {
      const handle = renderGraphvizDiagram(source);
      trackCancel(handle.cancel);
      try {
        const response = await handle.promise;
        if (!isCurrent()) return;
        if (response.svg) {
          const wrapper = document.createElement('div');
          wrapper.className = 'markdown-workbench-diagram';
          wrapper.innerHTML = response.svg;
          pre.replaceWith(wrapper);
        } else if (response.error) {
          pre.classList.add('markdown-workbench-diagram-error');
          pre.setAttribute('title', response.error);
        }
      } catch {
        if (!isCurrent()) return;
        pre.classList.add('markdown-workbench-diagram-error');
        pre.setAttribute('title', 'Graphviz rendering failed.');
      }
    }
  }
};

export default function MarkdownPreview({ preparedSource, onAnchorsMeasured, onRenderStateChange }: MarkdownPreviewProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [anchors, setAnchors] = useState<ScrollAnchor[]>([]);
  const generationRef = useRef(0);

  useEffect(() => {
    const { html, anchors: nextAnchors } = renderMarkdown(preparedSource);
    const host = hostRef.current;
    if (host) host.innerHTML = html;
    setAnchors(nextAnchors);

    generationRef.current += 1;
    const generation = generationRef.current;
    const isCurrent = () => generationRef.current === generation;
    const cancels: (() => void)[] = [];
    onRenderStateChange?.(true);

    const timer = setTimeout(() => {
      scheduleIdle(() => {
        if (!isCurrent()) return;
        if (!host) {
          onRenderStateChange?.(false);
          return;
        }
        void renderDiagramBlocks(host, isCurrent, (cancel) => cancels.push(cancel))
          .finally(() => {
            if (isCurrent()) onRenderStateChange?.(false);
          });
      });
    }, DIAGRAM_DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      generationRef.current += 1;
      cancels.forEach((cancel) => cancel());
      // Unmounting or replacing the preview must release exporters waiting for
      // the current render. A replacement effect immediately marks itself pending.
      onRenderStateChange?.(false);
    };
  }, [preparedSource, onRenderStateChange]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const offsets = anchors.map((anchor) => {
      const element = host.querySelector<HTMLElement>(`[data-source-line="${anchor.sourceLine}"]`);
      return { sourceLine: anchor.sourceLine, offsetTop: element?.offsetTop ?? 0 };
    });
    onAnchorsMeasured(offsets);
  }, [anchors, onAnchorsMeasured]);

  return (
    <div
      className="markdown-workbench-preview"
      ref={hostRef}
      role="region"
      aria-label="Rendered markdown preview"
      tabIndex={0}
    />
  );
}

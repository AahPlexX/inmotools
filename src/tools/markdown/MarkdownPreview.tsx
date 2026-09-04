import { useEffect, useRef, useState } from 'react';
import mermaid from 'mermaid';
import { renderMarkdown } from './render-engine';
import { substituteFormulaValues } from './table-formula-engine';
import { renderMermaidDiagram, renderGraphvizDiagram, scheduleIdle } from './diagram-engine';
import type { ScrollAnchor } from './markdown-types';

// Renders the live preview: markdown -> sanitized HTML (with computed table
// formula values substituted in first), then a post-render pass replaces
// fenced ```mermaid and ```dot code blocks with their rendered diagram SVG.
//
// Mermaid renders on the main thread (idle-scheduled, debounced) because its
// renderer depends on real DOM elements that do not exist inside a Worker.
// Graphviz renders inside a dedicated Worker, since @hpcc-js/wasm-graphviz
// has no DOM dependency and is safe to isolate off the main thread.

mermaid.initialize({ startOnLoad: false, securityLevel: 'strict' });

export interface MarkdownPreviewProps {
  readonly source: string;
  readonly onAnchorsMeasured: (anchors: { sourceLine: number; offsetTop: number }[]) => void;
}

let mermaidDiagramCounter = 0;

const renderDiagramBlocks = async (container: HTMLElement): Promise<void> => {
  const blocks = Array.from(container.querySelectorAll('pre > code.language-mermaid, pre > code.language-dot'));
  for (const block of blocks) {
    const pre = block.parentElement;
    if (!pre) continue;
    const source = block.textContent ?? '';
    const isMermaid = block.classList.contains('language-mermaid');

    if (isMermaid) {
      mermaidDiagramCounter += 1;
      const id = `markdown-workbench-mermaid-${mermaidDiagramCounter}`;
      const result = await renderMermaidDiagram((diagramId, text) => mermaid.render(diagramId, text), id, source);
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
      try {
        const response = await renderGraphvizDiagram(source).promise;
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
        pre.classList.add('markdown-workbench-diagram-error');
        pre.setAttribute('title', 'Graphviz rendering failed.');
      }
    }
  }
};

export default function MarkdownPreview({ source, onAnchorsMeasured }: MarkdownPreviewProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [anchors, setAnchors] = useState<ScrollAnchor[]>([]);

  useEffect(() => {
    const substituted = substituteFormulaValues(source);
    const { html, anchors: nextAnchors } = renderMarkdown(substituted);
    const host = hostRef.current;
    if (host) host.innerHTML = html;
    setAnchors(nextAnchors);

    scheduleIdle(() => {
      if (host) void renderDiagramBlocks(host);
    });
  }, [source]);

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
    />
  );
}

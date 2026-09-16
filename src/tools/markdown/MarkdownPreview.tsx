import { useEffect, useRef } from 'react';
import { renderMarkdown } from './render-engine';
import { scheduleIdle } from './diagram-engine';
import { renderDiagramBlocks } from './diagram-renderer';
import type { ScrollAnchor } from './markdown-types';

export interface MarkdownPreviewProps {
  readonly preparedSource: string;
  readonly onAnchorsMeasured: (anchors: { sourceLine: number; offsetTop: number }[]) => void;
  readonly onRenderStateChange?: (pending: boolean) => void;
}

const DIAGRAM_DEBOUNCE_MS = 250;

const measureAnchors = (
  host: HTMLElement,
  anchors: readonly ScrollAnchor[],
  onAnchorsMeasured: MarkdownPreviewProps['onAnchorsMeasured'],
): void => {
  const offsets = anchors.map((anchor) => {
    const element = host.querySelector<HTMLElement>(`[data-source-line="${anchor.sourceLine}"]`);
    return { sourceLine: anchor.sourceLine, offsetTop: element?.offsetTop ?? 0 };
  });
  onAnchorsMeasured(offsets);
};

export default function MarkdownPreview({ preparedSource, onAnchorsMeasured, onRenderStateChange }: MarkdownPreviewProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const generationRef = useRef(0);

  useEffect(() => {
    const { html, anchors } = renderMarkdown(preparedSource);
    const host = hostRef.current;
    if (host) {
      host.innerHTML = html;
      measureAnchors(host, anchors, onAnchorsMeasured);
    }

    generationRef.current += 1;
    const generation = generationRef.current;
    const isCurrent = () => generationRef.current === generation;
    const cancels: (() => void)[] = [];
    onRenderStateChange?.(true);

    const timer = setTimeout(() => {
      const cancelIdle = scheduleIdle(() => {
        if (!isCurrent()) return;
        if (!host) {
          onRenderStateChange?.(false);
          return;
        }
        void renderDiagramBlocks(host, {
          isCurrent,
          trackCancel: (cancel) => cancels.push(cancel),
          onLayoutChanged: () => {
            if (isCurrent()) measureAnchors(host, anchors, onAnchorsMeasured);
          },
        }).finally(() => {
          if (isCurrent()) onRenderStateChange?.(false);
        });
      });
      cancels.push(cancelIdle);
    }, DIAGRAM_DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      generationRef.current += 1;
      cancels.forEach((cancel) => cancel());
      // Unmounting or replacing the preview must release exporters waiting for
      // the current render. A replacement effect immediately marks itself pending.
      onRenderStateChange?.(false);
    };
  }, [preparedSource, onAnchorsMeasured, onRenderStateChange]);

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

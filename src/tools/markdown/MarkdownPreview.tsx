import { useEffect, useRef, type MouseEvent as ReactMouseEvent } from 'react';
import { renderMarkdown } from './render-engine';
import { scheduleIdle } from './diagram-engine';
import { renderDiagramBlocks } from './diagram-renderer';
import { highlightCodeBlocks } from './code-highlight-engine';
import { addCodePreviewControls } from './code-preview-controls';
import type { ScrollAnchor } from './markdown-types';
import './code-highlight.css';
import './alert-style.css';
import './abbreviation-style.css';
import './definition-list-style.css';
import './disclosure-style.css';
import { revealDisclosureTarget, uniqueDisclosureStates } from './disclosure-dom';

export interface MarkdownPreviewProps {
  readonly preparedSource: string;
  readonly onAnchorsMeasured: (anchors: { sourceLine: number; offsetTop: number }[]) => void;
  readonly onRenderStateChange?: (pending: boolean) => void;
  readonly onPreviewScroll?: (offsetTop: number) => void;
  readonly onToggleTask?: (line: number) => void;
  readonly documentKey?: number;
  readonly onNotice?: (message: string) => void;
}

const DIAGRAM_DEBOUNCE_MS = 250;

const measureAnchors = (
  host: HTMLElement,
  anchors: readonly ScrollAnchor[],
  onAnchorsMeasured: MarkdownPreviewProps['onAnchorsMeasured'],
): void => {
  // Offsets are in the scroller's own content coordinates. element.offsetTop is relative to whichever
  // ancestor is positioned, which is not this scroller, so it cannot be used as a scrollTop target.
  const hostTop = host.getBoundingClientRect().top;
  const offsets = anchors.flatMap((anchor) => {
    const element = host.querySelector<HTMLElement>(`[data-source-line="${anchor.sourceLine}"]`);
    if (!element || element.getClientRects().length === 0) return [];
    return [{ sourceLine: anchor.sourceLine, offsetTop: element.getBoundingClientRect().top - hostTop + host.scrollTop }];
  });
  onAnchorsMeasured(offsets);
};

export default function MarkdownPreview({ preparedSource, onAnchorsMeasured, onRenderStateChange, onPreviewScroll, onToggleTask, documentKey = 0, onNotice }: MarkdownPreviewProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const generationRef = useRef(0);
  const previousDocumentKey = useRef(documentKey);

  const handlePreviewClick = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (
      event.defaultPrevented
      || event.button !== 0
      || event.metaKey
      || event.ctrlKey
      || event.shiftKey
      || event.altKey
    ) return;

    const origin = event.target;
    if (!(origin instanceof Element)) return;
    if (origin.closest('summary')) return;
    const taskItem = origin.closest('li');
    if (taskItem?.querySelector('input[type="checkbox"]')) {
      const line = Number(taskItem.getAttribute('data-source-line'));
      if (Number.isInteger(line) && line > 0) {
        event.preventDefault();
        onToggleTask?.(line);
        return;
      }
    }
    const anchor = origin.closest<HTMLAnchorElement>('a[href^="#"]');
    if (!anchor || !event.currentTarget.contains(anchor)) return;

    const href = anchor.getAttribute('href');
    if (!href) return;
    if (href === '#') {
      event.preventDefault();
      event.currentTarget.scrollTo({ top: 0 });
      return;
    }
    if (href.startsWith('#/')) return;
    event.preventDefault();
    let targetId = href.slice(1);
    try {
      targetId = decodeURIComponent(targetId);
    } catch {
      onNotice?.('This section link has an invalid address.');
      return;
    }

    const destination = Array.from(
      event.currentTarget.querySelectorAll<HTMLElement>('[id]'),
    ).find((node) => node.id === targetId);
    if (!destination) {
      onNotice?.('The section linked here was not found in this document.');
      return;
    }

    event.preventDefault();
    revealDisclosureTarget(destination);
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    destination.scrollIntoView({
      block: 'start',
      behavior: reducedMotion ? 'auto' : 'smooth',
    });
  };

  useEffect(() => {
    const { html, anchors } = renderMarkdown(preparedSource);
    const host = hostRef.current;
    const cancels: (() => void)[] = [];
    if (host) {
      const states = previousDocumentKey.current === documentKey ? uniqueDisclosureStates(host) : new Map();
      previousDocumentKey.current = documentKey;
      host.innerHTML = html;
      const fresh = uniqueDisclosureStates(host);
      for (const node of host.querySelectorAll<HTMLDetailsElement>('details.markdown-disclosure')) {
        const caption = node.querySelector(':scope > summary')?.textContent?.trim() ?? '';
        const state = states.get(caption);
        if (fresh.has(caption) && state && state.defaultOpen === node.dataset.disclosureDefaultOpen) node.open = state.open;
      }
      const onToggle = () => measureAnchors(host, anchors, onAnchorsMeasured);
      host.addEventListener('toggle', onToggle, true);
      cancels.push(() => host.removeEventListener('toggle', onToggle, true));
      cancels.push(addCodePreviewControls(host));
      measureAnchors(host, anchors, onAnchorsMeasured);
    }

    generationRef.current += 1;
    const generation = generationRef.current;
    const isCurrent = () => generationRef.current === generation;
    onRenderStateChange?.(true);

    const timer = setTimeout(() => {
      const cancelIdle = scheduleIdle(() => {
        if (!isCurrent()) return;
        if (!host) {
          onRenderStateChange?.(false);
          return;
        }
        void highlightCodeBlocks(host, { isCurrent })
          .then((changed) => {
            if (isCurrent() && changed) measureAnchors(host, anchors, onAnchorsMeasured);
          })
          .then(() => renderDiagramBlocks(host, {
            isCurrent,
            trackCancel: (cancel) => cancels.push(cancel),
            onLayoutChanged: () => {
              if (isCurrent()) measureAnchors(host, anchors, onAnchorsMeasured);
            },
          }))
          .finally(() => {
            if (isCurrent()) {
              cancels.push(addCodePreviewControls(host, true));
              measureAnchors(host, anchors, onAnchorsMeasured);
              onRenderStateChange?.(false);
            }
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
  }, [preparedSource, onAnchorsMeasured, onRenderStateChange, documentKey]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || !onPreviewScroll) return;
    let frame = 0;
    const onScroll = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => onPreviewScroll(host.scrollTop));
    };
    host.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.cancelAnimationFrame(frame);
      host.removeEventListener('scroll', onScroll);
    };
  }, [onPreviewScroll]);

  return (
    <div
      className="markdown-workbench-preview"
      ref={hostRef}
      role="region"
      aria-label="Rendered markdown preview"
      tabIndex={0}
      onClick={handlePreviewClick}
    />
  );
}

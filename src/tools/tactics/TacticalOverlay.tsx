import { useEffect, useRef, type ReactNode, type RefObject } from 'react';

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

function focusableNodes(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((node) => {
    if (node.getAttribute('aria-hidden') === 'true') return false;
    return node.getClientRects().length > 0;
  });
}

export function useFocusTrap(
  active: boolean,
  container: RefObject<HTMLElement | null>,
  onEscape: () => void,
): void {
  const escapeRef = useRef(onEscape);
  escapeRef.current = onEscape;

  useEffect(() => {
    if (!active) return undefined;
    const root = container.current;
    if (!root) return undefined;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const initial = focusableNodes(root);
    (initial[0] ?? root).focus();

    function onKey(event: KeyboardEvent) {
      if (!container.current) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        escapeRef.current();
        return;
      }
      if (event.key !== 'Tab') return;
      const items = focusableNodes(container.current);
      if (!items.length) {
        event.preventDefault();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      if (previous && document.contains(previous)) previous.focus();
    };
  }, [active, container]);
}

export function TacticalDialog({
  title,
  labelledBy,
  closeLabel,
  onClose,
  children,
}: {
  title: string;
  labelledBy: string;
  closeLabel: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useFocusTrap(true, ref, onClose);

  return (
    <div className="tactical-dialog-backdrop">
      <div
        ref={ref}
        className="tactical-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        tabIndex={-1}
      >
        <h2 id={labelledBy}>{title}</h2>
        {children}
        <button type="button" className="action-button secondary" onClick={onClose}>{closeLabel}</button>
      </div>
    </div>
  );
}

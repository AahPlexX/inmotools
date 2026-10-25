import { useEffect, useLayoutEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { placePlayerActionMenu } from './accessibility-engine';
import type { PlayerActionAnchor } from './accessibility-engine';
import { useFocusTrap } from './TacticalOverlay';

export default function TacticalRadialMenu({ anchor, available, onClose, children }: {
  anchor: PlayerActionAnchor;
  available: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  useFocusTrap(true, ref, onClose, true);
  useEffect(() => { if (!available) closeRef.current?.focus({ preventScroll: true }); }, [available]);

  useLayoutEffect(() => {
    const root = ref.current;
    if (!root) return undefined;
    const viewport = window.visualViewport;

    function place() {
      if (!root) return;
      const width = viewport?.width ?? window.innerWidth;
      const height = viewport?.height ?? window.innerHeight;
      if (width <= 0 || height <= 0) return;
      const initial = root.getBoundingClientRect();
      const style = getComputedStyle(root);
      const scale = initial.width / root.offsetWidth || 1;
      const originLeft = initial.left - Number.parseFloat(style.left) * scale;
      const originTop = initial.top - Number.parseFloat(style.top) * scale;
      const fontSize = Math.max(Number.parseFloat(style.fontSize), Number.parseFloat(getComputedStyle(document.documentElement).fontSize));
      const compact = width / scale < 316 || height / scale < 380 || fontSize > 20;
      root.dataset.layout = compact ? 'compact' : 'radial';
      root.style.maxWidth = `${Math.max(1, (width - 16) / scale)}px`;
      root.style.maxHeight = `${Math.max(1, (height - 16) / scale)}px`;
      root.style.setProperty('--tactical-action-columns', width / scale < 240 ? '1' : '2');
      if (!compact && (root.scrollWidth > root.clientWidth + 1 || root.scrollHeight > root.clientHeight + 1
        || [...root.querySelectorAll<HTMLButtonElement>('button')].some(button => button.scrollWidth > button.clientWidth + 1 || button.scrollHeight > button.clientHeight + 1))) {
        root.dataset.layout = 'compact';
      }
      const rect = root.getBoundingClientRect();
      const offsetLeft = viewport?.offsetLeft ?? 0;
      const offsetTop = viewport?.offsetTop ?? 0;
      const position = placePlayerActionMenu({ x: anchor.x - offsetLeft, y: anchor.y - offsetTop }, rect, { width, height });
      root.style.left = `${(position.left + offsetLeft - originLeft) / scale}px`;
      root.style.top = `${(position.top + offsetTop - originTop) / scale}px`;
    }

    place();
    const observer = new ResizeObserver(place);
    observer.observe(root);
    const textObserver = new MutationObserver(place);
    textObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['style'] });
    window.addEventListener('resize', place);
    viewport?.addEventListener('resize', place);
    viewport?.addEventListener('scroll', place);
    return () => {
      observer.disconnect();
      textObserver.disconnect();
      window.removeEventListener('resize', place);
      viewport?.removeEventListener('resize', place);
      viewport?.removeEventListener('scroll', place);
    };
  }, [anchor]);

  return createPortal(
    <div className="tactical-dialog-backdrop tactical-radial-backdrop">
      <button type="button" className="tactical-radial-scrim" aria-label="Dismiss player actions" onClick={onClose} />
      <dialog
        open
        ref={ref}
        className="tactical-dialog tactical-radial-menu"
        data-testid="tactical-radial-actions"
        data-layout="radial"
        aria-modal="true"
        aria-labelledby="tactical-radial-title"
        aria-describedby="tactical-radial-description"
      >
        <h2 id="tactical-radial-title">Player actions</h2>
        <p id="tactical-radial-description" aria-live="polite">{available ? 'Lift, then choose an action.' : 'This player is unavailable. Close actions to choose another player.'}</p>
        <fieldset className="tactical-radial-ring" aria-label="Player commands">
          {children}
          <button ref={closeRef} type="button" data-player-action="close" aria-label="Close player actions" onClick={onClose}>Close</button>
        </fieldset>
      </dialog>
    </div>,
    document.body,
  );
}

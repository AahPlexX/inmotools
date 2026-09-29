// One tooltip layer for the whole workspace. Any element with `data-tip`
// gets a non-blocking tooltip:
//   · mouse: after a short hover delay; hides on leave, scroll, or press
//   · keyboard: on focus-visible
//   · touch/pen: press-and-hold reveals it; a drag or scroll cancels it
// Positioning flips above/below and clamps horizontally to the viewport.

import { useEffect, useId, useLayoutEffect, useRef, useState, type RefObject } from 'react';

interface TipState { text: string; rect: DOMRect; target: HTMLElement }

const HOVER_DELAY = 380;
const TOUCH_DELAY = 450;
const MARGIN = 8;

export function placeTooltip(anchor: { left: number; top: number; bottom: number; width: number }, size: { width: number; height: number }, viewport: { width: number; height: number }) {
  const spaceBelow = viewport.height - anchor.bottom;
  const below = spaceBelow >= size.height + MARGIN * 2 || anchor.top < size.height + MARGIN * 2;
  const top = below ? anchor.bottom + MARGIN : anchor.top - size.height - MARGIN;
  const centered = anchor.left + anchor.width / 2 - size.width / 2;
  const left = Math.max(MARGIN, Math.min(viewport.width - size.width - MARGIN, centered));
  return { top: Math.max(MARGIN, Math.min(viewport.height - size.height - MARGIN, top)), left, placement: below ? 'below' as const : 'above' as const };
}

export function TooltipLayer({ root }: { root: RefObject<HTMLElement | null> }) {
  const [tip, setTip] = useState<TipState | null>(null);
  const [position, setPosition] = useState<{ top: number; left: number; placement: 'above' | 'below' } | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const timer = useRef<number | null>(null);
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const id = useId();

  useEffect(() => {
    const host = root.current;
    if (!host) return undefined;
    const clearTimer = () => { if (timer.current !== null) window.clearTimeout(timer.current); timer.current = null; };
    const hide = () => { clearTimer(); setTip(null); };
    const targetOf = (event: Event) => (event.target instanceof Element ? event.target.closest<HTMLElement>('[data-tip]') : null);
    const show = (target: HTMLElement, requireHover = false) => {
      const text = target.dataset.tip;
      if (!text || !document.contains(target)) return;
      // A scroll during the hover delay may have moved the element away from the pointer.
      if (requireHover && !target.matches(':hover')) return;
      setTip({ text, rect: target.getBoundingClientRect(), target });
    };
    const onOver = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse') return;
      const target = targetOf(event);
      clearTimer();
      if (!target) { setTip(null); return; }
      timer.current = window.setTimeout(() => show(target, true), HOVER_DELAY);
    };
    const onOut = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse') return;
      const target = targetOf(event);
      const next = event.relatedTarget instanceof Element ? event.relatedTarget.closest('[data-tip]') : null;
      if (target && target !== next) hide();
    };
    const onDown = (event: PointerEvent) => {
      if (event.pointerType === 'mouse') { hide(); return; }
      const target = targetOf(event);
      clearTimer();
      if (!target) { setTip(null); return; }
      touchStart.current = { x: event.clientX, y: event.clientY };
      timer.current = window.setTimeout(() => show(target), TOUCH_DELAY);
    };
    const onMove = (event: PointerEvent) => {
      if (event.pointerType === 'mouse' || !touchStart.current) return;
      if (Math.hypot(event.clientX - touchStart.current.x, event.clientY - touchStart.current.y) > 8) { touchStart.current = null; hide(); }
    };
    const onUp = (event: PointerEvent) => {
      if (event.pointerType === 'mouse') return;
      touchStart.current = null;
      clearTimer();
      timer.current = window.setTimeout(() => setTip(null), 1800);
    };
    const onFocus = (event: FocusEvent) => {
      const target = targetOf(event);
      if (target && target.matches(':focus-visible')) show(target);
    };
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') hide(); };
    // Scrolling hides a visible tooltip but keeps a pending hover timer (it re-checks :hover).
    const onScroll = () => setTip(null);
    host.addEventListener('pointerover', onOver);
    host.addEventListener('pointerout', onOut);
    host.addEventListener('pointerdown', onDown, true);
    host.addEventListener('focusin', onFocus);
    host.addEventListener('focusout', hide);
    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', hide);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('keydown', onKey);
    return () => {
      clearTimer();
      host.removeEventListener('pointerover', onOver);
      host.removeEventListener('pointerout', onOut);
      host.removeEventListener('pointerdown', onDown, true);
      host.removeEventListener('focusin', onFocus);
      host.removeEventListener('focusout', hide);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', hide);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('keydown', onKey);
    };
  }, [root]);

  useEffect(() => {
    if (!tip) return undefined;
    const previous = tip.target.getAttribute('aria-describedby');
    tip.target.setAttribute('aria-describedby', [previous, id].filter(Boolean).join(' '));
    return () => {
      if (previous) tip.target.setAttribute('aria-describedby', previous);
      else tip.target.removeAttribute('aria-describedby');
    };
  }, [tip, id]);

  useLayoutEffect(() => {
    if (!tip || !box.current) { setPosition(null); return; }
    const size = box.current.getBoundingClientRect();
    setPosition(placeTooltip(tip.rect, size, { width: window.innerWidth, height: window.innerHeight }));
  }, [tip]);

  if (!tip) return null;
  return (
    <div
      ref={box}
      id={id}
      role="tooltip"
      className={`gi-tooltip ${position?.placement ?? ''}`}
      style={position ? { top: position.top, left: position.left } : { top: -9999, left: -9999 }}
    >
      {tip.text}
    </div>
  );
}

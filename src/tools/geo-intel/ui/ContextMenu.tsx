import { useEffect, useLayoutEffect, useRef, useState } from 'react';

export interface MenuItem {
  id: string;
  label: string;
  hint?: string;
  danger?: boolean;
  disabled?: boolean;
  run: () => void;
}

export interface MenuState { x: number; y: number; title: string; items: MenuItem[] }

export function placeMenu(x: number, y: number, size: { width: number; height: number }, viewport: { width: number; height: number }) {
  const margin = 6;
  const left = x + size.width + margin > viewport.width ? Math.max(margin, x - size.width) : x;
  const top = y + size.height + margin > viewport.height ? Math.max(margin, y - size.height) : y;
  return { left: Math.min(left, viewport.width - size.width - margin), top: Math.min(top, viewport.height - size.height - margin) };
}

export function ContextMenu({ menu, onClose }: { menu: MenuState | null; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  useLayoutEffect(() => {
    if (!menu || !ref.current) { setPos(null); return; }
    const size = ref.current.getBoundingClientRect();
    setPos(placeMenu(menu.x, menu.y, size, { width: window.innerWidth, height: window.innerHeight }));
    ref.current.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
  }, [menu]);

  useEffect(() => {
    if (!menu) return undefined;
    const close = (event: Event) => { if (!(event.target instanceof Node) || !ref.current?.contains(event.target)) onClose(); };
    // A right-click near an edge scrolls its target into view as the menu opens; ignore that scroll.
    const openedAt = performance.now();
    const onScroll = () => { if (performance.now() - openedAt > 250) onClose(); };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); onClose(); return; }
      if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp' && event.key !== 'Home' && event.key !== 'End') return;
      const buttons = [...(ref.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])];
      if (!buttons.length) return;
      event.preventDefault();
      const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
      buttons[next].focus();
    };
    window.addEventListener('pointerdown', close, true);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onClose);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', close, true);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onClose);
      window.removeEventListener('keydown', onKey);
    };
  }, [menu, onClose]);

  if (!menu) return null;
  return (
    <div
      ref={ref}
      className="gi-menu"
      role="menu"
      aria-label={menu.title}
      style={pos ? { left: pos.left, top: pos.top } : { left: -9999, top: -9999 }}
      onContextMenu={(event) => event.preventDefault()}
    >
      <p className="gi-menu-title" aria-hidden="true">{menu.title}</p>
      {menu.items.map((item) => (
        <button key={item.id} type="button" role="menuitem" className={item.danger ? 'is-danger' : ''} disabled={item.disabled}
          onClick={() => { onClose(); item.run(); }}>
          <span>{item.label}</span>{item.hint ? <kbd>{item.hint}</kbd> : null}
        </button>
      ))}
    </div>
  );
}

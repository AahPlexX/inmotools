export const CONTEXT_MENU_OWNER = 'frontend-stage-2' as const;
export const LONG_PRESS_MS = 500;

export const CONTEXT_MENU_ACTIONS = [
  { id: 'cut', label: 'Cut' },
  { id: 'copy', label: 'Copy' },
  { id: 'paste', label: 'Paste' },
  { id: 'paste-values', label: 'Paste values' },
  { id: 'paste-formats', label: 'Paste formats' },
  { id: 'paste-transpose', label: 'Paste transpose' },
  { id: 'insert-row', label: 'Insert row' },
  { id: 'insert-col', label: 'Insert column' },
  { id: 'delete-row', label: 'Delete row' },
  { id: 'delete-col', label: 'Delete column' },
  { id: 'wrap', label: 'Toggle wrap' },
  { id: 'clear', label: 'Clear contents' },
  { id: 'clear-all', label: 'Clear all' },
] as const;

export type ContextMenuActionId = (typeof CONTEXT_MENU_ACTIONS)[number]['id'];

export function contextMenuPixelSize(): { width: number; height: number } {
  const item = 44;
  const gap = 4;
  const pad = 8;
  const count = CONTEXT_MENU_ACTIONS.length;
  return { width: 228, height: count * item + Math.max(0, count - 1) * gap + pad };
}
export type LongPressTimer = ReturnType<typeof setTimeout> | null;

export function suppressNativeContextMenu(event: { preventDefault(): void }): void {
  event.preventDefault();
}

export function cancelLongPressStub(timer: { current: LongPressTimer }): void {
  if (timer.current !== null) {
    globalThis.clearTimeout(timer.current);
    timer.current = null;
  }
}

export function scheduleLongPressStub(
  timer: { current: LongPressTimer },
  onStage2?: () => void,
): void {
  cancelLongPressStub(timer);
  timer.current = globalThis.setTimeout(() => {
    timer.current = null;
    onStage2?.();
  }, LONG_PRESS_MS);
}

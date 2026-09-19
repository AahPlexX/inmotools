export const CONTEXT_MENU_OWNER = 'frontend-stage-2' as const;
export const LONG_PRESS_MS = 500;

export function suppressNativeContextMenu(event: { preventDefault(): void }): void {
  event.preventDefault();
}

export function cancelLongPressStub(timer: { current: number | null }): void {
  if (timer.current !== null) {
    window.clearTimeout(timer.current);
    timer.current = null;
  }
}

export function scheduleLongPressStub(
  timer: { current: number | null },
  onStage2?: () => void,
): void {
  cancelLongPressStub(timer);
  timer.current = window.setTimeout(() => {
    timer.current = null;
    onStage2?.();
  }, LONG_PRESS_MS);
}

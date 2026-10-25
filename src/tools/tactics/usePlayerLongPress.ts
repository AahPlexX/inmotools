import { useLayoutEffect, useRef } from 'react';
import type { PointerEvent as ReactPointerEvent, RefObject } from 'react';
import { createTacticalLongPress, isVisiblePlayerActionTarget } from './accessibility-engine';
import type { PlayerActionAnchor } from './accessibility-engine';
import type { TacticalProject } from './tactics-types';
import type { PitchViewport } from './workspace-engine';

interface PlayerLongPressOptions {
  project: TacticalProject;
  sceneId: string;
  selectedTokenId?: string;
  enabled: boolean;
  view: PitchViewport;
  onOpen: (tokenId: string, anchor: PlayerActionAnchor) => void;
}

type LongPress = ReturnType<typeof createTacticalLongPress<ReturnType<typeof globalThis.setTimeout>>>;

export function usePlayerLongPress(board: RefObject<HTMLDivElement | null>, options: PlayerLongPressOptions) {
  const latest = useRef(options);
  const controller = useRef<LongPress | null>(null);
  const armed = useRef<{ project: TacticalProject; sceneId: string; view: PitchViewport; tokenId: string } | null>(null);
  const lastPointerType = useRef('');

  useLayoutEffect(() => { latest.current = options; }, [options]);

  useLayoutEffect(() => {
    const owner = board.current;
    const gesture = createTacticalLongPress({
      schedule: (callback, delay) => globalThis.setTimeout(callback, delay),
      cancel: handle => globalThis.clearTimeout(handle),
      isEligible: (tokenId) => {
        const current = latest.current;
        return current.enabled && current.selectedTokenId === tokenId
          && isVisiblePlayerActionTarget(current.project, current.sceneId, tokenId);
      },
      onOpen: (tokenId, anchor) => {
        owner?.focus({ preventScroll: true });
        latest.current.onOpen(tokenId, anchor);
      },
    });
    controller.current = gesture;

    function pointerDown(event: PointerEvent) {
      lastPointerType.current = event.pointerType;
      gesture.begin(event, undefined);
    }
    function move(event: PointerEvent) { gesture.move(event); }
    function end(event: PointerEvent) { gesture.end(event.pointerId); }
    function cancel() { gesture.cancel(); }
    function visibility() { if (document.hidden) cancel(); }
    function contextMenu(event: MouseEvent) {
      if ((lastPointerType.current === 'touch' || (event instanceof PointerEvent && event.pointerType === 'touch'))
        && event.target instanceof Element && (owner?.contains(event.target) || event.target.closest('.tactical-radial-menu'))) event.preventDefault();
    }
    function compatibilityMouse(event: MouseEvent) {
      if (!gesture.compatibilityClickPending()) return;
      event.preventDefault();
      event.stopImmediatePropagation();
    }
    function click(event: MouseEvent) {
      if (event.detail === 0 || !gesture.consumeClick()) return;
      event.preventDefault();
      event.stopImmediatePropagation();
    }

    document.addEventListener('pointerdown', pointerDown, true);
    document.addEventListener('pointermove', move, true);
    document.addEventListener('pointerup', end, true);
    document.addEventListener('pointercancel', end, true);
    document.addEventListener('mousedown', compatibilityMouse, true);
    document.addEventListener('mouseup', compatibilityMouse, true);
    document.addEventListener('click', click, true);
    document.addEventListener('contextmenu', contextMenu, true);
    document.addEventListener('visibilitychange', visibility);
    window.addEventListener('scroll', cancel, true);
    window.addEventListener('resize', cancel);
    window.addEventListener('blur', cancel);
    const viewport = window.visualViewport;
    viewport?.addEventListener('resize', cancel);
    viewport?.addEventListener('scroll', cancel);

    return () => {
      const pointerId = gesture.pointerId();
      gesture.dispose();
      if (pointerId !== undefined && owner?.hasPointerCapture(pointerId)) owner.releasePointerCapture(pointerId);
      controller.current = null;
      document.removeEventListener('pointerdown', pointerDown, true);
      document.removeEventListener('pointermove', move, true);
      document.removeEventListener('pointerup', end, true);
      document.removeEventListener('pointercancel', end, true);
      document.removeEventListener('mousedown', compatibilityMouse, true);
      document.removeEventListener('mouseup', compatibilityMouse, true);
      document.removeEventListener('click', click, true);
      document.removeEventListener('contextmenu', contextMenu, true);
      document.removeEventListener('visibilitychange', visibility);
      window.removeEventListener('scroll', cancel, true);
      window.removeEventListener('resize', cancel);
      window.removeEventListener('blur', cancel);
      viewport?.removeEventListener('resize', cancel);
      viewport?.removeEventListener('scroll', cancel);
    };
  }, [board]);

  useLayoutEffect(() => {
    const pending = armed.current;
    if (pending && (!options.enabled || options.project !== pending.project || options.sceneId !== pending.sceneId
      || options.view !== pending.view || options.selectedTokenId !== pending.tokenId)) {
      controller.current?.cancel();
      armed.current = null;
    }
  }, [options]);

  return {
    begin(event: ReactPointerEvent<HTMLDivElement>, tokenId: string | undefined) {
      const current = latest.current;
      const eligible = current.enabled && isVisiblePlayerActionTarget(current.project, current.sceneId, tokenId);
      controller.current?.begin(event, eligible ? tokenId : undefined);
      if (!eligible || !tokenId || event.pointerType !== 'touch' || !event.isPrimary || event.button !== 0) return;
      armed.current = { project: current.project, sceneId: current.sceneId, view: current.view, tokenId };
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch (error) {
        if (!(error instanceof DOMException) || error.name !== 'NotFoundError') throw error;
      }
    },
    captureLost(event: ReactPointerEvent<HTMLDivElement>) {
      if (event.target === event.currentTarget) controller.current?.end(event.pointerId);
    },
    suppressContextMenu(event: MouseEvent) {
      return lastPointerType.current === 'touch' || (event instanceof PointerEvent && event.pointerType === 'touch');
    },
  };
}

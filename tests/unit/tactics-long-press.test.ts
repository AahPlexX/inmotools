import { afterEach, describe, expect, it, vi } from 'vitest';
import fc from 'fast-check';
import * as accessibility from '../../src/tools/tactics/accessibility-engine';
import { buildBeginnerTacticalProject } from '../../src/tools/tactics/workspace-engine';
import { sampleTacticalProjectAtTime } from '../../src/tools/tactics/timeline-engine';
import { addTimelineSubstitutionEvent } from '../../src/tools/tactics/substitution-engine';

const touch = { pointerId: 7, pointerType: 'touch', isPrimary: true, button: 0, clientX: 120, clientY: 240 };

function controller() {
  vi.useFakeTimers();
  const open = vi.fn(); const eligible = vi.fn(() => true);
  const schedule = vi.fn((callback: () => void, delay: number) => setTimeout(callback, delay));
  const cancel = vi.fn((handle: ReturnType<typeof setTimeout>) => clearTimeout(handle));
  const gesture = accessibility.createTacticalLongPress({ schedule, cancel, onOpen: open, isEligible: eligible });
  return { gesture, open, eligible, schedule, cancel };
}

function playerProject() {
  return buildBeginnerTacticalProject({
    title: 'Touch actions contract', teamName: 'Team', primaryColor: '#154c79', secondaryColor: '#ffffff',
    formationId: 'ussf-4v4-1-2-1', pitchDimensions: { lengthMeters: 100, widthMeters: 50 }, direction: 'left-to-right',
  });
}

afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });

describe('TMS-R78 touch long-press and radial geometry', () => {
  it('opens once at 500 ms with the original CSS-pixel anchor and no input mutation', () => {
    const { gesture, open, schedule } = controller(); const input = { ...touch }; const before = { ...input };
    gesture.begin(input, 'token-2'); expect(gesture.pointerId()).toBe(7);
    expect(accessibility.PLAYER_LONG_PRESS_DELAY_MS).toBe(500); expect(accessibility.PLAYER_LONG_PRESS_SLOP_PX).toBe(10);
    expect(schedule).toHaveBeenCalledWith(expect.any(Function), 500);
    vi.advanceTimersByTime(499); expect(open).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1); expect(open).toHaveBeenCalledExactlyOnceWith('token-2', { x: 120, y: 240 });
    vi.advanceTimersByTime(1000); expect(open).toHaveBeenCalledTimes(1); expect(input).toEqual(before);
  });

  it('copies inherited native pointer coordinates instead of retaining the event object', () => {
    class NativeLikeTouch {
      get pointerId() { return 7; } get pointerType() { return 'touch'; } get isPrimary() { return true; }
      get button() { return 0; } get clientX() { return 120; } get clientY() { return 240; }
    }
    const { gesture, open } = controller(); gesture.begin(new NativeLikeTouch(), 'token-2'); vi.advanceTimersByTime(500);
    expect(open).toHaveBeenCalledExactlyOnceWith('token-2', { x: 120, y: 240 });
  });

  it('keeps a quick tap out of the action menu and cancels its timer', () => {
    const { gesture, open, cancel } = controller(); gesture.begin(touch, 'token-2');
    vi.advanceTimersByTime(150); gesture.end(touch.pointerId); vi.advanceTimersByTime(1000);
    expect(open).not.toHaveBeenCalled(); expect(cancel).toHaveBeenCalledOnce(); expect(gesture.consumeClick()).toBe(false);
  });

  it('accepts exactly ten pixels of Euclidean movement without moving the anchor', () => {
    const { gesture, open } = controller(); gesture.begin(touch, 'token-2');
    gesture.move({ pointerId: 7, clientX: 126, clientY: 248 }); vi.advanceTimersByTime(500);
    expect(open).toHaveBeenCalledExactlyOnceWith('token-2', { x: 120, y: 240 });
  });

  it('permanently cancels movement beyond tolerance even after returning to the start', () => {
    const { gesture, open } = controller(); gesture.begin(touch, 'token-2');
    gesture.move({ pointerId: 7, clientX: 126, clientY: 248.01 }); gesture.move(touch);
    vi.advanceTimersByTime(700); expect(open).not.toHaveBeenCalled(); expect(gesture.pointerId()).toBeUndefined();
  });

  it('ignores other pointer moves and releases but stops on the tracked release', () => {
    const { gesture, open } = controller(); gesture.begin(touch, 'token-2');
    gesture.move({ pointerId: 99, clientX: 999, clientY: 999 }); gesture.end(99);
    vi.advanceTimersByTime(499); expect(gesture.pointerId()).toBe(7);
    gesture.end(7); vi.advanceTimersByTime(1); expect(open).not.toHaveBeenCalled();
  });

  it('cancels an existing hold when another contact begins without rearming', () => {
    const { gesture, open } = controller(); gesture.begin(touch, 'token-2');
    gesture.begin({ ...touch, pointerId: 8, isPrimary: false }, 'token-3');
    vi.advanceTimersByTime(1000); expect(open).not.toHaveBeenCalled(); expect(gesture.pointerId()).toBeUndefined();
  });

  it('never schedules mouse pen nonprimary secondary-button or malformed candidates', () => {
    const { gesture, schedule, open } = controller();
    for (const input of [
      { ...touch, pointerType: 'mouse' }, { ...touch, pointerType: 'pen' }, { ...touch, isPrimary: false },
      { ...touch, button: 2 }, { ...touch, clientX: Number.NaN }, { ...touch, clientY: Number.POSITIVE_INFINITY },
      { ...touch, pointerId: -1 }, { ...touch, pointerId: 0.5 },
    ]) gesture.begin(input, 'token-2');
    gesture.begin(touch, undefined); gesture.begin(touch, ' ');
    vi.advanceTimersByTime(1000); expect(schedule).not.toHaveBeenCalled(); expect(open).not.toHaveBeenCalled();
  });

  it('revalidates the latest eligibility at the deadline rather than opening a stale player', () => {
    const { gesture, eligible, open } = controller(); gesture.begin(touch, 'token-2');
    eligible.mockReturnValue(false); vi.advanceTimersByTime(500);
    expect(eligible).toHaveBeenCalledWith('token-2'); expect(open).not.toHaveBeenCalled(); expect(gesture.consumeClick()).toBe(false);
  });

  it('invalidates a queued old callback when another sequence replaces it', () => {
    const { gesture, schedule, open } = controller(); gesture.begin(touch, 'token-2');
    const stale = schedule.mock.calls[0]![0];
    gesture.cancel(); gesture.begin({ ...touch, pointerId: 8 }, 'token-3'); stale();
    expect(open).not.toHaveBeenCalled(); vi.advanceTimersByTime(500);
    expect(open).toHaveBeenCalledExactlyOnceWith('token-3', { x: 120, y: 240 });
  });

  it('disposes timers and prevents stale callbacks or new sequences after unmount', () => {
    const { gesture, schedule, open, cancel } = controller(); gesture.begin(touch, 'token-2');
    const stale = schedule.mock.calls[0]![0]; gesture.dispose(); stale(); gesture.begin(touch, 'token-3');
    vi.advanceTimersByTime(1000); expect(open).not.toHaveBeenCalled(); expect(cancel).toHaveBeenCalledOnce(); expect(schedule).toHaveBeenCalledOnce();
  });

  it('blocks exactly the initiating compatibility click even after release and cancellation', () => {
    const { gesture } = controller(); gesture.begin(touch, 'token-2'); vi.advanceTimersByTime(500);
    gesture.cancel(); gesture.end(7); expect(gesture.consumeClick()).toBe(true); expect(gesture.consumeClick()).toBe(false);
    gesture.begin(touch, 'token-2'); vi.advanceTimersByTime(500); gesture.begin({ ...touch, pointerType: 'mouse' }, undefined);
    expect(gesture.consumeClick()).toBe(false);
  });

  it('keeps compatibility mouse defaults blocked until the click without consuming the guard early', () => {
    const { gesture } = controller(); expect(gesture.compatibilityClickPending()).toBe(false);
    gesture.begin(touch, 'token-2'); vi.advanceTimersByTime(500); gesture.end(7); gesture.cancel();
    expect(gesture.compatibilityClickPending()).toBe(true); expect(gesture.compatibilityClickPending()).toBe(true);
    expect(gesture.consumeClick()).toBe(true); expect(gesture.compatibilityClickPending()).toBe(false);
  });

  it('allows idempotent cancellation from scroll blur mode or overlay interruption', () => {
    const { gesture, open, cancel } = controller(); gesture.begin(touch, 'token-2');
    gesture.cancel(); gesture.cancel(); vi.advanceTimersByTime(500);
    expect(cancel).toHaveBeenCalledOnce(); expect(open).not.toHaveBeenCalled();
    gesture.begin(touch, 'token-2'); vi.advanceTimersByTime(500); expect(open).toHaveBeenCalledOnce();
  });

  it('only accepts visible same-scene roster-backed targets while still allowing locked players', () => {
    const project = playerProject(); const token = project.playerTokens[0]!; const scene = project.scenes[0]!;
    const before = structuredClone(project); token.locked = true;
    expect(accessibility.isVisiblePlayerActionTarget(project, scene.id, token.id)).toBe(true);
    expect(accessibility.isVisiblePlayerActionTarget(project, scene.id, 'ball')).toBe(false);
    expect(accessibility.isVisiblePlayerActionTarget(project, 'missing-scene', token.id)).toBe(false);
    token.visible = false; expect(accessibility.isVisiblePlayerActionTarget(project, scene.id, token.id)).toBe(false);
    token.visible = true; scene.layers[0]!.visible = false; expect(accessibility.isVisiblePlayerActionTarget(project, scene.id, token.id)).toBe(false);
    scene.layers[0]!.visible = true; token.playerId = 'missing-player'; expect(accessibility.isVisiblePlayerActionTarget(project, scene.id, token.id)).toBe(false);
    const unchanged = structuredClone(before); accessibility.isVisiblePlayerActionTarget(before, scene.id, before.playerTokens[0]!.id); expect(before).toEqual(unchanged);
  });

  it('uses the exact sampled substitution boundary rather than roster status or another clock', () => {
    const base = playerProject(); const outgoing = base.playerTokens[0]!; const incoming = base.playerTokens[1]!;
    incoming.visible = false; base.teams[0]!.roster.find(player => player.id === incoming.playerId)!.status = 'substitute';
    const project = addTimelineSubstitutionEvent(base, { id: 'touch-swap', outgoingTargetId: outgoing.id, incomingTargetId: incoming.id, timeMs: 2000 });
    expect(accessibility.isVisiblePlayerActionTarget(sampleTacticalProjectAtTime(project, 1999), outgoing.sceneId, outgoing.id)).toBe(true);
    expect(accessibility.isVisiblePlayerActionTarget(sampleTacticalProjectAtTime(project, 1999), incoming.sceneId, incoming.id)).toBe(false);
    expect(accessibility.isVisiblePlayerActionTarget(sampleTacticalProjectAtTime(project, 2000), outgoing.sceneId, outgoing.id)).toBe(false);
    expect(accessibility.isVisiblePlayerActionTarget(sampleTacticalProjectAtTime(project, 2000), incoming.sceneId, incoming.id)).toBe(true);
  });

  it('centres a radial panel around an anchor and clamps all four viewport edges', () => {
    const size = { width: 296, height: 360 }; const viewport = { width: 390, height: 844 };
    expect(accessibility.placePlayerActionMenu({ x: 195, y: 422 }, size, viewport)).toEqual({ left: 47, top: 242, width: 296, height: 360 });
    for (const anchor of [{ x: 0, y: 0 }, { x: 390, y: 0 }, { x: 0, y: 844 }, { x: 390, y: 844 }]) {
      const box = accessibility.placePlayerActionMenu(anchor, size, viewport);
      expect(box.left).toBeGreaterThanOrEqual(8); expect(box.top).toBeGreaterThanOrEqual(8);
      expect(box.left + box.width).toBeLessThanOrEqual(382); expect(box.top + box.height).toBeLessThanOrEqual(836);
    }
  });

  it('fits oversized menus and rejects nonfinite or invalid placement inputs', () => {
    expect(accessibility.placePlayerActionMenu({ x: 0, y: 1000 }, { width: 400, height: 900 }, { width: 320, height: 300 })).toEqual({ left: 8, top: 8, width: 304, height: 284 });
    expect(() => accessibility.placePlayerActionMenu({ x: Number.NaN, y: 0 }, { width: 296, height: 360 }, { width: 320, height: 700 })).toThrow(/finite/i);
    expect(() => accessibility.placePlayerActionMenu({ x: 0, y: 0 }, { width: 0, height: 360 }, { width: 320, height: 700 })).toThrow(/positive/i);
    expect(() => accessibility.placePlayerActionMenu({ x: 0, y: 0 }, { width: 296, height: 360 }, { width: 320, height: Number.POSITIVE_INFINITY })).toThrow(/finite/i);
  });

  it('keeps 150 seeded offscreen anchors and oversized panels within their viewport', () => {
    fc.assert(fc.property(
      fc.integer({ min: 240, max: 1920 }), fc.integer({ min: 200, max: 1080 }),
      fc.integer({ min: -2000, max: 4000 }), fc.integer({ min: -2000, max: 4000 }),
      fc.integer({ min: 100, max: 1200 }), fc.integer({ min: 100, max: 1200 }),
      (width, height, x, y, menuWidth, menuHeight) => {
        const box = accessibility.placePlayerActionMenu({ x, y }, { width: menuWidth, height: menuHeight }, { width, height });
        expect(box.left).toBeGreaterThanOrEqual(8); expect(box.top).toBeGreaterThanOrEqual(8);
        expect(box.width).toBeGreaterThan(0); expect(box.height).toBeGreaterThan(0);
        expect(box.left + box.width).toBeLessThanOrEqual(width - 8); expect(box.top + box.height).toBeLessThanOrEqual(height - 8);
      },
    ), { seed: 0x78, numRuns: 150 });
  });
});

import { describe, expect, it } from 'vitest';
import {
  ACTION_LABELS,
  actionForEvent,
  bindingFromEvent,
  bindingsEqual,
  DEFAULT_SHORTCUTS,
  formatBinding,
  isCustomized,
  normalizeKey,
  parseShortcuts,
  rebind,
  removeBinding,
  resetAction,
  serializeShortcuts,
  SHORTCUT_ACTIONS,
  validateBinding,
  type Binding,
  type KeyEventLike,
  type ShortcutMap,
} from '../../src/tools/logic/shortcut-engine';

const event = (key: string, mods: Partial<KeyEventLike> = {}): KeyEventLike => ({ key, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, ...mods });
const binding = (key: string, ctrl = false, shift = false): Binding => ({ key, ctrl, shift });

const allBindings = (map: ShortcutMap): Binding[] => SHORTCUT_ACTIONS.flatMap((action) => [...map[action]]);
const hasDuplicates = (map: ShortcutMap): boolean => {
  const seen = new Set<string>();
  for (const b of allBindings(map)) {
    const id = JSON.stringify(b);
    if (seen.has(id)) return true;
    seen.add(id);
  }
  return false;
};

describe('shortcut defaults', () => {
  it('gives every action at least one binding and a description', () => {
    for (const action of SHORTCUT_ACTIONS) {
      expect(DEFAULT_SHORTCUTS[action].length).toBeGreaterThan(0);
      expect(ACTION_LABELS[action].length).toBeGreaterThan(3);
      expect(ACTION_LABELS[action]).not.toMatch(/\bAI\b/);
    }
  });

  it('never assigns one key to two actions, and every default is itself allowed', () => {
    expect(hasDuplicates(DEFAULT_SHORTCUTS)).toBe(false);
    for (const action of SHORTCUT_ACTIONS) {
      DEFAULT_SHORTCUTS[action].forEach((b, index) => expect(validateBinding(DEFAULT_SHORTCUTS, action, b, index).ok, `${action} ${formatBinding(b)}`).toBe(true));
    }
  });

  it('keeps the bindings the workstation has always had', () => {
    expect(actionForEvent(DEFAULT_SHORTCUTS, event(' '))).toBe('togglePlay');
    expect(actionForEvent(DEFAULT_SHORTCUTS, event('r'))).toBe('rotate');
    expect(actionForEvent(DEFAULT_SHORTCUTS, event('R'))).toBe('rotate');
    expect(actionForEvent(DEFAULT_SHORTCUTS, event('Delete'))).toBe('delete');
    expect(actionForEvent(DEFAULT_SHORTCUTS, event('Backspace'))).toBe('delete');
    expect(actionForEvent(DEFAULT_SHORTCUTS, event('z', { ctrlKey: true }))).toBe('undo');
    expect(actionForEvent(DEFAULT_SHORTCUTS, event('z', { metaKey: true }))).toBe('undo');
    expect(actionForEvent(DEFAULT_SHORTCUTS, event('Z', { ctrlKey: true, shiftKey: true }))).toBe('redo');
    expect(actionForEvent(DEFAULT_SHORTCUTS, event('y', { ctrlKey: true }))).toBe('redo');
    expect(actionForEvent(DEFAULT_SHORTCUTS, event('Escape'))).toBe('cancel');
  });
});

describe('matching key events', () => {
  it('normalizes keys', () => {
    expect(normalizeKey(' ')).toBe('space');
    expect(normalizeKey('Escape')).toBe('escape');
    expect(normalizeKey('A')).toBe('a');
    expect(normalizeKey('ArrowLeft')).toBe('arrowleft');
  });

  it('treats Ctrl and Cmd as one modifier', () => {
    expect(bindingFromEvent(event('d', { ctrlKey: true }))).toEqual(binding('d', true));
    expect(bindingFromEvent(event('d', { metaKey: true }))).toEqual(binding('d', true));
  });

  it('ignores a modifier pressed on its own and unidentifiable keys', () => {
    for (const key of ['Control', 'Shift', 'Alt', 'Meta', 'AltGraph', 'CapsLock', 'Dead', 'Unidentified', '']) expect(bindingFromEvent(event(key))).toBeUndefined();
  });

  it('requires the exact modifiers: Ctrl+Z is undo but plain Z and Ctrl+Shift+Z are not', () => {
    expect(actionForEvent(DEFAULT_SHORTCUTS, event('z'))).toBeUndefined();
    expect(actionForEvent(DEFAULT_SHORTCUTS, event('z', { ctrlKey: true, shiftKey: true }))).toBe('redo');
    expect(actionForEvent(DEFAULT_SHORTCUTS, event('r', { ctrlKey: true }))).toBeUndefined();
  });

  it('triggers nothing while Alt is held, whatever the key', () => {
    expect(actionForEvent(DEFAULT_SHORTCUTS, event('r', { altKey: true }))).toBeUndefined();
    expect(actionForEvent(DEFAULT_SHORTCUTS, event(' ', { altKey: true }))).toBeUndefined();
  });

  it('returns nothing for a key that is not bound', () => {
    expect(actionForEvent(DEFAULT_SHORTCUTS, event('q'))).toBeUndefined();
    expect(actionForEvent(DEFAULT_SHORTCUTS, event('ArrowLeft'))).toBeUndefined();
  });
});

describe('formatting', () => {
  it('spells bindings the way people read them', () => {
    expect(formatBinding(binding('space'))).toBe('Space');
    expect(formatBinding(binding('escape'))).toBe('Escape');
    expect(formatBinding(binding('delete'))).toBe('Delete');
    expect(formatBinding(binding('z', true))).toBe('Ctrl/Cmd + Z');
    expect(formatBinding(binding('z', true, true))).toBe('Ctrl/Cmd + Shift + Z');
    expect(formatBinding(binding('arrowleft'))).toBe('Left Arrow');
    expect(formatBinding(binding('pageup'))).toBe('Page Up');
    expect(formatBinding(binding('?', false, true))).toBe('Shift + ?');
    expect(formatBinding(binding('home'))).toBe('Home');
  });
});

describe('validating a remap', () => {
  it('accepts a free key', () => {
    expect(validateBinding(DEFAULT_SHORTCUTS, 'rotate', binding('x')).ok).toBe(true);
    expect(validateBinding(DEFAULT_SHORTCUTS, 'rotate', binding('x', true, true)).ok).toBe(true);
  });

  it('refuses a key another action uses, and names that action', () => {
    const result = validateBinding(DEFAULT_SHORTCUTS, 'rotate', binding('s'));
    expect(result.ok).toBe(false);
    expect(!result.ok && result.reason).toContain(ACTION_LABELS.step);
  });

  it('refuses a duplicate within the same action but allows re-saving the binding being edited', () => {
    expect(validateBinding(DEFAULT_SHORTCUTS, 'rotate', binding('r')).ok).toBe(false);
    expect(validateBinding(DEFAULT_SHORTCUTS, 'rotate', binding('r'), 0).ok).toBe(true);
  });

  it('refuses keys that must keep their platform meaning', () => {
    for (const b of [binding('tab'), binding('enter'), binding('f5'), binding('f12'), binding('w', true), binding('t', true), binding('r', true), binding('n', true), binding('l', true), binding('q', true)]) {
      expect(validateBinding(DEFAULT_SHORTCUTS, 'rotate', b).ok, formatBinding(b)).toBe(false);
    }
  });
});

describe('editing bindings', () => {
  it('replaces a binding in place', () => {
    const next = rebind(DEFAULT_SHORTCUTS, 'rotate', 0, binding('x'));
    expect(next.rotate).toEqual([binding('x')]);
    expect(actionForEvent(next, event('x'))).toBe('rotate');
    expect(actionForEvent(next, event('r'))).toBeUndefined();
  });

  it('adds an alternative when the index is -1', () => {
    const next = rebind(DEFAULT_SHORTCUTS, 'rotate', -1, binding('x'));
    expect(next.rotate).toEqual([binding('r'), binding('x')]);
  });

  it('returns the map unchanged for an invalid binding instead of corrupting it', () => {
    expect(rebind(DEFAULT_SHORTCUTS, 'rotate', 0, binding('s'))).toBe(DEFAULT_SHORTCUTS);
    expect(rebind(DEFAULT_SHORTCUTS, 'rotate', 0, binding('tab'))).toBe(DEFAULT_SHORTCUTS);
  });

  it('does not touch the original map', () => {
    const before = JSON.stringify(DEFAULT_SHORTCUTS);
    rebind(DEFAULT_SHORTCUTS, 'rotate', 0, binding('x'));
    removeBinding(DEFAULT_SHORTCUTS, 'delete', 0);
    expect(JSON.stringify(DEFAULT_SHORTCUTS)).toBe(before);
  });

  it('removes a binding but always leaves an action at least one', () => {
    const removed = removeBinding(DEFAULT_SHORTCUTS, 'delete', 1);
    expect(removed.delete).toEqual([binding('delete')]);
    expect(removeBinding(removed, 'delete', 0)).toBe(removed);
    expect(removeBinding(DEFAULT_SHORTCUTS, 'delete', 9)).toBe(DEFAULT_SHORTCUTS);
    expect(removeBinding(DEFAULT_SHORTCUTS, 'delete', -1)).toBe(DEFAULT_SHORTCUTS);
  });

  it('reports which actions differ from their defaults', () => {
    const next = rebind(DEFAULT_SHORTCUTS, 'rotate', 0, binding('x'));
    expect(isCustomized(next, 'rotate')).toBe(true);
    expect(isCustomized(next, 'step')).toBe(false);
    expect(isCustomized(DEFAULT_SHORTCUTS, 'rotate')).toBe(false);
  });

  it('resets one action to its defaults', () => {
    const next = rebind(DEFAULT_SHORTCUTS, 'rotate', 0, binding('x'));
    expect(resetAction(next, 'rotate').rotate).toEqual([binding('r')]);
  });

  it('leaves a key with the action that took it when resetting another would collide with it', () => {
    // Step is moved to R, then Rotate is reset: R now belongs to Step, so Rotate keeps the X it has.
    let map = rebind(DEFAULT_SHORTCUTS, 'rotate', 0, binding('x'));
    map = rebind(map, 'step', 0, binding('r'));
    const reset = resetAction(map, 'rotate');
    expect(hasDuplicates(reset)).toBe(false);
    expect(actionForEvent(reset, event('r'))).toBe('step');
    expect(reset.rotate).toEqual([binding('x')]);
  });
});

describe('persistence', () => {
  it('round-trips a customized map', () => {
    let map = rebind(DEFAULT_SHORTCUTS, 'rotate', 0, binding('x'));
    map = rebind(map, 'mirror', -1, binding('m', true, true));
    expect(parseShortcuts(serializeShortcuts(map))).toEqual(map);
  });

  it('falls back to the defaults for missing, empty, or unreadable data', () => {
    for (const raw of [null, '', 'not json', 'null', '42', '[1]', '"x"', '{}']) expect(parseShortcuts(raw)).toEqual(DEFAULT_SHORTCUTS);
  });

  it('keeps a valid customization and defaults the rest when the saved data is partial', () => {
    const map = parseShortcuts(JSON.stringify({ rotate: [{ key: 'x', ctrl: false, shift: false }] }));
    expect(map.rotate).toEqual([binding('x')]);
    expect(map.step).toEqual(DEFAULT_SHORTCUTS.step);
  });

  it('drops malformed, disallowed, and duplicated bindings from a hand-edited file', () => {
    const hostile = JSON.stringify({
      rotate: [{ key: 'tab', ctrl: false, shift: false }, { key: 5 }, 'r', null, { key: 'x', ctrl: 'yes', shift: false }],
      step: [{ key: 'W', ctrl: true, shift: false }, { key: 'k', ctrl: false, shift: false }, { key: 'K', ctrl: false, shift: false }],
      mirror: [{ key: 'k', ctrl: false, shift: false }],
      __proto__: { key: 'q', ctrl: false, shift: false },
      unknown: [{ key: 'q', ctrl: false, shift: false }],
    });
    const map = parseShortcuts(hostile);
    expect(map.rotate).toEqual(DEFAULT_SHORTCUTS.rotate);
    expect(map.step).toEqual([binding('k')]);
    // Step claimed K first, so Mirror falls back to its defaults instead of sharing it.
    expect(map.mirror).toEqual(DEFAULT_SHORTCUTS.mirror);
    expect(hasDuplicates(map)).toBe(false);
    expect(Object.keys(map).sort()).toEqual([...SHORTCUT_ACTIONS].sort());
  });

  it('never yields two actions on one key, even when saved data collides with another action\'s default', () => {
    // Rotate asks for S, which is Step's default; Step is absent, so its default must not also claim S.
    const map = parseShortcuts(JSON.stringify({ rotate: [{ key: 's', ctrl: false, shift: false }] }));
    expect(hasDuplicates(map)).toBe(false);
    // The person's own choice wins; Step, whose only default was taken, gets a free letter rather than none.
    expect(map.rotate).toEqual([binding('s')]);
    expect(map.step).toHaveLength(1);
    expect(map.step[0]!.key).not.toBe('s');
    expect(validateBinding({ ...map, step: [] }, 'step', map.step[0]!).ok).toBe(true);
  });

  it('caps how many bindings one action can hold', () => {
    const many = Array.from({ length: 12 }, (_, index) => ({ key: String.fromCharCode(97 + index), ctrl: true, shift: true }));
    expect(parseShortcuts(JSON.stringify({ rotate: many })).rotate.length).toBeLessThanOrEqual(4);
  });

  it('normalizes the case of stored keys', () => {
    expect(parseShortcuts(JSON.stringify({ rotate: [{ key: 'X', ctrl: false, shift: false }] })).rotate).toEqual([binding('x')]);
  });

  it('equality compares key and both modifiers', () => {
    expect(bindingsEqual(binding('a'), binding('a'))).toBe(true);
    expect(bindingsEqual(binding('a'), binding('a', true))).toBe(false);
    expect(bindingsEqual(binding('a'), binding('a', false, true))).toBe(false);
    expect(bindingsEqual(binding('a'), binding('b'))).toBe(false);
  });
});

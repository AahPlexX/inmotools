/**
 * Pure, framework-independent model of the workstation's keyboard shortcuts:
 * the actions a key can trigger, the default bindings, matching a key event to
 * an action, validating a user's remap (conflicts, keys that must keep their
 * platform meaning), and saving and restoring a customized map.
 *
 * A binding is a key plus the Ctrl/Cmd and Shift modifiers. Ctrl and Cmd are
 * one modifier here so a binding means the same thing on every platform, and
 * Alt is not supported because what it types varies by keyboard layout.
 */

export type ShortcutAction =
  | 'togglePlay'
  | 'step'
  | 'rotate'
  | 'mirror'
  | 'duplicate'
  | 'delete'
  | 'undo'
  | 'redo'
  | 'cancel'
  | 'focusPalette';

export interface Binding {
  /** The normalized key: a lowercase character, or a lowercase name such as `escape`, `space`, `delete`. */
  readonly key: string;
  /** Ctrl on most platforms, Cmd on macOS: either satisfies it. */
  readonly ctrl: boolean;
  readonly shift: boolean;
}

export type ShortcutMap = Readonly<Record<ShortcutAction, readonly Binding[]>>;

/** Every action, in the order the customization panel lists them. */
export const SHORTCUT_ACTIONS: readonly ShortcutAction[] = ['togglePlay', 'step', 'rotate', 'mirror', 'duplicate', 'delete', 'undo', 'redo', 'cancel', 'focusPalette'];

export const ACTION_LABELS: Readonly<Record<ShortcutAction, string>> = {
  togglePlay: 'Play or pause the simulation',
  step: 'Advance the clock by one step',
  rotate: 'Rotate the current selection 90°',
  mirror: 'Flip the current selection horizontally',
  duplicate: 'Duplicate the current selection',
  delete: 'Delete the current selection',
  undo: 'Undo',
  redo: 'Redo',
  cancel: 'Cancel an in-progress wire or component placement, or clear the selection',
  focusPalette: 'Move focus to the component palette',
};

const key = (name: string, ctrl = false, shift = false): Binding => ({ key: name, ctrl, shift });

export const DEFAULT_SHORTCUTS: ShortcutMap = {
  togglePlay: [key('space')],
  step: [key('s')],
  rotate: [key('r')],
  mirror: [key('f')],
  duplicate: [key('d', true)],
  delete: [key('delete'), key('backspace')],
  undo: [key('z', true)],
  redo: [key('z', true, true), key('y', true)],
  cancel: [key('escape')],
  focusPalette: [key('p')],
};

// --- SECTION: keys and events ---

export interface KeyEventLike {
  readonly key: string;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
  readonly shiftKey: boolean;
  readonly altKey: boolean;
}

const MODIFIER_KEYS = new Set(['control', 'shift', 'alt', 'meta', 'altgraph', 'capslock', 'os', 'dead', 'unidentified', 'process']);

/** `' '` becomes `space`, a character is lowercased, and a named key such as `Escape` is lowercased. */
export const normalizeKey = (raw: string): string => (raw === ' ' ? 'space' : raw.toLowerCase());

/** The binding a key event represents, or `undefined` while only a modifier (or an unidentifiable key) is down. */
export const bindingFromEvent = (event: KeyEventLike): Binding | undefined => {
  const name = normalizeKey(event.key);
  if (name === '' || MODIFIER_KEYS.has(name)) return undefined;
  return { key: name, ctrl: event.ctrlKey || event.metaKey, shift: event.shiftKey };
};

export const bindingsEqual = (a: Binding, b: Binding): boolean => a.key === b.key && a.ctrl === b.ctrl && a.shift === b.shift;

const KEY_NAMES: Readonly<Record<string, string>> = {
  space: 'Space',
  escape: 'Escape',
  delete: 'Delete',
  backspace: 'Backspace',
  enter: 'Enter',
  tab: 'Tab',
  arrowleft: 'Left Arrow',
  arrowright: 'Right Arrow',
  arrowup: 'Up Arrow',
  arrowdown: 'Down Arrow',
  home: 'Home',
  end: 'End',
  pageup: 'Page Up',
  pagedown: 'Page Down',
};

/** A binding as a person reads it: `Ctrl/Cmd + Shift + Z`, `Space`, `Delete`. */
export const formatBinding = (binding: Binding): string => {
  const name = KEY_NAMES[binding.key] ?? (binding.key.length === 1 ? binding.key.toUpperCase() : binding.key.charAt(0).toUpperCase() + binding.key.slice(1));
  return [binding.ctrl ? 'Ctrl/Cmd' : '', binding.shift ? 'Shift' : '', name].filter(Boolean).join(' + ');
};

/** The action a key event triggers under `map`, or `undefined`. An event with Alt held triggers nothing. */
export const actionForEvent = (map: ShortcutMap, event: KeyEventLike): ShortcutAction | undefined => {
  if (event.altKey) return undefined;
  const pressed = bindingFromEvent(event);
  if (!pressed) return undefined;
  return SHORTCUT_ACTIONS.find((action) => map[action].some((binding) => bindingsEqual(binding, pressed)));
};

// --- SECTION: validation ---

export type Validation = { readonly ok: true } | { readonly ok: false; readonly reason: string };

/** Ctrl/Cmd combinations the browser keeps for tabs, windows, and reloading; they cannot reliably be overridden. */
const RESERVED_CTRL_KEYS = new Set(['w', 't', 'n', 'q', 'r', 'l', 'tab']);

/**
 * Whether `binding` may be given to `action`. Rejects keys that must keep
 * their platform meaning (Tab and Enter move around and activate controls,
 * function keys and a few Ctrl combinations belong to the browser) and any
 * binding another action already uses. `replacing` is the index of the
 * binding being edited, which is allowed to be re-saved unchanged.
 */
export const validateBinding = (map: ShortcutMap, action: ShortcutAction, binding: Binding, replacing = -1): Validation => {
  if (binding.key === 'tab' || binding.key === 'enter') return { ok: false, reason: 'Tab and Enter move around and activate controls, so they cannot be shortcuts.' };
  if (/^f\d{1,2}$/.test(binding.key)) return { ok: false, reason: 'Function keys are kept for the browser.' };
  if (binding.ctrl && RESERVED_CTRL_KEYS.has(binding.key)) return { ok: false, reason: `${formatBinding(binding)} is kept for the browser (tabs, windows, and reloading).` };
  for (const other of SHORTCUT_ACTIONS) {
    const index = map[other].findIndex((existing) => bindingsEqual(existing, binding));
    if (index === -1) continue;
    if (other === action && index === replacing) continue;
    return { ok: false, reason: other === action ? `${formatBinding(binding)} is already one of this action's shortcuts.` : `${formatBinding(binding)} is already used to: ${ACTION_LABELS[other]}.` };
  }
  return { ok: true };
};

// --- SECTION: editing ---

/** Replaces binding `index` of `action`, or adds one when `index` is -1. Returns the map unchanged if the binding is not valid. */
export const rebind = (map: ShortcutMap, action: ShortcutAction, index: number, binding: Binding): ShortcutMap => {
  if (!validateBinding(map, action, binding, index).ok) return map;
  const current = map[action];
  const next = index >= 0 && index < current.length ? current.map((existing, position) => (position === index ? binding : existing)) : [...current, binding];
  return { ...map, [action]: next };
};

/** Removes binding `index`; an action always keeps at least one shortcut. */
export const removeBinding = (map: ShortcutMap, action: ShortcutAction, index: number): ShortcutMap => {
  const current = map[action];
  if (current.length <= 1 || index < 0 || index >= current.length) return map;
  return { ...map, [action]: current.filter((_, position) => position !== index) };
};

export const resetAction = (map: ShortcutMap, action: ShortcutAction): ShortcutMap => {
  // Restoring the defaults must not take a key another action has since claimed: that action keeps it.
  const claimed = new Set(SHORTCUT_ACTIONS.filter((other) => other !== action).flatMap((other) => map[other].map((binding) => JSON.stringify(binding))));
  const restored = DEFAULT_SHORTCUTS[action].filter((binding) => !claimed.has(JSON.stringify(binding)));
  // If every default is taken there is nothing safe to restore, so the action keeps what it has.
  return restored.length > 0 ? { ...map, [action]: restored } : map;
};

export const isCustomized = (map: ShortcutMap, action: ShortcutAction): boolean => {
  const defaults = DEFAULT_SHORTCUTS[action];
  return map[action].length !== defaults.length || map[action].some((binding, index) => !bindingsEqual(binding, defaults[index]!));
};

// --- SECTION: persistence ---

export const serializeShortcuts = (map: ShortcutMap): string => JSON.stringify(map);

/** The first plain letter no action has claimed. There are 26 letters and fewer than 26 actions, so one always exists. */
const firstFreeLetter = (claimed: ReadonlySet<string>): Binding => {
  for (const letter of 'abcdefghijklmnopqrstuvwxyz') {
    const candidate: Binding = { key: letter, ctrl: false, shift: false };
    if (!claimed.has(JSON.stringify(candidate))) return candidate;
  }
  return { key: 'a', ctrl: false, shift: false };
};

const NO_BINDINGS = Object.fromEntries(SHORTCUT_ACTIONS.map((action) => [action, []])) as unknown as ShortcutMap;

const isBinding = (value: unknown): value is Binding => {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.key === 'string' && candidate.key.length > 0 && candidate.key.length <= 20 && typeof candidate.ctrl === 'boolean' && typeof candidate.shift === 'boolean';
};

/**
 * Restores a saved map defensively. Anything malformed falls back to that
 * action's defaults, and a binding that is not valid or that an earlier
 * action already claimed (a hand-edited file could hold duplicates) is
 * dropped, so a stored map can never make two actions fight over one key.
 */
export const parseShortcuts = (raw: string | null): ShortcutMap => {
  if (!raw) return DEFAULT_SHORTCUTS;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return DEFAULT_SHORTCUTS;
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return DEFAULT_SHORTCUTS;

  // First pass: what each action's saved entry allows on its own (well-formed, permitted keys, no repeats).
  const proposed = new Map<ShortcutAction, Binding[]>();
  for (const action of SHORTCUT_ACTIONS) {
    const saved = (parsed as Record<string, unknown>)[action];
    const candidates = Array.isArray(saved) ? saved.filter(isBinding).map((binding) => ({ key: normalizeKey(binding.key), ctrl: binding.ctrl, shift: binding.shift })) : [];
    const accepted: Binding[] = [];
    for (const binding of candidates.slice(0, 4)) {
      if (accepted.some((existing) => bindingsEqual(existing, binding))) continue;
      // Only the keys-with-a-platform-meaning rules apply here; who wins a contested key is decided below.
      if (!validateBinding(NO_BINDINGS, action, binding).ok) continue;
      accepted.push(binding);
    }
    proposed.set(action, accepted);
  }

  // Second pass: a person's own customization wins over another action's default key. Actions that
  // saved something valid claim it first, in action order; an action left with nothing then gets its
  // defaults minus whatever was claimed (or, if all are taken, its defaults regardless).
  const restored: Record<string, readonly Binding[]> = {};
  const claimed = new Set<string>();
  const unclaimed = (bindings: readonly Binding[]): Binding[] => bindings.filter((binding) => !claimed.has(JSON.stringify(binding)));
  for (const action of SHORTCUT_ACTIONS) {
    const chosen = unclaimed(proposed.get(action) ?? []);
    if (chosen.length === 0) continue;
    restored[action] = chosen;
    for (const binding of chosen) claimed.add(JSON.stringify(binding));
  }
  for (const action of SHORTCUT_ACTIONS) {
    if (restored[action]) continue;
    let chosen = unclaimed(DEFAULT_SHORTCUTS[action]);
    // Every default was taken by someone's customization: give the action the first unused letter, so it is never left with no shortcut.
    if (chosen.length === 0) chosen = [firstFreeLetter(claimed)];
    restored[action] = chosen;
    for (const binding of chosen) claimed.add(JSON.stringify(binding));
  }
  return restored as ShortcutMap;
};

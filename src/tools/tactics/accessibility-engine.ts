export type TacticalShortcutId =
  | 'help'
  | 'close-overlay'
  | 'undo'
  | 'redo'
  | 'move-tool'
  | 'arrow-tool'
  | 'nudge-up'
  | 'nudge-down'
  | 'nudge-left'
  | 'nudge-right'
  | 'toggle-playback'
  | 'stop-playback'
  | 'previous-frame'
  | 'next-frame'
  | 'previous-keyframe'
  | 'next-keyframe'
  | 'delete-drawing'
  | 'player-actions';

export type TacticalFocusKind = 'editable' | 'activation' | 'board' | 'neutral';

export type TacticalTransportAction =
  | 'toggle-playback'
  | 'stop-playback'
  | 'previous-frame'
  | 'next-frame'
  | 'previous-keyframe'
  | 'next-keyframe';

export interface TacticalTransportRequest {
  serial: number;
  action: TacticalTransportAction;
}

export interface TacticalShortcutInput {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
  repeat?: boolean;
}

export interface TacticalShortcutContext {
  focus: TacticalFocusKind;
  overlayOpen: boolean;
}

export interface TacticalFocusSnapshot {
  inBoard: boolean;
  editable: boolean;
  activation: boolean;
}

export interface TacticalShortcut {
  id: TacticalShortcutId;
  label: string;
  chords: string[];
  display: string;
  summary: string;
  allowInEditable: boolean;
  allowWhenOverlay: boolean;
  allowRepeat: boolean;
  focus: TacticalFocusKind[];
}

export interface TacticalHelpSection {
  id: string;
  title: string;
  paragraphs: string[];
}

export interface TacticalBox {
  top: number;
  left: number;
  width: number;
  height: number;
}

const ALL_FOCUS: TacticalFocusKind[] = ['editable', 'activation', 'board', 'neutral'];
const QUIET_FOCUS: TacticalFocusKind[] = ['board', 'neutral'];

export const TACTICAL_SHORTCUTS: readonly TacticalShortcut[] = [
  {
    id: 'close-overlay',
    label: 'Close help, actions, or sheet',
    chords: ['escape'],
    display: 'Escape',
    summary: 'Closes the help reference, player actions, or an open sheet and returns focus to the control that opened it.',
    allowInEditable: true,
    allowWhenOverlay: true,
    allowRepeat: false,
    focus: ALL_FOCUS,
  },
  {
    id: 'help',
    label: 'Open help',
    chords: ['?', 'f1'],
    display: '? or F1',
    summary: 'Opens the help reference. This does not run while typing in a field.',
    allowInEditable: false,
    allowWhenOverlay: false,
    allowRepeat: false,
    focus: ['activation', 'board', 'neutral'],
  },
  {
    id: 'undo',
    label: 'Undo',
    chords: ['ctrl+z', 'meta+z'],
    display: 'Ctrl+Z or Cmd+Z',
    summary: 'Undoes the last board edit. Text fields keep their own undo.',
    allowInEditable: false,
    allowWhenOverlay: false,
    allowRepeat: false,
    focus: ['activation', 'board', 'neutral'],
  },
  {
    id: 'redo',
    label: 'Redo',
    chords: ['ctrl+shift+z', 'meta+shift+z', 'ctrl+y', 'meta+y'],
    display: 'Ctrl+Shift+Z, Cmd+Shift+Z, Ctrl+Y, or Cmd+Y',
    summary: 'Redoes the next board edit. Text fields keep their own redo.',
    allowInEditable: false,
    allowWhenOverlay: false,
    allowRepeat: false,
    focus: ['activation', 'board', 'neutral'],
  },
  {
    id: 'move-tool',
    label: 'Move tool',
    chords: ['m'],
    display: 'M',
    summary: 'Selects the move tool.',
    allowInEditable: false,
    allowWhenOverlay: false,
    allowRepeat: false,
    focus: ['activation', 'board', 'neutral'],
  },
  {
    id: 'arrow-tool',
    label: 'Arrow tool',
    chords: ['shift+a'],
    display: 'Shift+A',
    summary: 'Selects the arrow tool.',
    allowInEditable: false,
    allowWhenOverlay: false,
    allowRepeat: false,
    focus: ['activation', 'board', 'neutral'],
  },
  {
    id: 'nudge-up',
    label: 'Nudge up',
    chords: ['arrowup'],
    display: 'Arrow up',
    summary: 'Moves the selected player up when focus is on the pitch or the page background.',
    allowInEditable: false,
    allowWhenOverlay: false,
    allowRepeat: true,
    focus: QUIET_FOCUS,
  },
  {
    id: 'nudge-down',
    label: 'Nudge down',
    chords: ['arrowdown'],
    display: 'Arrow down',
    summary: 'Moves the selected player down when focus is on the pitch or the page background.',
    allowInEditable: false,
    allowWhenOverlay: false,
    allowRepeat: true,
    focus: QUIET_FOCUS,
  },
  {
    id: 'nudge-left',
    label: 'Nudge left',
    chords: ['arrowleft'],
    display: 'Arrow left',
    summary: 'Moves the selected player left when focus is on the pitch or the page background.',
    allowInEditable: false,
    allowWhenOverlay: false,
    allowRepeat: true,
    focus: QUIET_FOCUS,
  },
  {
    id: 'nudge-right',
    label: 'Nudge right',
    chords: ['arrowright'],
    display: 'Arrow right',
    summary: 'Moves the selected player right when focus is on the pitch or the page background.',
    allowInEditable: false,
    allowWhenOverlay: false,
    allowRepeat: true,
    focus: QUIET_FOCUS,
  },
  {
    id: 'toggle-playback',
    label: 'Play or pause',
    chords: ['k'],
    display: 'K',
    summary: 'Starts or pauses timeline playback. Buttons and fields keep Space and letter typing.',
    allowInEditable: false,
    allowWhenOverlay: false,
    allowRepeat: false,
    focus: QUIET_FOCUS,
  },
  {
    id: 'stop-playback',
    label: 'Stop playback',
    chords: ['shift+k'],
    display: 'Shift+K',
    summary: 'Stops playback and returns the preview to 0 ms.',
    allowInEditable: false,
    allowWhenOverlay: false,
    allowRepeat: false,
    focus: QUIET_FOCUS,
  },
  {
    id: 'previous-frame',
    label: 'Previous frame',
    chords: ['j'],
    display: 'J',
    summary: 'Steps the preview back one frame.',
    allowInEditable: false,
    allowWhenOverlay: false,
    allowRepeat: true,
    focus: QUIET_FOCUS,
  },
  {
    id: 'next-frame',
    label: 'Next frame',
    chords: ['l'],
    display: 'L',
    summary: 'Steps the preview forward one frame.',
    allowInEditable: false,
    allowWhenOverlay: false,
    allowRepeat: true,
    focus: QUIET_FOCUS,
  },
  {
    id: 'previous-keyframe',
    label: 'Previous keyframe',
    chords: ['['],
    display: '[',
    summary: 'Moves the preview to the previous keyframe.',
    allowInEditable: false,
    allowWhenOverlay: false,
    allowRepeat: false,
    focus: QUIET_FOCUS,
  },
  {
    id: 'next-keyframe',
    label: 'Next keyframe',
    chords: [']'],
    display: ']',
    summary: 'Moves the preview to the next keyframe.',
    allowInEditable: false,
    allowWhenOverlay: false,
    allowRepeat: false,
    focus: QUIET_FOCUS,
  },
  {
    id: 'player-actions',
    label: 'Player actions',
    chords: ['shift+f10', 'contextmenu'],
    display: 'Shift+F10 or the context menu key',
    summary: 'Opens the same player actions as a right-click. The Player actions button is the touch equivalent.',
    allowInEditable: false,
    allowWhenOverlay: false,
    allowRepeat: false,
    focus: ['activation', 'board', 'neutral'],
  },
  {
    id: 'delete-drawing',
    label: 'Remove selected drawing',
    chords: ['delete', 'backspace'],
    display: 'Delete or Backspace',
    summary: 'Removes the selected arrow or drawing. It does not remove a player. Text fields keep Backspace.',
    allowInEditable: false,
    allowWhenOverlay: false,
    allowRepeat: false,
    focus: QUIET_FOCUS,
  },
];

export const TACTICAL_HELP_SECTIONS: readonly TacticalHelpSection[] = [
  {
    id: 'move',
    title: 'Move a player',
    paragraphs: [
      'Select a player from the list or the pitch. Click or tap the pitch to place that player, use the arrow buttons, or type X and Y percentages from 0 to 100 across the pitch.',
      'Arrow keys nudge (move a small step) the selected player when focus is on the pitch or the page background. They do not nudge while a text field, button, or other control has focus.',
    ],
  },
  {
    id: 'actions',
    title: 'Right-click and touch',
    paragraphs: [
      'Right-click a player to open player actions. The same dialog opens from the "Player actions" button or from Shift+F10.',
      'Locking a player or a layer blocks later moves until you unlock it. Undo still restores the previous board.',
    ],
  },
  {
    id: 'layout',
    title: 'Narrow layout',
    paragraphs: [
      'On a narrow window the pitch and player controls come before the setup panels. "Players sheet" and "Timeline sheet" open those same controls in a bottom sheet, a panel that slides up from the bottom of the screen.',
      'Escape closes a sheet, player actions, or help and returns focus to the button that opened it.',
    ],
  },
  {
    id: 'layers',
    title: 'Layers and groups',
    paragraphs: [
      'Check the players you want to group, name the layer, and group them. The new layer keeps those players together.',
      'Show, lock, reorder, solo, and focus a layer from the "Layers" tab. Solo hides every other layer in the scene. Focus selects the first player on that layer.',
    ],
  },
  {
    id: 'motion',
    title: 'Playback and reduced motion',
    paragraphs: [
      'A keyframe is a saved time on the motion timeline (the row of times for player motion). K plays or pauses when focus is on the pitch or the page background. J and L step one frame. [ and ] move between keyframes. Shift+K stops and returns to 0 ms.',
      'When the device asks for reduced motion, Play and K step to the next keyframe instead of animating. Authoring, timeline scrubbing (dragging the current-time marker), and frame steps stay available.',
    ],
  },
  {
    id: 'recovery',
    title: 'Local recovery',
    paragraphs: [
      'The project vault — projects, snapshots (saved copies of the project at a moment), and autosaves stored in this browser — keeps that data on this device. Nothing is uploaded.',
      'If a previous autosave is waiting, autosave stays paused until you restore it or keep the current board.',
    ],
  },
  {
    id: 'match-setup',
    title: 'Other team, ball, and drawings',
    paragraphs: [
      'Place opposition fits the visible squad into one half and a mirrored squad into the other half. The two kits stay different colors. Undo puts the previous board back.',
      'Click the ball, then click the pitch to move it. Arrow keys nudge the ball while it is selected.',
      'Click an arrow or other drawing, then choose Remove drawing, Delete, or Backspace. That removes the drawing and leaves the players in place.',
    ],
  },
];

export function assertUniqueShortcutChords(shortcuts: readonly TacticalShortcut[]): void {
  const owner = new Map<string, TacticalShortcutId>();
  for (const shortcut of shortcuts) {
    if (!shortcut.display.trim() || !shortcut.summary.trim() || !shortcut.chords.length) {
      throw new Error(`Shortcut ${shortcut.id} is missing a chord, display label, or summary.`);
    }
    for (const chord of shortcut.chords) {
      const previous = owner.get(chord);
      if (previous) throw new Error(`Shortcut chord ${chord} is used by both ${previous} and ${shortcut.id}.`);
      owner.set(chord, shortcut.id);
    }
  }
}

export function shortcutChord(input: TacticalShortcutInput): string {
  const parts: string[] = [];
  if (input.ctrlKey) parts.push('ctrl');
  if (input.metaKey) parts.push('meta');
  if (input.altKey) parts.push('alt');
  const key = input.key === '?' ? '?' : input.key.toLowerCase();
  if (input.shiftKey && key !== '?') parts.push('shift');
  parts.push(key);
  return parts.join('+');
}

export function classifyTacticalFocus(snapshot: TacticalFocusSnapshot): TacticalFocusKind {
  if (snapshot.editable) return 'editable';
  if (snapshot.activation) return 'activation';
  if (snapshot.inBoard) return 'board';
  return 'neutral';
}

export function resolveTacticalShortcut(
  input: TacticalShortcutInput,
  context: TacticalShortcutContext,
  shortcuts: readonly TacticalShortcut[] = TACTICAL_SHORTCUTS,
): TacticalShortcutId | null {
  if (input.repeat) {
    const chord = shortcutChord(input);
    const repeated = shortcuts.find((shortcut) => shortcut.chords.includes(chord));
    if (!repeated?.allowRepeat) return null;
  }
  const chord = shortcutChord(input);
  const match = shortcuts.find((shortcut) => shortcut.chords.includes(chord));
  if (!match) return null;
  if (match.id === 'close-overlay' && !context.overlayOpen) return null;
  if (context.overlayOpen && !match.allowWhenOverlay) return null;
  if (context.focus === 'editable' && !match.allowInEditable) return null;
  if (!match.focus.includes(context.focus)) return null;
  return match.id;
}

assertUniqueShortcutChords(TACTICAL_SHORTCUTS);

export function placeCollisionSafeTooltip(
  anchor: TacticalBox,
  size: { width: number; height: number },
  viewport: { width: number; height: number },
  gap = 8,
): { top: number; left: number; placement: 'above' | 'below' } {
  const safeGap = Math.max(0, gap);
  const viewportWidth = Math.max(0, viewport.width);
  const viewportHeight = Math.max(0, viewport.height);
  const width = Math.min(Math.max(0, size.width), Math.max(0, viewportWidth - safeGap * 2));
  const height = Math.max(0, size.height);
  let left = anchor.left + anchor.width / 2 - width / 2;
  const maxLeft = Math.max(safeGap, viewportWidth - safeGap - width);
  left = Math.min(Math.max(left, safeGap), maxLeft);
  const below = anchor.top + anchor.height + safeGap;
  const above = anchor.top - safeGap - height;
  let placement: 'above' | 'below' = 'below';
  let top = below;
  if (below + height > viewportHeight - safeGap && above >= safeGap) {
    placement = 'above';
    top = above;
  }
  const maxTop = Math.max(safeGap, viewportHeight - safeGap - height);
  if (top < safeGap) top = safeGap;
  if (top > maxTop) top = maxTop;
  return { top, left, placement };
}

export function reducedMotionTransportStep(
  currentMs: number,
  durationMs: number,
  keyframeTimes: readonly number[],
): { timeMs: number; message: string } {
  const current = Number.isFinite(currentMs) ? currentMs : 0;
  const duration = Number.isFinite(durationMs) ? Math.max(0, durationMs) : 0;
  const nextKeyframe = keyframeTimes.find((time) => time > current);
  if (nextKeyframe !== undefined) {
    return {
      timeMs: Math.min(duration, nextKeyframe),
      message: 'Reduced motion stepped to the next keyframe.',
    };
  }
  if (current < duration) {
    return {
      timeMs: duration,
      message: 'Reduced motion stepped to the end of the timeline.',
    };
  }
  return {
    timeMs: 0,
    message: 'Reduced motion returned playback to the start.',
  };
}

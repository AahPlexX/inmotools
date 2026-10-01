import { useEffect, useState } from 'react';
import {
  ACTION_LABELS,
  bindingFromEvent,
  DEFAULT_SHORTCUTS,
  formatBinding,
  isCustomized,
  rebind,
  removeBinding,
  resetAction,
  SHORTCUT_ACTIONS,
  validateBinding,
  type ShortcutAction,
  type ShortcutMap,
} from './shortcut-engine';
import './LogicShortcutsDock.css';

export interface LogicShortcutsDockProps {
  readonly shortcuts: ShortcutMap;
  readonly onChange: (next: ShortcutMap) => void;
}

/** Pointer and touch gestures are fixed; they are listed so this panel is the one place to look. */
const POINTER_GESTURES: ReadonlyArray<{ readonly gesture: string; readonly action: string }> = [
  { gesture: 'Right-click (or long-press on touch)', action: 'Open a component’s rotate/flip/duplicate/delete menu' },
  { gesture: 'Click a pin, then another pin', action: 'Draw a wire between them' },
  { gesture: 'Scroll wheel, or pinch with two fingers', action: 'Zoom the canvas' },
  { gesture: 'Middle-drag, or two-finger drag', action: 'Pan the canvas' },
];

interface Recording {
  readonly action: ShortcutAction;
  /** Index of the binding being replaced, or -1 while adding another. */
  readonly index: number;
}

export function LogicShortcutsDock({ shortcuts, onChange }: LogicShortcutsDockProps) {
  const [recording, setRecording] = useState<Recording | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  // While recording, the next key or combination becomes the binding. A capture-phase listener runs before the
  // workspace's own handler and stops the event, so recording an "R" does not also rotate the selection.
  useEffect(() => {
    if (!recording) return;
    const onKeyDown = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();
      if (event.key === 'Escape') {
        setRecording(null);
        setProblem(null);
        return;
      }
      const binding = bindingFromEvent(event);
      if (!binding || event.altKey) {
        if (event.altKey) setProblem('Alt combinations vary by keyboard layout and are not supported.');
        return;
      }
      const verdict = validateBinding(shortcuts, recording.action, binding, recording.index);
      if (!verdict.ok) {
        setProblem(verdict.reason);
        return;
      }
      onChange(rebind(shortcuts, recording.action, recording.index, binding));
      setRecording(null);
      setProblem(null);
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [recording, shortcuts, onChange]);

  const startRecording = (next: Recording) => {
    setProblem(null);
    setRecording(next);
  };

  const anyCustomized = SHORTCUT_ACTIONS.some((action) => isCustomized(shortcuts, action));

  return (
    <section className="logic-dock logic-shortcuts" aria-label="Keyboard shortcuts" data-testid="logic-shortcuts-dock">
      <p className="logic-shortcuts-intro">
        Choose <strong>Change</strong> beside a shortcut, then press the key or combination you want. Escape cancels. Your choices stay on this device.
      </p>
      {recording ? (
        <p className="logic-shortcuts-recording" role="status" data-testid="logic-shortcut-recording">
          Press a key for: {ACTION_LABELS[recording.action]}
        </p>
      ) : null}
      {problem ? <p className="logic-shortcuts-problem" role="alert" data-testid="logic-shortcut-problem">{problem}</p> : null}

      <table className="logic-shortcuts-table">
        <thead>
          <tr>
            <th scope="col">Action</th>
            <th scope="col">Shortcuts</th>
            <th scope="col"><span className="logic-sr-only">Edit</span></th>
          </tr>
        </thead>
        <tbody>
          {SHORTCUT_ACTIONS.map((action) => (
            <tr key={action} data-action={action}>
              <th scope="row">{ACTION_LABELS[action]}</th>
              <td>
                <ul className="logic-shortcuts-keys">
                  {shortcuts[action].map((binding, index) => (
                    <li key={`${binding.key}-${binding.ctrl}-${binding.shift}`}>
                      <kbd>{formatBinding(binding)}</kbd>
                      <button
                        type="button"
                        aria-label={`Change ${formatBinding(binding)}, which is a shortcut to ${ACTION_LABELS[action]}`}
                        aria-pressed={recording?.action === action && recording.index === index}
                        onClick={() => startRecording({ action, index })}
                      >
                        Change
                      </button>
                      <button
                        type="button"
                        aria-label={`Remove ${formatBinding(binding)} from ${ACTION_LABELS[action]}`}
                        disabled={shortcuts[action].length <= 1}
                        onClick={() => onChange(removeBinding(shortcuts, action, index))}
                      >
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>
              </td>
              <td className="logic-shortcuts-row-actions">
                <button type="button" aria-label={`Add another shortcut to ${ACTION_LABELS[action]}`} onClick={() => startRecording({ action, index: -1 })}>Add another</button>
                <button
                  type="button"
                  aria-label={`Reset ${ACTION_LABELS[action]} to its default`}
                  disabled={!isCustomized(shortcuts, action)}
                  onClick={() => {
                    setProblem(null);
                    onChange(resetAction(shortcuts, action));
                  }}
                >
                  Reset
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="logic-shortcuts-footer">
        <button type="button" disabled={!anyCustomized} onClick={() => { setRecording(null); setProblem(null); onChange(DEFAULT_SHORTCUTS); }}>Reset all to defaults</button>
      </div>

      <dl className="logic-shortcut-list">
        {POINTER_GESTURES.map((entry) => (
          <div className="logic-shortcut-row" key={entry.gesture}>
            <dt>{entry.gesture}</dt>
            <dd>{entry.action}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

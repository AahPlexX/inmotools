/**
 * Workbench tab strip following the WAI-ARIA Authoring Practices tabs pattern:
 * one tab stop, arrow keys move between tabs (wrapping), Home/End jump to the
 * ends, and focus activates the tab. The last choice is remembered per browser
 * as a convenience; storage failures (private mode, blocked storage) are ignored.
 *
 * Every panel stays mounted and inactive ones are hidden, so work in progress
 * (a captured room tone, a half-filled form) survives switching tabs.
 */
import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';

export interface WorkbenchTab {
  id: string;
  label: string;
  /** `active` lets a panel defer costly first-use work (a codec probe) until it is first shown. */
  render: (active: boolean) => ReactNode;
}

const STORAGE_KEY = 'inmotools.mastering.tab';

function readStoredTab(): string | null {
  try { return window.localStorage.getItem(STORAGE_KEY); } catch { return null; }
}

export default function MasteringTabs({ tabs, label }: { tabs: WorkbenchTab[]; label: string }) {
  const baseId = useId();
  const [selected, setSelected] = useState(() => {
    const stored = readStoredTab();
    return tabs.some((tab) => tab.id === stored) ? stored! : tabs[0].id;
  });
  const buttons = useRef(new Map<string, HTMLButtonElement>());

  useEffect(() => {
    try { window.localStorage.setItem(STORAGE_KEY, selected); } catch { /* storage is optional */ }
  }, [selected]);

  const active = tabs.find((tab) => tab.id === selected) ?? tabs[0];

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const index = tabs.findIndex((tab) => tab.id === active.id);
    let next = index;
    if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
    else if (event.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = tabs.length - 1;
    else return;
    event.preventDefault();
    setSelected(tabs[next].id);
    buttons.current.get(tabs[next].id)?.focus();
  };

  return <div className="mastering-workbench">
    <div className="mastering-tablist" role="tablist" aria-label={label}>
      {tabs.map((tab) => <button
        key={tab.id}
        ref={(element) => { if (element) buttons.current.set(tab.id, element); else buttons.current.delete(tab.id); }}
        type="button"
        role="tab"
        id={`${baseId}-${tab.id}-tab`}
        aria-selected={tab.id === active.id}
        aria-controls={`${baseId}-${tab.id}-panel`}
        tabIndex={tab.id === active.id ? 0 : -1}
        onClick={() => setSelected(tab.id)}
        onKeyDown={onKeyDown}
      >{tab.label}</button>)}
    </div>
    {tabs.map((tab) => <div key={tab.id} role="tabpanel" id={`${baseId}-${tab.id}-panel`} aria-labelledby={`${baseId}-${tab.id}-tab`}
      className="mastering-tabpanel" hidden={tab.id !== active.id}>
      {tab.render(tab.id === active.id)}
    </div>)}
  </div>;
}

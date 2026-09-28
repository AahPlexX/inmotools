/**
 * Small shared UI pieces for the Mastering workspace: formatting helpers, id
 * creation, and a numeric field that commits once per edit.
 *
 * Committed values become undo steps, so fields must not commit on every
 * keystroke. `CommitNumberField` keeps a local draft and commits on Enter or
 * blur; Escape restores the committed value.
 */
import { useEffect, useId, useState, type KeyboardEvent } from 'react';
import type { AudioEdit, TimeSelection } from './mastering-engine';
import type { MasteringClip, MasteringDocument } from './mastering-project';
import type { ClipRenderInfo, RenderResult } from './mastering-dsp-engine';
import type { MasteringDspClient } from './mastering-dsp-client';

export const messageOf = (error: unknown) => error instanceof Error ? error.message : String(error || 'unknown error');

export const formatBytes = (bytes: number) => bytes < 1024
  ? `${bytes} B`
  : bytes < 1024 ** 2 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1024 ** 2).toFixed(1)} MB`;

/** `m:ss.mmm`, the precision edit fields and readouts share. */
export const formatTime = (seconds: number) => {
  const safe = Math.max(0, Number.isFinite(seconds) ? seconds : 0);
  // Round to whole milliseconds first so 59.9996 s carries into the next minute instead of showing 0:60.000.
  const milliseconds = Math.round(safe * 1000);
  const minutes = Math.floor(milliseconds / 60_000);
  return `${minutes}:${((milliseconds % 60_000) / 1000).toFixed(3).padStart(6, '0')}`;
};

export const formatDb = (value: number, digits = 1) => `${value > 0 ? '+' : value < 0 ? '−' : ''}${Math.abs(value).toFixed(digits)} dB`;

/** Human wording for a pan/balance value in [-1, 1]. */
export const formatPan = (pan: number) => Math.abs(pan) < 0.005 ? 'Centre' : `${Math.round(Math.abs(pan) * 100)}% ${pan < 0 ? 'left' : 'right'}`;

export const newId = (prefix: string) => typeof crypto !== 'undefined' && 'randomUUID' in crypto
  ? `${prefix}-${crypto.randomUUID()}`
  : `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

interface CommitNumberFieldProps {
  id?: string;
  label: string;
  value: number;
  onCommit: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  suffix?: string;
  hint?: string;
  /** Digits shown when the committed value is displayed. */
  digits?: number;
}

export function CommitNumberField({ id: providedId, label, value, onCommit, min, max, step = 0.1, disabled, suffix, hint, digits = 3 }: CommitNumberFieldProps) {
  const generatedId = useId();
  const id = providedId ?? generatedId;
  const shown = Number.isFinite(value) ? String(Number(value.toFixed(digits))) : '0';
  const [draft, setDraft] = useState(shown);
  useEffect(() => { setDraft(shown); }, [shown]);

  const commit = () => {
    // An untouched field shows a rounded value; committing it would silently move the stored one.
    if (draft === shown) return;
    const parsed = Number(draft);
    if (draft.trim() === '' || !Number.isFinite(parsed)) { setDraft(shown); return; }
    const bounded = Math.min(max ?? Infinity, Math.max(min ?? -Infinity, parsed));
    if (bounded !== value) onCommit(bounded);
    setDraft(String(Number(bounded.toFixed(digits))));
  };
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') { event.preventDefault(); commit(); }
    else if (event.key === 'Escape') { event.preventDefault(); setDraft(shown); }
  };
  return <div className="field">
    <label htmlFor={id}>{label}{suffix ? <span className="mastering-unit"> ({suffix})</span> : null}</label>
    <input id={id} type="number" inputMode="decimal" min={min} max={max} step={step} value={draft} disabled={disabled}
      onChange={(event) => setDraft(event.target.value)} onBlur={commit} onKeyDown={onKeyDown}
      aria-describedby={hint ? `${id}-hint` : undefined} />
    {hint && <small id={`${id}-hint`}>{hint}</small>}
  </div>;
}

// --- SECTION: shared panel context ---


/**
 * What every workbench tab receives from the workspace. Tabs read the current
 * document and return revisions through `commit`/`applyEdit`, which stop
 * playback and create exactly one undo step each.
 */
export interface MasteringPanelContext {
  document: MasteringDocument;
  /** Reads the newest document; use after an `await` so async work never commits against a stale revision. */
  latestDocument: () => MasteringDocument;
  clip: MasteringClip | null;
  clipInfo: ClipRenderInfo | undefined;
  clipStart: number;
  clipEnd: number;
  duration: number;
  playhead: number;
  selection: TimeSelection;
  render: RenderResult | null;
  /** True while the worker renders a newer revision; `render` still holds the previous one. */
  rendering: boolean;
  canEdit: boolean;
  client: MasteringDspClient | null;
  commit: (next: MasteringDocument, status: string) => void;
  applyEdit: (edit: AudioEdit, status: string) => void;
  setStatus: (status: string) => void;
  updateView: (patch: Partial<Pick<MasteringDocument, 'selection' | 'playhead' | 'activeClipId'>>) => void;
  seek: (seconds: number) => void;
}

/** A random 31-bit seed stored in edits that use randomness, so replay is deterministic. */
export const newSeed = () => Math.floor(Math.random() * 0x7fffffff) + 1;

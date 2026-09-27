/**
 * Repair tab: room-tone fill (ledger 32) and the sample pen (ledger 19).
 * Restoration processors (ledgers 33–44) join this tab as they land.
 */
import { useState } from 'react';
import MasteringSamplePen from './MasteringSamplePen';
import { formatTime, newSeed, type MasteringPanelContext } from './mastering-ui';

export default function MasteringRepairTab({ ctx }: { ctx: MasteringPanelContext }) {
  const { clip, clipStart, clipEnd, selection, canEdit } = ctx;
  const [capture, setCapture] = useState<{ clipId: string; startSeconds: number; endSeconds: number } | null>(null);
  const selectionInsideClip = Boolean(clip) && selection.endSeconds > selection.startSeconds && selection.startSeconds >= clipStart - 1e-9 && selection.endSeconds <= clipEnd + 1e-9;
  const captureValid = capture && clip && capture.clipId === clip.id && capture.startSeconds >= clipStart - 1e-9 && capture.endSeconds <= clipEnd + 1e-9;

  return <>
    <section className="mastering-panel" aria-labelledby="roomtone-heading">
      <div className="mastering-panel-heading"><div><h3 id="roomtone-heading">Room tone fill</h3><p>Cover a cough, bump, or edit gap with the natural background sound from a quiet part of the same clip.</p></div></div>
      <ol className="mastering-steps">
        <li>Select at least 0.5 seconds of clean background noise in the selected clip, then capture it.</li>
        <li>Select the part to cover and fill it. The edges blend over 10 ms so the patch doesn't click.</li>
      </ol>
      <div className="field"><span className="field-label">Captured room tone</span><output className="mastering-readout" aria-live="polite">{captureValid ? `${formatTime(capture.startSeconds)}–${formatTime(capture.endSeconds)} (${(capture.endSeconds - capture.startSeconds).toFixed(2)} s)` : 'Nothing captured for this clip yet'}</output></div>
      <div className="button-row">
        <button type="button" disabled={!canEdit || !selectionInsideClip || selection.endSeconds - selection.startSeconds < 0.02}
          onClick={() => { if (!clip) return; setCapture({ clipId: clip.id, startSeconds: selection.startSeconds, endSeconds: selection.endSeconds }); ctx.setStatus(`Captured ${(selection.endSeconds - selection.startSeconds).toFixed(2)} s of room tone. Now select the range to fill.`); }}>Capture selection as room tone</button>
        <button type="button" disabled={!canEdit || !captureValid || !selectionInsideClip}
          onClick={() => capture && ctx.applyEdit({ type: 'roomTone', captureStartSeconds: capture.startSeconds, captureEndSeconds: capture.endSeconds, startSeconds: selection.startSeconds, endSeconds: selection.endSeconds, seed: newSeed() }, `Filled ${formatTime(selection.startSeconds)}–${formatTime(selection.endSeconds)} with room tone. Undo is available.`)}>Fill selection with room tone</button>
      </div>
    </section>
    <MasteringSamplePen ctx={ctx} />
  </>;
}

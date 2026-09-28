/**
 * Sample pen (ledger 19).
 *
 * Shows up to 256 samples of the selected clip around the playhead. Drawing
 * with a pointer redraws samples; releasing the pointer commits one
 * `samplePatch` edit (one undo step). A numeric sample editor and a
 * cubic "interpolate selection" repair give keyboard-only paths to the same
 * result, so drawing is never required.
 */
import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { MAX_PATCH_FRAMES } from './dsp/processors';
import { CommitNumberField, formatTime, messageOf, type MasteringPanelContext } from './mastering-ui';

const VIEW_FRAMES = 256;
const HEIGHT = 180;

/**
 * Cubic Hermite values that replace `count` frames between two known samples
 * on each side. Each end's tangent is its one-sample slope scaled to the
 * `count + 1` frame span, so straight lines and smooth curves pass through
 * unchanged. Used for click and burst repair.
 */
export function interpolateGap(before: [number, number], after: [number, number], count: number): number[] {
  const [p0, p1] = before;
  const [p2, p3] = after;
  const span = count + 1;
  const m1 = (p1 - p0) * span;
  const m2 = (p3 - p2) * span;
  const values: number[] = [];
  for (let index = 1; index <= count; index += 1) {
    const t = index / span;
    const t2 = t * t;
    const t3 = t2 * t;
    values.push((2 * t3 - 3 * t2 + 1) * p1 + (t3 - 2 * t2 + t) * m1 + (-2 * t3 + 3 * t2) * p2 + (t3 - t2) * m2);
  }
  return values;
}

export default function MasteringSamplePen({ ctx }: { ctx: MasteringPanelContext }) {
  const { clip, clipStart, clipEnd, playhead, selection, canEdit, document } = ctx;
  const rate = document.sampleRate ?? 48_000;
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [channel, setChannel] = useState(0);
  const [slice, setSlice] = useState<{ startFrame: number; channels: Float32Array[] } | null>(null);
  const [draft, setDraft] = useState<Map<number, number>>(new Map());
  const [editIndex, setEditIndex] = useState(0);
  const [editValue, setEditValue] = useState(0);
  const lastPoint = useRef<{ frame: number; value: number } | null>(null);
  const [canvasWidth, setCanvasWidth] = useState(0);

  // The pen lives in a tab that may be hidden; redraw when it gets a real width.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const observer = new ResizeObserver((entries) => setCanvasWidth(Math.floor(entries[0]?.contentRect.width ?? 0)));
    observer.observe(canvas);
    return () => observer.disconnect();
  }, []);
  const channelCount = ctx.clipInfo?.channelCount ?? 1;
  const activeChannel = Math.min(channel, channelCount - 1);
  const clipFrames = Math.round((clipEnd - clipStart) * rate);
  const wantedStart = Math.max(0, Math.min(Math.max(0, clipFrames - VIEW_FRAMES), Math.round((playhead - clipStart) * rate) - VIEW_FRAMES / 2));
  const editsKey = useMemo(() => JSON.stringify(clip?.edits ?? null), [clip?.edits]);

  useEffect(() => {
    if (!clip || !ctx.client || !ctx.render) { setSlice(null); return; }
    let cancelled = false;
    ctx.client.slice(ctx.latestDocument(), clip.id, wantedStart, VIEW_FRAMES).then((result) => {
      if (!cancelled) { setSlice(result); setDraft(new Map()); }
    }).catch((error: unknown) => { if (!cancelled) ctx.setStatus(`Could not read samples: ${messageOf(error)}`); });
    return () => { cancelled = true; };
    // `ctx` is rebuilt every render; the fetch depends only on the clip content and window.
  }, [clip?.id, editsKey, wantedStart, ctx.render]);

  const samples = slice?.channels[activeChannel];
  const scale = useMemo(() => {
    let peak = 0.05;
    if (samples) for (const value of samples) peak = Math.max(peak, Math.abs(value));
    return Math.min(4, peak * 1.2);
  }, [samples]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || canvasWidth <= 0) return;
    const width = canvasWidth;
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(HEIGHT * ratio);
    const context = canvas.getContext('2d');
    if (!context) return;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.fillStyle = '#111820';
    context.fillRect(0, 0, width, HEIGHT);
    context.strokeStyle = '#56616d';
    context.beginPath(); context.moveTo(0, HEIGHT / 2 + 0.5); context.lineTo(width, HEIGHT / 2 + 0.5); context.stroke();
    if (!samples) return;
    const x = (index: number) => (index + 0.5) / samples.length * width;
    const y = (value: number) => HEIGHT / 2 - value / scale * (HEIGHT / 2 - 6);
    context.strokeStyle = '#8fb3ff';
    context.beginPath();
    for (let index = 0; index < samples.length; index += 1) {
      const value = draft.get(index) ?? samples[index];
      if (index === 0) context.moveTo(x(index), y(value)); else context.lineTo(x(index), y(value));
    }
    context.stroke();
    for (let index = 0; index < samples.length; index += 1) {
      const edited = draft.has(index);
      context.fillStyle = edited ? '#f2b84b' : '#d8e6ff';
      context.fillRect(x(index) - 1.5, y(draft.get(index) ?? samples[index]) - 1.5, 3, 3);
    }
  }, [samples, draft, scale, canvasWidth]);

  const pointAt = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const frame = Math.max(0, Math.min(VIEW_FRAMES - 1, Math.floor((event.clientX - rect.left) / rect.width * (samples?.length ?? VIEW_FRAMES))));
    const value = Math.max(-scale, Math.min(scale, -((event.clientY - rect.top) / rect.height * 2 - 1) * scale * HEIGHT / (HEIGHT - 12)));
    return { frame, value };
  };

  const drawTo = (point: { frame: number; value: number }) => {
    setDraft((current) => {
      const next = new Map(current);
      const previous = lastPoint.current;
      if (previous && previous.frame !== point.frame) {
        const step = point.frame > previous.frame ? 1 : -1;
        for (let frame = previous.frame; frame !== point.frame; frame += step) {
          next.set(frame, previous.value + (point.value - previous.value) * (frame - previous.frame) / (point.frame - previous.frame));
        }
      }
      next.set(point.frame, point.value);
      return next;
    });
    lastPoint.current = point;
  };

  const commitPatch = (patch: Map<number, number>, label: string) => {
    if (!slice || !patch.size || !clip) return;
    const frames = [...patch.keys()].sort((a, b) => a - b);
    const first = frames[0];
    const values = Array.from({ length: frames[frames.length - 1] - first + 1 }, (_, offset) => patch.get(first + offset) ?? slice.channels[activeChannel][first + offset]);
    const perChannel = Array.from({ length: channelCount }, (_, index) => index === activeChannel ? values : []);
    ctx.applyEdit({ type: 'samplePatch', startFrame: slice.startFrame + first, values: perChannel }, label);
  };

  const interpolateSelection = async () => {
    if (!clip || !ctx.client) return;
    const start = Math.round((selection.startSeconds - clipStart) * rate);
    const end = Math.round((selection.endSeconds - clipStart) * rate);
    const count = end - start;
    if (start < 2 || end > clipFrames - 2 || count < 1 || count > MAX_PATCH_FRAMES) {
      ctx.setStatus(`Select between 1 and ${MAX_PATCH_FRAMES} samples inside the clip, away from its edges, to interpolate.`);
      return;
    }
    try {
      const around = await ctx.client.slice(ctx.latestDocument(), clip.id, start - 2, count + 4);
      const values = around.channels.map((data) => interpolateGap([data[0], data[1]], [data[count + 2], data[count + 3]], count));
      ctx.applyEdit({ type: 'samplePatch', startFrame: start, values }, `Rebuilt ${count} sample${count === 1 ? '' : 's'} from the surrounding audio. Undo is available.`);
    } catch (error) { ctx.setStatus(messageOf(error)); }
  };

  const disabled = !canEdit || !clip || !samples;
  return <section className="mastering-panel" aria-labelledby="pen-heading">
    <div className="mastering-panel-heading"><div><h3 id="pen-heading">Sample pen</h3><p>Redraw a click or glitch by hand at sample level, around the playhead. Releasing the pointer applies the change.</p></div></div>
    <div className="workspace-grid three">
      <div className="field"><label htmlFor="mastering-pen-channel">Channel</label>
        <select id="mastering-pen-channel" value={activeChannel} onChange={(event) => setChannel(Number(event.target.value))} disabled={disabled}>
          {Array.from({ length: channelCount }, (_, index) => <option key={index} value={index}>Channel {index + 1}</option>)}
        </select></div>
      <div className="field"><span className="field-label">Showing samples</span><output className="mastering-readout">{slice ? `${slice.startFrame}–${slice.startFrame + (samples?.length ?? 0) - 1}` : '—'}</output></div>
      <div className="field"><span className="field-label">Vertical scale</span><output className="mastering-readout">±{scale.toFixed(3)}</output></div>
    </div>
    <canvas ref={canvasRef} className="mastering-pen-canvas" style={{ height: HEIGHT }} role="img"
      aria-label={samples ? `Samples ${slice?.startFrame} to ${(slice?.startFrame ?? 0) + samples.length - 1} of ${clip?.name}, channel ${activeChannel + 1}. Use the numeric sample editor below as an alternative to drawing.` : 'No samples loaded'}
      onPointerDown={(event) => { if (disabled) return; event.currentTarget.setPointerCapture(event.pointerId); lastPoint.current = null; drawTo(pointAt(event)); }}
      onPointerMove={(event) => { if (!disabled && event.currentTarget.hasPointerCapture(event.pointerId)) drawTo(pointAt(event)); }}
      onPointerUp={(event) => {
        if (disabled || !event.currentTarget.hasPointerCapture(event.pointerId)) return;
        event.currentTarget.releasePointerCapture(event.pointerId);
        lastPoint.current = null;
        commitPatch(draft, `Redrew ${draft.size} sample${draft.size === 1 ? '' : 's'} with the pen. Undo is available.`);
      }}
      onPointerCancel={() => { lastPoint.current = null; setDraft(new Map()); }} />
    <p className="help-text">Move the playhead to the damage first (for example with a marker). Tip: zoom the timeline to the click so you can place the playhead precisely.</p>
    <fieldset className="mastering-fieldset">
      <legend>Set one sample by number</legend>
      <div className="workspace-grid three">
        <CommitNumberField id="mastering-pen-index" label="Sample number in clip" value={editIndex} min={0} max={Math.max(0, clipFrames - 1)} step={1} digits={0}
          onCommit={(value) => setEditIndex(Math.trunc(value))} onPreview={(value) => setEditIndex(Math.trunc(value))} disabled={disabled} />
        <CommitNumberField id="mastering-pen-value" label="New value (−1 to 1)" value={editValue} min={-1} max={1} step={0.0001} digits={4}
          onCommit={setEditValue} onPreview={setEditValue} disabled={disabled} />
        <div className="field"><span className="field-label">At time</span><output className="mastering-readout">{formatTime(clipStart + editIndex / rate)}</output></div>
      </div>
      <div className="button-row">
        <button type="button" disabled={disabled || editIndex < 0 || editIndex >= clipFrames || !Number.isFinite(editValue)}
          onClick={() => ctx.applyEdit({ type: 'samplePatch', startFrame: editIndex, values: Array.from({ length: channelCount }, (_, index) => index === activeChannel ? [Math.max(-1, Math.min(1, editValue))] : []) }, `Set sample ${editIndex} on channel ${activeChannel + 1} to ${editValue}. Undo is available.`)}>Set sample</button>
        <button type="button" disabled={!canEdit || !clip} onClick={() => void interpolateSelection()}>Interpolate selected samples</button>
      </div>
    </fieldset>
  </section>;
}

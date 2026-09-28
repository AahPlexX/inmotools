/**
 * Zoomable arrangement view (ledgers 4, 5, 8, 9).
 *
 * Receives the document (tracks, clips, markers, regions), the latest worker
 * render (mix PCM, peak pyramid, per-clip overviews), and the view state.
 * Draws the mix waveform on a canvas from the peak pyramid at the current zoom
 * and lays out one lane per track with clip buttons underneath. Every pointer
 * gesture has a button, slider, or numeric equivalent elsewhere in the UI.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import type { MasteringDocument } from './mastering-project';
import { clipDurationSeconds } from './mastering-project';
import type { RenderResult } from './mastering-dsp-engine';
import type { TimeSelection } from './mastering-engine';
import { peaksForView } from './dsp/peaks';
import { formatTime } from './mastering-ui';

export interface TimelineViewport {
  startSeconds: number;
  spanSeconds: number;
}

interface Props {
  document: MasteringDocument;
  render: RenderResult | null;
  duration: number;
  playhead: number;
  selection: TimeSelection;
  viewport: TimelineViewport;
  playing: boolean;
  onViewportChange: (viewport: TimelineViewport) => void;
  onSeek: (seconds: number) => void;
  onSelect: (selection: TimeSelection) => void;
  onActivateClip: (clipId: string) => void;
}

/** Narrowest view: 64 frames across the whole canvas, enough to see individual samples. */
const MIN_SPAN_FRAMES = 64;
const WAVEFORM_HEIGHT = 200;

export function clampViewport(viewport: TimelineViewport, duration: number, sampleRate: number | null): TimelineViewport {
  const total = Math.max(duration, 0.001);
  const minSpan = Math.min(total, sampleRate ? MIN_SPAN_FRAMES / sampleRate : 0.001);
  const spanSeconds = Math.min(total, Math.max(minSpan, Number.isFinite(viewport.spanSeconds) ? viewport.spanSeconds : total));
  const startSeconds = Math.min(Math.max(0, total - spanSeconds), Math.max(0, Number.isFinite(viewport.startSeconds) ? viewport.startSeconds : 0));
  return { startSeconds, spanSeconds };
}

/** Zooms by `factor` (<1 zooms in) while keeping `anchorSeconds` at the same screen position. */
export function zoomViewport(viewport: TimelineViewport, factor: number, anchorSeconds: number, duration: number, sampleRate: number | null): TimelineViewport {
  const spanSeconds = viewport.spanSeconds * factor;
  const anchorFraction = viewport.spanSeconds > 0 ? (anchorSeconds - viewport.startSeconds) / viewport.spanSeconds : 0.5;
  return clampViewport({ spanSeconds, startSeconds: anchorSeconds - anchorFraction * spanSeconds }, duration, sampleRate);
}

export default function MasteringTimeline({ document, render, duration, playhead, selection, viewport, playing, onViewportChange, onSeek, onSelect, onActivateClip }: Props) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [width, setWidth] = useState(0);
  const dragStart = useRef<number | null>(null);
  const pointers = useRef(new Map<number, number>());
  // The anchor is fixed at pinch start in the starting viewport's time base, so every move zooms
  // from the same view around the same instant instead of drifting as the view updates.
  const pinch = useRef<{ distance: number; viewport: TimelineViewport; anchor: number } | null>(null);
  const rate = document.sampleRate;
  const view = clampViewport(viewport, duration, rate);
  const viewEnd = view.startSeconds + view.spanSeconds;

  useEffect(() => {
    const element = wrapRef.current;
    if (!element) return;
    const observer = new ResizeObserver((entries) => setWidth(Math.floor(entries[0]?.contentRect.width ?? 0)));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // Page-flip while playing so the playhead never leaves the visible range.
  useEffect(() => {
    if (!playing || duration <= 0) return;
    if (playhead < view.startSeconds || playhead > viewEnd) {
      onViewportChange(clampViewport({ ...view, startSeconds: playhead - view.spanSeconds * 0.05 }, duration, rate));
    }
  }, [playing, playhead, view.startSeconds, viewEnd, view.spanSeconds, duration, rate, onViewportChange]);

  const columns = useMemo(() => {
    if (!render || !rate || width <= 0) return [];
    return peaksForView(render.pyramid, view.startSeconds * rate, viewEnd * rate, width, render.mix);
  }, [render, rate, width, view.startSeconds, viewEnd]);

  const xAt = useCallback((seconds: number) => (seconds - view.startSeconds) / view.spanSeconds * width, [view.startSeconds, view.spanSeconds, width]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || width <= 0) return;
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(WAVEFORM_HEIGHT * ratio);
    const context = canvas.getContext('2d');
    if (!context) return;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, width, WAVEFORM_HEIGHT);
    const middle = WAVEFORM_HEIGHT / 2;
    const scale = WAVEFORM_HEIGHT * 0.46;
    for (const region of document.regions) {
      const start = xAt(region.startSeconds);
      const end = xAt(region.endSeconds);
      if (end < 0 || start > width) continue;
      context.fillStyle = 'rgba(242, 184, 75, 0.13)';
      context.fillRect(start, 0, Math.max(1, end - start), WAVEFORM_HEIGHT);
    }
    const selectionStart = xAt(Math.min(selection.startSeconds, selection.endSeconds));
    const selectionEnd = xAt(Math.max(selection.startSeconds, selection.endSeconds));
    if (selectionEnd > selectionStart) {
      context.fillStyle = 'rgba(80, 140, 255, 0.28)';
      context.fillRect(selectionStart, 0, selectionEnd - selectionStart, WAVEFORM_HEIGHT);
    }
    context.strokeStyle = '#56616d';
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(0, middle + 0.5);
    context.lineTo(width, middle + 0.5);
    context.stroke();
    context.strokeStyle = '#d8e6ff';
    context.beginPath();
    columns.forEach((column, x) => {
      const top = middle - Math.min(1, column.max) * scale;
      const bottom = middle - Math.max(-1, column.min) * scale;
      context.moveTo(x + 0.5, top);
      context.lineTo(x + 0.5, Math.max(top + 1, bottom));
    });
    context.stroke();
    // Samples above full scale are marked in red so clipping is visible at any zoom.
    context.fillStyle = '#ff6b66';
    columns.forEach((column, x) => {
      if (column.max > 1) context.fillRect(x, 0, 1, 3);
      if (column.min < -1) context.fillRect(x, WAVEFORM_HEIGHT - 3, 1, 3);
    });
    context.strokeStyle = '#f2b84b';
    for (const marker of document.markers) {
      const x = xAt(marker.seconds);
      if (x < 0 || x > width) continue;
      context.beginPath();
      context.moveTo(x + 0.5, 0);
      context.lineTo(x + 0.5, WAVEFORM_HEIGHT);
      context.stroke();
    }
    const playheadX = xAt(playhead);
    if (playheadX >= 0 && playheadX <= width) {
      context.strokeStyle = '#ff6b66';
      context.lineWidth = 2;
      context.beginPath();
      context.moveTo(playheadX, 0);
      context.lineTo(playheadX, WAVEFORM_HEIGHT);
      context.stroke();
    }
  }, [columns, width, xAt, selection, playhead, document.markers, document.regions]);

  // --- SECTION: pointer, wheel, and pinch navigation ---

  const secondsAtClientX = (clientX: number) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0) return view.startSeconds;
    const fraction = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    return view.startSeconds + fraction * view.spanSeconds;
  };

  const pointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (duration <= 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    pointers.current.set(event.pointerId, event.clientX);
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinch.current = { distance: Math.max(8, Math.abs(a - b)), viewport: view, anchor: secondsAtClientX((a + b) / 2) };
      dragStart.current = null;
      return;
    }
    dragStart.current = secondsAtClientX(event.clientX);
    onSelect({ startSeconds: dragStart.current, endSeconds: dragStart.current });
  };

  const pointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!pointers.current.has(event.pointerId)) return;
    pointers.current.set(event.pointerId, event.clientX);
    if (pinch.current && pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      const factor = pinch.current.distance / Math.max(8, Math.abs(a - b));
      onViewportChange(zoomViewport(pinch.current.viewport, factor, pinch.current.anchor, duration, rate));
      return;
    }
    if (dragStart.current === null) return;
    onSelect({ startSeconds: dragStart.current, endSeconds: secondsAtClientX(event.clientX) });
  };

  const pointerEnd = (event: ReactPointerEvent<HTMLCanvasElement>, cancelled: boolean) => {
    pointers.current.delete(event.pointerId);
    try { event.currentTarget.releasePointerCapture(event.pointerId); } catch { /* capture may already be released */ }
    if (pinch.current) {
      if (pointers.current.size === 0) pinch.current = null;
      return;
    }
    if (dragStart.current === null || cancelled) { dragStart.current = null; return; }
    const endSeconds = secondsAtClientX(event.clientX);
    onSelect({ startSeconds: dragStart.current, endSeconds });
    onSeek(endSeconds);
    dragStart.current = null;
  };

  // Plain vertical wheel scrolls the page as usual. Ctrl/⌘+wheel zooms at the
  // pointer and horizontal or Shift+wheel pans, the conventions of desktop editors.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onWheel = (event: WheelEvent) => {
      if (duration <= 0) return;
      if (event.ctrlKey || event.metaKey) {
        event.preventDefault();
        onViewportChange(zoomViewport(view, Math.exp(event.deltaY * 0.0025), secondsAtClientX(event.clientX), duration, rate));
      } else if (event.shiftKey || Math.abs(event.deltaX) > Math.abs(event.deltaY)) {
        event.preventDefault();
        const delta = (event.shiftKey ? event.deltaY : event.deltaX) / Math.max(1, width) * view.spanSeconds;
        onViewportChange(clampViewport({ ...view, startSeconds: view.startSeconds + delta }, duration, rate));
      }
    };
    canvas.addEventListener('wheel', onWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', onWheel);
  });

  const zoomed = view.spanSeconds < duration - 1e-9;
  const selected = Math.abs(selection.endSeconds - selection.startSeconds) > 0;

  return <div className="mastering-timeline">
    <div className="mastering-zoom-bar" aria-label="Timeline zoom">
      <button type="button" title={zoomed ? 'Zoom in around the centre of the view (+)' : 'Zoom in around the playhead (+)'} onClick={() => onViewportChange(zoomViewport(view, 0.5, zoomed ? view.startSeconds + view.spanSeconds / 2 : playhead, duration, rate))} disabled={duration <= 0}>Zoom in</button>
      <button type="button" title="Zoom out around the centre of the view (−)" onClick={() => onViewportChange(zoomViewport(view, 2, view.startSeconds + view.spanSeconds / 2, duration, rate))} disabled={!zoomed}>Zoom out</button>
      <button type="button" title="Show the whole timeline" onClick={() => onViewportChange({ startSeconds: 0, spanSeconds: duration })} disabled={!zoomed}>Show all</button>
      <button type="button" title="Zoom to fit the current selection" onClick={() => {
        const start = Math.min(selection.startSeconds, selection.endSeconds);
        const span = Math.abs(selection.endSeconds - selection.startSeconds);
        onViewportChange(clampViewport({ startSeconds: start - span * 0.05, spanSeconds: span * 1.1 }, duration, rate));
      }} disabled={!selected}>Zoom to selection</button>
      <label className="mastering-scroll">
        <span>View position</span>
        <input type="range" min={0} max={Math.max(0, duration - view.spanSeconds)} step="any" value={view.startSeconds}
          onChange={(event) => onViewportChange(clampViewport({ ...view, startSeconds: Number(event.target.value) }, duration, rate))}
          disabled={!zoomed} aria-valuetext={`Showing ${formatTime(view.startSeconds)} to ${formatTime(viewEnd)}`} />
      </label>
      <output className="mastering-view-readout" aria-label="Visible range">{formatTime(view.startSeconds)} – {formatTime(viewEnd)}</output>
    </div>
    <div className="mastering-waveform-wrap" ref={wrapRef}>
      <canvas
        ref={canvasRef}
        className="mastering-waveform"
        style={{ height: WAVEFORM_HEIGHT }}
        role="img"
        aria-label={`Mix waveform from ${formatTime(view.startSeconds)} to ${formatTime(viewEnd)}. Playhead ${formatTime(playhead)}. Selection ${formatTime(Math.min(selection.startSeconds, selection.endSeconds))} to ${formatTime(Math.max(selection.startSeconds, selection.endSeconds))}.`}
        onPointerDown={pointerDown}
        onPointerMove={pointerMove}
        onPointerUp={(event) => pointerEnd(event, false)}
        onPointerCancel={(event) => pointerEnd(event, true)}
      />
      <div className="mastering-lanes">
        {document.tracks.map((track) => <div className="mastering-lane" key={track.id}>
          <span className="mastering-lane-name">{track.name}{track.muted ? ' · muted' : track.solo ? ' · solo' : ''}</span>
          <div className="mastering-lane-body">
            {track.clips.map((clip) => {
              const clipDuration = clipDurationSeconds(document, clip);
              const left = xAt(clip.startSeconds);
              const right = xAt(clip.startSeconds + clipDuration);
              if (right < 0 || left > width) return null;
              const peaks = render?.clips[clip.id]?.peaks ?? [];
              const active = document.activeClipId === clip.id;
              return <button type="button" key={clip.id}
                className={`mastering-clip${active ? ' is-active' : ''}${clip.muted ? ' is-muted' : ''}`}
                style={{ left: Math.max(-2, left), width: Math.max(6, Math.min(width + 2, right) - Math.max(-2, left)) }}
                aria-pressed={active}
                aria-label={`${clip.name} on ${track.name}, ${formatTime(clip.startSeconds)} to ${formatTime(clip.startSeconds + clipDuration)}${active ? ', selected for editing' : ''}`}
                onClick={() => onActivateClip(clip.id)}>
                {peaks.length > 0 && <svg viewBox={`0 0 ${peaks.length} 2`} preserveAspectRatio="none" aria-hidden="true">
                  <path d={peaks.map((peak, index) => `M${index + 0.5} ${1 - peak.max}V${1 - peak.min}`).join('')} />
                </svg>}
                <span>{clip.name}</span>
              </button>;
            })}
          </div>
        </div>)}
      </div>
    </div>
  </div>;
}

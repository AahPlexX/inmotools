import { useCallback, useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react';
import {
  clampTimeView,
  firstTick,
  followLatest,
  formatDuration,
  lastTick,
  latestLevel,
  MAX_ANALYZER_CHANNELS,
  measureCursors,
  sampleCount,
  snapToRecordedTick,
  xToTick,
  zoomTimeView,
  clampTicksPerPixel,
  type ChannelCandidate,
  type SampleBuffer,
  type TimeView,
} from './analyzer-engine';
import { AXIS_HEIGHT, diagramHeight, drawTimingDiagram, LABEL_WIDTH, type DiagramCursors } from './analyzer-render';
import type { DelayMode, ThemeName } from './logic-types';
import { THEME_PALETTES } from './render-engine';
import './LogicAnalyzerDock.css';

export interface LogicAnalyzerDockProps {
  readonly buffer: SampleBuffer;
  /** Changes on every simulation step, so the dock redraws as samples arrive. */
  readonly tick: number;
  readonly candidates: readonly ChannelCandidate[];
  /** The user's channel choice, or `null` while the default (every probe and LED) is in effect. */
  readonly selectedKeys: readonly string[] | null;
  readonly delayMode: DelayMode;
  readonly theme: ThemeName;
  readonly onChannelsChange: (keys: string[] | null) => void;
  readonly onClose: () => void;
}

/** Movement, in pixels, below which a press is a click that places a cursor rather than a drag that scrolls. */
const DRAG_THRESHOLD_PX = 4;
const ZOOM_STEP = 1.4;
const DEFAULT_TICKS_PER_PIXEL = 0.5;

const describeMeasurement = (a: number | undefined, b: number | undefined, delayMode: DelayMode): string => {
  if (a === undefined) return 'Click the diagram to place cursor A, then again for cursor B.';
  if (b === undefined) return `Cursor A at tick ${a}. Click again to place cursor B.`;
  const measurement = measureCursors(a, b, delayMode);
  const time = measurement.nanoseconds === undefined ? '' : ` (${formatDuration(measurement.nanoseconds)})`;
  return `A at tick ${a}, B at tick ${b}: ${measurement.ticks} tick${measurement.ticks === 1 ? '' : 's'}${time}.`;
};

export function LogicAnalyzerDock({ buffer, tick, candidates, selectedKeys, delayMode, theme, onChannelsChange, onClose }: LogicAnalyzerDockProps) {
  const shellRef = useRef<HTMLElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [containerWidth, setContainerWidth] = useState(720);
  const [ticksPerPixel, setTicksPerPixel] = useState(DEFAULT_TICKS_PER_PIXEL);
  const [startTick, setStartTick] = useState(0);
  const [follow, setFollow] = useState(true);
  const [cursors, setCursors] = useState<DiagramCursors>({});
  const [activeCursor, setActiveCursor] = useState<'a' | 'b'>('a');
  const [showEdges, setShowEdges] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);
  const dragRef = useRef<{ pointerId: number; startX: number; startTick: number; dragging: boolean } | null>(null);

  const widthPx = Math.max(160, containerWidth - LABEL_WIDTH);
  const baseView: TimeView = { startTick, ticksPerPixel, widthPx };
  // Recomputed every render on purpose: the buffer is mutated in place as the simulation runs.
  const view = follow ? followLatest(baseView, buffer) : clampTimeView(baseView, buffer);
  const channelCount = buffer.channels.length;
  const activeKeys = buffer.channels.map((channel) => channel.key as string);
  const first = firstTick(buffer);
  const last = lastTick(buffer);

  useEffect(() => {
    const element = shellRef.current;
    if (!element) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) setContainerWidth(Math.max(LABEL_WIDTH + 160, Math.floor(entry.contentRect.width)));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // Draw after every render, including each new sample (the `tick` prop changes) and every UI change.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const totalWidth = LABEL_WIDTH + widthPx;
    const height = diagramHeight(channelCount);
    canvas.width = Math.floor(totalWidth * dpr);
    canvas.height = Math.floor(height * dpr);
    canvas.style.width = `${totalWidth}px`;
    canvas.style.height = `${height}px`;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawTimingDiagram(ctx, { buffer, view, widthPx, palette: THEME_PALETTES[theme], cursors, showEdges });
  });

  /** Stops following the live edge and freezes the window where it is, so a measurement does not scroll away. */
  const pause = useCallback((from: TimeView) => {
    setStartTick(from.startTick);
    setFollow(false);
  }, []);

  const placeCursor = (x: number) => {
    const snapped = snapToRecordedTick(buffer, xToTick(view, x - LABEL_WIDTH));
    if (snapped === undefined) return;
    pause(view);
    if (cursors.a === undefined) {
      setCursors({ a: snapped });
      setActiveCursor('a');
    } else if (cursors.b === undefined) {
      setCursors({ a: cursors.a, b: snapped });
      setActiveCursor('b');
    } else {
      setCursors({ a: snapped });
      setActiveCursor('a');
    }
  };

  const nudgeCursor = (delta: number) => {
    const current = cursors[activeCursor];
    if (current === undefined) return;
    const snapped = snapToRecordedTick(buffer, current + delta);
    if (snapped !== undefined) setCursors({ ...cursors, [activeCursor]: snapped });
  };

  const zoomBy = (factor: number) => {
    const zoomed = zoomTimeView(view, widthPx / 2, factor);
    setTicksPerPixel(zoomed.ticksPerPixel);
    pause(clampTimeView(zoomed, buffer));
  };

  const fitAll = () => {
    if (first === undefined || last === undefined) return;
    const fitted = clampTicksPerPixel((last - first + 1) / widthPx);
    setTicksPerPixel(fitted);
    setStartTick(first);
    setFollow(false);
  };

  const handlePointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (event.button !== 0) return;
    dragRef.current = { pointerId: event.pointerId, startX: event.clientX, startTick: view.startTick, dragging: false };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const dx = event.clientX - drag.startX;
    if (!drag.dragging && Math.abs(dx) < DRAG_THRESHOLD_PX) return;
    drag.dragging = true;
    const dragged = clampTimeView({ ...view, startTick: drag.startTick - dx * view.ticksPerPixel }, buffer);
    pause(dragged);
  };

  const handlePointerUp = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current;
    dragRef.current = null;
    if (!drag || drag.pointerId !== event.pointerId || drag.dragging) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - rect.left;
    if (x >= LABEL_WIDTH && event.clientY - rect.top >= 0) placeCursor(x);
  };

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLCanvasElement>) => {
    const big = event.shiftKey ? 10 : 1;
    if (event.key === 'ArrowLeft') nudgeCursor(-big);
    else if (event.key === 'ArrowRight') nudgeCursor(big);
    else if (event.key === '+' || event.key === '=') zoomBy(ZOOM_STEP);
    else if (event.key === '-') zoomBy(1 / ZOOM_STEP);
    else if (event.key === 'Tab' || event.key === 'Escape') return;
    else if (event.key === 'Home' && first !== undefined) pause({ ...view, startTick: first });
    else if (event.key === 'End') setFollow(true);
    else return;
    event.preventDefault();
  };

  // A native (non-passive) listener: React's onWheel cannot cancel the page scroll it competes with.
  const wheelState = useRef({ view, buffer });
  wheelState.current = { view, buffer };
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const { view: current, buffer: samples } = wheelState.current;
      const rect = canvas.getBoundingClientRect();
      if (event.ctrlKey || event.metaKey) {
        const zoomed = zoomTimeView(current, Math.max(0, event.clientX - rect.left - LABEL_WIDTH), event.deltaY < 0 ? 1.15 : 1 / 1.15);
        setTicksPerPixel(zoomed.ticksPerPixel);
        setStartTick(clampTimeView(zoomed, samples).startTick);
      } else {
        const amount = (Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY) * current.ticksPerPixel;
        setStartTick(clampTimeView({ ...current, startTick: current.startTick + amount }, samples).startTick);
      }
      setFollow(false);
    };
    canvas.addEventListener('wheel', onWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', onWheel);
  }, []);

  const toggleChannel = (key: string, enabled: boolean) => {
    const base = selectedKeys ?? activeKeys;
    onChannelsChange(enabled ? [...base.filter((existing) => existing !== key), key] : base.filter((existing) => existing !== key));
  };

  const readout = describeMeasurement(cursors.a, cursors.b, delayMode);
  const emptyReason = channelCount === 0
    ? 'No signals are being captured. Add a logic probe or LED to the circuit, or choose signals under Channels.'
    : sampleCount(buffer) === 0
      ? 'Nothing recorded yet. Press Play, or toggle a switch, to start capturing.'
      : null;

  return (
    <section
      ref={shellRef}
      className={fullscreen ? 'logic-dock logic-analyzer logic-analyzer-fullscreen' : 'logic-dock logic-analyzer'}
      aria-label="Logic analyzer"
      data-testid="logic-analyzer-dock"
    >
      <div className="logic-analyzer-toolbar">
        <strong className="logic-analyzer-title">Logic analyzer</strong>
        <button type="button" onClick={() => zoomBy(ZOOM_STEP)} aria-label="Zoom in on the timeline">Zoom in</button>
        <button type="button" onClick={() => zoomBy(1 / ZOOM_STEP)} aria-label="Zoom out on the timeline">Zoom out</button>
        <button type="button" onClick={fitAll} disabled={first === undefined}>Fit all</button>
        <button type="button" onClick={() => setFollow((current) => !current)} aria-pressed={follow}>Follow live</button>
        <button type="button" onClick={() => setShowEdges((current) => !current)} aria-pressed={showEdges}>Edge markers</button>
        <button type="button" onClick={() => setCursors({})} disabled={cursors.a === undefined}>Clear cursors</button>
        <button type="button" onClick={() => setFullscreen((current) => !current)} aria-pressed={fullscreen}>{fullscreen ? 'Exit full screen' : 'Full screen'}</button>
        <button type="button" className="logic-analyzer-close" onClick={onClose} aria-label="Close the logic analyzer">Close</button>
      </div>

      <details className="logic-analyzer-channels">
        <summary>Channels ({channelCount} of {MAX_ANALYZER_CHANNELS})</summary>
        <div className="logic-analyzer-channel-list">
          {candidates.length === 0 ? <p className="logic-dock-message">The circuit has no signals to capture yet.</p> : null}
          {candidates.map((candidate) => {
            const enabled = activeKeys.includes(candidate.key);
            return (
              <label key={candidate.key} className="logic-analyzer-channel">
                <input
                  type="checkbox"
                  checked={enabled}
                  disabled={!enabled && channelCount >= MAX_ANALYZER_CHANNELS}
                  onChange={(event) => toggleChannel(candidate.key, event.target.checked)}
                />
                <span>{candidate.label}{candidate.kind === 'probe' ? ' (probe)' : ''}</span>
              </label>
            );
          })}
          <button type="button" onClick={() => onChannelsChange(null)} disabled={selectedKeys === null}>Use probes and LEDs</button>
        </div>
      </details>

      {emptyReason ? <p className="logic-dock-message logic-analyzer-empty">{emptyReason}</p> : null}

      <div className="logic-analyzer-scroll">
        <canvas
          ref={canvasRef}
          className="logic-analyzer-canvas"
          data-testid="logic-analyzer-canvas"
          tabIndex={0}
          role="img"
          aria-label={`Timing diagram of ${channelCount} signal${channelCount === 1 ? '' : 's'}. Click to place measurement cursors, arrow keys move the active cursor, plus and minus zoom.`}
          aria-describedby="logic-analyzer-readout"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={() => { dragRef.current = null; }}
          onKeyDown={handleKeyDown}
          style={{ marginTop: 0, minHeight: AXIS_HEIGHT }}
        />
      </div>

      <input
        type="range"
        className="logic-analyzer-slider"
        aria-label="Scroll the timeline"
        min={first ?? 0}
        max={Math.max(first ?? 0, last ?? 0)}
        step={1}
        value={Math.round(view.startTick)}
        disabled={first === undefined}
        onChange={(event) => pause({ ...view, startTick: Number(event.target.value) })}
      />

      <p id="logic-analyzer-readout" className="logic-analyzer-readout" data-testid="logic-analyzer-readout" aria-live="polite">
        {readout}
        {first !== undefined && last !== undefined ? ` Showing ticks ${Math.round(view.startTick)}–${Math.round(Math.min(last, view.startTick + widthPx * view.ticksPerPixel))} of ${first}–${last}. Tick ${tick}.` : ''}
      </p>

      <ul className="logic-sr-only" aria-label="Latest signal values">
        {buffer.channels.map((channel, index) => (
          <li key={channel.key}>{channel.label}: {String(latestLevel(buffer, index) ?? 'no data')}</li>
        ))}
      </ul>
    </section>
  );
}

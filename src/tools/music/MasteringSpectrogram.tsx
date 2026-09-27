/**
 * Spectrogram view with spectral painting (ledgers 6, 43, 44).
 *
 * Shares the timeline viewport, so zooming and panning move both views
 * together, and draws the playhead and selection in sync. In "Select" mode a
 * drag selects time like the waveform; in "Paint" mode a drag adds a
 * time × frequency region. Painted regions can be attenuated or healed in one
 * undoable step. The Repair tab's frequency band tool is the keyboard path to
 * the same repairs.
 */
import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { appendAudioEditRevision } from './mastering-project';
import type { TimeSelection } from './mastering-engine';
import { spectrogramPalette, type Spectrogram } from './dsp/spectrogram';
import type { SpectralRegion } from './dsp/spectral';
import type { TimelineViewport } from './MasteringTimeline';
import { formatFrequency } from './MasteringControls';
import { formatTime, type MasteringPanelContext } from './mastering-ui';

const HEIGHT = 180;

interface Props {
  ctx: MasteringPanelContext;
  spectrogram: Spectrogram | null;
  loading: boolean;
  viewport: TimelineViewport;
  onSelect: (selection: TimeSelection) => void;
  onSeek: (seconds: number) => void;
}

export default function MasteringSpectrogram({ ctx, spectrogram, loading, viewport, onSelect, onSeek }: Props) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const baseRef = useRef<HTMLCanvasElement | null>(null);
  const overlayRef = useRef<HTMLCanvasElement | null>(null);
  const [width, setWidth] = useState(0);
  const [mode, setMode] = useState<'select' | 'paint'>('select');
  const [regions, setRegions] = useState<SpectralRegion[]>([]);
  const [draft, setDraft] = useState<SpectralRegion | null>(null);
  const [reduction, setReduction] = useState(18);
  const drag = useRef<{ seconds: number; hz: number } | null>(null);
  const palette = useMemo(() => spectrogramPalette(), []);
  const { startSeconds, spanSeconds } = viewport;
  const maxHz = spectrogram?.maxHz ?? 24_000;
  const minHz = spectrogram?.minHz ?? 20;

  useEffect(() => {
    const element = wrapRef.current;
    if (!element) return;
    const observer = new ResizeObserver((entries) => setWidth(Math.floor(entries[0]?.contentRect.width ?? 0)));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const xOf = (seconds: number) => (seconds - startSeconds) / Math.max(1e-9, spanSeconds) * width;
  const secondsAt = (x: number) => startSeconds + Math.min(1, Math.max(0, x / Math.max(1, width))) * spanSeconds;
  const yOf = (hz: number) => HEIGHT - Math.log(Math.max(minHz, hz) / minHz) / Math.log(maxHz / minHz) * HEIGHT;
  const hzAt = (y: number) => minHz * (maxHz / minHz) ** Math.min(1, Math.max(0, (HEIGHT - y) / HEIGHT));

  // Base image: redrawn only when the data, zoom, or size changes.
  useEffect(() => {
    const canvas = baseRef.current;
    if (!canvas || width <= 0) return;
    canvas.width = width;
    canvas.height = HEIGHT;
    const context = canvas.getContext('2d');
    if (!context) return;
    const image = context.createImageData(width, HEIGHT);
    if (spectrogram) {
      const { data, rows, columns, hopSeconds } = spectrogram;
      for (let x = 0; x < width; x += 1) {
        const column = Math.min(columns - 1, Math.max(0, Math.round((startSeconds + (x + 0.5) / width * spanSeconds) / hopSeconds)));
        for (let y = 0; y < HEIGHT; y += 1) {
          const row = Math.min(rows - 1, Math.floor((HEIGHT - 1 - y) / HEIGHT * rows));
          const level = data[column * rows + row];
          const offset = (y * width + x) * 4;
          image.data[offset] = palette[level * 4];
          image.data[offset + 1] = palette[level * 4 + 1];
          image.data[offset + 2] = palette[level * 4 + 2];
          image.data[offset + 3] = 255;
        }
      }
    }
    context.putImageData(image, 0, 0);
  }, [spectrogram, width, startSeconds, spanSeconds, palette]);

  // Overlay: frequency grid, selection, painted regions, playhead.
  useEffect(() => {
    const canvas = overlayRef.current;
    if (!canvas || width <= 0) return;
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(HEIGHT * ratio);
    const context = canvas.getContext('2d');
    if (!context) return;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, width, HEIGHT);
    context.font = '10px system-ui, sans-serif';
    for (const hz of [100, 1000, 10_000]) {
      if (hz >= maxHz) continue;
      const y = yOf(hz);
      context.strokeStyle = 'rgba(255,255,255,0.18)';
      context.beginPath(); context.moveTo(0, y + 0.5); context.lineTo(width, y + 0.5); context.stroke();
      context.fillStyle = 'rgba(255,255,255,0.75)';
      context.fillText(formatFrequency(hz), 4, y - 3);
    }
    const selection = ctx.selection;
    if (selection.endSeconds > selection.startSeconds) {
      context.fillStyle = 'rgba(80, 140, 255, 0.22)';
      context.fillRect(xOf(selection.startSeconds), 0, xOf(selection.endSeconds) - xOf(selection.startSeconds), HEIGHT);
    }
    for (const region of [...regions, ...(draft ? [draft] : [])]) {
      const x0 = xOf(Math.min(region.startSeconds, region.endSeconds));
      const x1 = xOf(Math.max(region.startSeconds, region.endSeconds));
      const y0 = yOf(Math.max(region.lowHz, region.highHz));
      const y1 = yOf(Math.min(region.lowHz, region.highHz));
      context.fillStyle = 'rgba(127, 209, 185, 0.18)';
      context.fillRect(x0, y0, x1 - x0, y1 - y0);
      context.strokeStyle = '#7fd1b9';
      context.lineWidth = 1.5;
      context.strokeRect(x0 + 0.5, y0 + 0.5, x1 - x0, y1 - y0);
    }
    const playheadX = xOf(ctx.playhead);
    if (playheadX >= 0 && playheadX <= width) {
      context.strokeStyle = '#ff6b66';
      context.lineWidth = 2;
      context.beginPath(); context.moveTo(playheadX, 0); context.lineTo(playheadX, HEIGHT); context.stroke();
    }
  });

  const point = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width * width;
    const y = (event.clientY - rect.top) / rect.height * HEIGHT;
    return { seconds: secondsAt(x), hz: hzAt(y) };
  };

  const onDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!spectrogram || ctx.duration <= 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const at = point(event);
    drag.current = at;
    if (mode === 'select') onSelect({ startSeconds: at.seconds, endSeconds: at.seconds });
    else setDraft({ startSeconds: at.seconds, endSeconds: at.seconds, lowHz: at.hz, highHz: at.hz });
  };
  const onMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const start = drag.current;
    if (!start || !event.currentTarget.hasPointerCapture(event.pointerId)) return;
    const at = point(event);
    if (mode === 'select') onSelect({ startSeconds: start.seconds, endSeconds: at.seconds });
    else setDraft({ startSeconds: Math.min(start.seconds, at.seconds), endSeconds: Math.max(start.seconds, at.seconds), lowHz: Math.min(start.hz, at.hz), highHz: Math.max(start.hz, at.hz) });
  };
  const onUp = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const start = drag.current;
    drag.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (!start) return;
    const at = point(event);
    if (mode === 'select') { onSelect({ startSeconds: start.seconds, endSeconds: at.seconds }); onSeek(at.seconds); return; }
    const region = { startSeconds: Math.min(start.seconds, at.seconds), endSeconds: Math.max(start.seconds, at.seconds), lowHz: Math.round(Math.min(start.hz, at.hz)), highHz: Math.round(Math.max(start.hz, at.hz)) };
    setDraft(null);
    if (region.endSeconds - region.startSeconds < 0.005 || region.highHz - region.lowHz < 10) { ctx.setStatus('Drag a larger box to paint a region.'); return; }
    setRegions((current) => [...current, region]);
    ctx.setStatus(`Painted ${formatTime(region.startSeconds)}–${formatTime(region.endSeconds)}, ${formatFrequency(region.lowHz)}–${formatFrequency(region.highHz)}.`);
  };

  const applyRegions = (kind: 'attenuate' | 'heal') => {
    let next = ctx.latestDocument();
    const before = next;
    if (kind === 'attenuate') next = appendAudioEditRevision(next, { type: 'spectralAttenuate', regions, reductionDb: reduction });
    else for (const region of regions) next = appendAudioEditRevision(next, { type: 'spectralHeal', region });
    if (next === before || JSON.stringify(next.tracks) === JSON.stringify(before.tracks)) { ctx.setStatus('The painted regions are outside the selected clip. Select the clip underneath them first.'); return; }
    ctx.commit(next, kind === 'attenuate'
      ? `Lowered ${regions.length} painted region${regions.length === 1 ? '' : 's'} by ${reduction} dB. Undo is available.`
      : `Healed ${regions.length} painted region${regions.length === 1 ? '' : 's'} from the surrounding audio. Undo is available.`);
    setRegions([]);
  };

  return <div className="mastering-spectrogram">
    <div className="mastering-spectrogram-bar">
      <div className="mastering-listen" role="group" aria-label="Spectrogram drag action">
        <button type="button" aria-pressed={mode === 'select'} onClick={() => setMode('select')}>Select time</button>
        <button type="button" aria-pressed={mode === 'paint'} onClick={() => setMode('paint')}>Paint regions</button>
      </div>
      {loading && <span className="mastering-busy" role="status">Analysing…</span>}
    </div>
    <div ref={wrapRef} className="mastering-spectrogram-view">
      <canvas ref={baseRef} className="mastering-spectrogram-base" style={{ height: HEIGHT }} aria-hidden="true" />
      <canvas ref={overlayRef} className="mastering-spectrogram-overlay" style={{ height: HEIGHT, cursor: mode === 'paint' ? 'cell' : 'crosshair' }} role="img"
        aria-label={`Spectrogram from ${formatTime(startSeconds)} to ${formatTime(startSeconds + spanSeconds)}, ${formatFrequency(minHz)} to ${formatFrequency(maxHz)} on a logarithmic scale. ${regions.length} painted region${regions.length === 1 ? '' : 's'}.`}
        onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp}
        onPointerCancel={() => { drag.current = null; setDraft(null); }} />
    </div>
    {mode === 'paint' && <div className="mastering-paint-tools">
      <p className="help-text">Drag boxes around the sound to fix, such as a squeak, ring, or bird call. Keyboard users can do the same with Frequency band repair on the Repair tab.</p>
      {regions.length > 0 && <ul className="mastering-resonance-list" aria-label="Painted regions">
        {regions.map((region, index) => <li key={`${region.startSeconds}-${region.lowHz}-${index}`}>
          <span>{formatTime(region.startSeconds)}–{formatTime(region.endSeconds)} · {formatFrequency(region.lowHz)}–{formatFrequency(region.highHz)}</span>
          <button type="button" onClick={() => setRegions((current) => current.filter((_, position) => position !== index))}>Remove region {index + 1}</button>
        </li>)}
      </ul>}
      <div className="mastering-nudge">
        <label className="field"><span className="field-label">Attenuation (dB)</span>
          <input type="number" min={1} max={60} step={1} value={reduction} onChange={(event) => { const value = Number(event.target.value); if (Number.isFinite(value)) setReduction(Math.min(60, Math.max(1, value))); }} /></label>
        <button type="button" disabled={!ctx.canEdit || !regions.length} onClick={() => applyRegions('attenuate')}>Attenuate painted regions</button>
        <button type="button" disabled={!ctx.canEdit || !regions.length} onClick={() => applyRegions('heal')}>Heal painted regions</button>
        <button type="button" disabled={!regions.length} onClick={() => setRegions([])}>Clear regions</button>
      </div>
    </div>}
  </div>;
}

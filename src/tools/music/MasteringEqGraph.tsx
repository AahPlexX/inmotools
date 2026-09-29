/**
 * EQ response graph (ledgers 45, 50).
 *
 * Draws the summed static response for the mid path (solid) and, when any
 * band targets the side, the side path (dashed) on a log-frequency axis.
 * Enabled bands appear as handles: drag to change frequency and gain
 * (previewed live, committed on release). Clicking empty space turns on the
 * next unused band at that frequency ("spectrum grab"). Every action here is
 * also available in the band table, so the graph is never required.
 */
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { eqResponseDb, shapeHasGain, type MasterSettings } from './dsp/master-chain';
import { formatFrequency } from './MasteringControls';

const MIN_HZ = 20;
const MAX_HZ = 20_000;
const RANGE_DB = 24;
const HEIGHT = 220;

interface Props {
  settings: MasterSettings;
  sampleRate: number;
  spectrumDb?: Float64Array | null;
  spectrumBinHz?: number;
  disabled: boolean;
  onPreview: (settings: MasterSettings) => void;
  onCommit: (settings: MasterSettings, status: string) => void;
}

const xOf = (hz: number, width: number) => Math.log(hz / MIN_HZ) / Math.log(MAX_HZ / MIN_HZ) * width;
const hzOf = (x: number, width: number) => MIN_HZ * (MAX_HZ / MIN_HZ) ** Math.min(1, Math.max(0, x / width));
const yOf = (db: number) => HEIGHT / 2 - db / RANGE_DB * (HEIGHT / 2 - 10);
const dbOf = (y: number) => Math.max(-RANGE_DB, Math.min(RANGE_DB, (HEIGHT / 2 - y) / (HEIGHT / 2 - 10) * RANGE_DB));

export default function MasteringEqGraph({ settings, sampleRate, spectrumDb, spectrumBinHz, disabled, onPreview, onCommit }: Props) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [width, setWidth] = useState(0);
  const drag = useRef<{ index: number; settings: MasterSettings } | null>(null);
  const [dragging, setDragging] = useState<MasterSettings | null>(null);
  const shown = dragging ?? settings;

  useEffect(() => {
    const element = wrapRef.current;
    if (!element) return;
    const observer = new ResizeObserver((entries) => setWidth(Math.floor(entries[0]?.contentRect.width ?? 0)));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || width <= 0) return;
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(HEIGHT * ratio);
    const context = canvas.getContext('2d');
    if (!context) return;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.fillStyle = '#111820';
    context.fillRect(0, 0, width, HEIGHT);
    context.font = '10px system-ui, sans-serif';
    context.fillStyle = '#7d8a97';
    context.strokeStyle = '#26313c';
    for (const hz of [50, 100, 200, 500, 1000, 2000, 5000, 10_000]) {
      const x = xOf(hz, width);
      context.beginPath(); context.moveTo(x + 0.5, 0); context.lineTo(x + 0.5, HEIGHT); context.stroke();
      context.fillText(formatFrequency(hz), x + 3, HEIGHT - 4);
    }
    for (const db of [-18, -12, -6, 0, 6, 12, 18]) {
      const y = yOf(db);
      context.strokeStyle = db === 0 ? '#56616d' : '#26313c';
      context.beginPath(); context.moveTo(0, y + 0.5); context.lineTo(width, y + 0.5); context.stroke();
      context.fillText(`${db > 0 ? '+' : ''}${db}`, 3, y - 2);
    }
    if (spectrumDb && spectrumBinHz) {
      // The analysed spectrum is drawn relative to its own peak so its shape sits inside the EQ scale.
      let peak = -Infinity;
      for (const value of spectrumDb) peak = Math.max(peak, value);
      context.strokeStyle = 'rgba(143, 179, 255, 0.45)';
      context.beginPath();
      for (let x = 0; x < width; x += 1) {
        const bin = Math.min(spectrumDb.length - 1, Math.round(hzOf(x, width) / spectrumBinHz));
        const y = yOf(Math.max(-RANGE_DB, (spectrumDb[bin] - peak) / 2 + RANGE_DB * 0.4));
        if (x === 0) context.moveTo(x, y); else context.lineTo(x, y);
      }
      context.stroke();
    }
    const drawCurve = (path: 'mid' | 'side', dash: number[], color: string) => {
      context.strokeStyle = color;
      context.lineWidth = 2;
      context.setLineDash(dash);
      context.beginPath();
      for (let x = 0; x <= width; x += 2) {
        const y = yOf(Math.max(-RANGE_DB, Math.min(RANGE_DB, eqResponseDb(shown, hzOf(x, width), sampleRate, path))));
        if (x === 0) context.moveTo(x, y); else context.lineTo(x, y);
      }
      context.stroke();
      context.setLineDash([]);
      context.lineWidth = 1;
    };
    drawCurve('mid', [], '#f2b84b');
    if (shown.eq.bands.some((band) => band.enabled && band.routing === 'side')) drawCurve('side', [5, 4], '#7fd1b9');
    shown.eq.bands.forEach((band, index) => {
      if (!band.enabled) return;
      const x = xOf(band.frequency, width);
      const y = yOf(shapeHasGain(band.shape) ? band.gainDb : 0);
      context.fillStyle = band.solo ? '#ff6b66' : '#f2b84b';
      context.beginPath(); context.arc(x, y, 7, 0, Math.PI * 2); context.fill();
      context.fillStyle = '#111820';
      context.font = 'bold 9px system-ui, sans-serif';
      context.fillText(String(index + 1), x - (index + 1 >= 10 ? 5 : 3), y + 3);
    });
  }, [shown, width, sampleRate, spectrumDb, spectrumBinHz]);

  const pointFor = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: (event.clientX - rect.left) / rect.width * width, y: (event.clientY - rect.top) / rect.height * HEIGHT };
  };

  const withBand = (base: MasterSettings, index: number, patch: Partial<MasterSettings['eq']['bands'][number]>): MasterSettings => ({
    ...base,
    eq: { ...base.eq, enabled: true, bands: base.eq.bands.map((band, position) => position === index ? { ...band, ...patch } : band) },
  });

  const onPointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (disabled || width <= 0) return;
    const point = pointFor(event);
    const hit = settings.eq.bands.findIndex((band) => band.enabled && Math.hypot(xOf(band.frequency, width) - point.x, yOf(shapeHasGain(band.shape) ? band.gainDb : 0) - point.y) < 12);
    if (hit >= 0) {
      event.currentTarget.setPointerCapture(event.pointerId);
      drag.current = { index: hit, settings };
      return;
    }
    const free = settings.eq.bands.findIndex((band) => !band.enabled);
    if (free < 0) return;
    const frequency = Math.round(hzOf(point.x, width));
    onCommit(withBand(settings, free, { enabled: true, shape: 'bell', frequency, gainDb: Math.round(dbOf(point.y) * 2) / 2, q: 1.5 }), `Band ${free + 1} added at ${formatFrequency(frequency)}.`);
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const current = drag.current;
    if (!current || !event.currentTarget.hasPointerCapture(event.pointerId)) return;
    const point = pointFor(event);
    const band = current.settings.eq.bands[current.index];
    const next = withBand(current.settings, current.index, { frequency: Math.round(hzOf(point.x, width)), ...(shapeHasGain(band.shape) ? { gainDb: Math.round(dbOf(point.y) * 10) / 10 } : {}) });
    setDragging(next);
    onPreview(next);
  };

  const onPointerUp = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const current = drag.current;
    drag.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (current && dragging) {
      const band = dragging.eq.bands[current.index];
      onCommit(dragging, `Band ${current.index + 1}: ${formatFrequency(band.frequency)}${shapeHasGain(band.shape) ? `, ${band.gainDb > 0 ? '+' : ''}${band.gainDb} dB` : ''}.`);
    }
    setDragging(null);
  };

  return <div ref={wrapRef} className="mastering-eq-graph">
    <canvas ref={canvasRef} style={{ height: HEIGHT }} role="img"
      aria-label={`EQ curve. ${shown.eq.bands.filter((band) => band.enabled).length} bands on. Use the band table below to edit bands with the keyboard.`}
      onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp}
      onPointerCancel={() => { drag.current = null; setDragging(null); onPreview(settings); }} />
    <p className="help-text">Drag a numbered handle to move a band. Click an empty spot to add a band there.</p>
  </div>;
}

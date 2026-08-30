import { useEffect, useMemo, useRef, useState } from 'react';
import type { NormalizedSpan } from './otel-engine';

type Props = { spans: NormalizedSpan[]; selectedSpanId?: string; criticalPath: string[]; onSelect: (spanId: string) => void };
type Hit = { spanId: string; x: number; y: number; width: number; height: number };

function serviceColor(service: string) {
  let hash = 0; for (let index = 0; index < service.length; index += 1) hash = (hash * 31 + service.charCodeAt(index)) | 0;
  return `hsl(${Math.abs(hash) % 360} 58% 62%)`;
}

export default function FlamegraphCanvas({ spans, selectedSpanId, criticalPath, onSelect }: Props) {
  const ref = useRef<HTMLCanvasElement>(null); const hits = useRef<Hit[]>([]); const drag = useRef<{ x: number; pan: number } | null>(null);
  const [width, setWidth] = useState(760); const [zoom, setZoom] = useState(1); const [panMs, setPanMs] = useState(0);
  const depths = useMemo(() => {
    const byId = new Map(spans.map((span) => [span.spanId, span])); const cache = new Map<string, number>();
    const depth = (span: NormalizedSpan, seen = new Set<string>()): number => { if (cache.has(span.spanId)) return cache.get(span.spanId)!; if (!span.parentSpanId || seen.has(span.spanId)) return 0; const parent = byId.get(span.parentSpanId); if (!parent) return 0; seen.add(span.spanId); const value = depth(parent, seen) + 1; cache.set(span.spanId, value); return value; };
    return new Map(spans.map((span) => [span.spanId, depth(span)]));
  }, [spans]);
  const maxEnd = Math.max(1, ...spans.map((span) => span.startMs + span.durationMs)); const maxDepth = Math.max(0, ...depths.values()); const height = Math.max(180, Math.min(480, 44 + (maxDepth + 1) * 34));

  useEffect(() => { const canvas = ref.current; if (!canvas) return; const observer = new ResizeObserver(([entry]) => setWidth(Math.max(320, Math.floor(entry.contentRect.width)))); observer.observe(canvas); return () => observer.disconnect(); }, []);
  useEffect(() => { setPanMs((current) => Math.max(0, Math.min(current, maxEnd - maxEnd / zoom))); }, [maxEnd, zoom]);

  useEffect(() => {
    const canvas = ref.current; if (!canvas) return; const dpr = window.devicePixelRatio || 1; canvas.width = Math.floor(width * dpr); canvas.height = Math.floor(height * dpr);
    const ctx = canvas.getContext('2d'); if (!ctx) return; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, width, height);
    const styles = getComputedStyle(document.documentElement); const ink = styles.getPropertyValue('--ink').trim() || '#101820'; const muted = styles.getPropertyValue('--muted').trim() || '#59636e'; const line = styles.getPropertyValue('--line').trim() || '#d7dde3'; const signal = styles.getPropertyValue('--signal').trim() || '#205bd6'; const danger = styles.getPropertyValue('--danger').trim() || '#b3261e'; const surface = styles.getPropertyValue('--surface').trim() || '#fff';
    const left = 62; const right = 12; const top = 30; const plotWidth = Math.max(100, width - left - right); const visible = maxEnd / zoom;
    ctx.font = '10px ui-monospace, SFMono-Regular, Menlo, monospace'; ctx.fillStyle = muted; ctx.strokeStyle = line;
    for (let tick = 0; tick <= 5; tick += 1) { const x = left + plotWidth * tick / 5; const time = panMs + visible * tick / 5; ctx.beginPath(); ctx.moveTo(x, top - 5); ctx.lineTo(x, height); ctx.stroke(); const label = `${Math.round(time)} ms`; ctx.fillText(label, x - (tick === 5 ? ctx.measureText(label).width : 0), 16); }
    hits.current = [];
    for (const span of spans) {
      const depth = depths.get(span.spanId) ?? 0; const x = left + (span.startMs - panMs) / visible * plotWidth; const barWidth = Math.max(2, span.durationMs / visible * plotWidth); const y = top + depth * 34; const barHeight = 25;
      if (x + barWidth < left || x > width - right) continue;
      ctx.fillStyle = serviceColor(span.serviceName); ctx.fillRect(x, y, barWidth, barHeight);
      if (criticalPath.includes(span.spanId)) { ctx.fillStyle = ink; ctx.font = '12px sans-serif'; ctx.fillText('◆', x + 4, y + 17); }
      if (span.error) { ctx.fillStyle = danger; ctx.font = '700 13px sans-serif'; ctx.fillText('!', Math.min(x + barWidth - 10, x + 20), y + 18); }
      if (span.spanId === selectedSpanId) { ctx.strokeStyle = signal; ctx.lineWidth = 3; ctx.strokeRect(x - 1, y - 1, barWidth + 2, barHeight + 2); ctx.lineWidth = 1; }
      ctx.fillStyle = ink; ctx.font = '600 10px ui-monospace, SFMono-Regular, Menlo, monospace'; const prefix = criticalPath.includes(span.spanId) ? '◆ ' : span.error ? '! ' : ''; const label = `${prefix}${span.name}`; if (barWidth > 34) { ctx.save(); ctx.beginPath(); ctx.rect(x + 3, y, Math.max(0, barWidth - 6), barHeight); ctx.clip(); ctx.fillText(label, x + 6, y + 17); ctx.restore(); }
      hits.current.push({ spanId: span.spanId, x, y, width: barWidth, height: barHeight });
    }
    ctx.fillStyle = surface; ctx.fillRect(0, top, left - 2, height - top); ctx.fillStyle = muted; ctx.font = '10px ui-monospace, SFMono-Regular, Menlo, monospace'; for (let depth = 0; depth <= maxDepth; depth += 1) ctx.fillText(`D${depth}`, 10, top + depth * 34 + 17);
  }, [criticalPath, depths, height, maxDepth, maxEnd, panMs, selectedSpanId, spans, width, zoom]);

  function selectAt(clientX: number, clientY: number) { const canvas = ref.current; if (!canvas) return; const rect = canvas.getBoundingClientRect(); const x = clientX - rect.left; const y = clientY - rect.top; const hit = [...hits.current].reverse().find((item) => x >= item.x && x <= item.x + item.width && y >= item.y && y <= item.y + item.height); if (hit) onSelect(hit.spanId); }
  function onWheel(event: React.WheelEvent<HTMLCanvasElement>) { event.preventDefault(); const rect = event.currentTarget.getBoundingClientRect(); const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left - 62) / Math.max(1, rect.width - 74))); const oldVisible = maxEnd / zoom; const nextZoom = Math.max(1, Math.min(20, zoom * (event.deltaY < 0 ? 1.25 : 0.8))); const nextVisible = maxEnd / nextZoom; const anchor = panMs + ratio * oldVisible; setZoom(nextZoom); setPanMs(Math.max(0, Math.min(maxEnd - nextVisible, anchor - ratio * nextVisible))); }
  function onKeyDown(event: React.KeyboardEvent<HTMLCanvasElement>) { const current = Math.max(0, spans.findIndex((span) => span.spanId === selectedSpanId)); if (event.key === 'ArrowDown') { event.preventDefault(); onSelect(spans[Math.min(spans.length - 1, current + 1)]?.spanId ?? ''); } if (event.key === 'ArrowUp') { event.preventDefault(); onSelect(spans[Math.max(0, current - 1)]?.spanId ?? ''); } if (event.key === '+' || event.key === '=') { event.preventDefault(); setZoom((value) => Math.min(20, value * 1.25)); } if (event.key === '-') { event.preventDefault(); setZoom((value) => Math.max(1, value * 0.8)); } if (event.key === 'ArrowLeft') { event.preventDefault(); setPanMs((value) => Math.max(0, value - maxEnd / zoom * 0.1)); } if (event.key === 'ArrowRight') { event.preventDefault(); setPanMs((value) => Math.min(maxEnd - maxEnd / zoom, value + maxEnd / zoom * 0.1)); } }

  return <div style={{ border: '1px solid var(--line)', borderRadius: 'var(--radius-sm)', overflow: 'hidden', marginTop: 18 }}><canvas ref={ref} tabIndex={0} aria-label={`Trace flamegraph with ${spans.length} spans. Diamond marks critical-path spans; exclamation marks errors. Use arrow keys to select or pan and plus/minus to zoom.`} style={{ width: '100%', height, display: 'block', background: 'var(--surface)', touchAction: 'none' }} onClick={(event) => selectAt(event.clientX, event.clientY)} onWheel={onWheel} onKeyDown={onKeyDown} onPointerDown={(event) => { drag.current = { x: event.clientX, pan: panMs }; event.currentTarget.setPointerCapture(event.pointerId); }} onPointerMove={(event) => { if (!drag.current) return; const visible = maxEnd / zoom; const dx = event.clientX - drag.current.x; setPanMs(Math.max(0, Math.min(maxEnd - visible, drag.current.pan - dx / Math.max(1, width - 74) * visible))); }} onPointerUp={() => { drag.current = null; }}/></div>;
}

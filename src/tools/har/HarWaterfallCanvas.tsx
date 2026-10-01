import { useEffect, useRef, useState } from 'react';
import type { HarWaterfallRow } from './har-engine';

type Props = { rows: HarWaterfallRow[]; selectedIndex: number; onSelect: (index: number) => void };
const PHASES: Array<keyof HarWaterfallRow['phases']> = ['blocked', 'dns', 'connect', 'ssl', 'send', 'wait', 'receive'];
const PHASE_LABELS: Record<(typeof PHASES)[number], string> = {
  blocked: 'Queued',
  dns: 'DNS',
  connect: 'Connect',
  ssl: 'TLS',
  send: 'Send',
  wait: 'Wait',
  receive: 'Receive',
};
const PHASE_TIPS: Record<(typeof PHASES)[number], string> = {
  blocked: 'Time waiting for a connection. HAR uses -1 when this phase does not apply; those values are drawn as zero.',
  dns: 'Time to resolve the host name. -1 means the capture did not measure it.',
  connect: 'TCP connect time after TLS is removed, so TLS is not counted twice.',
  ssl: 'TLS handshake. HAR nests this inside connect; the bar shows it separately.',
  send: 'Time to send the request.',
  wait: 'Time until the first response byte.',
  receive: 'Time to read the rest of the response.',
};

export default function HarWaterfallCanvas({ rows, selectedIndex, onSelect }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(720);
  const [viewport, setViewport] = useState(320);
  const [scrollTop, setScrollTop] = useState(0);
  const rowHeight = 32;
  const headerHeight = 28;
  const overscan = 3;
  const start = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
  const visibleCount = Math.min(rows.length, Math.ceil(viewport / rowHeight) + overscan * 2 + 1);
  const slice = rows.slice(start, start + visibleCount);
  const canvasHeight = Math.max(120, headerHeight + slice.length * rowHeight + 8);
  const scrollHeight = Math.max(canvasHeight, headerHeight + rows.length * rowHeight + 8);

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const observer = new ResizeObserver(([entry]) => {
      setWidth(Math.max(280, Math.floor(entry.contentRect.width)));
      setViewport(Math.max(160, Math.floor(entry.contentRect.height)));
    });
    observer.observe(wrap);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap || selectedIndex < 0) return;
    const top = headerHeight + selectedIndex * rowHeight;
    if (top < wrap.scrollTop) wrap.scrollTop = Math.max(0, top - headerHeight);
    else if (top + rowHeight > wrap.scrollTop + wrap.clientHeight) wrap.scrollTop = top + rowHeight - wrap.clientHeight;
  }, [selectedIndex]);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(canvasHeight * dpr);
    const context = canvas.getContext('2d');
    if (!context) return;
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.clearRect(0, 0, width, canvasHeight);
    const styles = getComputedStyle(document.documentElement);
    const ink = styles.getPropertyValue('--ink').trim() || '#101820';
    const muted = styles.getPropertyValue('--muted').trim() || '#59636e';
    const line = styles.getPropertyValue('--line').trim() || '#d7dde3';
    const signal = styles.getPropertyValue('--signal').trim() || '#205bd6';
    const signalSoft = styles.getPropertyValue('--signal-soft').trim() || '#e8efff';
    const surfaceStrong = styles.getPropertyValue('--surface-strong').trim() || '#eef1f4';
    const left = Math.min(210, Math.max(108, width * 0.34));
    const rightPad = 16;
    const plotWidth = Math.max(64, width - left - rightPad);
    const maxEnd = Math.max(1, ...rows.map((row) => row.startOffsetMs + Math.max(row.totalMs, Object.values(row.phases).reduce((sum, value) => sum + value, 0))));
    context.font = '11px ui-monospace, SFMono-Regular, Menlo, monospace';
    context.fillStyle = muted;
    context.fillText('REQUEST', 10, 18);
    context.fillText('0 ms', left, 18);
    const endLabel = `${Math.round(maxEnd)} ms`;
    context.fillText(endLabel, width - rightPad - context.measureText(endLabel).width, 18);
    context.strokeStyle = line;
    context.beginPath();
    context.moveTo(left, headerHeight - 4);
    context.lineTo(width - rightPad, headerHeight - 4);
    context.stroke();
    const phaseFills = [surfaceStrong, '#dce6f8', '#bfd2ff', '#9dbcf7', '#7aa2ef', signal, '#5c82d5'];
    const labelBudget = Math.max(48, left - 16);
    slice.forEach((row, localIndex) => {
      const rowIndex = start + localIndex;
      const y = headerHeight + localIndex * rowHeight;
      if (rowIndex === selectedIndex) {
        context.fillStyle = signalSoft;
        context.fillRect(0, y, width, rowHeight);
      }
      context.strokeStyle = line;
      context.beginPath();
      context.moveTo(0, y + rowHeight - 1);
      context.lineTo(width, y + rowHeight - 1);
      context.stroke();
      context.fillStyle = ink;
      context.font = '600 11px ui-monospace, SFMono-Regular, Menlo, monospace';
      let host = row.url || 'request';
      try { host = new URL(row.displayUrl || row.url).hostname; } catch { host = row.displayUrl || row.url || 'request'; }
      let label = `${row.method || 'HTTP'} ${host}`;
      while (label.length > 4 && context.measureText(label).width > labelBudget) label = `${label.slice(0, -2)}…`;
      context.fillText(label, 10, y + 20);
      let x = left + row.startOffsetMs / maxEnd * plotWidth;
      PHASES.forEach((phase, phaseIndex) => {
        const duration = row.phases[phase];
        if (duration <= 0) return;
        const barWidth = Math.max(1, duration / maxEnd * plotWidth);
        context.fillStyle = phaseFills[phaseIndex];
        context.fillRect(x, y + 8, barWidth, 16);
        x += barWidth;
      });
      if (rowIndex === selectedIndex) {
        context.strokeStyle = signal;
        context.lineWidth = 2;
        context.strokeRect(left + row.startOffsetMs / maxEnd * plotWidth, y + 7, Math.max(2, x - (left + row.startOffsetMs / maxEnd * plotWidth)), 18);
        context.lineWidth = 1;
      }
    });
  }, [canvasHeight, rows, selectedIndex, slice, start, width]);

  function selectFromY(clientY: number) {
    const canvas = ref.current;
    if (!canvas || !rows.length) return;
    const y = clientY - canvas.getBoundingClientRect().top;
    const index = start + Math.floor((y - headerHeight) / rowHeight);
    if (index >= 0 && index < rows.length) onSelect(index);
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLCanvasElement>) {
    if (!rows.length) return;
    if (event.key === 'ArrowDown') { event.preventDefault(); onSelect(Math.min(rows.length - 1, selectedIndex + 1)); }
    if (event.key === 'ArrowUp') { event.preventDefault(); onSelect(Math.max(0, selectedIndex - 1)); }
    if (event.key === 'Home') { event.preventDefault(); onSelect(0); }
    if (event.key === 'End') { event.preventDefault(); onSelect(rows.length - 1); }
  }

  return (
    <div style={{ marginTop: 18 }}>
      <div
        ref={wrapRef}
        role="region"
        aria-label="Scrollable HAR waterfall"
        tabIndex={0}
        onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
        style={{ border: '1px solid var(--line)', borderRadius: 'var(--radius-sm)', overflow: 'auto', maxHeight: 'clamp(220px, 52vh, 520px)', position: 'relative', WebkitOverflowScrolling: 'touch' }}
      >
        <div style={{ height: scrollHeight, position: 'relative' }}>
          <canvas
            ref={ref}
            tabIndex={0}
            aria-label={`HAR waterfall with ${rows.length} requests. Use up and down arrow keys to inspect requests.`}
            style={{ width: '100%', height: canvasHeight, display: 'block', background: 'var(--surface)', touchAction: 'manipulation', position: 'sticky', top: 0 }}
            onClick={(event) => selectFromY(event.clientY)}
            onKeyDown={onKeyDown}
          />
        </div>
      </div>
      <ul style={{ display: 'flex', flexWrap: 'wrap', gap: 8, margin: '10px 0 0', padding: 0, listStyle: 'none' }}>
        {PHASES.map((phase) => (
          <li key={phase} title={PHASE_TIPS[phase]} style={{ display: 'flex', alignItems: 'center', gap: 6, minHeight: 32, fontSize: 12 }}>
            <span aria-hidden="true" style={{ width: 12, height: 12, borderRadius: 2, background: phase === 'wait' ? 'var(--signal)' : 'var(--surface-strong)', border: '1px solid var(--line)' }} />
            {PHASE_LABELS[phase]}
          </li>
        ))}
      </ul>
    </div>
  );
}

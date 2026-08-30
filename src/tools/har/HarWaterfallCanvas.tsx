import { useEffect, useRef, useState } from 'react';
import type { buildWaterfallRows } from './har-engine';

type WaterfallRow = ReturnType<typeof buildWaterfallRows>[number];

type Props = {
  rows: WaterfallRow[];
  selectedIndex: number;
  onSelect: (index: number) => void;
};

const PHASES: Array<keyof WaterfallRow['phases']> = ['blocked', 'dns', 'connect', 'ssl', 'send', 'wait', 'receive'];

export default function HarWaterfallCanvas({ rows, selectedIndex, onSelect }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [width, setWidth] = useState(720);
  const rowHeight = 32;
  const headerHeight = 28;
  const height = Math.max(120, Math.min(440, headerHeight + rows.length * rowHeight + 8));

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(320, Math.floor(entry.contentRect.width))));
    observer.observe(canvas);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    const context = canvas.getContext('2d');
    if (!context) return;
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.clearRect(0, 0, width, height);

    const styles = getComputedStyle(document.documentElement);
    const ink = styles.getPropertyValue('--ink').trim() || '#101820';
    const muted = styles.getPropertyValue('--muted').trim() || '#59636e';
    const line = styles.getPropertyValue('--line').trim() || '#d7dde3';
    const signal = styles.getPropertyValue('--signal').trim() || '#205bd6';
    const signalSoft = styles.getPropertyValue('--signal-soft').trim() || '#e8efff';
    const surfaceStrong = styles.getPropertyValue('--surface-strong').trim() || '#eef1f4';
    const left = Math.min(210, Math.max(128, width * 0.28));
    const rightPad = 16;
    const plotWidth = Math.max(80, width - left - rightPad);
    const maxEnd = Math.max(1, ...rows.map((row) => row.startOffsetMs + Math.max(row.totalMs, Object.values(row.phases).reduce((sum, value) => sum + value, 0))));

    context.font = '11px ui-monospace, SFMono-Regular, Menlo, monospace';
    context.fillStyle = muted;
    context.fillText('REQUEST', 10, 18);
    context.fillText(`0 ms`, left, 18);
    const endLabel = `${Math.round(maxEnd)} ms`;
    context.fillText(endLabel, width - rightPad - context.measureText(endLabel).width, 18);
    context.strokeStyle = line;
    context.beginPath();
    context.moveTo(left, headerHeight - 4);
    context.lineTo(width - rightPad, headerHeight - 4);
    context.stroke();

    const phaseFills = [surfaceStrong, '#dce6f8', '#bfd2ff', '#9dbcf7', '#7aa2ef', signal, '#5c82d5'];
    rows.forEach((row, rowIndex) => {
      const y = headerHeight + rowIndex * rowHeight;
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
      const label = `${row.method || 'HTTP'} ${(() => { try { return new URL(row.url).hostname; } catch { return row.url || 'request'; } })()}`;
      context.fillText(label.length > 28 ? `${label.slice(0, 27)}…` : label, 10, y + 20);

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
  }, [height, rows, selectedIndex, width]);

  function selectFromY(clientY: number) {
    const canvas = ref.current;
    if (!canvas || !rows.length) return;
    const y = clientY - canvas.getBoundingClientRect().top;
    const index = Math.floor((y - headerHeight) / rowHeight);
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
    <div style={{ border: '1px solid var(--line)', borderRadius: 'var(--radius-sm)', overflow: 'hidden', marginTop: 18 }}>
      <canvas
        ref={ref}
        tabIndex={0}
        aria-label={`HAR waterfall with ${rows.length} requests. Use up and down arrow keys to inspect requests.`}
        style={{ width: '100%', height, display: 'block', background: 'var(--surface)', touchAction: 'manipulation' }}
        onClick={(event) => selectFromY(event.clientY)}
        onKeyDown={onKeyDown}
      />
    </div>
  );
}

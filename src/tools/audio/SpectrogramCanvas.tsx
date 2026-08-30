import { useEffect, useRef } from 'react';

export default function SpectrogramCanvas({ analyser, active }: { analyser: AnalyserNode | null; active: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let frame = 0;
    let animation = 0;
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.max(1, window.devicePixelRatio || 1);
      canvas.width = Math.max(1, Math.round(rect.width * dpr));
      canvas.height = Math.max(1, Math.round(rect.height * dpr));
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    const values = new Uint8Array(analyser?.frequencyBinCount ?? 128);

    const draw = () => {
      const context = canvas.getContext('2d');
      if (!context) return;
      const dpr = Math.max(1, window.devicePixelRatio || 1);
      const width = canvas.width / dpr;
      const height = canvas.height / dpr;
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      const styles = getComputedStyle(document.documentElement);
      context.fillStyle = styles.getPropertyValue('--surface').trim() || '#fff';
      context.fillRect(0, 0, width, height);
      context.strokeStyle = styles.getPropertyValue('--line').trim() || '#d8dde3';
      context.beginPath(); context.moveTo(0, height - 1); context.lineTo(width, height - 1); context.stroke();

      if (analyser && active) analyser.getByteFrequencyData(values);
      else values.fill(0);
      const bars = Math.min(96, values.length);
      const barWidth = width / bars;
      context.fillStyle = styles.getPropertyValue('--signal').trim() || '#205bd6';
      for (let index = 0; index < bars; index += 1) {
        const value = values[Math.floor(index * values.length / bars)] / 255;
        const barHeight = Math.max(1, value * (height - 14));
        context.fillRect(index * barWidth + 1, height - barHeight, Math.max(1, barWidth - 2), barHeight);
      }
      frame += 1;
      animation = requestAnimationFrame(draw);
    };
    draw();
    return () => { cancelAnimationFrame(animation); observer.disconnect(); void frame; };
  }, [active, analyser]);

  return <canvas ref={canvasRef} role="img" aria-label="Live audio frequency spectrum" style={{ display: 'block', width: '100%', height: 210, marginTop: 18, border: '1px solid var(--line)', borderRadius: 'var(--radius-sm)', background: 'var(--surface)' }}/>;
}

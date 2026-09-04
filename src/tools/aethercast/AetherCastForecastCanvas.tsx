import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import type { HourlyAssessment } from './aethercast-types';

interface AetherCastForecastCanvasProps {
  assessments: readonly HourlyAssessment[];
  activeIndex: number | null;
  onScrub: (index: number | null) => void;
  describedById: string;
}

const CATEGORY_COLOR: Record<string, string> = {
  GOOD: '#10b981',
  MODERATE: '#f59e0b',
  UNHEALTHY_SENSITIVE: '#f97316',
  UNHEALTHY: '#ef4444',
  VERY_UNHEALTHY: '#a855f7',
  HAZARDOUS: '#881337',
  BEYOND_INDEX: '#881337',
};

const CHART_PADDING = 24;

export function AetherCastForecastCanvas({ assessments, activeIndex, onScrub, describedById }: AetherCastForecastCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [size, setSize] = useState({ width: 320, height: 220 });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const target = canvas.parentElement ?? canvas;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const width = Math.max(240, Math.floor(entry.contentRect.width));
      const height = Math.max(180, Math.min(440, Math.floor(width * 0.4)));
      setSize({ width, height });
    });
    observer.observe(target);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ratio = window.devicePixelRatio || 1;
    canvas.width = size.width * ratio;
    canvas.height = size.height * ratio;
    canvas.style.width = `${size.width}px`;
    canvas.style.height = `${size.height}px`;
    const context = canvas.getContext('2d');
    if (!context) return;
    context.scale(ratio, ratio);
    context.clearRect(0, 0, size.width, size.height);

    if (assessments.length === 0) return;

    const maxAqi = Math.max(150, ...assessments.map((assessment) => assessment.compositeAqi ?? 0));
    const stepX = (size.width - CHART_PADDING * 2) / Math.max(1, assessments.length - 1);
    const yFor = (aqi: number) => size.height - CHART_PADDING - (aqi / maxAqi) * (size.height - CHART_PADDING * 2);

    context.strokeStyle = '#334155';
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(CHART_PADDING, size.height - CHART_PADDING);
    context.lineTo(size.width - CHART_PADDING, size.height - CHART_PADDING);
    context.stroke();

    context.beginPath();
    context.strokeStyle = '#10b981';
    context.lineWidth = 2;
    assessments.forEach((assessment, index) => {
      const x = CHART_PADDING + index * stepX;
      const y = yFor(assessment.compositeAqi ?? 0);
      if (index === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    });
    context.stroke();

    if (activeIndex !== null && assessments[activeIndex]) {
      const x = CHART_PADDING + activeIndex * stepX;
      context.strokeStyle = '#e2e8f0';
      context.beginPath();
      context.moveTo(x, CHART_PADDING);
      context.lineTo(x, size.height - CHART_PADDING);
      context.stroke();

      const category = assessments[activeIndex].aqiCategory ?? 'GOOD';
      context.fillStyle = CATEGORY_COLOR[category] ?? '#10b981';
      context.beginPath();
      context.arc(x, yFor(assessments[activeIndex].compositeAqi ?? 0), 4, 0, Math.PI * 2);
      context.fill();
    }
  }, [assessments, activeIndex, size]);

  const handlePointer = (clientX: number) => {
    const canvas = canvasRef.current;
    if (!canvas || assessments.length === 0) return;
    const rect = canvas.getBoundingClientRect();
    const usable = Math.max(1, rect.width - CHART_PADDING * 2);
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left - CHART_PADDING) / usable));
    const index = Math.round(ratio * (assessments.length - 1));
    onScrub(Math.min(assessments.length - 1, Math.max(0, index)));
  };

  const handlePointerMove = (event: PointerEvent<HTMLCanvasElement>) => {
    if (event.buttons === 1 || event.pointerType === 'touch') handlePointer(event.clientX);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLCanvasElement>) => {
    if (assessments.length === 0) return;
    const current = activeIndex ?? 0;
    if (event.key === 'ArrowRight') {
      onScrub(Math.min(assessments.length - 1, current + 1));
      event.preventDefault();
    }
    if (event.key === 'ArrowLeft') {
      onScrub(Math.max(0, current - 1));
      event.preventDefault();
    }
  };

  return (
    <canvas
      ref={canvasRef}
      role="img"
      tabIndex={0}
      aria-label="Composite AQI forecast chart. Use the arrow keys or drag to scrub through imported hours."
      aria-describedby={describedById}
      className="aethercast-canvas"
      onPointerMove={handlePointerMove}
      onPointerDown={(event) => handlePointer(event.clientX)}
      onKeyDown={handleKeyDown}
      onMouseLeave={() => onScrub(null)}
    />
  );
}

import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import type { HourlyAssessment, IndexStandard } from './aethercast-types';

interface AetherCastForecastCanvasProps {
  readonly assessments: readonly HourlyAssessment[];
  readonly activeIndex: number | null;
  readonly standard: IndexStandard;
  readonly onScrub: (index: number | null) => void;
  readonly describedById: string;
}

const CATEGORY_COLOR: Record<string, string> = {
  GOOD: '#087a55', FAIR: '#3f7f67', MODERATE: '#9b5d00', POOR: '#b45309',
  UNHEALTHY_SENSITIVE: '#c2410c', UNHEALTHY: '#b3261e', VERY_POOR: '#9f1239',
  VERY_UNHEALTHY: '#7e22ce', EXTREMELY_POOR: '#701a75', HAZARDOUS: '#701a2b', BEYOND_INDEX: '#4c0519',
};

const CHART_PADDING = 24;

const valueFor = (assessment: HourlyAssessment, standard: IndexStandard): number | null =>
  standard === 'US_EPA' ? assessment.compositeAqi : assessment.eaqiValue;

const categoryFor = (assessment: HourlyAssessment, standard: IndexStandard): string | null =>
  standard === 'US_EPA' ? assessment.aqiCategory : assessment.eaqiBand;

export function AetherCastForecastCanvas({ assessments, activeIndex, standard, onScrub, describedById }: AetherCastForecastCanvasProps) {
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
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, size.width, size.height);
    if (assessments.length === 0) return;

    const values = assessments.map((assessment) => valueFor(assessment, standard)).filter((value): value is number => value !== null);
    const maxIndex = Math.max(standard === 'US_EPA' ? 150 : 100, ...values);
    const stepX = (size.width - CHART_PADDING * 2) / Math.max(1, assessments.length - 1);
    const yFor = (value: number) => size.height - CHART_PADDING - (value / maxIndex) * (size.height - CHART_PADDING * 2);

    context.strokeStyle = '#64748b';
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(CHART_PADDING, size.height - CHART_PADDING);
    context.lineTo(size.width - CHART_PADDING, size.height - CHART_PADDING);
    context.stroke();

    context.strokeStyle = '#205bd6';
    context.lineWidth = 2;
    let drawing = false;
    context.beginPath();
    assessments.forEach((assessment, index) => {
      const value = valueFor(assessment, standard);
      if (value === null) { drawing = false; return; }
      const x = CHART_PADDING + index * stepX;
      const y = yFor(value);
      if (!drawing) { context.moveTo(x, y); drawing = true; } else context.lineTo(x, y);
    });
    context.stroke();

    if (activeIndex !== null && assessments[activeIndex]) {
      const assessment = assessments[activeIndex];
      const value = valueFor(assessment, standard);
      if (value !== null) {
        const x = CHART_PADDING + activeIndex * stepX;
        context.strokeStyle = '#334155';
        context.beginPath();
        context.moveTo(x, CHART_PADDING);
        context.lineTo(x, size.height - CHART_PADDING);
        context.stroke();
        const category = categoryFor(assessment, standard) ?? 'GOOD';
        context.fillStyle = CATEGORY_COLOR[category] ?? '#205bd6';
        context.beginPath();
        context.arc(x, yFor(value), 4, 0, Math.PI * 2);
        context.fill();
      }
    }
  }, [assessments, activeIndex, size, standard]);

  const handlePointer = (clientX: number) => {
    const canvas = canvasRef.current;
    if (!canvas || assessments.length === 0) return;
    const rect = canvas.getBoundingClientRect();
    const usable = Math.max(1, rect.width - CHART_PADDING * 2);
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left - CHART_PADDING) / usable));
    onScrub(Math.min(assessments.length - 1, Math.max(0, Math.round(ratio * (assessments.length - 1)))));
  };

  const handlePointerMove = (event: PointerEvent<HTMLCanvasElement>) => {
    if (event.buttons === 1 || event.pointerType === 'touch') handlePointer(event.clientX);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLCanvasElement>) => {
    if (assessments.length === 0) return;
    const current = activeIndex ?? 0;
    if (event.key === 'ArrowRight') { onScrub(Math.min(assessments.length - 1, current + 1)); event.preventDefault(); }
    if (event.key === 'ArrowLeft') { onScrub(Math.max(0, current - 1)); event.preventDefault(); }
    if (event.key === 'Home') { onScrub(0); event.preventDefault(); }
    if (event.key === 'End') { onScrub(assessments.length - 1); event.preventDefault(); }
  };

  return (
    <canvas
      ref={canvasRef}
      role="img"
      tabIndex={0}
      aria-label={`${standard === 'US_EPA' ? 'US EPA AQI' : 'European Air Quality Index'} chart. Use arrow keys, Home/End, or drag to scrub through imported hours.`}
      aria-describedby={describedById}
      className="aethercast-canvas"
      onPointerMove={handlePointerMove}
      onPointerDown={(event) => handlePointer(event.clientX)}
      onKeyDown={handleKeyDown}
      onMouseLeave={() => onScrub(null)}
    />
  );
}

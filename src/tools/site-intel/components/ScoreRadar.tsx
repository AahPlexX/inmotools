// Feature 32 UI — radar/spider chart rendering the composite scorecard.
// Clicking a vector slice scrolls to that report section (via onSelectVector).

import type { Scorecard } from '../scoring-engine';

const SIZE = 320;
const CENTER = SIZE / 2;
const RADIUS = SIZE / 2 - 48;

function pointFor(index: number, total: number, value: number): { x: number; y: number } {
  const angle = (Math.PI * 2 * index) / total - Math.PI / 2;
  const r = (value / 100) * RADIUS;
  return { x: CENTER + r * Math.cos(angle), y: CENTER + r * Math.sin(angle) };
}

function labelPointFor(index: number, total: number): { x: number; y: number } {
  const angle = (Math.PI * 2 * index) / total - Math.PI / 2;
  const r = RADIUS + 28;
  return { x: CENTER + r * Math.cos(angle), y: CENTER + r * Math.sin(angle) };
}

export function ScoreRadar({ scorecard, onSelectVector }: { scorecard: Scorecard; onSelectVector?: (vector: string) => void }) {
  const total = scorecard.vectors.length;
  const points = scorecard.vectors.map((v, i) => pointFor(i, total, v.score));
  const polygon = points.map((p) => `${p.x},${p.y}`).join(' ');
  const rings = [25, 50, 75, 100];

  return (
    <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="score-radar" role="img" aria-label={`Composite score ${scorecard.overallScore}, grade ${scorecard.overallGrade}`}>
      {rings.map((ring) => (
        <circle key={ring} cx={CENTER} cy={CENTER} r={(ring / 100) * RADIUS} className="score-radar-ring" />
      ))}
      {scorecard.vectors.map((_, i) => {
        const edge = pointFor(i, total, 100);
        return <line key={i} x1={CENTER} y1={CENTER} x2={edge.x} y2={edge.y} className="score-radar-axis" />;
      })}
      <polygon points={polygon} className="score-radar-shape" />
      {scorecard.vectors.map((v, i) => {
        const label = labelPointFor(i, total);
        return (
          <g key={v.vector}>
            <circle cx={points[i].x} cy={points[i].y} r={4} className="score-radar-dot" />
            <text
              x={label.x}
              y={label.y}
              textAnchor="middle"
              className="score-radar-label"
              tabIndex={0}
              role="button"
              onClick={() => onSelectVector?.(v.vector)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onSelectVector?.(v.vector); }}
            >
              {v.label} ({v.grade})
            </text>
          </g>
        );
      })}
      <text x={CENTER} y={CENTER - 4} textAnchor="middle" className="score-radar-overall-grade">{scorecard.overallGrade}</text>
      <text x={CENTER} y={CENTER + 16} textAnchor="middle" className="score-radar-overall-score">{scorecard.overallScore}/100</text>
    </svg>
  );
}

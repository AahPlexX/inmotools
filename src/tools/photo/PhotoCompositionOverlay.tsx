export type PhotoCompositionMode = 'none' | 'thirds' | 'golden' | 'diagonals' | 'grid';

export default function PhotoCompositionOverlay({ mode, divisions }: { mode: PhotoCompositionMode; divisions: number }) {
  if (mode === 'none') return null;
  const label = { thirds: 'Rule of thirds', golden: 'Golden ratio', diagonals: 'Diagonals', grid: 'Grid' }[mode];
  const count = mode === 'thirds' ? 3 : Math.max(2, Math.min(10, Math.round(divisions)));
  const positions = mode === 'golden' ? [38.196601125, 61.803398875]
    : Array.from({ length: count - 1 }, (_, index) => (index + 1) * 100 / count);
  return <svg className="photo-composition-overlay" viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label={`${label} composition guides`}>
    {mode === 'diagonals' ? <><line x1="0" y1="0" x2="100" y2="100" /><line x1="100" y1="0" x2="0" y2="100" /></>
      : positions.map((position) => <g key={position}>
        <line data-guide="vertical" x1={position} y1="0" x2={position} y2="100" />
        <line data-guide="horizontal" x1="0" y1={position} x2="100" y2={position} />
      </g>)}
  </svg>;
}

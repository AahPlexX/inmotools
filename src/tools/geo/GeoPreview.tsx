type Point = [number, number];

type Props = { data: any; label: string };

function linesFromCoordinates(value: unknown): Point[][] {
  if (!Array.isArray(value)) return [];
  if (value.length >= 2 && value.every((item) => typeof item === 'number')) return [[value as Point]];
  if (value.length && value.every((item) => Array.isArray(item) && item.length >= 2 && item.every((component) => typeof component === 'number'))) return [value as Point[]];
  return value.flatMap(linesFromCoordinates);
}

function collectGeometry(data: any): Point[][] {
  if (!data) return [];
  if (data.type === 'FeatureCollection') return (data.features ?? []).flatMap((feature: any) => collectGeometry(feature));
  if (data.type === 'Feature') return collectGeometry(data.geometry);
  if (data.type === 'GeometryCollection') return (data.geometries ?? []).flatMap((geometry: any) => collectGeometry(geometry));
  return linesFromCoordinates(data.coordinates);
}

export default function GeoPreview({ data, label }: Props) {
  const lines = collectGeometry(data);
  const points = lines.flat();
  if (!points.length) return <div className="notice">No plottable coordinates found.</div>;
  const xs = points.map(([x]) => x); const ys = points.map(([, y]) => y);
  const minX = Math.min(...xs); const maxX = Math.max(...xs); const minY = Math.min(...ys); const maxY = Math.max(...ys);
  const width = 600; const height = 300; const pad = 18;
  const scale = Math.min((width - pad * 2) / Math.max(1e-12, maxX - minX), (height - pad * 2) / Math.max(1e-12, maxY - minY));
  const project = ([x, y]: Point) => [pad + (x - minX) * scale, height - pad - (y - minY) * scale] as const;
  return <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label} style={{ width: '100%', height: 260, display: 'block', background: '#fbfcfd', border: '1px solid var(--line)', borderRadius: 'var(--radius-sm)' }}>
    <rect x="0" y="0" width={width} height={height} fill="transparent"/>
    {lines.map((line, index) => {
      const projected = line.map(project);
      if (projected.length === 1) return <circle key={index} cx={projected[0][0]} cy={projected[0][1]} r="2.5" fill="var(--signal)"/>;
      const d = projected.map(([x, y], pointIndex) => `${pointIndex ? 'L' : 'M'}${x.toFixed(2)},${y.toFixed(2)}`).join(' ');
      return <path key={index} d={d} fill="none" stroke="var(--signal)" strokeWidth="1.5" vectorEffect="non-scaling-stroke"/>;
    })}
  </svg>;
}

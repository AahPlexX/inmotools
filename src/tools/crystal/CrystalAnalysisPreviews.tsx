import type { MorphologyModel } from './morphology-engine';
import type { Vec3 } from './crystal-types';
import type { IsolatedVoidComponent } from './void-analysis-engine';
import type { Isosurface, ScalarSlice } from './volumetric-engine';

type Point2 = readonly [number, number];

interface Projector {
  readonly project: (point: Vec3) => Point2;
}

function projectedRaw(point: Vec3): Point2 {
  return [
    point[0] - 0.45 * point[2],
    -(point[1] + 0.25 * point[2]),
  ];
}

function projectorFor(groups: readonly (readonly Vec3[])[]): Projector {
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const group of groups) {
    for (const point of group) {
      const [x, y] = projectedRaw(point);
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
  }
  if (!Number.isFinite(minX)) {
    minX = minY = -0.5;
    maxX = maxY = 0.5;
  }
  const rangeX = Math.max(maxX - minX, 1e-9);
  const rangeY = Math.max(maxY - minY, 1e-9);
  const scale = Math.min(280 / rangeX, 180 / rangeY);
  const offsetX = 160 - ((minX + maxX) * scale) / 2;
  const offsetY = 110 - ((minY + maxY) * scale) / 2;
  return {
    project(point) {
      const [x, y] = projectedRaw(point);
      return [x * scale + offsetX, y * scale + offsetY];
    },
  };
}

function finiteRange(values: readonly number[]): readonly [number, number] {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const value of values) {
    if (!Number.isFinite(value)) continue;
    min = Math.min(min, value);
    max = Math.max(max, value);
  }
  return Number.isFinite(min) ? [min, max] : [0, 0];
}

export function CrystalSlicePreview({ slice }: { readonly slice: ScalarSlice }) {
  const [min, max] = finiteRange(slice.values);
  const range = Math.max(max - min, 1e-12);
  const stepX = Math.max(1, Math.ceil(slice.width / 40));
  const stepY = Math.max(1, Math.ceil(slice.height / 30));
  const sampledWidth = Math.ceil(slice.width / stepX);
  const sampledHeight = Math.ceil(slice.height / stepY);
  const cellWidth = 300 / sampledWidth;
  const cellHeight = 180 / sampledHeight;
  const cells: React.ReactNode[] = [];

  for (let y = 0; y < slice.height; y += stepY) {
    for (let x = 0; x < slice.width; x += stepX) {
      const value = slice.values[x + slice.width * y] ?? min;
      const normalized = Math.min(1, Math.max(0, (value - min) / range));
      const lightness = Math.round(92 - normalized * 72);
      cells.push(
        <rect
          key={`${x}-${y}`}
          x={10 + (x / stepX) * cellWidth}
          y={10 + (y / stepY) * cellHeight}
          width={cellWidth + 0.3}
          height={cellHeight + 0.3}
          fill={`hsl(210 20% ${lightness}%)`}
        />,
      );
    }
  }

  return (
    <svg
      className="crystal-analysis-preview"
      data-testid="crystal-field-slice-preview"
      role="img"
      aria-label={`${slice.label} scalar-field slice. Values range from ${min.toPrecision(4)} to ${max.toPrecision(4)}; the numeric table follows.`}
      viewBox="0 0 320 220"
    >
      <rect x="10" y="10" width="300" height="180" fill="none" stroke="currentColor" opacity="0.35" />
      {cells}
      <text x="10" y="210" fill="currentColor" fontSize="11">
        {slice.label} · {min.toPrecision(3)} to {max.toPrecision(3)}
      </text>
    </svg>
  );
}

export function CrystalIsosurfacePreview({
  positive,
  negative,
}: {
  readonly positive: Isosurface;
  readonly negative: Isosurface | null;
}) {
  const groups = negative ? [positive.vertices, negative.vertices] : [positive.vertices];
  const projector = projectorFor(groups);
  const polygonNodes: React.ReactNode[] = [];

  const addSurface = (surface: Isosurface, negativeSurface: boolean) => {
    const stride = Math.max(1, Math.ceil(surface.triangles.length / 1200));
    for (let index = 0; index < surface.triangles.length; index += stride) {
      const triangle = surface.triangles[index]!;
      const points = triangle
        .map((vertexIndex) => projector.project(surface.vertices[vertexIndex]!))
        .map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`)
        .join(' ');
      polygonNodes.push(
        <polygon
          key={`${negativeSurface ? 'n' : 'p'}-${index}`}
          points={points}
          fill={negativeSurface ? 'none' : 'currentColor'}
          fillOpacity={negativeSurface ? undefined : 0.11}
          stroke="currentColor"
          strokeOpacity={negativeSurface ? 0.65 : 0.38}
          strokeDasharray={negativeSurface ? '4 3' : undefined}
          strokeWidth="0.8"
        />,
      );
    }
  };
  addSurface(positive, false);
  if (negative) addSurface(negative, true);

  return (
    <svg
      className="crystal-analysis-preview"
      data-testid="crystal-field-surface-preview"
      role="img"
      aria-label={`Projected isosurface preview. Positive level ${positive.level}; ${positive.triangles.length} triangles${negative ? `; negative level ${negative.level}; ${negative.triangles.length} dashed triangles` : ''}. Numeric surface details are shown beside this preview.`}
      viewBox="0 0 320 220"
    >
      {polygonNodes}
      <text x="10" y="18" fill="currentColor" fontSize="11">+ positive surface</text>
      {negative ? <text x="10" y="34" fill="currentColor" fontSize="11">− negative surface (dashed)</text> : null}
    </svg>
  );
}

export function CrystalVoidPreview({
  isolated,
  resultDimensions,
}: {
  readonly isolated: IsolatedVoidComponent | null;
  readonly resultDimensions: readonly [number, number, number];
}) {
  const points = isolated?.points ?? [];
  const projector = projectorFor([points]);
  const stride = Math.max(1, Math.ceil(points.length / 1200));

  return (
    <svg
      className="crystal-analysis-preview"
      data-testid="crystal-void-preview"
      role="img"
      aria-label={isolated
        ? `Selected cavity ${isolated.component.id}, projected from ${isolated.points.length} grid samples on a ${resultDimensions.join(' by ')} periodic grid.`
        : `No isolated cavity component is resolved on the ${resultDimensions.join(' by ')} periodic grid.`}
      viewBox="0 0 320 220"
    >
      <rect x="12" y="12" width="296" height="196" fill="none" stroke="currentColor" opacity="0.35" />
      {points.filter((_, index) => index % stride === 0).map((point, index) => {
        const [x, y] = projector.project(point);
        return <circle key={index} cx={x} cy={y} r="2" fill="currentColor" opacity="0.45" />;
      })}
      {isolated ? (
        <text x="18" y="202" fill="currentColor" fontSize="11">
          {isolated.component.id} · {isolated.points.length.toLocaleString()} samples
        </text>
      ) : (
        <text x="160" y="112" fill="currentColor" fontSize="12" textAnchor="middle">No resolved component</text>
      )}
    </svg>
  );
}

export function CrystalMorphologyPreview({ model }: { readonly model: MorphologyModel }) {
  const projector = projectorFor([model.vertices]);
  return (
    <svg
      className="crystal-analysis-preview"
      data-testid="crystal-morphology-preview"
      role="img"
      aria-label={`${model.method.toUpperCase()} morphology preview with ${model.faces.length} faces and ${model.vertices.length} vertices. Facet values are listed in the following table.`}
      viewBox="0 0 320 220"
    >
      {model.faces.map((face, faceIndex) => {
        const points = face.vertexIndices
          .map((vertexIndex) => projector.project(model.vertices[vertexIndex]!))
          .map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`)
          .join(' ');
        const centroid = face.vertexIndices.reduce<Point2>((sum, vertexIndex) => {
          const [x, y] = projector.project(model.vertices[vertexIndex]!);
          return [sum[0] + x / face.vertexIndices.length, sum[1] + y / face.vertexIndices.length];
        }, [0, 0]);
        return (
          <g key={`${face.hkl.join(',')}-${faceIndex}`}>
            <polygon points={points} fill="currentColor" fillOpacity="0.08" stroke="currentColor" strokeOpacity="0.55" />
            {faceIndex < 12 ? (
              <text x={centroid[0]} y={centroid[1]} fill="currentColor" fontSize="9" textAnchor="middle">
                {face.hkl.join(' ')}
              </text>
            ) : null}
          </g>
        );
      })}
    </svg>
  );
}

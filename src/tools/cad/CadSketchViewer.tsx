import type { CSSProperties, KeyboardEvent, MouseEvent } from 'react';
import type { CadSketchViewerProps } from './cad-workspace-types';
import type { CadSketch, SketchEntity, SketchSplineEntity, SketchVector2 } from './sketch-types';

/**
 * Milestone B, first slice: a read-only 2D visualization of an
 * already-solved sketch. No drawing, dragging, inference snapping, or
 * constraint solving happens here -- see `cad-workspace-types.ts` for the
 * deliberately standalone contract this implements, and `CadWorkspace.tsx`
 * (untouched by this change) for why it isn't mounted anywhere yet.
 *
 * Sketch coordinates are the sketch's own local (x, y) frame: the same
 * y-up, atan2-based frame `sketch-profile.ts` uses for its arc angle math
 * (see `arcMidpoint` there). SVG's coordinate system is y-down, so every
 * point rendered here passes through `toViewPoint`, which flips y so the
 * sketch's "up" renders toward the top of the viewBox. That flip is what
 * lets `computeArcSweep` below derive `sweepFlag` directly from the
 * `clockwise` flag -- see the comment on that function for the derivation.
 */

const TAU = Math.PI * 2;
const MIN_VIEW_SPAN = 2;
const DEFAULT_MARGIN_RATIO = 0.12;

// ---------------------------------------------------------------------------
// Pure, DOM-free helpers (unit tested in tests/unit/cad-sketch-viewer.test.ts).
// ---------------------------------------------------------------------------

export interface SketchBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface SketchViewBox {
  minX: number;
  minY: number;
  width: number;
  height: number;
}

/** Point entities only, keyed by id, skipping any with non-finite coordinates. */
export function resolveSketchPoints(sketch: CadSketch): Map<string, SketchVector2> {
  const points = new Map<string, SketchVector2>();
  for (const entity of sketch.entities) {
    if (entity.type !== 'point') continue;
    if (!Number.isFinite(entity.x) || !Number.isFinite(entity.y)) continue;
    points.set(entity.id, { x: entity.x, y: entity.y });
  }
  return points;
}

/**
 * Bounding box across every entity, in the sketch's own (un-flipped)
 * coordinates. Circles and ellipses use their true radius-based extent (not
 * just their defining points), so a large circle is never clipped by a box
 * that only accounts for its center point. Arcs and elliptical arcs
 * conservatively use their *full* defining circle/ellipse rather than the
 * true swept-portion extent -- trading a slightly generous fit for
 * simplicity; an over-inclusive box never clips content, only frames it a
 * little wider than strictly necessary. Returns null when nothing resolves
 * to a finite point at all (an empty sketch, or one whose entities
 * reference no valid points).
 */
export function computeSketchBounds(sketch: CadSketch): SketchBounds | null {
  const points = resolveSketchPoints(sketch);
  let bounds: SketchBounds | null = null;

  const include = (x: number, y: number) => {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    bounds = bounds
      ? {
          minX: Math.min(bounds.minX, x),
          minY: Math.min(bounds.minY, y),
          maxX: Math.max(bounds.maxX, x),
          maxY: Math.max(bounds.maxY, y),
        }
      : { minX: x, minY: y, maxX: x, maxY: y };
  };

  for (const entity of sketch.entities) {
    switch (entity.type) {
      case 'point':
        include(entity.x, entity.y);
        break;

      case 'line': {
        const start = points.get(entity.startPointId);
        const end = points.get(entity.endPointId);
        if (start) include(start.x, start.y);
        if (end) include(end.x, end.y);
        break;
      }

      case 'circle': {
        const center = points.get(entity.centerPointId);
        if (!center) break;
        if (Number.isFinite(entity.radius) && entity.radius > 0) {
          include(center.x - entity.radius, center.y - entity.radius);
          include(center.x + entity.radius, center.y + entity.radius);
        } else {
          include(center.x, center.y);
        }
        break;
      }

      case 'arc': {
        const center = points.get(entity.centerPointId);
        const start = points.get(entity.startPointId);
        const end = points.get(entity.endPointId);
        if (center && start) {
          const radius = Math.hypot(start.x - center.x, start.y - center.y);
          include(center.x - radius, center.y - radius);
          include(center.x + radius, center.y + radius);
        } else {
          if (center) include(center.x, center.y);
          if (start) include(start.x, start.y);
        }
        if (end) include(end.x, end.y);
        break;
      }

      case 'ellipse':
      case 'elliptical-arc': {
        const center = points.get(entity.centerPointId);
        const major = points.get(entity.majorAxisPointId);
        if (center && major && Number.isFinite(entity.minorRadius) && entity.minorRadius > 0) {
          const majorRadius = Math.hypot(major.x - center.x, major.y - center.y);
          const theta = Math.atan2(major.y - center.y, major.x - center.x);
          const cos = Math.cos(theta);
          const sin = Math.sin(theta);
          const halfWidth = Math.hypot(majorRadius * cos, entity.minorRadius * sin);
          const halfHeight = Math.hypot(majorRadius * sin, entity.minorRadius * cos);
          include(center.x - halfWidth, center.y - halfHeight);
          include(center.x + halfWidth, center.y + halfHeight);
        } else if (center) {
          include(center.x, center.y);
        }
        break;
      }

      case 'spline':
        for (const fitPointId of entity.fitPointIds) {
          const point = points.get(fitPointId);
          if (point) include(point.x, point.y);
        }
        break;
    }
  }

  return bounds;
}

/**
 * Maps a sketch bounding box to an SVG `viewBox`, adding a proportional
 * margin and flipping y (see the module comment) so the sketch is centered
 * and fully visible. A degenerate box (a lone point, or a single
 * horizontal/vertical line) is padded up to `MIN_VIEW_SPAN` so it never
 * collapses to a zero-size viewBox.
 */
export function computeViewBox(bounds: SketchBounds, marginRatio = DEFAULT_MARGIN_RATIO): SketchViewBox {
  const centerX = (bounds.minX + bounds.maxX) / 2;
  const centerY = (bounds.minY + bounds.maxY) / 2;
  const effectiveWidth = Math.max(bounds.maxX - bounds.minX, MIN_VIEW_SPAN);
  const effectiveHeight = Math.max(bounds.maxY - bounds.minY, MIN_VIEW_SPAN);
  const margin = Math.max(effectiveWidth, effectiveHeight) * marginRatio;
  const width = effectiveWidth + margin * 2;
  const height = effectiveHeight + margin * 2;
  return {
    minX: centerX - width / 2,
    minY: -(centerY + height / 2),
    width,
    height,
  };
}

/** Sketch (x, y) -> SVG display coordinates. See the module comment for why this flip exists. */
export function toViewPoint(point: SketchVector2): SketchVector2 {
  return { x: point.x, y: -point.y };
}

function positiveAngle(value: number): number {
  const normalized = value % TAU;
  return normalized < 0 ? normalized + TAU : normalized;
}

export interface ArcSweepFlags {
  largeArcFlag: 0 | 1;
  sweepFlag: 0 | 1;
}

/**
 * SVG arc-command flags for a start/end angle pair plus the sketch's
 * `clockwise` flag, matching `sketch-profile.ts`'s `arcMidpoint` convention
 * exactly: angles come from atan2 in the sketch's own y-up frame, and
 * `clockwise` selects the negative-angle (decreasing-angle) sweep direction
 * between them.
 *
 * `sweepFlag` reduces to `clockwise ? 1 : 0`. That is not a coincidence --
 * it falls out of two sign flips cancelling: `toViewPoint` negates y, which
 * negates every angle computed from the resulting coordinates
 * (atan2(-y, x) === -atan2(y, x)); and SVG's sweep-flag=1 already means
 * "the positive/increasing-angle direction", evaluated in SVG's own y-down
 * frame. A `clockwise: false` (increasing-angle, i.e. counterclockwise)
 * sweep in the sketch's y-up frame becomes a decreasing-angle sweep once
 * read in the flipped, y-down view frame -- sweepFlag 0. The reverse holds
 * for `clockwise: true`. This is verified against an independent SVG
 * arc-center reconstruction in the unit tests, not just asserted here.
 */
export function computeArcSweep(startAngle: number, endAngle: number, clockwise: boolean): ArcSweepFlags {
  const delta = clockwise ? -positiveAngle(startAngle - endAngle) : positiveAngle(endAngle - startAngle);
  return {
    largeArcFlag: Math.abs(delta) > Math.PI ? 1 : 0,
    sweepFlag: clockwise ? 1 : 0,
  };
}

export interface CircularArcRenderParams {
  radius: number;
  largeArcFlag: 0 | 1;
  sweepFlag: 0 | 1;
}

/** Render parameters for a circular `arc` entity's SVG `A` path command. Null for a degenerate (zero-radius) arc. */
export function computeCircularArcRenderParams(
  center: SketchVector2,
  start: SketchVector2,
  end: SketchVector2,
  clockwise: boolean,
): CircularArcRenderParams | null {
  const radius = Math.hypot(start.x - center.x, start.y - center.y);
  if (!(radius > 1e-9)) return null;
  const startAngle = Math.atan2(start.y - center.y, start.x - center.x);
  const endAngle = Math.atan2(end.y - center.y, end.x - center.x);
  return { radius, ...computeArcSweep(startAngle, endAngle, clockwise) };
}

function ellipseAxisVectors(
  center: SketchVector2,
  majorAxisPoint: SketchVector2,
  minorRadius: number,
): { rx: number; ux: number; uy: number; vx: number; vy: number } | null {
  const rx = Math.hypot(majorAxisPoint.x - center.x, majorAxisPoint.y - center.y);
  if (!(rx > 1e-9) || !(minorRadius > 1e-9)) return null;
  const ux = (majorAxisPoint.x - center.x) / rx;
  const uy = (majorAxisPoint.y - center.y) / rx;
  // Minor axis unit vector: a 90-degree CCW rotation of the major axis unit
  // vector in the sketch's own y-up frame, matching sketch-geometry.ts's
  // elliptical-arc validation basis.
  return { rx, ux, uy, vx: -uy, vy: ux };
}

export interface EllipseRenderParams {
  rx: number;
  ry: number;
  rotationDeg: number;
}

/** Render parameters for an `ellipse` entity's native `<ellipse>` + rotate transform. Null if degenerate. */
export function computeEllipseRenderParams(
  center: SketchVector2,
  majorAxisPoint: SketchVector2,
  minorRadius: number,
): EllipseRenderParams | null {
  const axes = ellipseAxisVectors(center, majorAxisPoint, minorRadius);
  if (!axes) return null;
  // Rotation is derived from the y-flipped (view-space) major-axis direction
  // directly -- atan2(-uy, ux) -- rather than computed in sketch space and
  // then sign-flipped, to keep the flip logic in one place (toViewPoint).
  return { rx: axes.rx, ry: minorRadius, rotationDeg: (Math.atan2(-axes.uy, axes.ux) * 180) / Math.PI };
}

export interface EllipticalArcRenderParams extends EllipseRenderParams {
  largeArcFlag: 0 | 1;
  sweepFlag: 0 | 1;
}

/**
 * Render parameters for an `elliptical-arc` entity's SVG `A` path command.
 * Start/end angles are computed in the ellipse's own unit-circle
 * parametrization (via the major/minor axis basis), the same normalization
 * `sketch-geometry.ts` uses to validate that an elliptical-arc's start/end
 * points lie on its ellipse -- this generalizes the circular-arc case
 * exactly (for a circle, that basis reduces to the plain x/y axes). Null if
 * degenerate.
 */
export function computeEllipticalArcRenderParams(
  center: SketchVector2,
  majorAxisPoint: SketchVector2,
  minorRadius: number,
  start: SketchVector2,
  end: SketchVector2,
  clockwise: boolean,
): EllipticalArcRenderParams | null {
  const axes = ellipseAxisVectors(center, majorAxisPoint, minorRadius);
  if (!axes) return null;
  const { rx, ux, uy, vx, vy } = axes;
  const parametricAngle = (point: SketchVector2): number => {
    const dx = point.x - center.x;
    const dy = point.y - center.y;
    return Math.atan2((dx * vx + dy * vy) / minorRadius, (dx * ux + dy * uy) / rx);
  };
  const sweep = computeArcSweep(parametricAngle(start), parametricAngle(end), clockwise);
  return { rx, ry: minorRadius, rotationDeg: (Math.atan2(-uy, ux) * 180) / Math.PI, ...sweep };
}

/**
 * Fit-point polyline for a `spline` entity. This is a deliberate,
 * *disclosed* simplification (invariant #14: unsupported/unverified
 * behavior must be disclosed, not silently approximated) -- it is a
 * straight-segment polyline through the fit points, not a true evaluated
 * B-spline/NURBS curve. Real curve evaluation is out of scope for this
 * visualize-only first slice of sketch interaction. Returns null when the
 * spline has fewer than 2 fit points, or references a missing point, so the
 * caller can skip it instead of drawing a misleading partial shape.
 */
export function resolveSplinePolylinePoints(
  entity: SketchSplineEntity,
  points: ReadonlyMap<string, SketchVector2>,
): SketchVector2[] | null {
  if (entity.fitPointIds.length < 2) return null;
  const resolved: SketchVector2[] = [];
  for (const id of entity.fitPointIds) {
    const point = points.get(id);
    if (!point) return null;
    resolved.push(point);
  }
  return resolved;
}

export function describeSketchViewerState(entityCount: number): string {
  if (entityCount === 0) return 'Sketch viewer, no entities to display yet';
  return `Sketch viewer showing ${entityCount} ${entityCount === 1 ? 'entity' : 'entities'}`;
}

function entityKindLabel(entity: SketchEntity): string {
  return entity.type === 'elliptical-arc' ? 'elliptical arc' : entity.type;
}

export function describeSketchEntity(entity: SketchEntity, selected: boolean): string {
  const parts = [`${entityKindLabel(entity)} sketch entity`];
  if (entity.construction) parts.push('construction geometry');
  if (selected) parts.push('selected');
  return parts.join(', ');
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const REAL_STROKE = 'var(--ink)';
const CONSTRUCTION_STROKE = 'var(--muted)';
const SELECTED_STROKE = 'var(--signal)';
const REAL_STROKE_WIDTH = 1.6;
const CONSTRUCTION_STROKE_WIDTH = 1.1;
const SELECTED_STROKE_WIDTH_BOOST = 1.2;

interface ShapeStyle {
  stroke: string;
  strokeWidth: number;
  strokeDasharray?: string;
}

/**
 * Construction geometry always renders dashed and thinner than real
 * geometry, selected or not, so the two stay visually distinguishable even
 * when a construction entity is highlighted (only its color and width
 * shift toward the selection style).
 */
function shapeStyle(construction: boolean, selected: boolean, constructionDashArray: string): ShapeStyle {
  const stroke = selected ? SELECTED_STROKE : construction ? CONSTRUCTION_STROKE : REAL_STROKE;
  const baseWidth = construction ? CONSTRUCTION_STROKE_WIDTH : REAL_STROKE_WIDTH;
  const strokeWidth = selected ? baseWidth + SELECTED_STROKE_WIDTH_BOOST : baseWidth;
  return construction ? { stroke, strokeWidth, strokeDasharray: constructionDashArray } : { stroke, strokeWidth };
}

export default function CadSketchViewer({ sketch, selectedEntityId, onSelectEntity }: CadSketchViewerProps) {
  const bounds = computeSketchBounds(sketch);

  if (sketch.entities.length === 0 || !bounds) {
    const message =
      sketch.entities.length === 0
        ? 'This sketch has no entities yet.'
        : 'No sketch geometry could be resolved for display.';
    return (
      <div className="cad-sketch-viewer" data-testid="cad-sketch-viewer">
        <p data-testid="cad-sketch-viewer-empty-state" className="cad-sketch-viewer-empty" style={{ margin: 0, color: 'var(--muted)' }}>
          {message}
        </p>
      </div>
    );
  }

  const points = resolveSketchPoints(sketch);
  const viewBox = computeViewBox(bounds);
  const span = Math.max(viewBox.width, viewBox.height);
  const pointRadius = span / 100;
  const constructionDashArray = `${span / 60} ${span / 100}`;

  const handleBackgroundClick = () => onSelectEntity(null);

  const shapes = sketch.entities.map((entity) => {
    const selected = entity.id === selectedEntityId;
    const style = shapeStyle(entity.construction, selected, constructionDashArray);
    const label = describeSketchEntity(entity, selected);

    const handleSelect = (event: MouseEvent) => {
      event.stopPropagation();
      onSelectEntity(entity.id);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      onSelectEntity(entity.id);
    };

    const common = {
      key: entity.id,
      'data-testid': `cad-sketch-viewer-entity-${entity.id}`,
      role: 'button' as const,
      tabIndex: 0,
      'aria-label': label,
      'aria-pressed': selected,
      onClick: handleSelect,
      onKeyDown: handleKeyDown,
      style: { cursor: 'pointer' } as CSSProperties,
    };

    switch (entity.type) {
      case 'point': {
        const view = toViewPoint({ x: entity.x, y: entity.y });
        const fill = selected ? SELECTED_STROKE : entity.construction ? CONSTRUCTION_STROKE : REAL_STROKE;
        return (
          <circle {...common} cx={view.x} cy={view.y} r={selected ? pointRadius * 1.6 : pointRadius} fill={fill} stroke="none" />
        );
      }

      case 'line': {
        const start = points.get(entity.startPointId);
        const end = points.get(entity.endPointId);
        if (!start || !end) return null;
        const viewStart = toViewPoint(start);
        const viewEnd = toViewPoint(end);
        return (
          <line
            {...common}
            x1={viewStart.x}
            y1={viewStart.y}
            x2={viewEnd.x}
            y2={viewEnd.y}
            fill="none"
            vectorEffect="non-scaling-stroke"
            {...style}
          />
        );
      }

      case 'circle': {
        const center = points.get(entity.centerPointId);
        if (!center || !(entity.radius > 0)) return null;
        const view = toViewPoint(center);
        return (
          <circle {...common} cx={view.x} cy={view.y} r={entity.radius} fill="none" vectorEffect="non-scaling-stroke" {...style} />
        );
      }

      case 'arc': {
        const center = points.get(entity.centerPointId);
        const start = points.get(entity.startPointId);
        const end = points.get(entity.endPointId);
        if (!center || !start || !end) return null;
        const params = computeCircularArcRenderParams(center, start, end, entity.clockwise);
        if (!params) return null;
        const viewStart = toViewPoint(start);
        const viewEnd = toViewPoint(end);
        const d = `M ${viewStart.x} ${viewStart.y} A ${params.radius} ${params.radius} 0 ${params.largeArcFlag} ${params.sweepFlag} ${viewEnd.x} ${viewEnd.y}`;
        return <path {...common} d={d} fill="none" vectorEffect="non-scaling-stroke" {...style} />;
      }

      case 'ellipse': {
        const center = points.get(entity.centerPointId);
        const major = points.get(entity.majorAxisPointId);
        if (!center || !major) return null;
        const params = computeEllipseRenderParams(center, major, entity.minorRadius);
        if (!params) return null;
        const view = toViewPoint(center);
        return (
          <ellipse
            {...common}
            cx={view.x}
            cy={view.y}
            rx={params.rx}
            ry={params.ry}
            transform={`rotate(${params.rotationDeg} ${view.x} ${view.y})`}
            fill="none"
            vectorEffect="non-scaling-stroke"
            {...style}
          />
        );
      }

      case 'elliptical-arc': {
        const center = points.get(entity.centerPointId);
        const major = points.get(entity.majorAxisPointId);
        const start = points.get(entity.startPointId);
        const end = points.get(entity.endPointId);
        if (!center || !major || !start || !end) return null;
        const params = computeEllipticalArcRenderParams(center, major, entity.minorRadius, start, end, entity.clockwise);
        if (!params) return null;
        const viewStart = toViewPoint(start);
        const viewEnd = toViewPoint(end);
        const d = `M ${viewStart.x} ${viewStart.y} A ${params.rx} ${params.ry} ${params.rotationDeg} ${params.largeArcFlag} ${params.sweepFlag} ${viewEnd.x} ${viewEnd.y}`;
        return <path {...common} d={d} fill="none" vectorEffect="non-scaling-stroke" {...style} />;
      }

      case 'spline': {
        // See resolveSplinePolylinePoints: this is a fit-point polyline, not
        // an evaluated B-spline/NURBS curve -- a disclosed simplification.
        const polyline = resolveSplinePolylinePoints(entity, points);
        if (!polyline) return null;
        const viewPoints = polyline.map((point) => toViewPoint(point)).map((p) => `${p.x},${p.y}`).join(' ');
        return <polyline {...common} points={viewPoints} fill="none" vectorEffect="non-scaling-stroke" {...style} />;
      }

      default:
        return null;
    }
  });

  return (
    <div className="cad-sketch-viewer" data-testid="cad-sketch-viewer" style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
      <svg
        data-testid="cad-sketch-viewer-canvas"
        aria-label={describeSketchViewerState(sketch.entities.length)}
        viewBox={`${viewBox.minX} ${viewBox.minY} ${viewBox.width} ${viewBox.height}`}
        style={{
          width: '100%',
          height: 'clamp(280px, 50vh, 560px)',
          minHeight: 0,
          border: '1px solid var(--line)',
          borderRadius: 'var(--radius-sm)',
          background: 'var(--surface-strong)',
        }}
        onClick={handleBackgroundClick}
      >
        {shapes}
      </svg>
    </div>
  );
}

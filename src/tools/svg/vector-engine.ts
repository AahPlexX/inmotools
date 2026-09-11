import type {
  SnapOptions,
  SnappedPoint,
  VectorDocument,
  VectorElement,
  VectorElementBase,
  VectorHistory,
  VectorPoint,
  VectorSelectionResult,
} from './vector-types';
import { DEFAULT_FILL, DEFAULT_STROKE } from './vector-types';

let idSequence = 0;

export function createVectorId(prefix = 'vector'): string {
  idSequence += 1;
  return `${prefix}-${Date.now().toString(36)}-${idSequence.toString(36)}`;
}

export function createVectorDocument(): VectorDocument {
  return {
    format: 'inmotools-vector',
    version: 1,
    id: createVectorId('document'),
    name: 'Untitled vector',
    artboard: {
      width: 1200,
      height: 800,
      background: '#ffffff',
      exportBackground: false,
      gridVisible: true,
      gridSize: 20,
      snapToGrid: true,
      snapToObjects: true,
    },
    metadata: {
      title: '',
      description: '',
      creator: '',
      rights: '',
      license: '',
      language: 'en',
      tags: [],
      custom: '',
    },
    elements: [],
    symbols: [],
    swatches: ['#111827', '#ffffff', '#7c3aed', '#2563eb', '#06b6d4', '#f59e0b', '#ef4444', '#22c55e'],
  };
}

export function baseElement(type: VectorElement['type'], name: string, x: number, y: number, width: number, height: number): VectorElementBase {
  return {
    id: createVectorId(type),
    type,
    name,
    x,
    y,
    width,
    height,
    rotation: 0,
    flipX: false,
    flipY: false,
    opacity: 1,
    visible: true,
    locked: false,
    fill: { ...DEFAULT_FILL },
    stroke: { ...DEFAULT_STROKE },
    blendMode: 'normal',
    title: '',
    description: '',
  };
}

export function addElement(document: VectorDocument, element: VectorElement): VectorDocument {
  return { ...document, elements: [...document.elements, element] };
}

export function updateElement(document: VectorDocument, id: string, patch: Partial<VectorElement>): VectorDocument {
  return {
    ...document,
    elements: document.elements.map((element) => element.id === id ? ({ ...element, ...patch } as VectorElement) : element),
  };
}

function mapElements(document: VectorDocument, ids: ReadonlySet<string>, mapper: (element: VectorElement) => VectorElement): VectorDocument {
  return { ...document, elements: document.elements.map((element) => ids.has(element.id) ? mapper(element) : element) };
}

export function removeSelection(document: VectorDocument, selection: readonly string[]): VectorDocument {
  const selected = new Set(selection);
  return { ...document, elements: document.elements.filter((element) => !selected.has(element.id)) };
}

function moveElement(element: VectorElement, dx: number, dy: number): VectorElement {
  if (element.type === 'group') {
    return {
      ...element,
      x: element.x + dx,
      y: element.y + dy,
      children: element.children.map((child) => moveElement(child, dx, dy)),
    };
  }
  if (element.type === 'line') {
    return { ...element, x: element.x + dx, y: element.y + dy, x2: element.x2 + dx, y2: element.y2 + dy };
  }
  return { ...element, x: element.x + dx, y: element.y + dy };
}

export function moveSelection(document: VectorDocument, selection: readonly string[], dx: number, dy: number): VectorDocument {
  const ids = new Set(selection);
  return mapElements(document, ids, (element) => element.locked ? element : moveElement(element, dx, dy));
}

function cloneElement(element: VectorElement, dx: number, dy: number): VectorElement {
  const moved = moveElement(element, dx, dy);
  if (moved.type === 'group') {
    return {
      ...moved,
      id: createVectorId('group'),
      name: `${element.name} copy`,
      children: moved.children.map((child) => ({ ...child, id: createVectorId(child.type) } as VectorElement)),
    };
  }
  return { ...moved, id: createVectorId(element.type), name: `${element.name} copy` } as VectorElement;
}

export function duplicateSelection(document: VectorDocument, selection: readonly string[], dx = 12, dy = 12): VectorSelectionResult {
  const selected = new Set(selection);
  const copies = document.elements.filter((element) => selected.has(element.id)).map((element) => cloneElement(element, dx, dy));
  return { document: { ...document, elements: [...document.elements, ...copies] }, selection: copies.map((element) => element.id) };
}

export interface ElementBounds { x: number; y: number; width: number; height: number; right: number; bottom: number; cx: number; cy: number }

export function elementBounds(element: VectorElement): ElementBounds {
  if (element.type === 'line') {
    const x = Math.min(element.x, element.x2);
    const y = Math.min(element.y, element.y2);
    const right = Math.max(element.x, element.x2);
    const bottom = Math.max(element.y, element.y2);
    return { x, y, width: right - x, height: bottom - y, right, bottom, cx: (x + right) / 2, cy: (y + bottom) / 2 };
  }
  return {
    x: element.x,
    y: element.y,
    width: element.width,
    height: element.height,
    right: element.x + element.width,
    bottom: element.y + element.height,
    cx: element.x + element.width / 2,
    cy: element.y + element.height / 2,
  };
}

export function selectionBounds(document: VectorDocument, selection: readonly string[]): ElementBounds | null {
  const selected = new Set(selection);
  const bounds = document.elements.filter((element) => selected.has(element.id)).map(elementBounds);
  if (!bounds.length) return null;
  const x = Math.min(...bounds.map((bound) => bound.x));
  const y = Math.min(...bounds.map((bound) => bound.y));
  const right = Math.max(...bounds.map((bound) => bound.right));
  const bottom = Math.max(...bounds.map((bound) => bound.bottom));
  return { x, y, right, bottom, width: right - x, height: bottom - y, cx: (x + right) / 2, cy: (y + bottom) / 2 };
}

export function groupSelection(document: VectorDocument, selection: readonly string[]): VectorSelectionResult {
  const selected = new Set(selection);
  const children = document.elements.filter((element) => selected.has(element.id));
  if (children.length < 2) return { document, selection: [...selection] };
  const bounds = selectionBounds(document, selection);
  if (!bounds) return { document, selection: [...selection] };
  const firstIndex = document.elements.findIndex((element) => selected.has(element.id));
  const group: VectorElement = {
    ...baseElement('group', 'Group', bounds.x, bounds.y, bounds.width, bounds.height),
    type: 'group',
    fill: { kind: 'solid', color: 'none' },
    children,
  };
  const remaining = document.elements.filter((element) => !selected.has(element.id));
  remaining.splice(Math.max(0, firstIndex), 0, group);
  return { document: { ...document, elements: remaining }, selection: [group.id] };
}

export function ungroupSelection(document: VectorDocument, groupId: string): VectorSelectionResult {
  const index = document.elements.findIndex((element) => element.id === groupId && element.type === 'group');
  if (index < 0) return { document, selection: [] };
  const group = document.elements[index];
  if (group.type !== 'group') return { document, selection: [] };
  const elements = [...document.elements];
  elements.splice(index, 1, ...group.children);
  return { document: { ...document, elements }, selection: group.children.map((child) => child.id) };
}

export type Alignment = 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom';

export function alignSelection(document: VectorDocument, selection: readonly string[], alignment: Alignment): VectorDocument {
  const bounds = selectionBounds(document, selection);
  if (!bounds) return document;
  const ids = new Set(selection);
  return mapElements(document, ids, (element) => {
    if (element.locked) return element;
    const current = elementBounds(element);
    let dx = 0;
    let dy = 0;
    if (alignment === 'left') dx = bounds.x - current.x;
    if (alignment === 'center') dx = bounds.cx - current.cx;
    if (alignment === 'right') dx = bounds.right - current.right;
    if (alignment === 'top') dy = bounds.y - current.y;
    if (alignment === 'middle') dy = bounds.cy - current.cy;
    if (alignment === 'bottom') dy = bounds.bottom - current.bottom;
    return moveElement(element, dx, dy);
  });
}

export function distributeSelection(document: VectorDocument, selection: readonly string[], axis: 'horizontal' | 'vertical'): VectorDocument {
  const ids = new Set(selection);
  const selected = document.elements.filter((element) => ids.has(element.id));
  if (selected.length < 3) return document;
  const sorted = [...selected].sort((a, b) => axis === 'horizontal' ? elementBounds(a).x - elementBounds(b).x : elementBounds(a).y - elementBounds(b).y);
  const first = elementBounds(sorted[0]);
  const last = elementBounds(sorted[sorted.length - 1]);
  const span = axis === 'horizontal' ? last.x - first.x : last.y - first.y;
  const step = span / (sorted.length - 1);
  const targets = new Map<string, number>();
  sorted.forEach((element, index) => targets.set(element.id, (axis === 'horizontal' ? first.x : first.y) + step * index));
  return mapElements(document, ids, (element) => {
    if (element.locked) return element;
    const bound = elementBounds(element);
    const target = targets.get(element.id) ?? (axis === 'horizontal' ? bound.x : bound.y);
    return axis === 'horizontal' ? moveElement(element, target - bound.x, 0) : moveElement(element, 0, target - bound.y);
  });
}

export type ReorderAction = 'front' | 'back' | 'forward' | 'backward';

export function reorderSelection(document: VectorDocument, selection: readonly string[], action: ReorderAction): VectorDocument {
  const selected = new Set(selection);
  const chosen = document.elements.filter((element) => selected.has(element.id));
  if (!chosen.length) return document;
  if (action === 'front') return { ...document, elements: [...document.elements.filter((element) => !selected.has(element.id)), ...chosen] };
  if (action === 'back') return { ...document, elements: [...chosen, ...document.elements.filter((element) => !selected.has(element.id))] };
  const elements = [...document.elements];
  if (action === 'forward') {
    for (let index = elements.length - 2; index >= 0; index -= 1) {
      if (selected.has(elements[index].id) && !selected.has(elements[index + 1].id)) [elements[index], elements[index + 1]] = [elements[index + 1], elements[index]];
    }
  } else {
    for (let index = 1; index < elements.length; index += 1) {
      if (selected.has(elements[index].id) && !selected.has(elements[index - 1].id)) [elements[index], elements[index - 1]] = [elements[index - 1], elements[index]];
    }
  }
  return { ...document, elements };
}

function nearestSnap(value: number, candidates: number[], threshold: number): number | null {
  let best: number | null = null;
  let distance = Number.POSITIVE_INFINITY;
  for (const candidate of candidates) {
    const nextDistance = Math.abs(candidate - value);
    if (nextDistance <= threshold && nextDistance < distance) {
      best = candidate;
      distance = nextDistance;
    }
  }
  return best;
}

export function snapPoint(point: VectorPoint, options: SnapOptions): SnappedPoint {
  const gridCandidatesX = options.grid > 0 ? [Math.round(point.x / options.grid) * options.grid] : [];
  const gridCandidatesY = options.grid > 0 ? [Math.round(point.y / options.grid) * options.grid] : [];
  const x = nearestSnap(point.x, [...gridCandidatesX, ...(options.guidesX ?? [])], options.threshold);
  const y = nearestSnap(point.y, [...gridCandidatesY, ...(options.guidesY ?? [])], options.threshold);
  return { x: x ?? point.x, y: y ?? point.y, snappedX: x !== null, snappedY: y !== null };
}

function formatNumber(value: number): string {
  return Number(value.toFixed(3)).toString();
}

export function createPolygonPath(cx: number, cy: number, radius: number, sides: number, rotation = -90): string {
  const count = Math.max(3, Math.round(sides));
  const points = Array.from({ length: count }, (_, index) => {
    const angle = (rotation + index * 360 / count) * Math.PI / 180;
    return { x: cx + Math.cos(angle) * radius, y: cy + Math.sin(angle) * radius };
  });
  return `M ${formatNumber(points[0].x)} ${formatNumber(points[0].y)}${points.slice(1).map((point) => ` L ${formatNumber(point.x)} ${formatNumber(point.y)}`).join('')} Z`;
}

export function createStarPath(cx: number, cy: number, radius: number, innerRatio: number, points: number, rotation = -90): string {
  const count = Math.max(2, Math.round(points));
  const ratio = Math.max(0.05, Math.min(0.95, innerRatio));
  const vertices = Array.from({ length: count * 2 }, (_, index) => {
    const angle = (rotation + index * 180 / count) * Math.PI / 180;
    const r = index % 2 === 0 ? radius : radius * ratio;
    return { x: cx + Math.cos(angle) * r, y: cy + Math.sin(angle) * r };
  });
  return `M ${formatNumber(vertices[0].x)} ${formatNumber(vertices[0].y)}${vertices.slice(1).map((point) => ` L ${formatNumber(point.x)} ${formatNumber(point.y)}`).join('')} Z`;
}

function perpendicularDistance(point: VectorPoint, start: VectorPoint, end: VectorPoint): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  if (dx === 0 && dy === 0) return Math.hypot(point.x - start.x, point.y - start.y);
  const numerator = Math.abs(dy * point.x - dx * point.y + end.x * start.y - end.y * start.x);
  return numerator / Math.hypot(dx, dy);
}

export function simplifyPoints(points: readonly VectorPoint[], tolerance = 1): VectorPoint[] {
  if (points.length <= 2) return [...points];
  let maxDistance = 0;
  let index = 0;
  for (let cursor = 1; cursor < points.length - 1; cursor += 1) {
    const distance = perpendicularDistance(points[cursor], points[0], points[points.length - 1]);
    if (distance > maxDistance) {
      maxDistance = distance;
      index = cursor;
    }
  }
  if (maxDistance <= tolerance) return [points[0], points[points.length - 1]];
  const left = simplifyPoints(points.slice(0, index + 1), tolerance);
  const right = simplifyPoints(points.slice(index), tolerance);
  return [...left.slice(0, -1), ...right];
}

export function pointsToPath(points: readonly VectorPoint[], closed = false): string {
  if (!points.length) return '';
  const body = points.slice(1).map((point) => ` L ${formatNumber(point.x)} ${formatNumber(point.y)}`).join('');
  return `M ${formatNumber(points[0].x)} ${formatNumber(points[0].y)}${body}${closed ? ' Z' : ''}`;
}

export function radialRepeatSelection(document: VectorDocument, selection: readonly string[], count: number, center: VectorPoint): VectorSelectionResult {
  const total = Math.max(1, Math.round(count));
  if (total <= 1 || selection.length === 0) return { document, selection: [] };
  const ids = new Set(selection);
  const originals = document.elements.filter((element) => ids.has(element.id));
  const clones: VectorElement[] = [];
  for (let copy = 1; copy < total; copy += 1) {
    const angle = copy * 360 / total;
    const radians = angle * Math.PI / 180;
    for (const original of originals) {
      const bounds = elementBounds(original);
      const vx = bounds.cx - center.x;
      const vy = bounds.cy - center.y;
      const cx = center.x + vx * Math.cos(radians) - vy * Math.sin(radians);
      const cy = center.y + vx * Math.sin(radians) + vy * Math.cos(radians);
      const clone = cloneElement(original, cx - bounds.cx, cy - bounds.cy);
      clones.push({ ...clone, rotation: clone.rotation + angle } as VectorElement);
    }
  }
  return { document: { ...document, elements: [...document.elements, ...clones] }, selection: clones.map((element) => element.id) };
}

export function mirrorSelection(document: VectorDocument, selection: readonly string[], axis: 'horizontal' | 'vertical'): VectorDocument {
  const ids = new Set(selection);
  return mapElements(document, ids, (element) => {
    if (element.locked) return element;
    return axis === 'horizontal'
      ? ({ ...element, flipX: !Boolean(element.flipX), flipY: Boolean(element.flipY) } as VectorElement)
      : ({ ...element, flipX: Boolean(element.flipX), flipY: !Boolean(element.flipY) } as VectorElement);
  });
}

export function createHistory(document: VectorDocument, limit = 80): VectorHistory {
  return { past: [], present: document, future: [], limit };
}

export function pushHistory(history: VectorHistory, document: VectorDocument): VectorHistory {
  if (document === history.present) return history;
  return {
    past: [...history.past, history.present].slice(-history.limit),
    present: document,
    future: [],
    limit: history.limit,
  };
}

export function undoHistory(history: VectorHistory): VectorHistory {
  if (!history.past.length) return history;
  const previous = history.past[history.past.length - 1];
  return {
    ...history,
    past: history.past.slice(0, -1),
    present: previous,
    future: [history.present, ...history.future].slice(0, history.limit),
  };
}

export function redoHistory(history: VectorHistory): VectorHistory {
  if (!history.future.length) return history;
  const next = history.future[0];
  return {
    ...history,
    past: [...history.past, history.present].slice(-history.limit),
    present: next,
    future: history.future.slice(1),
  };
}
